import { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Code2,
  Cpu,
  Film,
  Menu,
  Mic,
  Moon,
  OctagonX,
  Sliders,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  Workflow,
  X,
} from 'lucide-react';
import { AiBrainView } from './components/AiBrainView';
import { ApiExplorerView } from './components/ApiExplorerView';
import { AutomationsView } from './components/AutomationsView';
import { ChoreographyStudioView } from './components/ChoreographyStudioView';
import { ControlPanelView } from './components/ControlPanelView';
import { SpeechModeView } from './components/SpeechModeView';
import { TelemetryBridgeView } from './components/TelemetryBridgeView';
import { useMistyConnection } from './hooks/useMistyConnection';

type WorkspaceSection =
  | 'control'
  | 'ai'
  | 'speech'
  | 'api'
  | 'choreography'
  | 'automations'
  | 'telemetry';

const NAV_ITEMS: Array<{
  id: WorkspaceSection;
  label: string;
  breadcrumb: string;
  icon: typeof Sliders;
}> = [
  { id: 'control', label: 'Painel e Arena', breadcrumb: 'Controle e Gêmeo Digital', icon: Sliders },
  { id: 'ai', label: 'Cérebro IA', breadcrumb: 'Inteligência Artificial Embarcada', icon: Sparkles },
  { id: 'speech', label: 'Modo de Fala', breadcrumb: 'Síntese TTS e Comandos de Voz', icon: Mic },
  { id: 'api', label: 'Explorador de API', breadcrumb: 'Endpoints REST e SDK', icon: Code2 },
  { id: 'choreography', label: 'Coreografia', breadcrumb: 'Linha do Tempo de Keyframes', icon: Film },
  { id: 'automations', label: 'Automações', breadcrumb: 'Regras Reativas 20 Hz', icon: Workflow },
  { id: 'telemetry', label: 'Telemetria e Ponte', breadcrumb: 'WebSocket /pubsub e Hardware', icon: Activity },
];

export default function App() {
  const [section, setSection] = useState<WorkspaceSection>('control');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const {
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
    clearPubSubFeed,
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
    refreshData,
  } = useMistyConnection();

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const currentNav = NAV_ITEMS.find((n) => n.id === section) ?? NAV_ITEMS[0];

  const handleSelectSection = (id: WorkspaceSection) => {
    setSection(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-[256px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          {/* Brand Lockup */}
          <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                MistyForge
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              aria-label="Fechar menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Nav */}
          <nav className="p-3 space-y-1" aria-label="Navegação principal">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Bottom Controls & Real Hardware Summary */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
          {robotState && (
            <div className="space-y-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span>Canal /pubsub</span>
                <span
                  className={
                    wsConnected
                      ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                      : 'text-amber-700 dark:text-amber-400 font-medium'
                  }
                >
                  {wsConnected ? 'Conectado' : 'Reconectando'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span>Bateria</span>
                <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {robotState.battery.chargePercent.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span>Modo</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {bridgeConfig.mode === 'bridge' ? 'Hardware LAN' : 'Gêmeo Digital'}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              {audioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {audioEnabled ? 'Áudio Ativo' : 'Mudo'}
            </button>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="inline-flex items-center justify-center p-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label={darkMode ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
              aria-label="Abrir navegação"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
                Misty II Super-API
              </span>
              <span className="text-slate-400 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentNav.breadcrumb}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void sendCommand('/api/misty/battery/recharge', {})}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5" />
              Recarregar Bateria
            </button>
            <button
              type="button"
              onClick={() => void sendCommand('/api/misty/drive/stop', {})}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <OctagonX className="w-3.5 h-3.5" />
              Parada Imediata
            </button>
          </div>
        </header>

        {/* Viewport Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {!robotState ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 h-[460px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
              <div className="lg:col-span-5 h-[460px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
            </div>
          ) : (
            <>
              {section === 'control' && (
                <ControlPanelView
                  state={robotState}
                  latestCameraFrame={latestCameraFrame}
                  captureCameraFrame={captureCameraFrame}
                  sendCommand={sendCommand}
                />
              )}
              {section === 'ai' && (
                <AiBrainView
                  state={robotState}
                  audioEnabled={audioEnabled}
                  setAudioEnabled={setAudioEnabled}
                  sendCommand={sendCommand}
                />
              )}
              {section === 'speech' && (
                <SpeechModeView
                  state={robotState}
                  audioEnabled={audioEnabled}
                  setAudioEnabled={setAudioEnabled}
                  speechVoiceURI={speechVoiceURI}
                  setSpeechVoiceURI={setSpeechVoiceURI}
                  ttsEngine={ttsEngine}
                  setTtsEngine={setTtsEngine}
                  neuralVoice={neuralVoice}
                  setNeuralVoice={setNeuralVoice}
                  neuralStyle={neuralStyle}
                  setNeuralStyle={setNeuralStyle}
                  ttsLoading={ttsLoading}
                  ttsNotice={ttsNotice}
                  lastSpeechEngineLabel={lastSpeechEngineLabel}
                  sendCommand={sendCommand}
                />
              )}
              {section === 'api' && (
                <ApiExplorerView state={robotState} sendCommand={sendCommand} />
              )}
              {section === 'choreography' && (
                <ChoreographyStudioView
                  state={robotState}
                  choreographies={choreographies}
                  sendCommand={sendCommand}
                  onRefresh={refreshData}
                />
              )}
              {section === 'automations' && (
                <AutomationsView
                  automations={automations}
                  sendCommand={sendCommand}
                  onRefresh={refreshData}
                />
              )}
              {section === 'telemetry' && (
                <TelemetryBridgeView
                  wsConnected={wsConnected}
                  subscribedTopics={subscribedTopics}
                  updateSubscriptions={updateSubscriptions}
                  pubSubFeed={pubSubFeed}
                  clearPubSubFeed={clearPubSubFeed}
                  pubSubPaused={pubSubPaused}
                  setPubSubPaused={setPubSubPaused}
                  telemetryHistory={telemetryHistory}
                  apiLogs={apiLogs}
                  bridgeConfig={bridgeConfig}
                  setBridgeConfig={setBridgeConfig}
                  sendCommand={sendCommand}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
