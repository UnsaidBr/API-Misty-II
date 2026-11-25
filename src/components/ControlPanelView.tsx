import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Download,
  Eye,
  EyeOff,
  Layers,
  OctagonX,
  RefreshCw,
  Video,
  VideoOff,
  Volume2,
  Waves,
} from 'lucide-react';
import type {
  CameraCaptureResult,
  CameraStreamType,
  EasingCurve,
  EyeMood,
  LedMode,
  RobotState,
} from '../types/misty';
import { ArenaSlamMap } from './ArenaSlamMap';
import { MistyDigitalTwin } from './MistyDigitalTwin';

interface ControlPanelViewProps {
  state: RobotState;
  latestCameraFrame: CameraCaptureResult | null;
  captureCameraFrame: (
    streamType?: CameraStreamType,
    width?: number,
    height?: number
  ) => Promise<unknown>;
  sendCommand: (
    path: string,
    body?: Record<string, unknown>,
    method?: 'GET' | 'POST' | 'DELETE'
  ) => Promise<{ ok: boolean; status: number; durationMs: number; data: Record<string, unknown> }>;
}

const STREAM_OPTIONS: Array<{
  id: CameraStreamType;
  label: string;
  title: string;
  endpoint: string;
  subtitle: string;
}> = [
  {
    id: 'rgb',
    label: 'Frontal RGB',
    title: 'Câmera Frontal RGB',
    endpoint: 'GET /api/misty/camera/rgb',
    subtitle: 'Visão óptica em primeira pessoa',
  },
  {
    id: 'depth',
    label: 'Profundidade',
    title: 'Câmera de Profundidade',
    endpoint: 'GET /api/misty/camera/depth',
    subtitle: 'Mapa métrico de distância por raios',
  },
  {
    id: 'fisheye',
    label: 'SLAM Fisheye',
    title: 'Câmera SLAM Fisheye',
    endpoint: 'GET /api/misty/camera/fisheye',
    subtitle: 'Rastreamento grande-angular de marcos SLAM',
  },
];

const PRESETS = [
  { id: 'greeting', label: 'Saudar' },
  { id: 'curious', label: 'Curiosa' },
  { id: 'celebrate', label: 'Celebrar' },
  { id: 'alert', label: 'Alerta' },
  { id: 'sleep', label: 'Repouso' },
  { id: 'neutral', label: 'Neutra' },
];

const EYE_MOODS: Array<{ id: EyeMood; label: string }> = [
  { id: 'neutral', label: 'Neutro' },
  { id: 'happy', label: 'Feliz' },
  { id: 'curious', label: 'Curioso' },
  { id: 'surprised', label: 'Surpreso' },
  { id: 'processing', label: 'Processando' },
  { id: 'alert', label: 'Alerta' },
  { id: 'sleepy', label: 'Sonolento' },
];

const LED_SWATCHES = [
  { label: 'Ciano', r: 14, g: 165, b: 233 },
  { label: 'Esmeralda', r: 16, g: 185, b: 129 },
  { label: 'Âmbar', r: 245, g: 158, b: 11 },
  { label: 'Carmesim', r: 239, g: 68, b: 68 },
  { label: 'Violeta', r: 139, g: 92, b: 246 },
  { label: 'Branco', r: 248, g: 250, b: 252 },
];

export const ControlPanelView: React.FC<ControlPanelViewProps> = ({
  state,
  latestCameraFrame,
  captureCameraFrame,
  sendCommand,
}) => {
  const [easing, setEasing] = useState<EasingCurve>('easeInOut');
  const [speechText, setSpeechText] = useState('Olá! Todos os sensores da Misty estão operacionais.');
  const [driveSpeed, setDriveSpeed] = useState(20);
  const [driveMode, setDriveMode] = useState<'short' | 'medium' | 'hold'>('short');
  const [activeTab, setActiveTab] = useState<'motion' | 'face' | 'vision'>('motion');
  const [rightStage, setRightStage] = useState<'twin' | 'camera'>('twin');
  const [selectedStream, setSelectedStream] = useState<CameraStreamType>(
    state.camera.streamType ?? 'rgb'
  );
  const [hudEnabled, setHudEnabled] = useState(true);
  const [capturingCam, setCapturingCam] = useState(false);

  // Grab an initial POV frame when switching to camera view
  useEffect(() => {
    if (rightStage === 'camera' && !latestCameraFrame) {
      void captureCameraFrame(selectedStream, 640, 480);
    }
  }, [rightStage, latestCameraFrame, selectedStream, captureCameraFrame]);

  const activeStreamMeta =
    STREAM_OPTIONS.find((opt) => opt.id === selectedStream) ?? STREAM_OPTIONS[0];

  const stepDurationMs = driveMode === 'short' ? 220 : 520;

  const handleDrivePress = (linearVelocity: number, angularVelocity: number) => {
    if (driveMode === 'hold') {
      void sendCommand('/api/misty/drive', {
        linearVelocity,
        angularVelocity,
        durationMs: 3000,
      });
    } else {
      void sendCommand('/api/misty/drive', {
        linearVelocity,
        angularVelocity,
        durationMs: stepDurationMs,
      });
    }
  };

  const handleDriveRelease = () => {
    if (driveMode === 'hold') {
      void sendCommand('/api/misty/drive/stop', {});
    }
  };

  const handleSelectStream = async (nextStream: CameraStreamType) => {
    setSelectedStream(nextStream);
    if (state.camera.streamActive) {
      await sendCommand('/api/misty/camera/stream/start', {
        streamType: nextStream,
        width: 640,
        height: 480,
        fps: state.camera.fps || 3,
      });
      return;
    }
    setCapturingCam(true);
    try {
      await captureCameraFrame(nextStream, 640, 480);
    } finally {
      setCapturingCam(false);
    }
  };

  const handleManualCapture = async () => {
    setCapturingCam(true);
    try {
      await captureCameraFrame(selectedStream, 640, 480);
    } finally {
      setCapturingCam(false);
    }
  };

  const handleToggleStream = () => {
    if (state.camera.streamActive) {
      void sendCommand('/api/misty/camera/stream/stop', {});
    } else {
      void sendCommand('/api/misty/camera/stream/start', {
        streamType: selectedStream,
        width: 640,
        height: 480,
        fps: 3,
      });
    }
  };

  const updateHead = (next: Partial<{ pitch: number; roll: number; yaw: number }>) => {
    void sendCommand('/api/misty/head', {
      pitch: next.pitch ?? Math.round(state.head.targetPitch),
      roll: next.roll ?? Math.round(state.head.targetRoll),
      yaw: next.yaw ?? Math.round(state.head.targetYaw),
      easing,
    });
  };

  const updateArms = (next: Partial<{ left: number; right: number }>) => {
    void sendCommand('/api/misty/arms', {
      leftArmPosition: next.left ?? Math.round(state.arms.targetLeft),
      rightArmPosition: next.right ?? Math.round(state.arms.targetRight),
    });
  };

  const updateLed = (r: number, g: number, b: number, mode: LedMode = state.led.mode) => {
    void sendCommand('/api/misty/led/transition', {
      red: r,
      green: g,
      blue: b,
      mode,
      periodMs: state.led.periodMs,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Stage: 2D SLAM Arena + Digital Twin */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Arena SLAM e Sensores Time-of-Flight
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Navegação autônoma por waypoint com desvio reativo de obstáculos
              </p>
            </div>
          </div>
          <div className="flex-1">
            <ArenaSlamMap
              state={state}
              onNavigateWaypoint={(x, y) =>
                void sendCommand('/api/misty/drive/waypoint', { x, y, speed: driveSpeed })
              }
              onAddObstacle={(x, y) =>
                void sendCommand('/api/misty/slam/obstacles', {
                  action: 'add',
                  obstacle: { x, y, width: 0.45, height: 0.45, label: 'Bloco' },
                })
              }
              onRemoveObstacle={(id) =>
                void sendCommand('/api/misty/slam/obstacles', { action: 'remove', id })
              }
              onResetSlam={() => void sendCommand('/api/misty/slam/reset', {})}
            />
          </div>
        </div>

        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {rightStage === 'twin' ? 'Modelo Cinemático Interativo' : activeStreamMeta.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {rightStage === 'twin'
                  ? 'Clique no queixo, cabeça ou para-choque para testar toque'
                  : `${activeStreamMeta.endpoint} · ${activeStreamMeta.subtitle}`}
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setRightStage('twin')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  rightStage === 'twin'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Modelo 2D
              </button>
              <button
                type="button"
                onClick={() => setRightStage('camera')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  rightStage === 'camera'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Camera className="w-3 h-3" />
                Câmera
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            {rightStage === 'twin' ? (
              <MistyDigitalTwin
                state={state}
                onTouchSensor={(kind, sensor) =>
                  void sendCommand('/api/misty/touch/simulate', { kind, sensor })
                }
              />
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                {/* Stream Selector + HUD Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                    role="group"
                    aria-label="Selecionar fluxo de vídeo"
                  >
                    {STREAM_OPTIONS.map((opt) => {
                      const active = selectedStream === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => void handleSelectStream(opt.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          {opt.id === 'depth' && <Layers className="w-3 h-3" />}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setHudEnabled((v) => !v)}
                    aria-pressed={hudEnabled}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      hudEnabled
                        ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {hudEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    HUD Telemetria
                  </button>
                </div>

                {/* Live Video Frame + Telemetry HUD Overlay */}
                <div className="relative bg-slate-950 rounded-lg border border-slate-800 overflow-hidden aspect-[4/3] flex items-center justify-center">
                  {latestCameraFrame ? (
                    <img
                      src={latestCameraFrame.dataUrl}
                      alt={`Feed ${activeStreamMeta.label} da Misty II`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-xs text-slate-400 text-center px-4">
                      Clique em Capturar ou Stream Ao Vivo para visualizar o feed da câmera.
                    </div>
                  )}

                  {hudEnabled && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-[11px] text-slate-100">
                      {/* Top Telemetry Bar */}
                      <div className="flex items-start justify-between gap-2 px-2.5 py-2 bg-gradient-to-b from-slate-950/85 via-slate-950/60 to-transparent">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-tight text-sky-300">
                            <span>{activeStreamMeta.label}</span>
                            <span className="text-slate-500">·</span>
                            <span className="text-slate-200">
                              {latestCameraFrame?.source === 'hardware' ? 'Hardware' : 'Simulador'}
                            </span>
                            <span className="text-slate-500">·</span>
                            <span
                              className={
                                state.camera.streamActive ? 'text-emerald-400' : 'text-slate-300'
                              }
                            >
                              {state.camera.streamActive
                                ? `Ao vivo ${state.camera.fps} FPS`
                                : 'Quadro único'}
                            </span>
                          </div>
                          {(state.bump.frontLeft ||
                            state.bump.frontRight ||
                            state.bump.backLeft ||
                            state.bump.backRight) && (
                            <div className="inline-block px-1.5 py-0.5 rounded bg-red-950/90 border border-red-500/60 text-red-200 font-mono text-[10px]">
                              Alerta colisão para-choque
                            </div>
                          )}
                        </div>

                        <div className="text-right font-mono tabular-nums text-[10px] leading-tight text-slate-200 bg-slate-950/75 px-2 py-1 rounded border border-slate-700/70">
                          <div>
                            Bat {state.battery.chargePercent.toFixed(0)}% · {state.battery.voltage.toFixed(1)}V
                          </div>
                          <div className="text-sky-300">
                            Cab P:{state.head.pitch.toFixed(0)}° Y:{state.head.yaw.toFixed(0)}°
                          </div>
                        </div>
                      </div>

                      {/* Middle Vision Detections */}
                      {state.vision.entities.length > 0 && (
                        <div className="px-2.5 flex flex-wrap gap-1.5">
                          {state.vision.entities.slice(0, 3).map((entity) => (
                            <div
                              key={entity.id}
                              className="px-1.5 py-0.5 rounded bg-slate-950/75 border border-emerald-500/50 text-emerald-300 font-mono tabular-nums text-[10px]"
                            >
                              {entity.label} · {Math.round(entity.confidence * 100)}% ·{' '}
                              {entity.distanceMeters.toFixed(2)}m
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Bottom ToF + Pose/Drive Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 bg-slate-950/80 border-t border-slate-800/80 font-mono tabular-nums text-[10px]">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">ToF</span>
                          <span
                            className={
                              state.tof.FrontLeft < 0.45 ? 'text-amber-300' : 'text-slate-200'
                            }
                          >
                            E:{state.tof.FrontLeft.toFixed(2)}m
                          </span>
                          <span
                            className={
                              state.tof.FrontCenter < 0.45 ? 'text-red-300 font-semibold' : 'text-sky-300'
                            }
                          >
                            C:{state.tof.FrontCenter.toFixed(2)}m
                          </span>
                          <span
                            className={
                              state.tof.FrontRight < 0.45 ? 'text-amber-300' : 'text-slate-200'
                            }
                          >
                            D:{state.tof.FrontRight.toFixed(2)}m
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-slate-300">
                          <span>
                            Pose ({state.pose.x.toFixed(2)}, {state.pose.y.toFixed(2)}){' '}
                            {state.pose.heading.toFixed(0)}°
                          </span>
                          <span className="text-slate-500">·</span>
                          <span>
                            Vel L:{state.drive.linearVelocity.toFixed(0)} A:
                            {state.drive.angularVelocity.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {latestCameraFrame?.hardwareError && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Fallback simulado ativo: {latestCameraFrame.hardwareError}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleManualCapture()}
                      disabled={capturingCam}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${capturingCam ? 'animate-spin' : ''}`} />
                      Capturar Foto
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleStream}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        state.camera.streamActive
                          ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {state.camera.streamActive ? (
                        <>
                          <VideoOff className="w-3.5 h-3.5" />
                          Parar Stream
                        </>
                      ) : (
                        <>
                          <Video className="w-3.5 h-3.5" />
                          Stream 3 FPS
                        </>
                      )}
                    </button>
                  </div>

                  {latestCameraFrame && (
                    <a
                      href={latestCameraFrame.dataUrl}
                      download={`misty-${selectedStream}-${Date.now()}.${latestCameraFrame.contentType.includes('jpeg') ? 'jpg' : 'svg'}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Interactive Hardware Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('motion')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'motion'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Locomoção e Cinemática
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('face')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'face'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              LED, Visor e Fala TTS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vision')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'vision'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Visão Computacional e Sensores
            </button>
          </div>

          {/* Atomic Presets Strip */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Expressões:</span>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void sendCommand('/api/misty/pose/preset', { preset: p.id })}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:border-sky-500 hover:text-sky-700 dark:hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'motion' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-5">
            {/* D-Pad Differential Drive with Precision Modes */}
            <div className="lg:col-span-4 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Controle Direcional
                </h3>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {driveMode === 'hold'
                    ? `Contínuo · ${driveSpeed}%`
                    : `${stepDurationMs}ms · ${driveSpeed}%`}
                </span>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setDriveMode('short')}
                  className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    driveMode === 'short'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Passo Curto
                </button>
                <button
                  type="button"
                  onClick={() => setDriveMode('medium')}
                  className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    driveMode === 'medium'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Passo Médio
                </button>
                <button
                  type="button"
                  onClick={() => setDriveMode('hold')}
                  className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    driveMode === 'hold'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Segurar
                </button>
              </div>

              <div className="flex flex-col items-center gap-2 py-1 select-none">
                <button
                  type="button"
                  onPointerDown={() => handleDrivePress(driveSpeed, 0)}
                  onPointerUp={handleDriveRelease}
                  onPointerLeave={handleDriveRelease}
                  onPointerCancel={handleDriveRelease}
                  className="w-12 h-11 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-950 hover:border-sky-500 active:bg-sky-100 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                  aria-label="Mover para frente"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onPointerDown={() => handleDrivePress(0, driveSpeed)}
                    onPointerUp={handleDriveRelease}
                    onPointerLeave={handleDriveRelease}
                    onPointerCancel={handleDriveRelease}
                    className="w-12 h-11 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-950 hover:border-sky-500 active:bg-sky-100 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                    aria-label="Girar à esquerda"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendCommand('/api/misty/drive/stop', {})}
                    className="w-12 h-11 flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 hover:bg-red-100 text-red-700 dark:text-red-300 transition-colors cursor-pointer"
                    aria-label="Parar motores"
                  >
                    <OctagonX className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={() => handleDrivePress(0, -driveSpeed)}
                    onPointerUp={handleDriveRelease}
                    onPointerLeave={handleDriveRelease}
                    onPointerCancel={handleDriveRelease}
                    className="w-12 h-11 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-950 hover:border-sky-500 active:bg-sky-100 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                    aria-label="Girar à direita"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onPointerDown={() => handleDrivePress(-driveSpeed, 0)}
                  onPointerUp={handleDriveRelease}
                  onPointerLeave={handleDriveRelease}
                  onPointerCancel={handleDriveRelease}
                  className="w-12 h-11 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-950 hover:border-sky-500 active:bg-sky-100 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                  aria-label="Mover para trás"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>Velocidade (Precisão 5% a 80%)</span>
                  <span className="font-mono tabular-nums">{driveSpeed}%</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={80}
                  step={5}
                  value={driveSpeed}
                  onChange={(e) => setDriveSpeed(Number(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>
            </div>

            {/* 3-DOF Head Kinematics */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Cabeça 3-DOF
                </h3>
                <select
                  value={easing}
                  onChange={(e) => setEasing(e.target.value as EasingCurve)}
                  className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-slate-700 dark:text-slate-200"
                  aria-label="Curva Easing"
                >
                  <option value="easeInOut">Curva: Ease-In-Out</option>
                  <option value="spring">Curva: Spring (Mola)</option>
                  <option value="linear">Curva: Linear</option>
                </select>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                    <span>Pitch (Vertical)</span>
                    <span className="font-mono tabular-nums">{Math.round(state.head.targetPitch)}°</span>
                  </label>
                  <input
                    type="range"
                    min={-40}
                    max={26}
                    value={Math.round(state.head.targetPitch)}
                    onChange={(e) => updateHead({ pitch: Number(e.target.value) })}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                    <span>Roll (Inclinação Lateral)</span>
                    <span className="font-mono tabular-nums">{Math.round(state.head.targetRoll)}°</span>
                  </label>
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    value={Math.round(state.head.targetRoll)}
                    onChange={(e) => updateHead({ roll: Number(e.target.value) })}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                    <span>Yaw (Giro Horizontal)</span>
                    <span className="font-mono tabular-nums">{Math.round(state.head.targetYaw)}°</span>
                  </label>
                  <input
                    type="range"
                    min={-81}
                    max={81}
                    value={Math.round(state.head.targetYaw)}
                    onChange={(e) => updateHead({ yaw: Number(e.target.value) })}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Dual Arms */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Articulação dos Braços
                </h3>
                <button
                  type="button"
                  onClick={() => updateArms({ left: 42, right: 42 })}
                  className="text-xs text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  Centralizar
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                    <span>Braço Esquerdo (-29° a 90°)</span>
                    <span className="font-mono tabular-nums">{Math.round(state.arms.targetLeft)}°</span>
                  </label>
                  <input
                    type="range"
                    min={-29}
                    max={90}
                    value={Math.round(state.arms.targetLeft)}
                    onChange={(e) => updateArms({ left: Number(e.target.value) })}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                    <span>Braço Direito (-29° a 90°)</span>
                    <span className="font-mono tabular-nums">{Math.round(state.arms.targetRight)}°</span>
                  </label>
                  <input
                    type="range"
                    min={-29}
                    max={90}
                    value={Math.round(state.arms.targetRight)}
                    onChange={(e) => updateArms({ right: Number(e.target.value) })}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'face' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-5">
            {/* LED RGB & Mode */}
            <div className="lg:col-span-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                LED Torácico Programável
              </h3>
              <div className="flex flex-wrap gap-2">
                {LED_SWATCHES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => updateLed(s.r, s.g, s.b)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-md hover:border-slate-400 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <span
                      className="w-3 h-3 rounded-xs border border-black/10"
                      style={{ backgroundColor: `rgb(${s.r}, ${s.g}, ${s.b})` }}
                    />
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {(['solid', 'breathe', 'blink', 'rainbow'] as LedMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateLed(state.led.r, state.led.g, state.led.b, m)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      state.led.mode === m
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Vector Eyes */}
            <div className="lg:col-span-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Olhos Vetoriais e Direção do Olhar
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {EYE_MOODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => void sendCommand('/api/misty/eyes', { mood: m.id })}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      state.eyes.mood === m.id
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-sky-500'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                    <span>Olhar X</span>
                    <span className="font-mono tabular-nums">{state.eyes.gazeX.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.1}
                    value={state.eyes.gazeX}
                    onChange={(e) =>
                      void sendCommand('/api/misty/eyes', {
                        mood: state.eyes.mood,
                        gazeX: Number(e.target.value),
                      })
                    }
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                    <span>Olhar Y</span>
                    <span className="font-mono tabular-nums">{state.eyes.gazeY.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.1}
                    value={state.eyes.gazeY}
                    onChange={(e) =>
                      void sendCommand('/api/misty/eyes', {
                        mood: state.eyes.mood,
                        gazeY: Number(e.target.value),
                      })
                    }
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Speech TTS & Audio Tone */}
            <div className="lg:col-span-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Síntese de Voz (TTS) e Sinal Sonoro
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={speechText}
                  onChange={(e) => setSpeechText(e.target.value)}
                  placeholder="Digite o que a Misty deve falar..."
                  className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={() => void sendCommand('/api/misty/tts/speak', { text: speechText })}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Falar
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void sendCommand('/api/misty/audio/tone', {
                      frequency: 523,
                      durationMs: 220,
                      waveform: 'triangle',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:border-sky-500 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Waves className="w-3.5 h-3.5" />
                  Chime Confirmação (523 Hz)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void sendCommand('/api/misty/audio/tone', {
                      frequency: 880,
                      durationMs: 320,
                      waveform: 'square',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:border-sky-500 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Waves className="w-3.5 h-3.5" />
                  Bipe Alerta (880 Hz)
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'vision' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-5">
            <div className="lg:col-span-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Inferência de Visão Computacional
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Executa POST /api/misty/vision/scan para detectar rostos, obstáculos e AprilTags
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void sendCommand('/api/misty/vision/scan', {
                      detectFaces: true,
                      detectObjects: true,
                      detectAprilTags: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Capturar Quadro
                </button>
              </div>

              {state.vision.entities.length === 0 ? (
                <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Nenhuma captura executada ainda. Clique em "Capturar Quadro" para inspecionar o campo visual atual da Misty.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                  {state.vision.entities.map((ent) => (
                    <div key={ent.id} className="flex items-center justify-between px-3 py-2.5 text-xs">
                      <div>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{ent.label}</span>
                        <span className="text-slate-500 dark:text-slate-400 ml-2">
                          {ent.type} · confiança {(ent.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {ent.distanceMeters.toFixed(2)}m · {ent.bearingDeg > 0 ? '+' : ''}
                        {ent.bearingDeg.toFixed(1)}°
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Matriz de Sensores ToF, IMU e Toque
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {Object.entries(state.tof).map(([key, val]) => (
                  <div
                    key={key}
                    className="border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 bg-slate-50/70 dark:bg-slate-800/40"
                  >
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{key}</div>
                    <div className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      {val.toFixed(2)} m
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">Simular toque:</span>
                {(['chin', 'headFront', 'headLeft', 'headRight'] as const).map((sensor) => (
                  <button
                    key={sensor}
                    type="button"
                    onClick={() =>
                      void sendCommand('/api/misty/touch/simulate', { kind: 'capTouch', sensor })
                    }
                    className="px-2.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded hover:border-sky-500 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    {sensor}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
