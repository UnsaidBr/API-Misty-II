import React, { useState } from 'react';
import { Check, Copy, Pause, Play, Radio, RefreshCw, Trash2, Wifi } from 'lucide-react';
import type { TelemetryPoint } from '../hooks/useMistyConnection';
import type { ApiLogEntry, HardwareBridgeConfig, PubSubMessage } from '../types/misty';

interface TelemetryBridgeViewProps {
  wsConnected: boolean;
  subscribedTopics: string[];
  updateSubscriptions: (topics: string[]) => void;
  pubSubFeed: PubSubMessage[];
  clearPubSubFeed: () => void;
  pubSubPaused: boolean;
  setPubSubPaused: (paused: boolean) => void;
  telemetryHistory: TelemetryPoint[];
  apiLogs: ApiLogEntry[];
  bridgeConfig: HardwareBridgeConfig;
  setBridgeConfig: (cfg: HardwareBridgeConfig) => void;
  sendCommand: (
    path: string,
    body?: Record<string, unknown>,
    method?: 'GET' | 'POST' | 'DELETE'
  ) => Promise<{ ok: boolean; status: number; durationMs: number; data: Record<string, unknown> }>;
}

const ALL_TOPICS = [
  'TimeOfFlight',
  'IMU',
  'RobotOdometry',
  'BatteryCharge',
  'ActuatorPosition',
  'AutomationTriggered',
  'SpeechStatus',
  'CapTouch',
  'BumpSensor',
  'VisionEvent',
  'CameraFrame',
];

const buildPolyline = (
  points: TelemetryPoint[],
  accessor: (p: TelemetryPoint) => number,
  minVal: number,
  maxVal: number,
  w = 340,
  h = 84
) => {
  if (points.length < 2) return '';
  const span = Math.max(0.001, maxVal - minVal);
  return points
    .map((p, idx) => {
      const x = (idx / (points.length - 1)) * w;
      const norm = Math.max(0, Math.min(1, (accessor(p) - minVal) / span));
      const y = h - 6 - norm * (h - 12);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

export const TelemetryBridgeView: React.FC<TelemetryBridgeViewProps> = ({
  wsConnected,
  subscribedTopics,
  updateSubscriptions,
  pubSubFeed,
  clearPubSubFeed,
  pubSubPaused,
  setPubSubPaused,
  telemetryHistory,
  apiLogs,
  bridgeConfig,
  setBridgeConfig,
  sendCommand,
}) => {
  const [robotIpInput, setRobotIpInput] = useState(bridgeConfig.robotIp);
  const [testingBridge, setTestingBridge] = useState(false);
  const [copiedRelay, setCopiedRelay] = useState(false);

  const wsBridgeUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/bridge-agent`
      : 'wss://seu-app.run.app/bridge-agent';

  const relayScript = `// Salve como misty-relay.mjs e rode na mesma rede Wi-Fi da Misty II (Node 22+):
// node misty-relay.mjs ${robotIpInput || '192.168.1.120'}
const MISTY_IP = process.argv[2] || "${robotIpInput || '192.168.1.120'}";
const CLOUD_WS = "${wsBridgeUrl}";

function connect() {
  const ws = new WebSocket(CLOUD_WS);
  ws.onopen = () => console.log("Ponte conectada ao MistyForge:", MISTY_IP);
  ws.onmessage = async (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.type !== "http_request") return;
    try {
      const r = await fetch(\`http://\${MISTY_IP}\${msg.path}\`, {
        method: msg.method,
        headers: msg.method === "GET" ? undefined : { "Content-Type": "application/json" },
        body: msg.method === "GET" ? undefined : JSON.stringify(msg.body || {}),
        signal: AbortSignal.timeout(8000)
      });
      const ct = r.headers.get("content-type") || "";
      let data;
      if (ct.startsWith("image/")) {
        const buf = Buffer.from(await r.arrayBuffer());
        data = { result: { base64: buf.toString("base64"), contentType: ct } };
      } else if (ct.includes("application/json")) {
        data = await r.json().catch(() => ({}));
      } else {
        const txt = await r.text().catch(() => "");
        try { data = JSON.parse(txt); } catch { data = { rawText: txt }; }
      }
      console.log(msg.method, msg.path, "->", r.status);
      ws.send(JSON.stringify({ type: "http_response", reqId: msg.reqId, ok: r.ok, status: r.status, data }));
    } catch (e) {
      console.error("Erro:", msg.path, e.message);
      ws.send(JSON.stringify({ type: "http_response", reqId: msg.reqId, ok: false, status: 502, data: { error: e.message } }));
    }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();`;

  const toggleTopic = (topic: string) => {
    const exists = subscribedTopics.includes(topic);
    const next = exists
      ? subscribedTopics.filter((t) => t !== topic)
      : [...subscribedTopics, topic];
    updateSubscriptions(next);
  };

  const handleSaveBridge = async (testConnection: boolean, nextMode?: 'simulator' | 'bridge') => {
    setTestingBridge(true);
    try {
      const res = await sendCommand('/api/bridge/config', {
        mode: nextMode ?? bridgeConfig.mode,
        robotIp: robotIpInput,
        testConnection,
      });
      if (res.ok && res.data.result) {
        setBridgeConfig(res.data.result as HardwareBridgeConfig);
      }
    } finally {
      setTestingBridge(false);
    }
  };

  const latestPoint = telemetryHistory[telemetryHistory.length - 1];

  return (
    <div className="space-y-6">
      {/* Top Row: Live Rolling Sparkline Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Sensores Time-of-Flight (ToF) em Tempo Real
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Distância medida pelos feixes frontais (0.02 m – 2.00 m)
              </p>
            </div>
            {latestPoint && (
              <span className="font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                FC: {latestPoint.frontCenter.toFixed(2)}m · FL: {latestPoint.frontLeft.toFixed(2)}m · FR:{' '}
                {latestPoint.frontRight.toFixed(2)}m
              </span>
            )}
          </div>
          <div className="bg-slate-950 rounded-lg border border-slate-800 p-3">
            <svg viewBox="0 0 340 84" className="w-full h-24">
              <line x1="0" y1="42" x2="340" y2="42" stroke="#1E293B" strokeDasharray="3 3" />
              <polyline
                points={buildPolyline(telemetryHistory, (p) => p.frontCenter, 0, 2.0)}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2"
              />
              <polyline
                points={buildPolyline(telemetryHistory, (p) => p.frontLeft, 0, 2.0)}
                fill="none"
                stroke="#10B981"
                strokeWidth="1.5"
                opacity="0.8"
              />
              <polyline
                points={buildPolyline(telemetryHistory, (p) => p.frontRight, 0, 2.0)}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.5"
                opacity="0.8"
              />
            </svg>
            <div className="flex items-center gap-4 text-[11px] text-slate-400 mt-1">
              <span className="text-sky-400">FrontCenter</span>
              <span className="text-emerald-400">FrontLeft</span>
              <span className="text-amber-400">FrontRight</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Orientação Inercial IMU (Yaw e Pitch)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ângulos do chassi e cabeçote (-180° a +180°)
              </p>
            </div>
            {latestPoint && (
              <span className="font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                Yaw: {latestPoint.yaw.toFixed(1)}° · Pitch: {latestPoint.pitch.toFixed(1)}°
              </span>
            )}
          </div>
          <div className="bg-slate-950 rounded-lg border border-slate-800 p-3">
            <svg viewBox="0 0 340 84" className="w-full h-24">
              <line x1="0" y1="42" x2="340" y2="42" stroke="#1E293B" strokeDasharray="3 3" />
              <polyline
                points={buildPolyline(telemetryHistory, (p) => p.yaw, -180, 180)}
                fill="none"
                stroke="#818CF8"
                strokeWidth="2"
              />
              <polyline
                points={buildPolyline(telemetryHistory, (p) => p.pitch * 15, -180, 180)}
                fill="none"
                stroke="#34D399"
                strokeWidth="1.5"
              />
            </svg>
            <div className="flex items-center gap-4 text-[11px] text-slate-400 mt-1">
              <span className="text-indigo-400">Yaw (°)</span>
              <span className="text-emerald-400">Pitch (escalado)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: WebSocket /pubsub Inspector & Hardware Bridge */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Fluxo WebSocket /pubsub
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {wsConnected ? 'Conectado ao canal /pubsub' : 'Reconectando ao canal /pubsub...'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPubSubPaused(!pubSubPaused)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                {pubSubPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                {pubSubPaused ? 'Retomar' : 'Pausar'}
              </button>
              <button
                type="button"
                onClick={clearPubSubFeed}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar
              </button>
            </div>
          </div>

          {/* Topic Subscription Toggles */}
          <div className="flex flex-wrap gap-1.5">
            {ALL_TOPICS.map((topic) => {
              const active = subscribedTopics.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => toggleTopic(topic)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                    active
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>

          {/* Stream Log */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 h-72 overflow-y-auto space-y-2 font-mono text-[11px]">
            {pubSubFeed.length === 0 ? (
              <div className="text-slate-500 text-center py-12">
                Aguardando quadros de telemetria dos tópicos assinados...
              </div>
            ) : (
              pubSubFeed.map((item, i) => (
                <div key={`${item.created}-${i}`} className="border-b border-slate-800/80 pb-1.5">
                  <div className="flex items-center justify-between text-sky-400">
                    <span>{item.eventName}</span>
                    <span className="text-slate-500 tabular-nums">
                      {new Date(item.created).toLocaleTimeString('pt-BR')}
                    </span>
                  </div>
                  <div className="text-slate-300 break-all mt-0.5">
                    {JSON.stringify(item.message)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Hardware Bridge + Comparison */}
        <div className="xl:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Ponte para Misty II Física (LAN)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Alterne entre o Simulador Digital Twin ou encaminhamento para o IP real do robô
                </p>
              </div>
              <Wifi className="w-4 h-4 text-slate-400" />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => void handleSaveBridge(false, 'simulator')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  bridgeConfig.mode === 'simulator'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Simulador Gêmeo Digital
              </button>
              <button
                type="button"
                onClick={() => void handleSaveBridge(false, 'bridge')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  bridgeConfig.mode === 'bridge'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Ponte Hardware Real
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={robotIpInput}
                onChange={(e) => setRobotIpInput(e.target.value)}
                placeholder="Ex: 192.168.1.120"
                className="flex-1 min-w-0 px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={testingBridge}
                onClick={() => void handleSaveBridge(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingBridge ? 'animate-spin' : ''}`} />
                Testar IP
              </button>
            </div>

            <div className="text-xs border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Status da Ponte:</span>
                <span
                  className={
                    bridgeConfig.reachable
                      ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                      : 'text-amber-700 dark:text-amber-400 font-medium'
                  }
                >
                  {bridgeConfig.agentConnected
                    ? 'Agente Local Conectado (/bridge-agent)'
                    : bridgeConfig.reachable
                      ? 'Conectado via HTTP / Túnel'
                      : 'Sem conexão física (Simulador ativo)'}
                </span>
              </div>
              {bridgeConfig.lastError && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {bridgeConfig.lastError}
                </p>
              )}
            </div>

            {/* Zero-dependency local Wi-Fi relay agent */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Agente Ponte Wi-Fi (Nuvem ↔ IP Local)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(relayScript);
                    setCopiedRelay(true);
                    setTimeout(() => setCopiedRelay(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {copiedRelay ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedRelay ? 'Script Copiado' : 'Copiar misty-relay.mjs'}
                </button>
              </div>
              <pre className="p-2.5 font-mono text-[10px] leading-relaxed bg-slate-950 text-slate-300 border border-slate-800 rounded-lg overflow-x-auto max-h-36">
                {relayScript}
              </pre>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Se você já rodava uma versão anterior do <code className="font-mono">misty-relay.mjs</code>, atualize o arquivo local com o script acima para habilitar imagens binárias da câmera frontal.
              </p>
            </div>
          </div>

          {/* HTTP Audit Log */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Registro de Requisições REST
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {apiLogs.length} eventos
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {apiLogs.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  Nenhuma chamada REST registrada ainda.
                </div>
              ) : (
                apiLogs.slice(0, 25).map((log) => (
                  <div key={log.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-mono">
                        <span
                          className={
                            log.method === 'GET'
                              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : 'text-sky-700 dark:text-sky-400 font-semibold'
                          }
                        >
                          {log.method}
                        </span>
                        <span className="text-slate-900 dark:text-slate-100 truncate">{log.path}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {log.summary} · {log.source}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className={log.status < 400 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}>
                        {log.status}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {log.durationMs}ms
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
