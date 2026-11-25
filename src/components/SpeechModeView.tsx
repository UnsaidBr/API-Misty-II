import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import { rankBrazilianVoice } from '../hooks/useMistyConnection';
import type {
  EyeMood,
  LedMode,
  NeuralSpeechStyle,
  NeuralVoiceName,
  RobotState,
  TtsEngine,
} from '../types/misty';
import { MistyDigitalTwin } from './MistyDigitalTwin';

interface SpeechModeViewProps {
  state: RobotState;
  audioEnabled: boolean;
  setAudioEnabled: (v: boolean) => void;
  speechVoiceURI: string;
  setSpeechVoiceURI: (uri: string) => void;
  ttsEngine: TtsEngine;
  setTtsEngine: (engine: TtsEngine) => void;
  neuralVoice: NeuralVoiceName;
  setNeuralVoice: (voice: NeuralVoiceName) => void;
  neuralStyle: NeuralSpeechStyle;
  setNeuralStyle: (style: NeuralSpeechStyle) => void;
  ttsLoading: boolean;
  ttsNotice: string | null;
  lastSpeechEngineLabel: string;
  sendCommand: (
    path: string,
    body?: Record<string, unknown>,
    method?: 'GET' | 'POST' | 'DELETE'
  ) => Promise<{ ok: boolean; status: number; durationMs: number; data: Record<string, unknown> }>;
}

type SpeechOperationMode = 'tts' | 'dictation' | 'voice_commands';
type HeadGesture = 'none' | 'nod' | 'tilt';

interface ExpressionPreset {
  id: string;
  label: string;
  mood?: EyeMood;
  led?: { r: number; g: number; b: number; mode: LedMode };
}

interface SpeechHistoryEntry {
  id: string;
  text: string;
  origin: 'Texto' | 'Ditado' | 'Comando';
  actionSummary?: string;
  rate: number;
  pitch: number;
  timeLabel: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const EXPRESSION_PRESETS: ExpressionPreset[] = [
  { id: 'keep', label: 'Manter expressão atual' },
  {
    id: 'friendly',
    label: 'Amigável (Feliz + LED Esmeralda)',
    mood: 'happy',
    led: { r: 16, g: 185, b: 129, mode: 'solid' },
  },
  {
    id: 'curious',
    label: 'Curiosa (Olhar curioso + Ciano)',
    mood: 'curious',
    led: { r: 14, g: 165, b: 233, mode: 'breathe' },
  },
  {
    id: 'processing',
    label: 'Analítica (Processando + Âmbar)',
    mood: 'processing',
    led: { r: 245, g: 158, b: 11, mode: 'breathe' },
  },
  {
    id: 'alert',
    label: 'Alerta (Olhos alerta + Vermelho)',
    mood: 'alert',
    led: { r: 239, g: 68, b: 68, mode: 'blink' },
  },
];

const NEURAL_VOICES: Array<{ id: NeuralVoiceName; label: string }> = [
  { id: 'Kore', label: 'Kore · Feminina Natural (Padrão)' },
  { id: 'Zephyr', label: 'Zephyr · Feminina Suave e Acolhedora' },
  { id: 'Puck', label: 'Puck · Expressiva e Dinâmica' },
  { id: 'Charon', label: 'Charon · Masculina Firme e Clara' },
  { id: 'Fenrir', label: 'Fenrir · Masculina Grave e Calma' },
];

const NEURAL_STYLES: Array<{ id: NeuralSpeechStyle; label: string }> = [
  { id: 'natural', label: 'Conversa Brasileira Natural' },
  { id: 'friendly', label: 'Simpática e Sorridente' },
  { id: 'lab', label: 'Pesquisadora de Laboratório' },
  { id: 'calm', label: 'Calma e Didática' },
  { id: 'enthusiastic', label: 'Animada e Entusiasta' },
];

const QUICK_PHRASES: Array<{ label: string; text: string; presetId: string; gesture: HeadGesture }> = [
  {
    label: 'Saudação Brasileira',
    text: 'Oi, tudo bem? Eu sou a Misty dois! Meus sensores já estão ligados e tô pronta pra te ajudar aqui no laboratório.',
    presetId: 'friendly',
    gesture: 'nod',
  },
  {
    label: 'Status da Arena',
    text: 'Prontinho, acabei de checar o ambiente. O caminho tá livre aqui na frente pra gente continuar os testes.',
    presetId: 'curious',
    gesture: 'tilt',
  },
  {
    label: 'Pedido de Passagem',
    text: 'Com licença pessoal, vou me movimentar um pouquinho aqui pela área de testes, tá bom?',
    presetId: 'processing',
    gesture: 'nod',
  },
  {
    label: 'Alerta de Proximidade',
    text: 'Opa, atenção! Tem um obstáculo bem pertinho do sensor frontal. Vou reduzir a velocidade por segurança.',
    presetId: 'alert',
    gesture: 'none',
  },
];

const VOICE_COMMAND_HINTS = [
  { phrase: '"frente" / "avançar"', effect: 'Move a Misty para frente em passo curto' },
  { phrase: '"trás" / "voltar"', effect: 'Recua em passo curto' },
  { phrase: '"esquerda" / "direita"', effect: 'Gira para o lado indicado' },
  { phrase: '"pare" / "parar"', effect: 'Aciona parada imediata dos motores' },
  { phrase: '"saudar" / "curiosa" / "alerta" / "celebrar"', effect: 'Aplica preset corporal completo' },
  { phrase: '"fale <frase>"', effect: 'Faz a Misty repetir exatamente a frase falada' },
];

export const SpeechModeView: React.FC<SpeechModeViewProps> = ({
  state,
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
  sendCommand,
}) => {
  const [mode, setMode] = useState<SpeechOperationMode>('tts');
  const [text, setText] = useState(
    'Oi! Tudo bem por aí? Agora estou falando com pronúncia em português brasileiro bem mais natural.'
  );
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [expressionId, setExpressionId] = useState('friendly');
  const [headGesture, setHeadGesture] = useState<HeadGesture>('nod');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [history, setHistory] = useState<SpeechHistoryEntry[]>([]);

  // Live microphone recognition state
  const [micActive, setMicActive] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [lastVoiceFeedback, setLastVoiceFeedback] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const micActiveRef = useRef(micActive);
  micActiveRef.current = micActive;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const pitchRef = useRef(pitch);
  pitchRef.current = pitch;
  const expressionIdRef = useRef(expressionId);
  expressionIdRef.current = expressionId;
  const headGestureRef = useRef(headGesture);
  headGestureRef.current = headGesture;

  const speechRecognitionSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  // Load and rank browser speech synthesis voices (preferring native pt-BR)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices();
      const sorted = [...list].sort(
        (a, b) => rankBrazilianVoice(b) - rankBrazilianVoice(a) || a.name.localeCompare(b.name)
      );
      setVoices(sorted);
      if (!speechVoiceURI && sorted.length > 0) {
        const ptVoice = sorted.find((v) => v.lang.toLowerCase().startsWith('pt'));
        if (ptVoice) setSpeechVoiceURI(ptVoice.voiceURI);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [speechVoiceURI, setSpeechVoiceURI]);

  // Clean up mic on unmount
  useEffect(() => {
    return () => {
      micActiveRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  const pushHistory = (
    spokenText: string,
    origin: SpeechHistoryEntry['origin'],
    actionSummary?: string
  ) => {
    const entry: SpeechHistoryEntry = {
      id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: spokenText,
      origin,
      actionSummary,
      rate: rateRef.current,
      pitch: pitchRef.current,
      timeLabel: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
    setHistory((prev) => [entry, ...prev].slice(0, 18));
  };

  const speakUtterance = async (
    utteranceText: string,
    origin: SpeechHistoryEntry['origin'] = 'Texto',
    overridePresetId?: string,
    overrideGesture?: HeadGesture
  ) => {
    const trimmed = utteranceText.trim();
    if (!trimmed) return;
    const preset = EXPRESSION_PRESETS.find((p) => p.id === (overridePresetId ?? expressionIdRef.current));
    const gesture = overrideGesture ?? headGestureRef.current;

    await sendCommand('/api/misty/tts/speak', {
      text: trimmed,
      rate: rateRef.current,
      pitch: pitchRef.current,
      mood: preset?.mood,
      led: preset?.led,
      headGesture: gesture,
      displayText: trimmed,
    });
    pushHistory(trimmed, origin);
  };

  const handleVoiceCommand = async (rawTranscript: string) => {
    const normalized = rawTranscript
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    let summary = '';
    if (normalized.startsWith('fale ') || normalized.startsWith('diga ')) {
      const spoken = rawTranscript.trim().replace(/^(fale|diga)\s+/i, '');
      await speakUtterance(spoken, 'Comando');
      setLastVoiceFeedback(`Fala executada: "${spoken}"`);
      return;
    }

    if (normalized.includes('pare') || normalized.includes('parar') || normalized.includes('stop')) {
      await sendCommand('/api/misty/drive/stop', {});
      summary = 'Parada imediata (drive/stop)';
    } else if (normalized.includes('frente') || normalized.includes('avancar')) {
      await sendCommand('/api/misty/drive', { linearVelocity: 20, angularVelocity: 0, durationMs: 360 });
      summary = 'Avanço curto para frente';
    } else if (normalized.includes('tras') || normalized.includes('voltar') || normalized.includes('re')) {
      await sendCommand('/api/misty/drive', { linearVelocity: -20, angularVelocity: 0, durationMs: 360 });
      summary = 'Recuo curto para trás';
    } else if (normalized.includes('esquerda')) {
      await sendCommand('/api/misty/drive', { linearVelocity: 0, angularVelocity: 25, durationMs: 360 });
      summary = 'Giro à esquerda';
    } else if (normalized.includes('direita')) {
      await sendCommand('/api/misty/drive', { linearVelocity: 0, angularVelocity: -25, durationMs: 360 });
      summary = 'Giro à direita';
    } else if (normalized.includes('saudar') || normalized.includes('oi') || normalized.includes('ola')) {
      await sendCommand('/api/misty/pose/preset', { preset: 'greeting' });
      summary = 'Preset Saudação';
    } else if (normalized.includes('curios')) {
      await sendCommand('/api/misty/pose/preset', { preset: 'curious' });
      summary = 'Preset Curiosa';
    } else if (normalized.includes('celebr')) {
      await sendCommand('/api/misty/pose/preset', { preset: 'celebrate' });
      summary = 'Preset Celebrar';
    } else if (normalized.includes('alerta') || normalized.includes('perigo')) {
      await sendCommand('/api/misty/pose/preset', { preset: 'alert' });
      summary = 'Preset Alerta';
    } else if (normalized.includes('repouso') || normalized.includes('dormir')) {
      await sendCommand('/api/misty/pose/preset', { preset: 'sleep' });
      summary = 'Preset Repouso';
    } else if (normalized.includes('led verde')) {
      await sendCommand('/api/misty/led', { red: 16, green: 185, blue: 129 });
      summary = 'LED Esmeralda';
    } else if (normalized.includes('led azul') || normalized.includes('led ciano')) {
      await sendCommand('/api/misty/led', { red: 14, green: 165, blue: 233 });
      summary = 'LED Ciano';
    } else if (normalized.includes('led vermelho')) {
      await sendCommand('/api/misty/led', { red: 239, green: 68, blue: 68 });
      summary = 'LED Vermelho';
    } else {
      await speakUtterance(rawTranscript, 'Comando');
      setLastVoiceFeedback(`Sem comando específico — Misty repetiu: "${rawTranscript}"`);
      return;
    }

    pushHistory(rawTranscript, 'Comando', summary);
    setLastVoiceFeedback(`Comando executado: ${summary}`);
  };

  const stopMicrophone = () => {
    micActiveRef.current = false;
    setMicActive(false);
    setInterimTranscript('');
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore stop error
    }
  };

  const startMicrophone = () => {
    setMicError(null);
    if (!speechRecognitionSupported) {
      setMicError('Reconhecimento de voz não suportado neste navegador. Use Chrome ou Edge.');
      return;
    }
    const Ctor = (
      window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
      }
    ).SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
        }
      ).webkitSpeechRecognition;

    if (!Ctor) return;

    try {
      const rec = new Ctor();
      rec.lang = 'pt-BR';
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0]?.transcript?.trim() ?? '';
          if (res.isFinal && transcript) {
            setText(transcript);
            if (modeRef.current === 'voice_commands') {
              void handleVoiceCommand(transcript);
            } else {
              void speakUtterance(transcript, 'Ditado');
            }
          } else if (transcript) {
            interim += `${transcript} `;
          }
        }
        setInterimTranscript(interim.trim());
      };

      rec.onerror = (ev) => {
        if (ev.error === 'not-allowed') {
          setMicError('Permissão do microfone negada no navegador.');
        } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
          setMicError(`Erro de microfone: ${ev.error}`);
        }
        micActiveRef.current = false;
        setMicActive(false);
      };

      rec.onend = () => {
        if (micActiveRef.current) {
          try {
            rec.start();
          } catch {
            micActiveRef.current = false;
            setMicActive(false);
          }
        } else {
          setMicActive(false);
        }
      };

      recognitionRef.current = rec;
      micActiveRef.current = true;
      setMicActive(true);
      rec.start();
    } catch {
      setMicError('Não foi possível iniciar a captura do microfone.');
      micActiveRef.current = false;
      setMicActive(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Speech Studio & Voice Modes */}
      <div className="xl:col-span-7 space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Modo de Fala e Interação Vocal
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Síntese TTS expressiva, ditado ao vivo por microfone e comandos de voz em português
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setMode('tts');
                  if (micActive) stopMicrophone();
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  mode === 'tts'
                    ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Texto TTS
              </button>
              <button
                type="button"
                onClick={() => setMode('dictation')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  mode === 'dictation'
                    ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                Ditado ao Vivo
              </button>
              <button
                type="button"
                onClick={() => setMode('voice_commands')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  mode === 'voice_commands'
                    ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <AudioLines className="w-3.5 h-3.5" />
                Comandos Voz
              </button>
            </div>
          </div>

          {!audioEnabled && (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2">
                <VolumeX className="w-4 h-4 shrink-0" />
                <span>O áudio do navegador está silenciado. Ative para ouvir a Misty falando.</span>
              </div>
              <button
                type="button"
                onClick={() => setAudioEnabled(true)}
                className="px-2.5 py-1 font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-md cursor-pointer whitespace-nowrap shrink-0"
              >
                Ativar Áudio
              </button>
            </div>
          )}

          {/* Microphone Bar for Dictation & Voice Commands */}
          {(mode === 'dictation' || mode === 'voice_commands') && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {mode === 'dictation'
                      ? 'Microfone → Misty Repete ao Vivo'
                      : 'Controle por Comandos de Voz (pt-BR)'}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {mode === 'dictation'
                      ? 'Fale no microfone; cada frase reconhecida é enviada automaticamente para POST /api/misty/tts/speak.'
                      : 'Fale comandos como "frente", "esquerda", "pare", "saudar", "curiosa" ou "fale <frase>".'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={micActive ? stopMicrophone : startMicrophone}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    micActive
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-sky-600 hover:bg-sky-700 text-white'
                  }`}
                >
                  {micActive ? (
                    <>
                      <MicOff className="w-3.5 h-3.5" />
                      Parar Microfone
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      Ativar Microfone
                    </>
                  )}
                </button>
              </div>

              {micActive && (
                <div className="px-3 py-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 font-mono">
                  {interimTranscript || 'Escutando em pt-BR... fale normalmente.'}
                </div>
              )}

              {lastVoiceFeedback && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">{lastVoiceFeedback}</p>
              )}

              {micError && <p className="text-xs text-red-600 dark:text-red-400">{micError}</p>}

              {mode === 'voice_commands' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px]">
                  {VOICE_COMMAND_HINTS.map((hint) => (
                    <div
                      key={hint.phrase}
                      className="px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    >
                      <span className="font-mono font-medium text-sky-700 dark:text-sky-300">
                        {hint.phrase}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 ml-1.5">
                        — {hint.effect}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Expressive Text Composer */}
          <div className="space-y-3">
            <label
              htmlFor="speech-composer"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Texto para Falar (Ctrl+Enter para enviar)
            </label>
            <textarea
              id="speech-composer"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void speakUtterance(text, 'Texto');
                }
              }}
              placeholder="Digite o que a Misty II deve falar..."
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>Velocidade da Fala (Rate)</span>
                  <span className="font-mono tabular-nums">{rate.toFixed(2)}x</span>
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={1.8}
                  step={0.05}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>Altura Tonal (Pitch)</span>
                  <span className="font-mono tabular-nums">{pitch.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={0.6}
                  max={1.8}
                  step={0.05}
                  value={pitch}
                  onChange={(e) => setPitch(Number(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Expressão Sincronizada
                </label>
                <select
                  value={expressionId}
                  onChange={(e) => setExpressionId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                >
                  {EXPRESSION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Gesto da Cabeça ao Falar
                </label>
                <select
                  value={headGesture}
                  onChange={(e) => setHeadGesture(e.target.value as HeadGesture)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                >
                  <option value="nod">Aceno leve (Nod)</option>
                  <option value="tilt">Inclinação curiosa (Tilt)</option>
                  <option value="none">Sem movimento</option>
                </select>
              </div>
            </div>

            {/* Motor de Voz Nativa Brasileira */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    Motor de Voz em Português (pt-BR)
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {ttsEngine === 'neural'
                      ? 'Voz neural humana brasileira com sotaque natural (fallback automático para navegador)'
                      : 'Voz local instantânea do navegador priorizando motores pt-BR'}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md">
                  <button
                    type="button"
                    onClick={() => setTtsEngine('neural')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer whitespace-nowrap shrink-0 ${
                      ttsEngine === 'neural'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    Voz Neural Nativa
                  </button>
                  <button
                    type="button"
                    onClick={() => setTtsEngine('browser')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer whitespace-nowrap shrink-0 ${
                      ttsEngine === 'browser'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Voz do Navegador
                  </button>
                </div>
              </div>

              {ttsEngine === 'neural' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      Persona Vocal (Neural)
                    </label>
                    <select
                      value={neuralVoice}
                      onChange={(e) => setNeuralVoice(e.target.value as NeuralVoiceName)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      {NEURAL_VOICES.map((nv) => (
                        <option key={nv.id} value={nv.id}>
                          {nv.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      Estilo de Pronúncia Brasileira
                    </label>
                    <select
                      value={neuralStyle}
                      onChange={(e) => setNeuralStyle(e.target.value as NeuralSpeechStyle)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      {NEURAL_STYLES.map((ns) => (
                        <option key={ns.id} value={ns.id}>
                          {ns.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                voices.length > 0 && (
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      Voz Sintetizada no Navegador (ordenadas por qualidade pt-BR)
                    </label>
                    <select
                      value={speechVoiceURI}
                      onChange={(e) => setSpeechVoiceURI(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      {voices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                )
              )}

              {ttsNotice && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-2.5 py-1.5">
                  {ttsNotice}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={ttsLoading}
                  onClick={() => void speakUtterance(text, 'Texto')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {ttsLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  {ttsLoading ? 'Sintetizando pt-BR...' : 'Falar Agora'}
                </button>
                <button
                  type="button"
                  onClick={() => void sendCommand('/api/misty/tts/stop', {})}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5" />
                  Parar Fala
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    void sendCommand('/api/misty/audio/tone', {
                      frequency: 523,
                      durationMs: 220,
                      waveform: 'triangle',
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:border-sky-500 text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Waves className="w-3.5 h-3.5" />
                  Chime OK
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void sendCommand('/api/misty/audio/tone', {
                      frequency: 880,
                      durationMs: 300,
                      waveform: 'square',
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:border-sky-500 text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Waves className="w-3.5 h-3.5" />
                  Bipe Alerta
                </button>
              </div>
            </div>
          </div>

          {/* Quick Phrases */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Frases Rápidas de Laboratório
            </span>
            <div className="flex flex-wrap gap-2">
              {QUICK_PHRASES.map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  onClick={() => {
                    setText(qp.text);
                    setExpressionId(qp.presetId);
                    setHeadGesture(qp.gesture);
                    void speakUtterance(qp.text, 'Texto', qp.presetId, qp.gesture);
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:border-sky-500 hover:text-sky-700 dark:hover:text-sky-300 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Speech Session History */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Histórico de Falas da Sessão
            </h3>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setHistory([])}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Nenhuma fala enviada nesta sessão ainda.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span>{item.timeLabel}</span>
                      <span>·</span>
                      <span className="text-sky-700 dark:text-sky-300 font-medium">{item.origin}</span>
                      {item.actionSummary && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {item.actionSummary}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-slate-800 dark:text-slate-100 truncate mt-0.5">{item.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setText(item.text);
                      void speakUtterance(item.text, 'Texto');
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                    title="Repetir fala"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Repetir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Live Digital Twin + Voice Status */}
      <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Monitor Vocal e Expressivo
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lastSpeechEngineLabel}
            </p>
          </div>
          <span
            className={`text-xs font-medium ${
              state.speech.isSpeaking
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {state.speech.isSpeaking ? 'Falando agora' : 'Em espera'}
          </span>
        </div>

        <MistyDigitalTwin
          state={state}
          onTouchSensor={(kind, sensor) =>
            void sendCommand('/api/misty/touch/simulate', { kind, sensor })
          }
        />

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>Última fala emitida</span>
            <span>
              Rate {state.speech.rate.toFixed(2)}x · Pitch {state.speech.pitch.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-slate-800 dark:text-slate-100">
            {state.speech.lastUtterance || 'Aguardando primeira frase...'}
          </p>
        </div>
      </div>
    </div>
  );
};
