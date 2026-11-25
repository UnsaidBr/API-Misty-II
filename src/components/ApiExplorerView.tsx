import React, { useMemo, useState } from 'react';
import { Check, Copy, Play, Search } from 'lucide-react';
import { API_ENDPOINTS, type ApiEndpointSpec, type EndpointCategory } from '../data/apiCatalog';
import type { RobotState } from '../types/misty';
import { MistyDigitalTwin } from './MistyDigitalTwin';

interface ApiExplorerViewProps {
  state: RobotState;
  sendCommand: (
    path: string,
    body?: Record<string, unknown>,
    method?: 'GET' | 'POST' | 'DELETE'
  ) => Promise<{ ok: boolean; status: number; durationMs: number; data: Record<string, unknown> }>;
}

const CATEGORIES: Array<'Todas' | EndpointCategory> = [
  'Todas',
  'Locomoção',
  'Cabeça & Braços',
  'LED & Visor',
  'Áudio & Fala',
  'Sensores & SLAM',
  'Visão Computacional',
  'Coreografia & Batch',
  'Sistema & Ponte',
];

export const ApiExplorerView: React.FC<ApiExplorerViewProps> = ({ state, sendCommand }) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'Todas' | EndpointCategory>('Todas');
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpointSpec>(API_ENDPOINTS[4]); // move-head default
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(API_ENDPOINTS[4].defaultBody ?? {}, null, 2)
  );
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [responseMeta, setResponseMeta] = useState<{
    status: number;
    durationMs: number;
    data: unknown;
  } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [sdkLang, setSdkLang] = useState<'curl' | 'typescript' | 'python' | 'websocket'>('curl');
  const [copied, setCopied] = useState(false);

  const filteredEndpoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    return API_ENDPOINTS.filter((ep) => {
      const catMatch = selectedCategory === 'Todas' || ep.category === selectedCategory;
      const textMatch =
        !q ||
        ep.path.toLowerCase().includes(q) ||
        ep.title.toLowerCase().includes(q) ||
        ep.description.toLowerCase().includes(q);
      return catMatch && textMatch;
    });
  }, [search, selectedCategory]);

  const selectEndpoint = (ep: ApiEndpointSpec) => {
    setSelectedEndpoint(ep);
    setPayloadText(ep.defaultBody ? JSON.stringify(ep.defaultBody, null, 2) : '{}');
    setPayloadError(null);
    setResponseMeta(null);
  };

  const handleExecute = async () => {
    let parsedBody: Record<string, unknown> = {};
    if (selectedEndpoint.method !== 'GET') {
      try {
        parsedBody = JSON.parse(payloadText || '{}') as Record<string, unknown>;
        setPayloadError(null);
      } catch (err) {
        setPayloadError(err instanceof Error ? err.message : 'JSON inválido');
        return;
      }
    }

    setIsExecuting(true);
    try {
      const res = await sendCommand(selectedEndpoint.path, parsedBody, selectedEndpoint.method);
      setResponseMeta({ status: res.status, durationMs: res.durationMs, data: res.data });
    } finally {
      setIsExecuting(false);
    }
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const wsUrl = baseUrl.replace(/^http/, 'ws') + '/pubsub';

  const generatedSnippet = useMemo(() => {
    const cleanBody = payloadText.trim() || '{}';
    if (sdkLang === 'curl') {
      if (selectedEndpoint.method === 'GET') {
        return `curl -X GET "${baseUrl}${selectedEndpoint.path}" \\
  -H "Accept: application/json"`;
      }
      return `curl -X ${selectedEndpoint.method} "${baseUrl}${selectedEndpoint.path}" \\
  -H "Content-Type: application/json" \\
  -H "X-Misty-Source: external" \\
  -d '${cleanBody.replace(/\n\s*/g, ' ')}'`;
    }

    if (sdkLang === 'typescript') {
      if (selectedEndpoint.method === 'GET') {
        return `const response = await fetch("${baseUrl}${selectedEndpoint.path}");
const data = await response.json();
console.log(data);`;
      }
      return `const response = await fetch("${baseUrl}${selectedEndpoint.path}", {
  method: "${selectedEndpoint.method}",
  headers: {
    "Content-Type": "application/json",
    "X-Misty-Source": "external"
  },
  body: JSON.stringify(${cleanBody})
});

const result = await response.json();
console.log(result);`;
    }

    if (sdkLang === 'python') {
      if (selectedEndpoint.method === 'GET') {
        return `import requests

resp = requests.get("${baseUrl}${selectedEndpoint.path}", timeout=5)
print(resp.status_code, resp.json())`;
      }
      return `import requests

payload = ${cleanBody.replace(/true/g, 'True').replace(/false/g, 'False').replace(/null/g, 'None')}

resp = requests.${selectedEndpoint.method.toLowerCase()}(
    "${baseUrl}${selectedEndpoint.path}",
    json=payload,
    headers={"X-Misty-Source": "external"},
    timeout=5,
)
print(resp.status_code, resp.json())`;
    }

    return `// Conexão WebSocket compatível com /pubsub da Misty II
const ws = new WebSocket("${wsUrl}");

ws.onopen = () => {
  ws.send(JSON.stringify({
    Operation: "subscribe",
    Type: "TimeOfFlight"
  }));
  ws.send(JSON.stringify({
    Operation: "subscribe",
    Type: "AutomationTriggered"
  }));
};

ws.onmessage = (event) => {
  const frame = JSON.parse(event.data);
  console.log(frame.eventName, frame.message);
};`;
  }, [sdkLang, selectedEndpoint, payloadText, baseUrl, wsUrl]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(generatedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Column: Search & Endpoint Catalog */}
      <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar endpoint ou recurso..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-slate-900 dark:bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
          {filteredEndpoints.map((ep) => {
            const active = ep.id === selectedEndpoint.id;
            return (
              <button
                key={ep.id}
                type="button"
                onClick={() => selectEndpoint(ep)}
                className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-50/80 dark:bg-sky-950/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      ep.method === 'GET'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-sky-700 dark:text-sky-400'
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {ep.tier}
                  </span>
                </div>
                <div className="font-mono text-xs text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                  {ep.path}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                  {ep.title}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center Column: Request Builder, Parameters & Response */}
      <div className="xl:col-span-5 space-y-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{selectedEndpoint.category}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedEndpoint.tier}</span>
                {selectedEndpoint.mistyStockPath && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">Stock: {selectedEndpoint.mistyStockPath}</span>
                  </>
                )}
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {selectedEndpoint.title}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {selectedEndpoint.description}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-950 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`font-mono text-xs font-semibold shrink-0 ${
                  selectedEndpoint.method === 'GET' ? 'text-emerald-400' : 'text-sky-400'
                }`}
              >
                {selectedEndpoint.method}
              </span>
              <span className="font-mono text-xs text-slate-200 truncate">
                {selectedEndpoint.path}
              </span>
            </div>
            <button
              type="button"
              onClick={handleExecute}
              disabled={isExecuting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {isExecuting ? 'Enviando...' : 'Executar'}
            </button>
          </div>

          {selectedEndpoint.params.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Parâmetros Aceitos
              </h3>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {selectedEndpoint.params.map((p) => (
                  <div key={p.name} className="px-3 py-2 flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                        {p.name}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 ml-2">{p.type}</span>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">{p.description}</p>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                      {p.required ? 'Obrigatório' : 'Opcional'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedEndpoint.method !== 'GET' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Corpo JSON da Requisição
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setPayloadText(JSON.stringify(selectedEndpoint.defaultBody ?? {}, null, 2))
                  }
                  className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  Restaurar exemplo
                </button>
              </div>
              <textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                rows={7}
                spellCheck={false}
                className="w-full p-3 font-mono text-xs bg-slate-950 text-sky-200 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              {payloadError && (
                <p className="text-xs text-red-600 dark:text-red-400">Erro no JSON: {payloadError}</p>
              )}
            </div>
          )}

          {/* Live Response Output */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Resposta do Servidor
              </span>
              {responseMeta && (
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  HTTP {responseMeta.status} · {responseMeta.durationMs} ms
                </span>
              )}
            </div>
            {typeof (responseMeta?.data as { result?: { dataUrl?: string } })?.result?.dataUrl ===
              'string' && (
              <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                <img
                  src={(responseMeta?.data as { result: { dataUrl: string } }).result.dataUrl}
                  alt="Captura da câmera frontal via API"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-56 object-contain"
                />
              </div>
            )}
            <pre className="p-3 font-mono text-xs bg-slate-950 text-emerald-300 border border-slate-800 rounded-lg overflow-x-auto max-h-56">
              {responseMeta
                ? JSON.stringify(responseMeta.data, null, 2)
                : 'Clique em "Executar" para enviar esta requisição ao servidor MistyForge.'}
            </pre>
          </div>
        </div>

        {/* Multi-Language SDK Codegen */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              {(['curl', 'typescript', 'python', 'websocket'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setSdkLang(lang)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    sdkLang === lang
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {lang === 'curl'
                    ? 'cURL'
                    : lang === 'typescript'
                      ? 'TypeScript'
                      : lang === 'python'
                        ? 'Python'
                        : 'WebSocket'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar código'}
            </button>
          </div>
          <pre className="p-3 font-mono text-xs bg-slate-950 text-slate-200 border border-slate-800 rounded-lg overflow-x-auto">
            {generatedSnippet}
          </pre>
        </div>
      </div>

      {/* Right Column: Live Digital Twin Response Preview */}
      <div className="xl:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Feedback Visual ao Vivo
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Veja o robô reagir imediatamente às chamadas de API
          </p>
        </div>
        <MistyDigitalTwin
          state={state}
          compact
          onTouchSensor={(kind, sensor) =>
            void sendCommand('/api/misty/touch/simulate', { kind, sensor })
          }
        />
      </div>
    </div>
  );
};
