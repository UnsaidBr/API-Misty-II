import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApiLogEntry,
  AutomationRule,
  CameraCaptureResult,
  CameraStreamType,
  ChoreographySequence,
  HardwareBridgeConfig,
  NeuralSpeechStyle,
  NeuralVoiceName,
  PubSubMessage,
  RobotState,
  TtsEngine,
} from '../types/misty';

export function rankBrazilianVoice(v: SpeechSynthesisVoice): number {
  const lang = v.lang.toLowerCase();
  const name = v.name.toLowerCase();
  let score = 0;

  if (lang === 'pt-br' || lang === 'pt_br') score += 200;
  else if (lang.startsWith('pt-')) score += 60;
  else if (lang === 'pt') score += 50;
  else score -= 300;

  if (name.includes('brazil') || name.includes('brasil')) score += 80;
  if (name.includes('natural') || name.includes('neural') || name.includes('online')) score += 70;
  if (name.includes('google')) score += 55;
  if (
    name.includes('francisca') ||
    name.includes('thalita') ||
    name.includes('antonio') ||
    name.includes('luciana') ||
    name.includes('maria') ||
    name.includes('felipe') ||
    name.includes('raquel')
  ) {
    score += 45;
  }
  if (!v.localService) score += 15;
  if (name.includes('espeak') || name.includes('speech-dispatcher')) score -= 180;
  return score;
}

export function pickBestBrazilianVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) return undefined;
  const sorted = [...voices].sort((a, b) => rankBrazilianVoice(b) - rankBrazilianVoice(a));
  return sorted[0];
}

function normalizePortugueseForBrowser(raw: string): string {
  return raw
    .replace(/\bMisty\s*II\b/gi, 'Místi dois')
    .replace(/\bMisty\s*2\b/gi, 'Místi dois')
    .replace(/\bMisty\b/gi, 'Místi')
    .replace(/\bpt-BR\b/gi, 'português do Brasil')
    .replace(/\bm\/s\b/gi, 'metros por segundo')
    .replace(/\bkm\/h\b/gi, 'quilômetros por hora')
    .replace(/(\d+(?:[.,]\d+)?)\s*°\b/g, '$1 graus')
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, '$1 por cento')
    .trim();
}

export interface TelemetryPoint {
  t: number;
  frontCenter: number;
  frontLeft: number;
  frontRight: number;
  yaw: number;
  pitch: number;
}

export function useMistyConnection() {
  const [robotState, setRobotState] = useState<RobotState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [subscribedTopics, setSubscribedTopics] = useState<string[]>([
    'StateSnapshot',
    'TimeOfFlight',
    'IMU',
    'RobotOdometry',
    'AutomationTriggered',
    'SpeechStatus',
    'CapTouch',
    'BumpSensor',
    'VisionEvent',
    'CameraFrame',
  ]);
  const [pubSubFeed, setPubSubFeed] = useState<PubSubMessage[]>([]);
  const [pubSubPaused, setPubSubPaused] = useState(false);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>([]);
  const [latestCameraFrame, setLatestCameraFrame] = useState<CameraCaptureResult | null>(null);
  const [choreographies, setChoreographies] = useState<ChoreographySequence[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([]);
  const [bridgeConfig, setBridgeConfig] = useState<HardwareBridgeConfig>({
    mode: 'simulator',
    robotIp: '192.168.1.120',
    lastCheckedAt: null,
    reachable: false,
    agentConnected: false,
    connectionMethod: 'none',
    lastError: null,
  });

  const [speechVoiceURI, setSpeechVoiceURI] = useState<string>('');
  const [ttsEngine, setTtsEngine] = useState<TtsEngine>('neural');
  const [neuralVoice, setNeuralVoice] = useState<NeuralVoiceName>('Kore');
  const [neuralStyle, setNeuralStyle] = useState<NeuralSpeechStyle>('natural');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsNotice, setTtsNotice] = useState<string | null>(null);
  const [lastSpeechEngineLabel, setLastSpeechEngineLabel] = useState<string>(
    'Neural Nativa (pt-BR)'
  );

  const wsRef = useRef<WebSocket | null>(null);
  const lastSpokenTsRef = useRef<number>(0);
  const lastToneTsRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const neuralAudioRef = useRef<HTMLAudioElement | null>(null);
  const neuralSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const pubSubPausedRef = useRef(pubSubPaused);
  pubSubPausedRef.current = pubSubPaused;

  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;
  const speechVoiceURIRef = useRef(speechVoiceURI);
  speechVoiceURIRef.current = speechVoiceURI;
  const ttsEngineRef = useRef(ttsEngine);
  ttsEngineRef.current = ttsEngine;
  const neuralVoiceRef = useRef(neuralVoice);
  neuralVoiceRef.current = neuralVoice;
  const neuralStyleRef = useRef(neuralStyle);
  neuralStyleRef.current = neuralStyle;

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        void audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  const stopAllSpeechPlayback = useCallback(() => {
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (neuralSourceRef.current) {
      try {
        neuralSourceRef.current.stop();
        neuralSourceRef.current.disconnect();
      } catch {
        // ignore stop error
      }
      neuralSourceRef.current = null;
    }
    if (neuralAudioRef.current) {
      try {
        neuralAudioRef.current.pause();
        neuralAudioRef.current.currentTime = 0;
      } catch {
        // ignore audio stop error
      }
      neuralAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setTtsLoading(false);
  }, []);

  const speakWithBrowserVoice = useCallback((utteranceText: string, rateVal: number, pitchVal: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(normalizePortugueseForBrowser(utteranceText));
      utter.lang = 'pt-BR';
      utter.rate = rateVal || 1.0;
      utter.pitch = pitchVal || 1.0;

      const voices = window.speechSynthesis.getVoices();
      const chosen =
        (speechVoiceURIRef.current
          ? voices.find((v) => v.voiceURI === speechVoiceURIRef.current)
          : undefined) ?? pickBestBrazilianVoice(voices);

      if (chosen) {
        utter.voice = chosen;
        utter.lang = chosen.lang;
        setLastSpeechEngineLabel(`Navegador (${chosen.name})`);
      } else {
        setLastSpeechEngineLabel('Navegador (pt-BR padrão)');
      }
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore browser speech block before user gesture
    }
  }, []);

  // Browser & Neural pt-BR TTS + WebAudio tone synthesizer synced to server state
  useEffect(() => {
    if (!audioEnabled) {
      stopAllSpeechPlayback();
      return;
    }
    if (!robotState) return;

    if (
      robotState.speech.timestamp > lastSpokenTsRef.current &&
      robotState.speech.lastUtterance
    ) {
      lastSpokenTsRef.current = robotState.speech.timestamp;
      const textToSpeak = robotState.speech.lastUtterance;
      const rateVal = robotState.speech.rate || 1.0;
      const pitchVal = robotState.speech.pitch || 1.0;
      const moodVal = robotState.eyes.mood;

      stopAllSpeechPlayback();

      if (ttsEngineRef.current === 'neural') {
        const controller = new AbortController();
        ttsAbortRef.current = controller;
        setTtsLoading(true);
        setTtsNotice(null);

        void (async () => {
          try {
            const res = await fetch('/api/misty/tts/synthesize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: textToSpeak,
                voiceName: neuralVoiceRef.current,
                style: neuralStyleRef.current,
                mood: moodVal,
              }),
              signal: controller.signal,
            });

            if (controller.signal.aborted || !audioEnabledRef.current) return;

            if (!res.ok) {
              const errData = (await res.json().catch(() => ({}))) as { error?: string };
              const reason =
                res.status === 503
                  ? 'Voz neural com alta demanda no momento — reproduzindo com voz pt-BR do navegador.'
                  : errData.error || 'Voz neural indisponível — usando voz pt-BR do navegador.';
              setTtsNotice(reason);
              speakWithBrowserVoice(textToSpeak, rateVal, pitchVal);
              return;
            }

            const payload = (await res.json()) as {
              audioBase64?: string;
              mimeType?: string;
              model?: string;
              voiceName?: string;
            };
            if (!payload.audioBase64 || controller.signal.aborted || !audioEnabledRef.current) {
              if (!controller.signal.aborted && audioEnabledRef.current) {
                speakWithBrowserVoice(textToSpeak, rateVal, pitchVal);
              }
              return;
            }

            const binaryStr = atob(payload.audioBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }

            setLastSpeechEngineLabel(
              `Neural Nativa (${payload.model || 'gemini-3.8-flash-tts'} · ${payload.voiceName || neuralVoiceRef.current})`
            );

            const ctx = ensureAudioContext();
            let playedViaWebAudio = false;
            if (ctx) {
              try {
                if (ctx.state === 'suspended') {
                  await ctx.resume();
                }
                const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
                if (controller.signal.aborted || !audioEnabledRef.current) return;
                const source = ctx.createBufferSource();
                source.buffer = decoded;
                if (Math.abs(rateVal - 1.0) > 0.04) {
                  source.playbackRate.value = Math.min(1.5, Math.max(0.75, rateVal));
                }
                source.connect(ctx.destination);
                neuralSourceRef.current = source;
                source.onended = () => {
                  if (neuralSourceRef.current === source) {
                    neuralSourceRef.current = null;
                  }
                };
                source.start(0);
                playedViaWebAudio = true;
              } catch {
                playedViaWebAudio = false;
              }
            }

            if (!playedViaWebAudio) {
              const blob = new Blob([bytes], { type: payload.mimeType || 'audio/wav' });
              const blobUrl = URL.createObjectURL(blob);
              const audio = new Audio(blobUrl);
              if (Math.abs(rateVal - 1.0) > 0.04) {
                audio.playbackRate = Math.min(1.5, Math.max(0.75, rateVal));
              }
              neuralAudioRef.current = audio;
              audio.onended = () => {
                URL.revokeObjectURL(blobUrl);
                if (neuralAudioRef.current === audio) {
                  neuralAudioRef.current = null;
                }
              };
              await audio.play();
            }
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            setTtsNotice('Falha ao reproduzir voz neural — usando voz pt-BR do navegador.');
            speakWithBrowserVoice(textToSpeak, rateVal, pitchVal);
          } finally {
            if (ttsAbortRef.current === controller) {
              ttsAbortRef.current = null;
              setTtsLoading(false);
            }
          }
        })();
      } else {
        setTtsNotice(null);
        speakWithBrowserVoice(textToSpeak, rateVal, pitchVal);
      }
    }

    if (
      robotState.audioTone &&
      robotState.audioTone.timestamp > lastToneTsRef.current
    ) {
      lastToneTsRef.current = robotState.audioTone.timestamp;
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioCtxRef.current) {
          audioCtxRef.current = new Ctx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          void ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = robotState.audioTone.waveform;
        osc.frequency.value = robotState.audioTone.frequency;
        gain.gain.setValueAtTime(0.14, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + robotState.audioTone.durationMs / 1000
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + robotState.audioTone.durationMs / 1000);
      } catch {
        // ignore audio context block
      }
    }
  }, [robotState, audioEnabled, stopAllSpeechPlayback, speakWithBrowserVoice, ensureAudioContext]);

  const fetchAuxData = useCallback(async () => {
    try {
      const [chorRes, autoRes, logRes, bridgeRes] = await Promise.all([
        fetch('/api/misty/choreography'),
        fetch('/api/misty/automations'),
        fetch('/api/misty/logs'),
        fetch('/api/bridge/config'),
      ]);
      if (chorRes.ok) {
        const d = await chorRes.json();
        setChoreographies(d.result ?? []);
      }
      if (autoRes.ok) {
        const d = await autoRes.json();
        setAutomations(d.result ?? []);
      }
      if (logRes.ok) {
        const d = await logRes.json();
        setApiLogs(d.result ?? []);
      }
      if (bridgeRes.ok) {
        const d = await bridgeRes.json();
        if (d.result) setBridgeConfig(d.result);
      }
    } catch {
      // silent retry on next poll
    }
  }, []);

  useEffect(() => {
    void fetch('/api/misty/state')
      .then((r) => r.json())
      .then((d: RobotState) => setRobotState(d))
      .catch(() => {});

    void fetchAuxData();
    const poll = setInterval(() => {
      void fetchAuxData();
    }, 3500);

    return () => clearInterval(poll);
  }, [fetchAuxData]);

  // Preload browser speech voices & unlock WebAudio on first user interaction
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
    const unlock = () => {
      if (audioEnabledRef.current) {
        ensureAudioContext();
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ensureAudioContext]);

  // WebSocket /pubsub connection
  useEffect(() => {
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/pubsub`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ events: subscribedTopics }));
      };

      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data as string) as PubSubMessage;
          if (parsed.eventName === 'StateSnapshot') {
            const snap = parsed.message as unknown as RobotState;
            setRobotState(snap);
            setTelemetryHistory((prev) => {
              const point: TelemetryPoint = {
                t: Date.now(),
                frontCenter: snap.tof.FrontCenter,
                frontLeft: snap.tof.FrontLeft,
                frontRight: snap.tof.FrontRight,
                yaw: snap.imu.yaw,
                pitch: snap.imu.pitch,
              };
              const next = [...prev, point];
              return next.length > 60 ? next.slice(next.length - 60) : next;
            });
            return;
          }

          if (parsed.eventName === 'CameraFrame') {
            const frame = parsed.message as unknown as CameraCaptureResult;
            setLatestCameraFrame(frame);
            if (!pubSubPausedRef.current) {
              setPubSubFeed((prev) => {
                const summaryFrame: PubSubMessage = {
                  eventName: 'CameraFrame',
                  created: parsed.created,
                  message: {
                    source: frame.source,
                    width: frame.width,
                    height: frame.height,
                    contentType: frame.contentType,
                    capturedAt: frame.capturedAt,
                  },
                };
                const next = [summaryFrame, ...prev];
                return next.length > 80 ? next.slice(0, 80) : next;
              });
            }
            return;
          }

          if (!pubSubPausedRef.current) {
            setPubSubFeed((prev) => {
              const next = [parsed, ...prev];
              return next.length > 80 ? next.slice(0, 80) : next;
            });
          }
        } catch {
          // ignore non-json frames
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closed) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const updateSubscriptions = useCallback((topics: string[]) => {
    setSubscribedTopics(topics);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const withSnapshot = Array.from(new Set(['StateSnapshot', ...topics]));
      wsRef.current.send(JSON.stringify({ events: withSnapshot }));
    }
  }, []);

  const sendCommand = useCallback(
    async <T = Record<string, unknown>>(
      path: string,
      body?: Record<string, unknown>,
      method: 'GET' | 'POST' | 'DELETE' = 'POST'
    ): Promise<{ ok: boolean; status: number; durationMs: number; data: T }> => {
      const start = performance.now();
      if (audioEnabledRef.current) {
        ensureAudioContext();
      }
      if (path === '/api/misty/tts/stop') {
        stopAllSpeechPlayback();
      }
      const outboundBody =
        path === '/api/misty/tts/speak'
          ? {
              ttsEngine: ttsEngineRef.current,
              voiceName: neuralVoiceRef.current,
              style: neuralStyleRef.current,
              ...(body ?? {}),
            }
          : body ?? {};
      const res = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Misty-Source': 'studio',
        },
        body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(outboundBody),
      });
      const durationMs = Number((performance.now() - start).toFixed(1));
      const data = (await res.json().catch(() => ({}))) as T;
      void fetchAuxData();
      return { ok: res.ok, status: res.status, durationMs, data };
    },
    [fetchAuxData, stopAllSpeechPlayback, ensureAudioContext]
  );

  const captureCameraFrame = useCallback(
    async (streamType: CameraStreamType = 'rgb', width = 640, height = 480) => {
      const res = await sendCommand<{ result?: CameraCaptureResult }>(
        `/api/misty/camera/${streamType}?base64=true&width=${width}&height=${height}`,
        undefined,
        'GET'
      );
      if (res.ok && res.data?.result) {
        setLatestCameraFrame(res.data.result);
      }
      return res;
    },
    [sendCommand]
  );

  return {
    robotState,
    wsConnected,
    audioEnabled,
    setAudioEnabled,
    speechVoiceURI,
    setSpeechVoiceURI,
    ttsEngine,
    setTtsEngine,
    neuralVoice,
    setNeuralVoice,
    neuralStyle,
    setNeuralStyle,
    ttsLoading,
    ttsNotice,
    lastSpeechEngineLabel,
    subscribedTopics,
    updateSubscriptions,
    pubSubFeed,
    clearPubSubFeed: () => setPubSubFeed([]),
    pubSubPaused,
    setPubSubPaused,
    telemetryHistory,
    latestCameraFrame,
    captureCameraFrame,
    choreographies,
    automations,
    apiLogs,
    bridgeConfig,
    setBridgeConfig,
    sendCommand,
    refreshData: fetchAuxData,
  };
}
