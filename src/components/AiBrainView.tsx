import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  ScanEye,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CameraStreamType, RobotState } from '../types/misty';
import { MistyDigitalTwin } from './MistyDigitalTwin';

interface AiBrainViewProps {
  state: RobotState;
  audioEnabled: boolean;
  setAudioEnabled: (v: boolean) => void;
  sendCommand: (
    path: string,
    body?: Record<string, unknown>,
    method?: 'GET' | 'POST' | 'DELETE'
  ) => Promise<{ ok: boolean; status: number; durationMs: number; data: Record<string, unknown> }>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  executedActions?: string[];
  timeLabel: string;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const MISSION_PROMPTS = [
  'Faça uma saudação amigável, acene e informe o nível da bateria.',
  'Olhe para a esquerda e para a direita com curiosidade e verifique os sensores ToF.',
  'Execute a coreografia de patrulha e avise o que está fazendo.',
  'Analise os obstáculos ao redor e me diga se o caminho à frente está livre.',
];

export const AiBrainView: React.FC<AiBrainViewProps> = ({
  state,
  audioEnabled,
  setAudioEnabled,
  sendCommand,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzingScene, setAnalyzingScene] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [includeCamera, setIncludeCamera] = useState(true);
  const [streamType, setStreamType] = useState<CameraStreamType>(state.camera.streamType ?? 'rgb');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<
    { type: 'chat'; prompt: string; history: Array<{ role: 'user' | 'model'; text: string }> } | { type: 'scene' } | null
  >(null);
  const [lastModelUsed, setLastModelUsed] = useState<string>('gemini-4-hydrogen');
  const [sceneReport, setSceneReport] = useState<string | null>(null);
  const [micListening, setMicListening] = useState(false);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore cleanup
      }
    };
  }, []);

  const sendMessageToAi = async (
    promptText: string,
    retryContext?: { history: Array<{ role: 'user' | 'model'; text: string }> }
  ) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;

    setErrorMsg(null);
    setLastFailedAction(null);

    const historyPayload =
      retryContext?.history ??
      messages.slice(-8).map((m) => ({
        role: m.role,
        text: m.text,
      }));

    if (!retryContext) {
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed,
        timeLabel: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
    }
    setLoading(true);

    try {
      const res = await sendCommand('/api/misty/ai/chat', {
        message: trimmed,
        history: historyPayload,
        includeCamera,
        streamType,
        autoSpeak,
      });

      if (!res.ok) {
        const err = typeof res.data?.error === 'string' ? res.data.error : `Erro HTTP ${res.status}`;
        setErrorMsg(err);
        setLastFailedAction({ type: 'chat', prompt: trimmed, history: historyPayload });
        return;
      }

      if (typeof res.data?.model === 'string') {
        setLastModelUsed(res.data.model);
      }

      const replyText =
        typeof res.data?.reply === 'string' ? res.data.reply : 'Comando processado.';
      const executedActions = Array.isArray(res.data?.executedActions)
        ? res.data.executedActions.map(String)
        : [];

      const modelMsg: ChatMessage = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: replyText,
        executedActions,
        timeLabel: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, modelMsg]);
    } catch {
      setErrorMsg('Falha de comunicação com o servidor de IA.');
      setLastFailedAction({ type: 'chat', prompt: trimmed, history: historyPayload });
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeScene = async () => {
    if (analyzingScene) return;
    setErrorMsg(null);
    setLastFailedAction(null);
    setAnalyzingScene(true);
    try {
      const res = await sendCommand('/api/misty/ai/analyze-scene', {
        streamType,
        autoSpeak,
      });
      if (!res.ok) {
        const err = typeof res.data?.error === 'string' ? res.data.error : `Erro HTTP ${res.status}`;
        setErrorMsg(err);
        setLastFailedAction({ type: 'scene' });
        return;
      }
      if (typeof res.data?.model === 'string') {
        setLastModelUsed(res.data.model);
      }
      const analysis = typeof res.data?.analysis === 'string' ? res.data.analysis : '';
      setSceneReport(analysis);
    } catch {
      setErrorMsg('Falha ao analisar ambiente com IA.');
      setLastFailedAction({ type: 'scene' });
    } finally {
      setAnalyzingScene(false);
    }
  };

  const toggleVoiceInput = () => {
    if (micListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setMicListening(false);
      return;
    }

    const Ctor =
      (
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

    if (!Ctor) {
      setErrorMsg('Captura de voz não suportada neste navegador.');
      return;
    }

    setErrorMsg(null);
    const rec = new Ctor();
    rec.lang = 'pt-BR';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (ev) => {
      const transcript = ev.results[ev.resultIndex]?.[0]?.transcript?.trim();
      if (transcript) {
        void sendMessageToAi(transcript);
      }
    };
    rec.onerror = (ev) => {
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        setErrorMsg(`Erro no microfone: ${ev.error}`);
      }
      setMicListening(false);
    };
    rec.onend = () => {
      setMicListening(false);
    };

    recognitionRef.current = rec;
    setMicListening(true);
    rec.start();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Conversational AI Console */}
      <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              Cérebro IA da Misty II
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Converse naturalmente; a IA lê sensores, analisa a câmera e executa ações físicas no robô
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIncludeCamera((v) => !v)}
              aria-pressed={includeCamera}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                includeCamera
                  ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Visão Câmera
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !autoSpeak;
                setAutoSpeak(next);
                if (next && !audioEnabled) setAudioEnabled(true);
              }}
              aria-pressed={autoSpeak}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                autoSpeak
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {autoSpeak ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              Falar Respostas
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                title="Limpar conversa"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Chat Stream */}
        <div className="h-[380px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Peça para a Misty conversar, mover a cabeça, acenar, navegar na arena ou inspecionar obstáculos ao redor.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {MISSION_PROMPTS.map((mp) => (
                  <button
                    key={mp}
                    type="button"
                    onClick={() => void sendMessageToAi(mp)}
                    className="text-left px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-sky-500 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    {mp}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-sky-600 text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>

                  {m.executedActions && m.executedActions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5">
                      {m.executedActions.map((act, idx) => (
                        <span
                          key={`${m.id}-act-${idx}`}
                          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-sky-700 dark:text-sky-300"
                        >
                          {act}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-mono tabular-nums text-slate-400 mt-1 px-1">
                  {m.role === 'user' ? 'Operador' : 'Misty IA'} · {m.timeLabel}
                </span>
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
              <span>Misty está pensando e acionando comandos...</span>
            </div>
          )}
          <div ref={listEndRef} />
        </div>

        {errorMsg && (
          <div className="px-3.5 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
            <span>{errorMsg}</span>
            {lastFailedAction && (
              <button
                type="button"
                disabled={loading || analyzingScene}
                onClick={() => {
                  if (lastFailedAction.type === 'chat') {
                    void sendMessageToAi(lastFailedAction.prompt, {
                      history: lastFailedAction.history,
                    });
                  } else {
                    void handleAnalyzeScene();
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-100 dark:bg-red-900/60 hover:bg-red-200 dark:hover:bg-red-900 text-red-800 dark:text-red-100 font-medium whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessageToAi(input);
          }}
          className="flex items-center gap-2"
        >
          <button
            type="button"
            onClick={toggleVoiceInput}
            className={`p-2.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
              micListening
                ? 'bg-red-600 border-red-600 text-white'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-sky-500'
            }`}
            title={micListening ? 'Parar ditado por voz' : 'Falar comando com a IA'}
            aria-label="Falar com a IA pelo microfone"
          >
            {micListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder={
              micListening
                ? 'Ouvindo em pt-BR...'
                : 'Converse ou dê uma ordem à Misty (ex: "Olhe para mim e acene")...'
            }
            className="flex-1 min-w-0 px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            Enviar
          </button>
        </form>
      </div>

      {/* Right: Live Digital Twin + Scene Inspection */}
      <div className="xl:col-span-5 space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Corpo e Expressão em Tempo Real
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Modelo ativo: <span className="font-mono">{lastModelUsed}</span> · Execução via API REST
              </p>
            </div>
          </div>

          <MistyDigitalTwin
            state={state}
            onTouchSensor={(kind, sensor) =>
              void sendCommand('/api/misty/touch/simulate', { kind, sensor })
            }
          />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Inspeção Multimodal do Ambiente
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Combina câmera, sensores ToF e mapa SLAM
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={streamType}
                onChange={(e) => setStreamType(e.target.value as CameraStreamType)}
                className="px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-100"
                aria-label="Fluxo para análise"
              >
                <option value="rgb">Frontal RGB</option>
                <option value="depth">Profundidade</option>
                <option value="fisheye">SLAM Fisheye</option>
              </select>

              <button
                type="button"
                onClick={() => void handleAnalyzeScene()}
                disabled={analyzingScene}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {analyzingScene ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ScanEye className="w-3.5 h-3.5" />
                )}
                Analisar Agora
              </button>
            </div>
          </div>

          {sceneReport ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-800 dark:text-slate-100 leading-relaxed">
              {sceneReport}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clique em Analisar Agora para gerar um diagnóstico imediato dos obstáculos ao redor.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
