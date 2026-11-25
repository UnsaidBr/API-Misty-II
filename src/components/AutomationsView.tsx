import React, { useState } from 'react';
import { Plus, Trash2, Zap } from 'lucide-react';
import type {
  AutomationActionType,
  AutomationRule,
  AutomationTriggerType,
  CapTouchSensorId,
  EyeMood,
} from '../types/misty';

interface AutomationsViewProps {
  automations: AutomationRule[];
  sendCommand: (
    path: string,
    body?: Record<string, unknown>,
    method?: 'GET' | 'POST' | 'DELETE'
  ) => Promise<{ ok: boolean; status: number; durationMs: number; data: Record<string, unknown> }>;
  onRefresh: () => void;
}

export const AutomationsView: React.FC<AutomationsViewProps> = ({
  automations,
  sendCommand,
  onRefresh,
}) => {
  const [name, setName] = useState('Saudação ao Tocar Topo da Cabeça');
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('cap_touch');
  const [sensorKey, setSensorKey] = useState<CapTouchSensorId>('headFront');
  const [threshold, setThreshold] = useState(0.35);
  const [actionType, setActionType] = useState<AutomationActionType>('speak_custom');
  const [actionText, setActionText] = useState('Toque detectado! Olá operador.');
  const [actionMood, setActionMood] = useState<EyeMood>('happy');

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await sendCommand('/api/misty/automations', {
      name: name.trim(),
      enabled: true,
      triggerType,
      threshold,
      sensorKey: triggerType === 'cap_touch' ? sensorKey : undefined,
      actionType,
      actionPayload: {
        text: actionText,
        mood: actionMood,
        r: actionType === 'stop_and_alert' ? 239 : 16,
        g: actionType === 'stop_and_alert' ? 68 : 185,
        b: actionType === 'stop_and_alert' ? 68 : 129,
      },
      cooldownMs: 2500,
    });
    onRefresh();
  };

  const handleToggleRule = async (rule: AutomationRule) => {
    await sendCommand('/api/misty/automations', {
      id: rule.id,
      enabled: !rule.enabled,
    });
    onRefresh();
  };

  const handleDeleteRule = async (id: string) => {
    await sendCommand(`/api/misty/automations/${id}`, undefined, 'DELETE');
    onRefresh();
  };

  const handleTestTrigger = async (rule: AutomationRule) => {
    if (rule.triggerType === 'cap_touch') {
      await sendCommand('/api/misty/touch/simulate', {
        kind: 'capTouch',
        sensor: rule.sensorKey ?? 'chin',
      });
    } else if (rule.triggerType === 'bump_any') {
      await sendCommand('/api/misty/touch/simulate', {
        kind: 'bump',
        sensor: 'frontLeft',
      });
    } else {
      await sendCommand('/api/misty/drive', {
        linearVelocity: 45,
        angularVelocity: 0,
        durationMs: 1800,
      });
    }
  };

  const formatTriggerLabel = (r: AutomationRule) => {
    switch (r.triggerType) {
      case 'tof_front_below':
        return `ToF Frontal < ${r.threshold.toFixed(2)} m`;
      case 'bump_any':
        return 'Qualquer sensor Bump acionado';
      case 'cap_touch':
        return `Toque capacitivo: ${r.sensorKey ?? 'chin'}`;
      case 'battery_below':
        return `Bateria < ${r.threshold}%`;
    }
  };

  const formatActionLabel = (r: AutomationRule) => {
    switch (r.actionType) {
      case 'stop_and_alert':
        return 'Parar motores + Alerta visual e fala';
      case 'preset_greeting':
        return 'Aplicar expressão Saudação + Fala';
      case 'speak_custom':
        return `Falar: "${r.actionPayload.text ?? ''}"`;
      case 'set_led_eyes':
        return `Ajustar LED + Olhos (${r.actionPayload.mood ?? 'curious'})`;
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left/Center: Active Automation Rules Table */}
      <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Motor de Regras Autônomas (20 Hz)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Avaliado continuamente no servidor sem exigir polling externo do cliente
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {automations.filter((a) => a.enabled).length} de {automations.length} ativas
          </span>
        </div>

        {automations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhuma regra configurada. Crie uma regra ao lado para automatizar reações dos sensores.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {automations.map((rule) => (
              <div
                key={rule.id}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {rule.name}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        rule.enabled
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {rule.enabled ? 'Ativa' : 'Pausada'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">
                    <span>Se {formatTriggerLabel(rule)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Então {formatActionLabel(rule)}</span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Disparos: {rule.triggerCount}
                    {rule.lastTriggeredAt
                      ? ` · Último: ${new Date(rule.lastTriggeredAt).toLocaleTimeString('pt-BR')}`
                      : ' · Nunca disparada'}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleTestTrigger(rule)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-md hover:bg-sky-100 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Testar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleRule(rule)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {rule.enabled ? 'Pausar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteRule(rule.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                    aria-label="Excluir regra"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Create New Automation Rule */}
      <form
        onSubmit={handleCreateRule}
        className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Criar Nova Regra Reativa
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Define comportamento embarcado estilo Misty Skill
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Nome da Regra
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Condição (Gatilho)
          </label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)}
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          >
            <option value="cap_touch">Toque Capacitivo na Cabeça</option>
            <option value="tof_front_below">ToF Frontal abaixo do limite (m)</option>
            <option value="bump_any">Colisão no Para-Choque (Bump)</option>
            <option value="battery_below">Bateria abaixo de (%)</option>
          </select>
        </div>

        {triggerType === 'cap_touch' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Sensor Capacitivo
            </label>
            <select
              value={sensorKey}
              onChange={(e) => setSensorKey(e.target.value as CapTouchSensorId)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            >
              <option value="chin">chin (Queixo)</option>
              <option value="headFront">headFront (Topo Frontal)</option>
              <option value="headLeft">headLeft (Lateral Esquerda)</option>
              <option value="headRight">headRight (Lateral Direita)</option>
              <option value="headBack">headBack (Nuca)</option>
              <option value="scruff">scruff (Base Traseira)</option>
            </select>
          </div>
        )}

        {(triggerType === 'tof_front_below' || triggerType === 'battery_below') && (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Limite ({triggerType === 'tof_front_below' ? 'metros' : '%'})
            </label>
            <input
              type="number"
              step={triggerType === 'tof_front_below' ? 0.05 : 5}
              min={0.1}
              max={triggerType === 'tof_front_below' ? 1.8 : 95}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Ação Executada
          </label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as AutomationActionType)}
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          >
            <option value="speak_custom">Falar Frase TTS + Texto no Visor</option>
            <option value="stop_and_alert">Parar Motores + Alerta Vermelho</option>
            <option value="preset_greeting">Executar Preset Saudação</option>
            <option value="set_led_eyes">Alterar LED e Expressão Ocular</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Expressão Ocular da Ação
          </label>
          <select
            value={actionMood}
            onChange={(e) => setActionMood(e.target.value as EyeMood)}
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          >
            <option value="happy">Feliz</option>
            <option value="surprised">Surpreso</option>
            <option value="alert">Alerta</option>
            <option value="curious">Curioso</option>
            <option value="neutral">Neutro</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Mensagem de Fala / Visor
          </label>
          <input
            type="text"
            value={actionText}
            onChange={(e) => setActionText(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          />
        </div>

        <button
          type="submit"
          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Regra ao Motor
        </button>
      </form>
    </div>
  );
};
