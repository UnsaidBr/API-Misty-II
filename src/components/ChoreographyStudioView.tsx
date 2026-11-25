import React, { useEffect, useState } from 'react';
import { Play, Plus, Save, Sparkles, Square, Trash2 } from 'lucide-react';
import type {
  ChoreographyKeyframe,
  ChoreographySequence,
  EasingCurve,
  EyeMood,
  LedMode,
  RobotState,
} from '../types/misty';
import { MistyDigitalTwin } from './MistyDigitalTwin';

interface ChoreographyStudioViewProps {
  state: RobotState;
  choreographies: ChoreographySequence[];
  sendCommand: (
    path: string,
    body?: Record<string, unknown>,
    method?: 'GET' | 'POST' | 'DELETE'
  ) => Promise<{ ok: boolean; status: number; durationMs: number; data: Record<string, unknown> }>;
  onRefresh: () => void;
}

export const ChoreographyStudioView: React.FC<ChoreographyStudioViewProps> = ({
  state,
  choreographies,
  sendCommand,
  onRefresh,
}) => {
  const [selectedId, setSelectedId] = useState<string>('chor-greeting');
  const [draft, setDraft] = useState<ChoreographySequence | null>(null);
  const [selectedKfId, setSelectedKfId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ text: string; isError?: boolean } | null>(null);
  const [playheadMs, setPlayheadMs] = useState<number>(0);

  // Initialize draft once when choreographies first arrive (never clobber unsaved new drafts)
  useEffect(() => {
    if (draft || choreographies.length === 0) return;
    const found = choreographies.find((c) => c.id === selectedId) ?? choreographies[0];
    if (found) {
      setDraft(structuredClone(found));
      setSelectedId(found.id);
      setSelectedKfId(found.keyframes[0]?.id ?? null);
    }
  }, [choreographies, selectedId, draft]);

  // Animate playhead while activeChoreography plays
  useEffect(() => {
    if (!state.activeChoreography?.isPlaying) {
      setPlayheadMs(0);
      return;
    }
    let raf: number;
    const tick = () => {
      if (state.activeChoreography) {
        const elapsed = Date.now() - state.activeChoreography.startedAt;
        setPlayheadMs(Math.min(elapsed, state.activeChoreography.durationMs));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.activeChoreography]);

  if (!draft) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
        Carregando estúdio de coreografia...
      </div>
    );
  }

  const activeKeyframe = draft.keyframes.find((k) => k.id === selectedKfId) ?? draft.keyframes[0];

  const updateKeyframe = (kfId: string, updater: (kf: ChoreographyKeyframe) => ChoreographyKeyframe) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const updated = prev.keyframes.map((k) => (k.id === kfId ? updater(k) : k));
      updated.sort((a, b) => a.timeMs - b.timeMs);
      const maxTime = updated.reduce((acc, k) => Math.max(acc, k.timeMs), 1000);
      return {
        ...prev,
        durationMs: Math.max(prev.durationMs, maxTime + 600),
        keyframes: updated,
      };
    });
  };

  const handleAddKeyframe = () => {
    const lastTime = draft.keyframes.reduce((m, k) => Math.max(m, k.timeMs), 0);
    const newKf: ChoreographyKeyframe = {
      id: `kf-${Date.now()}`,
      timeMs: Math.min(lastTime + 800, 12000),
      label: `Passo ${draft.keyframes.length + 1}`,
      easing: 'easeInOut',
      head: { pitch: -8, roll: 0, yaw: 0 },
      arms: { left: 30, right: 30 },
      led: { r: 14, g: 165, b: 233, mode: 'solid' },
      eyes: { mood: 'happy', displayText: '' },
    };
    setDraft({
      ...draft,
      durationMs: Math.max(draft.durationMs, newKf.timeMs + 800),
      keyframes: [...draft.keyframes, newKf].sort((a, b) => a.timeMs - b.timeMs),
    });
    setSelectedKfId(newKf.id);
  };

  const handleDeleteKeyframe = (kfId: string) => {
    if (draft.keyframes.length <= 1) return;
    const remaining = draft.keyframes.filter((k) => k.id !== kfId);
    setDraft({ ...draft, keyframes: remaining });
    setSelectedKfId(remaining[0]?.id ?? null);
  };

  const handleCreateSequence = () => {
    const id = `chor-${Date.now()}`;
    const fresh: ChoreographySequence = {
      id,
      name: 'Nova Coreografia',
      description: 'Sequência personalizada criada no estúdio.',
      durationMs: 3600,
      keyframes: [
        {
          id: `kf-${Date.now()}-1`,
          timeMs: 0,
          label: 'Início',
          easing: 'easeInOut',
          head: { pitch: -10, roll: 0, yaw: 0 },
          arms: { left: 40, right: 40 },
          led: { r: 14, g: 165, b: 233, mode: 'solid' },
          eyes: { mood: 'happy', displayText: 'Iniciando sequência!' },
        },
        {
          id: `kf-${Date.now()}-2`,
          timeMs: 1800,
          label: 'Aceno',
          easing: 'spring',
          head: { pitch: -14, roll: 12, yaw: 20 },
          arms: { left: 40, right: -22 },
        },
      ],
    };
    setDraft(fresh);
    setSelectedId(id);
    setSelectedKfId(fresh.keyframes[0].id);
  };

  const showNotice = (text: string, isError = false) => {
    setStatusNotice({ text, isError });
    setTimeout(() => setStatusNotice(null), 2600);
  };

  const handleSave = async () => {
    const res = await sendCommand(
      '/api/misty/choreography/save',
      draft as unknown as Record<string, unknown>
    );
    if (res.ok) {
      setSelectedId(draft.id);
      onRefresh();
      showNotice('Sequência salva no servidor');
    } else {
      showNotice('Erro ao salvar sequência', true);
    }
  };

  const handleRun = async () => {
    const saveRes = await sendCommand(
      '/api/misty/choreography/save',
      draft as unknown as Record<string, unknown>
    );
    if (!saveRes.ok) {
      showNotice('Falha ao salvar antes da reprodução', true);
      return;
    }
    const runRes = await sendCommand('/api/misty/choreography/run', {
      choreographyId: draft.id,
      sequence: draft,
    });
    if (runRes.ok) {
      onRefresh();
      showNotice(`Reproduzindo "${draft.name}" (${draft.keyframes.length} passos)`);
    } else {
      showNotice('Não foi possível iniciar a coreografia', true);
    }
  };

  const handleDeleteSequence = async () => {
    const isSaved = choreographies.some((c) => c.id === draft.id);
    if (isSaved) {
      if (choreographies.length <= 1) return;
      const res = await sendCommand(`/api/misty/choreography/${draft.id}`, undefined, 'DELETE');
      if (res.ok) {
        onRefresh();
        const fallback = choreographies.find((c) => c.id !== draft.id) ?? choreographies[0];
        if (fallback) {
          setSelectedId(fallback.id);
          setDraft(structuredClone(fallback));
          setSelectedKfId(fallback.keyframes[0]?.id ?? null);
        }
        showNotice('Sequência removida');
      }
    } else {
      const fallback = choreographies[0];
      if (fallback) {
        setSelectedId(fallback.id);
        setDraft(structuredClone(fallback));
        setSelectedKfId(fallback.keyframes[0]?.id ?? null);
      }
    }
  };

  const handlePreviewKeyframe = async (kf: ChoreographyKeyframe) => {
    if (kf.head) {
      await sendCommand('/api/misty/head', {
        pitch: kf.head.pitch,
        roll: kf.head.roll,
        yaw: kf.head.yaw,
        easing: kf.easing,
      });
    }
    if (kf.arms) {
      await sendCommand('/api/misty/arms', {
        leftArmPosition: kf.arms.left,
        rightArmPosition: kf.arms.right,
      });
    }
    if (kf.led) {
      await sendCommand('/api/misty/led/transition', {
        red: kf.led.r,
        green: kf.led.g,
        blue: kf.led.b,
        mode: kf.led.mode,
        periodMs: 1200,
      });
    }
    if (kf.eyes) {
      await sendCommand('/api/misty/eyes', {
        mood: kf.eyes.mood,
        displayText: kf.eyes.displayText ?? '',
      });
    }
    if (kf.speech?.text) {
      await sendCommand('/api/misty/tts/speak', { text: kf.speech.text });
    }
    showNotice(`Prévia aplicada: ${kf.label}`);
  };

  const isPlayingThis = state.activeChoreography?.id === draft.id && state.activeChoreography.isPlaying;
  const activeDurationMs = state.activeChoreography?.durationMs ?? draft.durationMs;

  return (
    <div className="space-y-6">
      {/* Top Sequence Selector & Playback Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={draft.id}
              onChange={(e) => {
                setSelectedId(e.target.value);
                const found = choreographies.find((c) => c.id === e.target.value);
                if (found) {
                  setDraft(structuredClone(found));
                  setSelectedKfId(found.keyframes[0]?.id ?? null);
                }
              }}
              className="text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
              aria-label="Selecionar coreografia"
            >
              {choreographies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({(c.durationMs / 1000).toFixed(1)}s)
                </option>
              ))}
              {!choreographies.some((c) => c.id === draft.id) && (
                <option value={draft.id}>{draft.name} (Não salva)</option>
              )}
            </select>

            <button
              type="button"
              onClick={handleCreateSequence}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Sequência
            </button>

            {choreographies.length > 1 && (
              <button
                type="button"
                onClick={() => void handleDeleteSequence()}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/70 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Excluir coreografia selecionada"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {statusNotice && (
              <span
                className={`text-xs mr-2 ${
                  statusNotice.isError
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {statusNotice.text}
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar
            </button>
            {isPlayingThis ? (
              <button
                type="button"
                onClick={() => void sendCommand('/api/misty/choreography/stop', {})}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5" />
                Parar Execução
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleRun()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                Reproduzir Sequência
              </button>
            )}
          </div>
        </div>

        {state.activeChoreography?.isPlaying && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                Executando agora: {state.activeChoreography.name}
              </span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {(playheadMs / 1000).toFixed(1)}s / {(activeDurationMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-[width] duration-75"
                style={{ width: `${Math.min(100, (playheadMs / Math.max(1, activeDurationMs)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left/Center: Visual Timeline & Keyframe Inspector */}
        <div className="xl:col-span-8 space-y-6">
          {/* Sequence Metadata */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nome da Coreografia
                </label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Duração Total (ms)
                </label>
                <input
                  type="number"
                  min={1000}
                  max={30000}
                  step={200}
                  value={draft.durationMs}
                  onChange={(e) => setDraft({ ...draft, durationMs: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Interactive Timeline Ruler */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Linha do Tempo de Keyframes ({draft.keyframes.length} passos)
                </span>
                <button
                  type="button"
                  onClick={handleAddKeyframe}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-md hover:bg-sky-100 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar Keyframe
                </button>
              </div>

              <div className="relative bg-slate-950 border border-slate-800 rounded-lg p-4 overflow-hidden">
                {/* Time Grid */}
                <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-500 pb-2 border-b border-slate-800">
                  <span>0.0s</span>
                  <span>{(draft.durationMs / 4000).toFixed(1)}s</span>
                  <span>{(draft.durationMs / 2000).toFixed(1)}s</span>
                  <span>{((draft.durationMs * 3) / 4000).toFixed(1)}s</span>
                  <span>{(draft.durationMs / 1000).toFixed(1)}s</span>
                </div>

                {/* Track */}
                <div className="relative h-16 mt-3 bg-slate-900/70 rounded border border-slate-800">
                  {/* Playhead */}
                  {isPlayingThis && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-20 pointer-events-none"
                      style={{
                        left: `${Math.min(100, (playheadMs / draft.durationMs) * 100)}%`,
                      }}
                    />
                  )}

                  {draft.keyframes.map((kf) => {
                    const leftPct = Math.min(94, Math.max(2, (kf.timeMs / draft.durationMs) * 100));
                    const active = kf.id === activeKeyframe?.id;
                    return (
                      <button
                        key={kf.id}
                        type="button"
                        onClick={() => setSelectedKfId(kf.id)}
                        style={{ left: `${leftPct}%` }}
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-2 py-1.5 rounded border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap z-10 ${
                          active
                            ? 'bg-sky-600 border-sky-400 text-white shadow-sm'
                            : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-sky-500'
                        }`}
                      >
                        <span className="font-mono tabular-nums">{(kf.timeMs / 1000).toFixed(1)}s</span>
                        <span className="ml-1.5">{kf.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Selected Keyframe Editor */}
          {activeKeyframe && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Editor de Keyframe: {activeKeyframe.label}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Instante: {activeKeyframe.timeMs} ms · Curva: {activeKeyframe.easing}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handlePreviewKeyframe(activeKeyframe)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-md hover:bg-sky-100 dark:hover:bg-sky-900/60 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Testar Keyframe
                  </button>
                  <button
                    type="button"
                    disabled={draft.keyframes.length <= 1}
                    onClick={() => handleDeleteKeyframe(activeKeyframe.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Rótulo do Passo
                  </label>
                  <input
                    type="text"
                    value={activeKeyframe.label}
                    onChange={(e) =>
                      updateKeyframe(activeKeyframe.id, (k) => ({ ...k, label: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Tempo (ms)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={28000}
                    step={100}
                    value={activeKeyframe.timeMs}
                    onChange={(e) =>
                      updateKeyframe(activeKeyframe.id, (k) => ({
                        ...k,
                        timeMs: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Curva Easing
                  </label>
                  <select
                    value={activeKeyframe.easing}
                    onChange={(e) =>
                      updateKeyframe(activeKeyframe.id, (k) => ({
                        ...k,
                        easing: e.target.value as EasingCurve,
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  >
                    <option value="easeInOut">Ease-In-Out</option>
                    <option value="spring">Spring</option>
                    <option value="linear">Linear</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Head & Arms Sliders */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Cabeça e Braços neste Keyframe
                  </h4>
                  <div>
                    <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Pitch / Yaw</span>
                      <span className="font-mono tabular-nums">
                        {activeKeyframe.head?.pitch ?? 0}° / {activeKeyframe.head?.yaw ?? 0}°
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <input
                        type="range"
                        min={-40}
                        max={26}
                        value={activeKeyframe.head?.pitch ?? 0}
                        onChange={(e) =>
                          updateKeyframe(activeKeyframe.id, (k) => ({
                            ...k,
                            head: {
                              pitch: Number(e.target.value),
                              roll: k.head?.roll ?? 0,
                              yaw: k.head?.yaw ?? 0,
                            },
                          }))
                        }
                        className="accent-sky-600 cursor-pointer"
                      />
                      <input
                        type="range"
                        min={-81}
                        max={81}
                        value={activeKeyframe.head?.yaw ?? 0}
                        onChange={(e) =>
                          updateKeyframe(activeKeyframe.id, (k) => ({
                            ...k,
                            head: {
                              pitch: k.head?.pitch ?? 0,
                              roll: k.head?.roll ?? 0,
                              yaw: Number(e.target.value),
                            },
                          }))
                        }
                        className="accent-sky-600 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Braço Esq / Dir</span>
                      <span className="font-mono tabular-nums">
                        {activeKeyframe.arms?.left ?? 42}° / {activeKeyframe.arms?.right ?? 42}°
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <input
                        type="range"
                        min={-29}
                        max={90}
                        value={activeKeyframe.arms?.left ?? 42}
                        onChange={(e) =>
                          updateKeyframe(activeKeyframe.id, (k) => ({
                            ...k,
                            arms: {
                              left: Number(e.target.value),
                              right: k.arms?.right ?? 42,
                            },
                          }))
                        }
                        className="accent-sky-600 cursor-pointer"
                      />
                      <input
                        type="range"
                        min={-29}
                        max={90}
                        value={activeKeyframe.arms?.right ?? 42}
                        onChange={(e) =>
                          updateKeyframe(activeKeyframe.id, (k) => ({
                            ...k,
                            arms: {
                              left: k.arms?.left ?? 42,
                              right: Number(e.target.value),
                            },
                          }))
                        }
                        className="accent-sky-600 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Eyes, LED & Speech */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Olhos, LED e Fala TTS
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={activeKeyframe.eyes?.mood ?? 'neutral'}
                      onChange={(e) =>
                        updateKeyframe(activeKeyframe.id, (k) => ({
                          ...k,
                          eyes: {
                            mood: e.target.value as EyeMood,
                            displayText: k.eyes?.displayText ?? '',
                          },
                        }))
                      }
                      className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="neutral">Olhos: Neutro</option>
                      <option value="happy">Olhos: Feliz</option>
                      <option value="curious">Olhos: Curioso</option>
                      <option value="surprised">Olhos: Surpreso</option>
                      <option value="processing">Olhos: Processando</option>
                      <option value="alert">Olhos: Alerta</option>
                    </select>
                    <select
                      value={activeKeyframe.led?.mode ?? 'solid'}
                      onChange={(e) =>
                        updateKeyframe(activeKeyframe.id, (k) => ({
                          ...k,
                          led: {
                            r: k.led?.r ?? 14,
                            g: k.led?.g ?? 165,
                            b: k.led?.b ?? 233,
                            mode: e.target.value as LedMode,
                          },
                        }))
                      }
                      className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="solid">LED: Sólido</option>
                      <option value="breathe">LED: Breathe</option>
                      <option value="blink">LED: Pisca</option>
                      <option value="rainbow">LED: Arco-íris</option>
                    </select>
                  </div>
                  <div>
                    <input
                      type="text"
                      value={activeKeyframe.speech?.text ?? ''}
                      onChange={(e) =>
                        updateKeyframe(activeKeyframe.id, (k) => ({
                          ...k,
                          speech: e.target.value ? { text: e.target.value } : undefined,
                        }))
                      }
                      placeholder="Texto opcional para a Misty falar neste keyframe..."
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Base (Linear / Angular)</span>
                      <span className="font-mono tabular-nums">
                        {activeKeyframe.drive?.linearVelocity ?? 0}% /{' '}
                        {activeKeyframe.drive?.angularVelocity ?? 0}%
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <input
                        type="range"
                        min={-60}
                        max={60}
                        step={5}
                        value={activeKeyframe.drive?.linearVelocity ?? 0}
                        onChange={(e) =>
                          updateKeyframe(activeKeyframe.id, (k) => ({
                            ...k,
                            drive: {
                              linearVelocity: Number(e.target.value),
                              angularVelocity: k.drive?.angularVelocity ?? 0,
                            },
                          }))
                        }
                        className="accent-sky-600 cursor-pointer"
                      />
                      <input
                        type="range"
                        min={-60}
                        max={60}
                        step={5}
                        value={activeKeyframe.drive?.angularVelocity ?? 0}
                        onChange={(e) =>
                          updateKeyframe(activeKeyframe.id, (k) => ({
                            ...k,
                            drive: {
                              linearVelocity: k.drive?.linearVelocity ?? 0,
                              angularVelocity: Number(e.target.value),
                            },
                          }))
                        }
                        className="accent-sky-600 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Digital Twin Stage */}
        <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Pré-visualização em Tempo Real
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Executada no motor de keyframes do servidor
            </p>
          </div>
          <MistyDigitalTwin
            state={state}
            onTouchSensor={(kind, sensor) =>
              void sendCommand('/api/misty/touch/simulate', { kind, sensor })
            }
          />
        </div>
      </div>
    </div>
  );
};
