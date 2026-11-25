import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
  type Part,
} from '@google/genai';
import type {
  ApiLogEntry,
  ArenaObstacle,
  AutomationRule,
  CameraStreamType,
  CapTouchSensorId,
  ChoreographyKeyframe,
  ChoreographySequence,
  DetectedEntity,
  EasingCurve,
  EyeMood,
  HardwareBridgeConfig,
  LedMode,
  RobotState,
  TofSensorId,
} from './src/types/misty.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ARENA_HALF_W = 2.85;
const ARENA_HALF_H = 1.95;
const ROBOT_RADIUS = 0.18;

const clamp = (val: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, val));

const normalizeAngleDeg = (deg: number): number => {
  let a = ((deg + 180) % 360 + 360) % 360 - 180;
  return a;
};

const defaultObstacles: ArenaObstacle[] = [
  { id: 'obs-1', x: 1.15, y: 0.65, width: 0.55, height: 0.55, label: 'Bancada A' },
  { id: 'obs-2', x: -1.3, y: -0.7, width: 0.7, height: 0.45, label: 'Estação Carga' },
  { id: 'obs-3', x: 0.25, y: -1.15, width: 0.5, height: 0.5, label: 'Pilar Central' },
  { id: 'obs-4', x: -1.5, y: 0.95, width: 0.45, height: 0.65, label: 'Rack Sensores' },
];

const state: RobotState = {
  deviceInfo: {
    robotId: 'misty-forge-02',
    serialNumber: 'M2-2026-BR8841',
    firmwareVersion: '2.9.4-ForgeExtended',
    apiVersion: 'Misty II + v2 Super-API',
    uptimeSeconds: 0,
    hardwareModel: 'Misty II Robotics Platform',
  },
  head: {
    pitch: -6,
    roll: 0,
    yaw: 0,
    targetPitch: -6,
    targetRoll: 0,
    targetYaw: 0,
  },
  arms: {
    left: 42,
    right: 42,
    targetLeft: 42,
    targetRight: 42,
  },
  drive: {
    linearVelocity: 0,
    angularVelocity: 0,
    leftTrack: 0,
    rightTrack: 0,
  },
  pose: {
    x: 0,
    y: 0,
    heading: 0,
    trail: [{ x: 0, y: 0 }],
  },
  waypointTarget: null,
  led: {
    r: 14,
    g: 165,
    b: 233,
    mode: 'breathe',
    periodMs: 2200,
  },
  eyes: {
    mood: 'neutral',
    gazeX: 0,
    gazeY: 0,
    displayText: 'Sistema MistyForge pronto.',
    isBlinking: false,
  },
  speech: {
    isSpeaking: false,
    lastUtterance: '',
    utteranceId: '',
    rate: 1.0,
    pitch: 1.0,
    timestamp: 0,
  },
  audioTone: null,
  battery: {
    chargePercent: 94.2,
    voltage: 12.42,
    isCharging: false,
    currentAmps: 0.45,
  },
  imu: {
    yaw: 0,
    pitch: -6,
    roll: 0,
    accelX: 0,
    accelY: 0,
    accelZ: 9.81,
  },
  tof: {
    FrontCenter: 1.85,
    FrontLeft: 1.62,
    FrontRight: 1.48,
    FrontBack: 1.9,
    DownFrontLeft: 0.14,
    DownFrontRight: 0.14,
    DownBackLeft: 0.14,
    DownBackRight: 0.14,
  },
  bump: {
    frontLeft: false,
    frontRight: false,
    backLeft: false,
    backRight: false,
  },
  capTouch: {
    chin: false,
    headFront: false,
    headBack: false,
    headLeft: false,
    headRight: false,
    scruff: false,
  },
  vision: {
    lastScanAt: 0,
    entities: [],
  },
  camera: {
    streamActive: false,
    streamType: 'rgb',
    width: 640,
    height: 480,
    lastFrameAt: 0,
    source: 'simulator',
    fps: 3,
  },
  obstacles: defaultObstacles,
  activeChoreography: null,
};

const choreographies: ChoreographySequence[] = [
  {
    id: 'chor-greeting',
    name: 'Saudação Amigável',
    description: 'Acena com o braço direito, inclina a cabeça com curiosidade, pisca LED esmeralda e cumprimenta.',
    durationMs: 4200,
    keyframes: [
      {
        id: 'kf-1',
        timeMs: 0,
        label: 'Atenção inicial',
        easing: 'easeInOut',
        head: { pitch: -14, roll: 8, yaw: 18 },
        arms: { left: 55, right: -22 },
        led: { r: 16, g: 185, b: 129, mode: 'solid' },
        eyes: { mood: 'happy', displayText: 'Olá! Bem-vindo ao laboratório.' },
        speech: { text: 'Olá! Tudo pronto para começarmos os testes de robótica.' },
      },
      {
        id: 'kf-2',
        timeMs: 1200,
        label: 'Aceno direito',
        easing: 'spring',
        head: { pitch: -10, roll: -8, yaw: -12 },
        arms: { left: 55, right: 20 },
      },
      {
        id: 'kf-3',
        timeMs: 2200,
        label: 'Aceno retorno',
        easing: 'spring',
        head: { pitch: -14, roll: 6, yaw: 0 },
        arms: { left: 55, right: -24 },
      },
      {
        id: 'kf-4',
        timeMs: 3600,
        label: 'Posição neutra',
        easing: 'easeInOut',
        head: { pitch: -5, roll: 0, yaw: 0 },
        arms: { left: 42, right: 42 },
        led: { r: 14, g: 165, b: 233, mode: 'breathe' },
        eyes: { mood: 'neutral', displayText: 'Aguardando próximo comando.' },
      },
    ],
  },
  {
    id: 'chor-patrol',
    name: 'Patrulha e Varredura',
    description: 'Avança pela arena, gira o cabeçote examinando esquerda/direita e retorna à pose estável.',
    durationMs: 5600,
    keyframes: [
      {
        id: 'kp-1',
        timeMs: 0,
        label: 'Iniciar varredura',
        easing: 'easeInOut',
        head: { pitch: -4, roll: 0, yaw: -55 },
        arms: { left: 25, right: 25 },
        drive: { linearVelocity: 30, angularVelocity: 0 },
        led: { r: 245, g: 158, b: 11, mode: 'blink' },
        eyes: { mood: 'processing', displayText: 'Modo patrulha ativo...' },
        speech: { text: 'Iniciando varredura perimetral da arena.' },
      },
      {
        id: 'kp-2',
        timeMs: 1800,
        label: 'Olhar à direita',
        easing: 'easeInOut',
        head: { pitch: -4, roll: 0, yaw: 55 },
        drive: { linearVelocity: 0, angularVelocity: 38 },
      },
      {
        id: 'kp-3',
        timeMs: 3600,
        label: 'Avanço lateral',
        easing: 'easeInOut',
        head: { pitch: -10, roll: 0, yaw: 0 },
        drive: { linearVelocity: 28, angularVelocity: -22 },
      },
      {
        id: 'kp-4',
        timeMs: 5200,
        label: 'Finalizar patrulha',
        easing: 'easeInOut',
        drive: { linearVelocity: 0, angularVelocity: 0 },
        arms: { left: 45, right: 45 },
        led: { r: 14, g: 165, b: 233, mode: 'breathe' },
        eyes: { mood: 'neutral', displayText: 'Perímetro verificado.' },
      },
    ],
  },
  {
    id: 'chor-alert',
    name: 'Alerta de Segurança',
    description: 'Sinaliza obstáculo ou erro crítico com LED pulsante vermelho, olhar alerta e parada total.',
    durationMs: 3200,
    keyframes: [
      {
        id: 'ka-1',
        timeMs: 0,
        label: 'Disparo alerta',
        easing: 'spring',
        head: { pitch: -22, roll: 0, yaw: 0 },
        arms: { left: -15, right: -15 },
        drive: { linearVelocity: 0, angularVelocity: 0 },
        led: { r: 220, g: 38, b: 38, mode: 'blink' },
        eyes: { mood: 'alert', displayText: 'ALERTA: Zona de segurança!' },
        speech: { text: 'Atenção. Condição de alerta detectada nos sensores.' },
      },
      {
        id: 'ka-2',
        timeMs: 2800,
        label: 'Estabilizar',
        easing: 'easeInOut',
        head: { pitch: -5, roll: 0, yaw: 0 },
        arms: { left: 45, right: 45 },
        led: { r: 14, g: 165, b: 233, mode: 'solid' },
        eyes: { mood: 'curious', displayText: 'Sistema estabilizado.' },
      },
    ],
  },
];

const automationRules: AutomationRule[] = [
  {
    id: 'rule-tof-guard',
    name: 'Freio Preventivo por ToF Frontal',
    enabled: true,
    triggerType: 'tof_front_below',
    threshold: 0.34,
    actionType: 'stop_and_alert',
    actionPayload: {
      text: 'Obstáculo próximo detectado. Motores interrompidos.',
      mood: 'surprised',
      r: 239,
      g: 68,
      b: 68,
    },
    cooldownMs: 3500,
    lastTriggeredAt: null,
    triggerCount: 0,
  },
  {
    id: 'rule-chin-greet',
    name: 'Reação Amigável ao Toque no Queixo',
    enabled: true,
    triggerType: 'cap_touch',
    threshold: 1,
    sensorKey: 'chin',
    actionType: 'preset_greeting',
    actionPayload: {
      text: 'Queixo tocado! Olá humano.',
      mood: 'happy',
      r: 16,
      g: 185,
      b: 129,
    },
    cooldownMs: 2000,
    lastTriggeredAt: null,
    triggerCount: 0,
  },
  {
    id: 'rule-bump-halt',
    name: 'Parada ao Acionar Para-Choque',
    enabled: true,
    triggerType: 'bump_any',
    threshold: 1,
    actionType: 'stop_and_alert',
    actionPayload: {
      text: 'Colisão física registrada no para-choque.',
      mood: 'alert',
      r: 245,
      g: 158,
      b: 11,
    },
    cooldownMs: 2500,
    lastTriggeredAt: null,
    triggerCount: 0,
  },
];

const apiLogs: ApiLogEntry[] = [];
const bridgeConfig: HardwareBridgeConfig = {
  mode: 'simulator',
  robotIp: '192.168.1.120',
  lastCheckedAt: null,
  reachable: false,
  agentConnected: false,
  connectionMethod: 'none',
  lastError: null,
};

let bridgeAgentWs: WebSocket | null = null;
const pendingBridgeCalls = new Map<
  string,
  {
    resolve: (res: { ok: boolean; status: number; data: unknown }) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

const normalizeTargetBaseUrl = (input: string): string => {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
};

const sendToRealMisty = async (
  mistyPath: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>,
  timeoutMs = 3000
): Promise<{ ok: boolean; status: number; data: unknown; via: string }> => {
  // 1) Prefer reverse WebSocket bridge agent if connected (works from Cloud Run -> LAN)
  if (bridgeAgentWs && bridgeAgentWs.readyState === WebSocket.OPEN) {
    const reqId = `br-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingBridgeCalls.delete(reqId);
        resolve({
          ok: false,
          status: 504,
          data: { error: 'Timeout aguardando resposta do agente local.' },
          via: 'relay-agent',
        });
      }, timeoutMs);

      pendingBridgeCalls.set(reqId, {
        timer,
        resolve: (res) => resolve({ ...res, via: 'relay-agent' }),
      });

      bridgeAgentWs?.send(
        JSON.stringify({
          type: 'http_request',
          reqId,
          method,
          path: mistyPath,
          body: body ?? {},
        })
      );
    });
  }

  // 2) Otherwise attempt direct HTTP/HTTPS fetch (works locally on LAN or via ngrok/Cloudflare tunnel)
  const targetUrl = `${normalizeTargetBaseUrl(bridgeConfig.robotIp)}${mistyPath}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(targetUrl, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data, via: 'direct-http' };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: {
        error: err instanceof Error ? err.message : 'Falha de conexão com Misty II',
        targetUrl,
      },
      via: 'direct-http',
    };
  }
};

// Latest-wins channel coalescer for smooth real-time hardware slider updates
const channelBusy = new Map<string, boolean>();
const channelLatest = new Map<string, () => Promise<void>>();
let bridgeDriveStopTimer: ReturnType<typeof setTimeout> | null = null;

const enqueueCoalesced = (channel: string, task: () => Promise<void>) => {
  if (channelBusy.get(channel)) {
    channelLatest.set(channel, task);
    return;
  }
  channelBusy.set(channel, true);
  void (async () => {
    try {
      await task();
    } finally {
      channelBusy.set(channel, false);
      const next = channelLatest.get(channel);
      if (next) {
        channelLatest.delete(channel);
        enqueueCoalesced(channel, next);
      }
    }
  })();
};

// Server-Side Gemini Helpers & Native Brazilian Portuguese Neural TTS
const getGeminiClient = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

const isTransientGeminiError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('500') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
};

const extractCleanErrorMessage = (rawMsg: string): string => {
  const jsonStart = rawMsg.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(rawMsg.slice(jsonStart)) as {
        error?: { message?: string };
        message?: string;
      };
      const inner = parsed?.error?.message || parsed?.message;
      if (inner && typeof inner === 'string') {
        return inner;
      }
    } catch {
      // ignore JSON parse failure
    }
  }
  return rawMsg;
};

const formatGeminiError = (err: unknown): { status: number; message: string } => {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'GEMINI_API_KEY_MISSING' || msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message:
        'Chave Gemini ausente ou inválida. No AI Studio verifique Settings > Secrets; rodando localmente, configure GEMINI_API_KEY no arquivo .env na raiz do projeto.',
    };
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return {
      status: 429,
      message: 'Limite de cota da API Gemini atingido no momento. Tente novamente em instantes.',
    };
  }
  if (isTransientGeminiError(err)) {
    return {
      status: 503,
      message:
        'Os modelos Gemini estão com pico temporário de demanda (503). Aguarde alguns segundos e clique em Tentar novamente.',
    };
  }
  return {
    status: 502,
    message: `Erro ao consultar a IA Gemini: ${extractCleanErrorMessage(msg)}`,
  };
};

const withGeminiRetry = async <T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> => {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientGeminiError(err) || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
};

const GEMINI_MODEL_FALLBACKS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

const generateContentWithFallback = async (
  ai: GoogleGenAI,
  params: {
    contents: Content[];
    systemInstruction: string;
    tools?: Array<{ functionDeclarations: FunctionDeclaration[] }>;
    preferredModel?: string;
  }
) => {
  const candidates = params.preferredModel
    ? [
        params.preferredModel,
        ...GEMINI_MODEL_FALLBACKS.filter((m) => m !== params.preferredModel),
      ]
    : [...GEMINI_MODEL_FALLBACKS];

  let lastErr: unknown;
  for (const model of candidates) {
    try {
      const response = await withGeminiRetry(
        () =>
          ai.models.generateContent({
            model,
            contents: params.contents,
            config: {
              systemInstruction: params.systemInstruction,
              ...(params.tools ? { tools: params.tools } : {}),
              thinkingConfig: {
                thinkingLevel:
                  model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
              },
            },
          }),
        1
      );
      return { response, model };
    } catch (err) {
      lastErr = err;
      if (!isTransientGeminiError(err)) {
        throw err;
      }
    }
  }
  throw lastErr;
};

const ALLOWED_NEURAL_VOICES = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
const TTS_MODEL_PRIORITY = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'] as const;
const STYLE_PROMPTS: Record<string, string> = {
  natural:
    'Native Brazilian Portuguese (pt-BR) speaker from Brazil, authentic Brazilian accent, natural conversational rhythm, warm human tone, clear Brazilian nasal vowels and soft palatalized t/d sounds, zero American or European Portuguese accent.',
  friendly:
    'Warm, smiling, friendly native Brazilian Portuguese (pt-BR) speaker, very natural Brazilian intonation and relaxed conversational prosody, zero foreign accent.',
  lab:
    'Articulate, clear, engaging native Brazilian Portuguese (pt-BR) robotics researcher speaking naturally in pt-BR with authentic Brazilian pronunciation.',
  calm:
    'Calm, soothing, reassuring native Brazilian Portuguese (pt-BR) speaker with smooth Brazilian cadence and natural pauses.',
  enthusiastic:
    'Upbeat, expressive, energetic native Brazilian Portuguese (pt-BR) presenter with authentic Brazilian intonation and natural liveliness.',
};

const normalizePortugueseSpeechText = (raw: string): string =>
  raw
    .replace(/\bMisty\s*II\b/gi, 'Misty dois')
    .replace(/\bMisty\s*2\b/gi, 'Misty dois')
    .replace(/\bpt-BR\b/gi, 'português do Brasil')
    .replace(/\bToF\b/g, 'sensor Tóf')
    .replace(/\bAPI\b/g, 'A P I')
    .replace(/\bm\/s\b/gi, 'metros por segundo')
    .replace(/\bkm\/h\b/gi, 'quilômetros por hora')
    .replace(/(\d+(?:[.,]\d+)?)\s*°\b/g, '$1 graus')
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, '$1 por cento')
    .replace(/\s+/g, ' ')
    .trim();

const neuralTtsCache = new Map<
  string,
  { audioBase64: string; mimeType: string; model: string }
>();

const synthesizeBrazilianSpeechWav = async (params: {
  text: string;
  voiceName?: string;
  style?: string;
  mood?: string;
}): Promise<{
  audioBase64: string;
  mimeType: string;
  model: string;
  voiceName: string;
  cached: boolean;
}> => {
  const requestedVoice = String(params.voiceName ?? 'Kore');
  const voiceName = ALLOWED_NEURAL_VOICES.has(requestedVoice) ? requestedVoice : 'Kore';
  const requestedStyle = String(params.style ?? 'natural');
  const moodHint = String(params.mood ?? '').trim();
  const baseStyle = STYLE_PROMPTS[requestedStyle] ?? STYLE_PROMPTS.natural;
  const stylePrompt =
    moodHint === 'alert'
      ? `${baseStyle} Urgent yet composed safety alert tone.`
      : moodHint === 'curious'
      ? `${baseStyle} Curious and inquisitive tone.`
      : baseStyle;

  const spokenText = normalizePortugueseSpeechText(params.text).slice(0, 600);
  const cacheKey = `${voiceName}::${requestedStyle}::${moodHint}::${spokenText}`;
  const cached = neuralTtsCache.get(cacheKey);
  if (cached) {
    return {
      audioBase64: cached.audioBase64,
      mimeType: cached.mimeType,
      model: cached.model,
      voiceName,
      cached: true,
    };
  }

  const ai = getGeminiClient();
  let lastErr: unknown;
  let audioBase64: string | undefined;
  let mimeType = 'audio/wav';
  let usedModel: string = TTS_MODEL_PRIORITY[0];

  for (const ttsModel of TTS_MODEL_PRIORITY) {
    try {
      const response = await withGeminiRetry(
        () =>
          ai.models.generateContent({
            model: ttsModel,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: spokenText,
                    speechMetadata: {
                      style: stylePrompt,
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
          }),
        1
      );
      const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inline?.data) {
        audioBase64 = inline.data;
        mimeType = inline.mimeType || 'audio/wav';
        usedModel = ttsModel;
        break;
      }
    } catch (err) {
      lastErr = err;
      if (!isTransientGeminiError(err)) {
        throw err;
      }
    }
  }

  if (!audioBase64) {
    if (lastErr) throw lastErr;
    throw new Error('Resposta de áudio vazia do sintetizador neural.');
  }

  if (neuralTtsCache.size >= 30) {
    const oldestKey = neuralTtsCache.keys().next().value;
    if (oldestKey) neuralTtsCache.delete(oldestKey);
  }
  neuralTtsCache.set(cacheKey, { audioBase64, mimeType, model: usedModel });

  return {
    audioBase64,
    mimeType,
    model: usedModel,
    voiceName,
    cached: false,
  };
};

const forwardCommandToRealMisty = async (
  endpointPath: string,
  body: Record<string, unknown>
): Promise<{ forwarded: boolean; ok: boolean; status: number; via: string; detail?: unknown }> => {
  if (bridgeConfig.mode !== 'bridge') {
    return { forwarded: false, ok: true, status: 200, via: 'simulator' };
  }

  const calls: Array<{ path: string; method?: 'GET' | 'POST'; payload?: Record<string, unknown> }> = [];

  switch (endpointPath) {
    case '/api/misty/drive': {
      if (bridgeDriveStopTimer) {
        clearTimeout(bridgeDriveStopTimer);
        bridgeDriveStopTimer = null;
      }
      const linear = Number(body.linearVelocity ?? 0);
      const angular = Number(body.angularVelocity ?? 0);
      if (body.durationMs) {
        const ms = clamp(Number(body.durationMs), 80, 15000);
        calls.push({
          path: '/api/drive/time',
          payload: { LinearVelocity: linear, AngularVelocity: angular, TimeMS: ms },
        });
        // Safety stop right after pulse so short clicks never drift
        bridgeDriveStopTimer = setTimeout(() => {
          void sendToRealMisty('/api/drive/stop', 'POST', {});
        }, ms + 35);
      } else {
        calls.push({
          path: '/api/drive',
          payload: { LinearVelocity: linear, AngularVelocity: angular },
        });
      }
      break;
    }
    case '/api/misty/drive/track':
      if (bridgeDriveStopTimer) {
        clearTimeout(bridgeDriveStopTimer);
        bridgeDriveStopTimer = null;
      }
      calls.push({
        path: '/api/drive/track',
        payload: {
          LeftTrackSpeed: Number(body.leftTrackSpeed ?? 0),
          RightTrackSpeed: Number(body.rightTrackSpeed ?? 0),
        },
      });
      if (body.durationMs) {
        const ms = clamp(Number(body.durationMs), 80, 15000);
        bridgeDriveStopTimer = setTimeout(() => {
          void sendToRealMisty('/api/drive/stop', 'POST', {});
        }, ms + 35);
      }
      break;
    case '/api/misty/drive/stop':
      if (bridgeDriveStopTimer) {
        clearTimeout(bridgeDriveStopTimer);
        bridgeDriveStopTimer = null;
      }
      channelLatest.delete('drive');
      calls.push({ path: '/api/drive/stop', payload: {} });
      break;
    case '/api/misty/head': {
      const payload = {
        Pitch: Number(body.pitch ?? 0),
        Roll: Number(body.roll ?? 0),
        Yaw: Number(body.yaw ?? 0),
        Velocity: Number(body.velocity ?? 75),
      };
      enqueueCoalesced('head', async () => {
        await sendToRealMisty('/api/head', 'POST', payload);
      });
      return { forwarded: true, ok: true, status: 202, via: 'coalesced-head' };
    }
    case '/api/misty/arms': {
      const payload = {
        LeftArmPosition: Number(body.leftArmPosition ?? 42),
        RightArmPosition: Number(body.rightArmPosition ?? 42),
        LeftArmVelocity: Number(body.leftArmVelocity ?? 65),
        RightArmVelocity: Number(body.rightArmVelocity ?? 65),
      };
      enqueueCoalesced('arms', async () => {
        await sendToRealMisty('/api/arms/set', 'POST', payload);
      });
      return { forwarded: true, ok: true, status: 202, via: 'coalesced-arms' };
    }
    case '/api/misty/led':
      calls.push({
        path: '/api/led',
        payload: {
          red: Number(body.red ?? body.r ?? 0),
          green: Number(body.green ?? body.g ?? 0),
          blue: Number(body.blue ?? body.b ?? 0),
        },
      });
      break;
    case '/api/misty/led/transition':
      calls.push({
        path: '/api/led/transition',
        payload: {
          Red: Number(body.red ?? 14),
          Green: Number(body.green ?? 165),
          Blue: Number(body.blue ?? 233),
          Red2: 0,
          Green2: 0,
          Blue2: 0,
          TransitionType: body.mode === 'blink' ? 'Blink' : 'Breathe',
          TimeMs: Number(body.periodMs ?? 1400),
        },
      });
      break;
    case '/api/misty/tts/speak': {
      const text = String(body.text ?? '').trim();
      const useNeural = body.ttsEngine !== 'browser';
      let hardwareSpokeNeural = false;

      if (useNeural && text) {
        try {
          const wav = await synthesizeBrazilianSpeechWav({
            text,
            voiceName: typeof body.voiceName === 'string' ? body.voiceName : 'Kore',
            style: typeof body.style === 'string' ? body.style : 'natural',
            mood: typeof body.mood === 'string' ? body.mood : '',
          });
          calls.push({
            path: '/api/audio',
            payload: {
              FileName: 'misty_ptbr.wav',
              Data: wav.audioBase64,
              ImmediatelyApply: true,
              OverwriteExisting: true,
            },
          });
          hardwareSpokeNeural = true;
        } catch {
          hardwareSpokeNeural = false;
        }
      }

      if (!hardwareSpokeNeural) {
        calls.push({
          path: '/api/tts/speak',
          payload: {
            Text: text,
            Pitch: Number(body.pitch ?? 1.0),
            SpeechRate: Number(body.rate ?? 1.0),
            Flush: true,
            UtteranceId: String(body.utteranceId ?? `mf-${Date.now()}`),
          },
        });
      }

      if (body.mood || body.displayText !== undefined) {
        calls.push({
          path: '/api/text/display',
          payload: { Text: String(body.displayText ?? body.text ?? '') },
        });
      }
      if (body.led && typeof body.led === 'object') {
        const l = body.led as Record<string, unknown>;
        calls.push({
          path: '/api/led',
          payload: {
            red: Number(l.r ?? 14),
            green: Number(l.g ?? 165),
            blue: Number(l.b ?? 233),
          },
        });
      }
      break;
    }
    case '/api/misty/tts/stop':
      calls.push(
        { path: '/api/tts/stop', payload: {} },
        { path: '/api/audio/stop', payload: {} }
      );
      break;
    case '/api/misty/eyes':
      if (body.displayText) {
        calls.push({
          path: '/api/text/display',
          payload: { Text: String(body.displayText) },
        });
      }
      break;
    case '/api/misty/pose/preset':
      calls.push(
        {
          path: '/api/head',
          payload: {
            Pitch: Math.round(state.head.targetPitch),
            Roll: Math.round(state.head.targetRoll),
            Yaw: Math.round(state.head.targetYaw),
            Velocity: 70,
          },
        },
        {
          path: '/api/arms/set',
          payload: {
            LeftArmPosition: Math.round(state.arms.targetLeft),
            RightArmPosition: Math.round(state.arms.targetRight),
            LeftArmVelocity: 65,
            RightArmVelocity: 65,
          },
        },
        {
          path: '/api/led',
          payload: { red: state.led.r, green: state.led.g, blue: state.led.b },
        }
      );
      break;
    case '/api/misty/slam/reset':
      calls.push({ path: '/api/slam/reset', payload: {} });
      break;
    case '/api/misty/vision/scan':
      calls.push({ path: '/api/faces/detection/start', payload: {} });
      break;
    default:
      break;
  }

  if (calls.length === 0) {
    return { forwarded: false, ok: true, status: 200, via: 'simulator' };
  }

  let lastRes = { ok: true, status: 200, data: {} as unknown, via: 'direct-http' };
  for (const call of calls) {
    lastRes = await sendToRealMisty(call.path, call.method ?? 'POST', call.payload);
  }
  return {
    forwarded: true,
    ok: lastRes.ok,
    status: lastRes.status,
    via: lastRes.via,
    detail: lastRes.data,
  };
};

const normalizeStreamType = (value: unknown): CameraStreamType => {
  if (value === 'depth' || value === 'fisheye' || value === 'rgb') {
    return value;
  }
  return 'rgb';
};

const castCameraRay = (
  ox: number,
  oy: number,
  angleRad: number,
  maxRange = 6.0
): { dist: number; hitType: 'wall' | 'obstacle' } => {
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  let minDist = maxRange;
  let hitType: 'wall' | 'obstacle' = 'wall';

  if (dx > 1e-5) minDist = Math.min(minDist, (ARENA_HALF_W - ox) / dx);
  if (dx < -1e-5) minDist = Math.min(minDist, (-ARENA_HALF_W - ox) / dx);
  if (dy > 1e-5) minDist = Math.min(minDist, (ARENA_HALF_H - oy) / dy);
  if (dy < -1e-5) minDist = Math.min(minDist, (-ARENA_HALF_H - oy) / dy);

  for (const obs of state.obstacles) {
    const hit = rayIntersectAABB(
      ox,
      oy,
      dx,
      dy,
      obs.x - obs.width / 2,
      obs.y - obs.height / 2,
      obs.x + obs.width / 2,
      obs.y + obs.height / 2
    );
    if (hit !== null && hit > 0 && hit < minDist) {
      minDist = hit;
      hitType = 'obstacle';
    }
  }
  return { dist: clamp(minDist, 0.12, maxRange), hitType };
};

const depthColorFromMeters = (dist: number, hitType: 'wall' | 'obstacle'): string => {
  const t = clamp((dist - 0.25) / 4.2, 0, 1);
  // Close: warm coral/amber -> Mid: cyan/teal -> Far: deep indigo
  let r: number;
  let g: number;
  let b: number;
  if (t < 0.35) {
    const k = t / 0.35;
    r = Math.round(249 - k * 54);
    g = Math.round(115 + k * 100);
    b = Math.round(22 + k * 145);
  } else if (t < 0.7) {
    const k = (t - 0.35) / 0.35;
    r = Math.round(195 - k * 175);
    g = Math.round(215 - k * 35);
    b = Math.round(167 + k * 55);
  } else {
    const k = (t - 0.7) / 0.3;
    r = Math.round(20 + k * 10);
    g = Math.round(180 - k * 135);
    b = Math.round(222 - k * 120);
  }
  if (hitType === 'obstacle') {
    r = clamp(r + 12, 0, 255);
    g = clamp(g + 8, 0, 255);
  }
  return `rgb(${r}, ${g}, ${b})`;
};

// First-person POV Stream Renderer for Simulator + Hardware Proxy Fallback (RGB, Depth, SLAM Fisheye)
const renderSimulatorStreamSvg = (
  streamType: CameraStreamType,
  width: number,
  height: number
): string => {
  const fovDeg = streamType === 'fisheye' ? 124 : 72;
  const lookAngleDeg = state.pose.heading - state.head.yaw * 0.65;
  const horizonY = Math.round(height * 0.46 - (state.head.pitch / 40) * (height * 0.18));

  // Project visible obstacles in Misty's frustum
  const projectedObstacles: Array<{
    id: string;
    label: string;
    dist: number;
    screenX: number;
    boxW: number;
    boxH: number;
    bearing: number;
  }> = [];

  for (const obs of state.obstacles) {
    const dx = obs.x - state.pose.x;
    const dy = obs.y - state.pose.y;
    const dist = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const bearing = normalizeAngleDeg(angle - lookAngleDeg);
    if (Math.abs(bearing) < fovDeg * 0.72 && dist > 0.25 && dist < 5.6) {
      const normBearing = bearing / (fovDeg / 2);
      const fisheyeCurve =
        streamType === 'fisheye' ? Math.sign(normBearing) * Math.pow(Math.abs(normBearing), 0.84) : normBearing;
      const screenX = width / 2 - fisheyeCurve * (width / 2);
      const scale = Math.min(2.2, (streamType === 'fisheye' ? 0.92 : 1.15) / Math.max(0.35, dist));
      const boxW = Math.round(obs.width * (streamType === 'fisheye' ? 150 : 180) * scale);
      const boxH = Math.round((streamType === 'fisheye' ? 120 : 145) * scale);
      projectedObstacles.push({
        id: obs.id,
        label: obs.label,
        dist,
        screenX,
        boxW,
        boxH,
        bearing,
      });
    }
  }

  projectedObstacles.sort((a, b) => b.dist - a.dist);

  if (streamType === 'depth') {
    const columns = 64;
    const colW = width / columns;
    const colRects: string[] = [];

    for (let i = 0; i < columns; i++) {
      const frac = (i + 0.5) / columns - 0.5; // -0.5 to 0.5
      const rayBearingDeg = -frac * fovDeg;
      const rayAngleRad = ((lookAngleDeg + rayBearingDeg) * Math.PI) / 180;
      const { dist, hitType } = castCameraRay(state.pose.x, state.pose.y, rayAngleRad, 6.0);
      const colColor = depthColorFromMeters(dist, hitType);
      const wallRatio = clamp(1.15 / Math.max(0.32, dist), 0.14, 0.9);
      const colHeight = Math.round(height * wallRatio);
      const topY = Math.round(horizonY - colHeight * 0.48);

      colRects.push(
        `<rect x="${(i * colW).toFixed(1)}" y="${topY}" width="${(colW + 0.8).toFixed(1)}" height="${colHeight}" fill="${colColor}" opacity="0.95" />`
      );
      if (hitType === 'obstacle') {
        colRects.push(
          `<rect x="${(i * colW).toFixed(1)}" y="${topY}" width="${(colW + 0.8).toFixed(1)}" height="3" fill="#FEF08A" opacity="0.7" />`
        );
      }
    }

    // Subtle floor depth gradient rows below horizon
    const floorDepthBands: string[] = [];
    for (let r = 0; r < 6; r++) {
      const y = horizonY + Math.round((r / 6) * (height - horizonY));
      const bandH = Math.ceil((height - horizonY) / 6) + 1;
      const t = 1 - r / 6;
      const alpha = (0.18 + t * 0.35).toFixed(2);
      floorDepthBands.push(
        `<rect x="0" y="${y}" width="${width}" height="${bandH}" fill="#0F172A" opacity="${alpha}" />`
      );
    }

    const obstacleTags = projectedObstacles
      .map((o) => {
        const topY = Math.round(horizonY + 8 - o.boxH * 0.52);
        const leftX = clamp(Math.round(o.screenX - o.boxW / 2), 8, width - 110);
        return `<g>
          <line x1="${Math.round(o.screenX)}" y1="${topY}" x2="${Math.round(o.screenX)}" y2="${topY + 18}" stroke="#FEF08A" stroke-width="1" stroke-dasharray="2 2" />
          <rect x="${leftX}" y="${Math.max(10, topY - 18)}" width="96" height="16" rx="2" fill="#020617" opacity="0.78" />
          <text x="${leftX + 5}" y="${Math.max(21, topY - 7)}" fill="#FDE047" font-size="10" font-family="monospace">${o.dist.toFixed(2)}m</text>
        </g>`;
      })
      .join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="depthSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#090D16" />
      <stop offset="100%" stop-color="#1E1B4B" />
    </linearGradient>
    <linearGradient id="depthScale" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F97316" />
      <stop offset="45%" stop-color="#14B8A6" />
      <stop offset="100%" stop-color="#1E3A8A" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#depthSky)" />
  ${floorDepthBands.join('\n  ')}
  ${colRects.join('\n  ')}
  ${obstacleTags}
  <line x1="${width / 2 - 14}" y1="${height / 2}" x2="${width / 2 + 14}" y2="${height / 2}" stroke="#F8FAFC" stroke-width="1" opacity="0.45" />
  <line x1="${width / 2}" y1="${height / 2 - 14}" x2="${width / 2}" y2="${height / 2 + 14}" stroke="#F8FAFC" stroke-width="1" opacity="0.45" />
  <rect x="${width - 26}" y="${Math.round(height * 0.2)}" width="8" height="${Math.round(height * 0.6)}" rx="2" fill="url(#depthScale)" stroke="#334155" stroke-width="1" />
  <text x="${width - 54}" y="${Math.round(height * 0.2) + 8}" fill="#FDBA74" font-size="9" font-family="monospace">0.3m</text>
  <text x="${width - 54}" y="${Math.round(height * 0.8)}" fill="#93C5FD" font-size="9" font-family="monospace">4.5m</text>
</svg>`;
  }

  if (streamType === 'fisheye') {
    const phaseShift = ((lookAngleDeg % 25) / 25) * 48;
    const curvedGrid: string[] = [];
    for (let i = -4; i <= 4; i++) {
      const bx = width / 2 + i * 95 + phaseShift;
      const cx = width / 2 + i * 48 + phaseShift * 0.45;
      const tx = width / 2 + i * 24 + phaseShift * 0.2;
      curvedGrid.push(
        `<path d="M ${tx.toFixed(0)} ${horizonY} Q ${cx.toFixed(0)} ${Math.round((horizonY + height) / 2)} ${bx.toFixed(0)} ${height}" fill="none" stroke="#334155" stroke-width="1" opacity="0.65" />`
      );
    }
    for (let row = 1; row <= 4; row++) {
      const y = horizonY + Math.pow(row / 4, 1.4) * (height - horizonY);
      const bow = row * 12;
      curvedGrid.push(
        `<path d="M 0 ${y.toFixed(0)} Q ${width / 2} ${(y + bow).toFixed(0)} ${width} ${y.toFixed(0)}" fill="none" stroke="#334155" stroke-width="1" opacity="0.55" />`
      );
    }

    const slamFeatures: string[] = [];
    const slamObstacles = projectedObstacles
      .map((o) => {
        const topY = Math.round(horizonY + 14 - o.boxH * 0.55);
        const leftX = Math.round(o.screenX - o.boxW / 2);
        const corners = [
          [leftX, topY],
          [leftX + o.boxW, topY],
          [leftX, topY + o.boxH],
          [leftX + o.boxW, topY + o.boxH],
        ];
        for (const [cx, cy] of corners) {
          slamFeatures.push(
            `<g stroke="#34D399" stroke-width="1.3" opacity="0.9">
              <circle cx="${cx}" cy="${cy}" r="3.5" fill="none" />
              <line x1="${cx - 6}" y1="${cy}" x2="${cx + 6}" y2="${cy}" />
              <line x1="${cx}" y1="${cy - 6}" x2="${cx}" y2="${cy + 6}" />
            </g>`
          );
        }
        return `<rect x="${leftX}" y="${topY}" width="${o.boxW}" height="${o.boxH}" rx="4" fill="#1E293B" stroke="#94A3B8" stroke-width="1.4" opacity="0.88" />`;
      })
      .join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="fisheyeVignette" cx="50%" cy="50%" r="65%">
      <stop offset="60%" stop-color="#0F172A" stop-opacity="0" />
      <stop offset="100%" stop-color="#020617" stop-opacity="0.88" />
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${horizonY}" fill="#111827" />
  <rect x="0" y="${horizonY}" width="${width}" height="${height - horizonY}" fill="#090D16" />
  ${curvedGrid.join('\n  ')}
  <path d="M 0 ${horizonY + 16} Q ${width / 2} ${horizonY - 12} ${width} ${horizonY + 16}" fill="none" stroke="#64748B" stroke-width="1.5" />
  ${slamObstacles}
  ${slamFeatures.join('\n  ')}
  <ellipse cx="${width / 2}" cy="${height / 2}" rx="${Math.round(width * 0.46)}" ry="${Math.round(height * 0.46)}" fill="none" stroke="#475569" stroke-width="1" stroke-dasharray="4 4" opacity="0.65" />
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#fisheyeVignette)" />
</svg>`;
  }

  // Default: Frontal RGB POV
  const phaseShift = ((lookAngleDeg % 30) / 30) * 60;
  const floorLines: string[] = [];
  for (let i = -5; i <= 5; i++) {
    const xBottom = width / 2 + i * 110 + phaseShift;
    const xTop = width / 2 + i * 24 + phaseShift * 0.25;
    floorLines.push(
      `<line x1="${xTop.toFixed(0)}" y1="${horizonY}" x2="${xBottom.toFixed(0)}" y2="${height}" stroke="#1E293B" stroke-width="1.2" />`
    );
  }
  for (let row = 1; row <= 5; row++) {
    const y = horizonY + Math.pow(row / 5, 1.55) * (height - horizonY);
    floorLines.push(
      `<line x1="0" y1="${y.toFixed(0)}" x2="${width}" y2="${y.toFixed(0)}" stroke="#1E293B" stroke-width="1" />`
    );
  }

  const obstacleMarkup = projectedObstacles
    .map((o) => {
      const shade = Math.max(25, Math.min(80, Math.round(85 - o.dist * 14)));
      const topY = Math.round(horizonY + 12 - o.boxH * 0.55);
      const leftX = Math.round(o.screenX - o.boxW / 2);
      return `<g>
        <rect x="${leftX}" y="${topY}" width="${o.boxW}" height="${o.boxH}" rx="4" fill="rgb(${shade}, ${shade + 12}, ${shade + 28})" stroke="#38BDF8" stroke-width="1.5" opacity="0.92" />
        <rect x="${leftX}" y="${topY}" width="${o.boxW}" height="18" fill="#0F172A" opacity="0.72" />
        <text x="${leftX + 6}" y="${topY + 13}" fill="#7DD3FC" font-size="11" font-family="monospace">${o.label} · ${o.dist.toFixed(2)}m</text>
      </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>
    <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#090E1A" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${horizonY}" fill="url(#wallGrad)" />
  <rect x="0" y="${horizonY}" width="${width}" height="${height - horizonY}" fill="url(#floorGrad)" />
  ${floorLines.join('\n  ')}
  <line x1="0" y1="${horizonY}" x2="${width}" y2="${horizonY}" stroke="#334155" stroke-width="1.5" />
  ${obstacleMarkup}
  <circle cx="${width / 2}" cy="${height / 2}" r="14" fill="none" stroke="#38BDF8" stroke-width="1.2" opacity="0.45" />
  <line x1="${width / 2 - 22}" y1="${height / 2}" x2="${width / 2 - 8}" y2="${height / 2}" stroke="#38BDF8" stroke-width="1.2" opacity="0.45" />
  <line x1="${width / 2 + 8}" y1="${height / 2}" x2="${width / 2 + 22}" y2="${height / 2}" stroke="#38BDF8" stroke-width="1.2" opacity="0.45" />
</svg>`;
};

let cameraStreamTimer: ReturnType<typeof setInterval> | null = null;

const captureCameraFrame = async (
  streamType: CameraStreamType = 'rgb',
  width = 640,
  height = 480
) => {
  const kind = normalizeStreamType(streamType);
  const w = clamp(Number(width) || 640, 160, 1920);
  const h = clamp(Number(height) || 480, 120, 1080);

  if (bridgeConfig.mode === 'bridge') {
    const hardwarePath =
      kind === 'depth'
        ? '/api/cameras/depth?base64=true'
        : kind === 'fisheye'
          ? '/api/cameras/fisheye?base64=true'
          : `/api/cameras/rgb?base64=true&width=${w}&height=${h}`;

    const resp = await sendToRealMisty(hardwarePath, 'GET', undefined, 5000);
    const rawData = resp.data as Record<string, unknown>;
    const inner = (rawData?.result as Record<string, unknown>) ?? rawData;
    const base64Str =
      typeof inner?.base64 === 'string'
        ? inner.base64
        : typeof inner?.image === 'string'
          ? inner.image
          : '';

    if (resp.ok && base64Str) {
      const contentType =
        typeof inner?.contentType === 'string' ? inner.contentType : 'image/jpeg';
      const cleanB64 = base64Str.replace(/^data:image\/[a-z+]+;base64,/i, '');
      state.camera.lastFrameAt = Date.now();
      state.camera.streamType = kind;
      state.camera.source = 'hardware';
      state.camera.width = w;
      state.camera.height = h;
      return {
        base64: cleanB64,
        contentType,
        dataUrl: `data:${contentType};base64,${cleanB64}`,
        streamType: kind,
        width: w,
        height: h,
        source: 'hardware' as const,
        capturedAt: new Date().toISOString(),
      };
    }

    // Fallback cleanly to simulator POV if hardware capture failed
    const svg = renderSimulatorStreamSvg(kind, w, h);
    const b64 = Buffer.from(svg, 'utf-8').toString('base64');
    state.camera.lastFrameAt = Date.now();
    state.camera.streamType = kind;
    state.camera.source = 'simulator';
    return {
      base64: b64,
      contentType: 'image/svg+xml',
      dataUrl: `data:image/svg+xml;base64,${b64}`,
      streamType: kind,
      width: w,
      height: h,
      source: 'simulator' as const,
      capturedAt: new Date().toISOString(),
      hardwareError:
        typeof rawData?.error === 'string'
          ? rawData.error
          : `Falha na captura física ${kind.toUpperCase()} (HTTP ${resp.status})`,
    };
  }

  const svg = renderSimulatorStreamSvg(kind, w, h);
  const b64 = Buffer.from(svg, 'utf-8').toString('base64');
  state.camera.lastFrameAt = Date.now();
  state.camera.streamType = kind;
  state.camera.source = 'simulator';
  state.camera.width = w;
  state.camera.height = h;
  return {
    base64: b64,
    contentType: 'image/svg+xml',
    dataUrl: `data:image/svg+xml;base64,${b64}`,
    streamType: kind,
    width: w,
    height: h,
    source: 'simulator' as const,
    capturedAt: new Date().toISOString(),
  };
};

let driveStopTimer: ReturnType<typeof setTimeout> | null = null;
let choreographyTimers: Array<ReturnType<typeof setTimeout>> = [];
let currentEasing: EasingCurve = 'easeInOut';

const addLog = (
  method: 'GET' | 'POST' | 'DELETE',
  reqPath: string,
  status: number,
  durationMs: number,
  summary: string,
  source: ApiLogEntry['source'] = 'studio'
) => {
  apiLogs.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    method,
    path: reqPath,
    status,
    durationMs,
    summary,
    source,
  });
  if (apiLogs.length > 80) {
    apiLogs.length = 80;
  }
};

// WebSocket PubSub registry
interface ClientSub {
  ws: WebSocket;
  subscriptions: Set<string>;
}
const wsClients = new Set<ClientSub>();

const broadcastPubSub = (eventName: string, message: Record<string, unknown>) => {
  const payload = JSON.stringify({
    eventName,
    created: new Date().toISOString(),
    message,
  });
  for (const client of wsClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      if (client.subscriptions.has('*') || client.subscriptions.has(eventName)) {
        client.ws.send(payload);
      }
    }
  }
};

// Ray-box intersection helper for 8 ToF sensors
const rayIntersectAABB = (
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): number | null => {
  let tmin = -Infinity;
  let tmax = Infinity;

  if (Math.abs(dx) > 1e-6) {
    const tx1 = (minX - ox) / dx;
    const tx2 = (maxX - ox) / dx;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));
  } else if (ox < minX || ox > maxX) {
    return null;
  }

  if (Math.abs(dy) > 1e-6) {
    const ty1 = (minY - oy) / dy;
    const ty2 = (maxY - oy) / dy;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));
  } else if (oy < minY || oy > maxY) {
    return null;
  }

  if (tmax >= Math.max(0, tmin)) {
    return tmin >= 0 ? tmin : tmax;
  }
  return null;
};

const computeTofDistance = (ox: number, oy: number, angleRad: number): number => {
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  let minDist = 2.0;

  // Arena inner walls
  if (dx > 1e-5) minDist = Math.min(minDist, (ARENA_HALF_W - ox) / dx);
  if (dx < -1e-5) minDist = Math.min(minDist, (-ARENA_HALF_W - ox) / dx);
  if (dy > 1e-5) minDist = Math.min(minDist, (ARENA_HALF_H - oy) / dy);
  if (dy < -1e-5) minDist = Math.min(minDist, (-ARENA_HALF_H - oy) / dy);

  for (const obs of state.obstacles) {
    const hit = rayIntersectAABB(
      ox,
      oy,
      dx,
      dy,
      obs.x - obs.width / 2,
      obs.y - obs.height / 2,
      obs.x + obs.width / 2,
      obs.y + obs.height / 2
    );
    if (hit !== null && hit > 0 && hit < minDist) {
      minDist = hit;
    }
  }
  return Number(clamp(minDist - ROBOT_RADIUS, 0.02, 2.0).toFixed(3));
};

const checkCircleCollision = (cx: number, cy: number): { collided: boolean; frontHit: boolean } => {
  if (
    Math.abs(cx) + ROBOT_RADIUS > ARENA_HALF_W ||
    Math.abs(cy) + ROBOT_RADIUS > ARENA_HALF_H
  ) {
    return { collided: true, frontHit: true };
  }
  for (const obs of state.obstacles) {
    const closestX = clamp(cx, obs.x - obs.width / 2, obs.x + obs.width / 2);
    const closestY = clamp(cy, obs.y - obs.height / 2, obs.y + obs.height / 2);
    const distSq = (cx - closestX) ** 2 + (cy - closestY) ** 2;
    if (distSq < ROBOT_RADIUS * ROBOT_RADIUS) {
      return { collided: true, frontHit: true };
    }
  }
  return { collided: false, frontHit: false };
};

const applyPosePreset = (preset: string) => {
  switch (preset) {
    case 'greeting':
      state.head.targetPitch = -14;
      state.head.targetRoll = 8;
      state.head.targetYaw = 12;
      state.arms.targetLeft = 50;
      state.arms.targetRight = -24;
      state.led = { r: 16, g: 185, b: 129, mode: 'solid', periodMs: 1200 };
      state.eyes.mood = 'happy';
      state.eyes.displayText = 'Olá! Prazer em interagir.';
      break;
    case 'curious':
      state.head.targetPitch = -12;
      state.head.targetRoll = 18;
      state.head.targetYaw = -22;
      state.arms.targetLeft = 20;
      state.arms.targetRight = 58;
      state.led = { r: 14, g: 165, b: 233, mode: 'breathe', periodMs: 1600 };
      state.eyes.mood = 'curious';
      state.eyes.gazeX = -0.35;
      state.eyes.gazeY = -0.15;
      state.eyes.displayText = 'Analisando ambiente...';
      break;
    case 'celebrate':
      state.head.targetPitch = -22;
      state.head.targetRoll = 0;
      state.head.targetYaw = 0;
      state.arms.targetLeft = -25;
      state.arms.targetRight = -25;
      state.led = { r: 168, g: 85, b: 247, mode: 'rainbow', periodMs: 1100 };
      state.eyes.mood = 'happy';
      state.eyes.displayText = 'Missão concluída!';
      break;
    case 'alert':
      state.head.targetPitch = -18;
      state.head.targetRoll = 0;
      state.head.targetYaw = 0;
      state.arms.targetLeft = -5;
      state.arms.targetRight = -5;
      state.drive.linearVelocity = 0;
      state.drive.angularVelocity = 0;
      state.waypointTarget = null;
      state.led = { r: 220, g: 38, b: 38, mode: 'blink', periodMs: 700 };
      state.eyes.mood = 'alert';
      state.eyes.displayText = 'Modo alerta ativado.';
      break;
    case 'sleep':
      state.head.targetPitch = 20;
      state.head.targetRoll = 0;
      state.head.targetYaw = 0;
      state.arms.targetLeft = 82;
      state.arms.targetRight = 82;
      state.drive.linearVelocity = 0;
      state.drive.angularVelocity = 0;
      state.waypointTarget = null;
      state.led = { r: 51, g: 65, b: 85, mode: 'breathe', periodMs: 3600 };
      state.eyes.mood = 'sleepy';
      state.eyes.displayText = 'Modo repouso.';
      break;
    default:
      state.head.targetPitch = -5;
      state.head.targetRoll = 0;
      state.head.targetYaw = 0;
      state.arms.targetLeft = 42;
      state.arms.targetRight = 42;
      state.led = { r: 14, g: 165, b: 233, mode: 'breathe', periodMs: 2200 };
      state.eyes.mood = 'neutral';
      state.eyes.gazeX = 0;
      state.eyes.gazeY = 0;
      state.eyes.displayText = 'Pronto para comandos.';
      break;
  }
};

const runAutomationAction = (rule: AutomationRule) => {
  const now = Date.now();
  rule.lastTriggeredAt = now;
  rule.triggerCount += 1;

  if (rule.actionType === 'stop_and_alert') {
    state.drive.linearVelocity = 0;
    state.drive.angularVelocity = 0;
    state.drive.leftTrack = 0;
    state.drive.rightTrack = 0;
    state.waypointTarget = null;
    state.led = {
      r: rule.actionPayload.r ?? 239,
      g: rule.actionPayload.g ?? 68,
      b: rule.actionPayload.b ?? 68,
      mode: 'blink',
      periodMs: 800,
    };
    state.eyes.mood = rule.actionPayload.mood ?? 'surprised';
    state.eyes.displayText = rule.actionPayload.text ?? rule.name;
    if (rule.actionPayload.text) {
      state.speech = {
        isSpeaking: true,
        lastUtterance: rule.actionPayload.text,
        utteranceId: `auto-${now}`,
        rate: 1.05,
        pitch: 1.0,
        timestamp: now,
      };
    }
  } else if (rule.actionType === 'preset_greeting') {
    applyPosePreset('greeting');
    if (rule.actionPayload.text) {
      state.eyes.displayText = rule.actionPayload.text;
      state.speech = {
        isSpeaking: true,
        lastUtterance: rule.actionPayload.text,
        utteranceId: `auto-${now}`,
        rate: 1.0,
        pitch: 1.1,
        timestamp: now,
      };
    }
  } else if (rule.actionType === 'speak_custom') {
    const txt = rule.actionPayload.text ?? 'Regra de automação acionada.';
    state.speech = {
      isSpeaking: true,
      lastUtterance: txt,
      utteranceId: `auto-${now}`,
      rate: 1.0,
      pitch: 1.0,
      timestamp: now,
    };
    state.eyes.displayText = txt;
  } else if (rule.actionType === 'set_led_eyes') {
    state.led = {
      r: rule.actionPayload.r ?? 14,
      g: rule.actionPayload.g ?? 165,
      b: rule.actionPayload.b ?? 233,
      mode: 'solid',
      periodMs: 1200,
    };
    state.eyes.mood = rule.actionPayload.mood ?? 'curious';
    if (rule.actionPayload.text) {
      state.eyes.displayText = rule.actionPayload.text;
    }
  }

  addLog('POST', '/api/misty/automations/trigger', 200, 1, `Regra: ${rule.name}`, 'automation');
  broadcastPubSub('AutomationTriggered', {
    ruleId: rule.id,
    ruleName: rule.name,
    triggerType: rule.triggerType,
    triggerCount: rule.triggerCount,
  });
};

const applyChoreographyKeyframe = (kf: ChoreographyKeyframe) => {
  currentEasing = kf.easing || 'easeInOut';

  if (kf.head) {
    state.head.targetPitch = clamp(kf.head.pitch, -40, 26);
    state.head.targetRoll = clamp(kf.head.roll, -40, 40);
    state.head.targetYaw = clamp(kf.head.yaw, -81, 81);
    if (bridgeConfig.mode === 'bridge') {
      const payload = {
        Pitch: Math.round(state.head.targetPitch),
        Roll: Math.round(state.head.targetRoll),
        Yaw: Math.round(state.head.targetYaw),
        Velocity: 75,
      };
      enqueueCoalesced('head', async () => {
        await sendToRealMisty('/api/head', 'POST', payload);
      });
    }
  }

  if (kf.arms) {
    state.arms.targetLeft = clamp(kf.arms.left, -29, 90);
    state.arms.targetRight = clamp(kf.arms.right, -29, 90);
    if (bridgeConfig.mode === 'bridge') {
      const payload = {
        LeftArmPosition: Math.round(state.arms.targetLeft),
        RightArmPosition: Math.round(state.arms.targetRight),
        LeftArmVelocity: 65,
        RightArmVelocity: 65,
      };
      enqueueCoalesced('arms', async () => {
        await sendToRealMisty('/api/arms/set', 'POST', payload);
      });
    }
  }

  if (kf.drive) {
    const linear = clamp(kf.drive.linearVelocity, -100, 100);
    const angular = clamp(kf.drive.angularVelocity, -100, 100);
    state.waypointTarget = null;
    state.drive.linearVelocity = linear;
    state.drive.angularVelocity = angular;
    state.drive.leftTrack = clamp(linear - angular * 0.5, -100, 100);
    state.drive.rightTrack = clamp(linear + angular * 0.5, -100, 100);
    if (bridgeConfig.mode === 'bridge') {
      enqueueCoalesced('drive', async () => {
        if (linear === 0 && angular === 0) {
          await sendToRealMisty('/api/drive/stop', 'POST', {});
        } else {
          await sendToRealMisty('/api/drive', 'POST', {
            LinearVelocity: linear,
            AngularVelocity: angular,
          });
        }
      });
    }
  }

  if (kf.led) {
    state.led = {
      r: clamp(kf.led.r, 0, 255),
      g: clamp(kf.led.g, 0, 255),
      b: clamp(kf.led.b, 0, 255),
      mode: kf.led.mode || 'solid',
      periodMs: 1200,
    };
    if (bridgeConfig.mode === 'bridge') {
      if (state.led.mode === 'solid' || state.led.mode === 'rainbow') {
        void sendToRealMisty('/api/led', 'POST', {
          red: state.led.r,
          green: state.led.g,
          blue: state.led.b,
        });
      } else {
        void sendToRealMisty('/api/led/transition', 'POST', {
          Red: state.led.r,
          Green: state.led.g,
          Blue: state.led.b,
          Red2: 0,
          Green2: 0,
          Blue2: 0,
          TransitionType: state.led.mode === 'blink' ? 'Blink' : 'Breathe',
          TimeMs: 1200,
        });
      }
    }
  }

  if (kf.eyes) {
    state.eyes.mood = kf.eyes.mood;
    if (kf.eyes.displayText !== undefined) {
      state.eyes.displayText = kf.eyes.displayText;
      if (bridgeConfig.mode === 'bridge' && kf.eyes.displayText) {
        void sendToRealMisty('/api/text/display', 'POST', { Text: kf.eyes.displayText });
      }
    }
  }

  if (kf.speech?.text) {
    const utteranceId = `chor-${Date.now()}`;
    state.speech = {
      isSpeaking: true,
      lastUtterance: kf.speech.text,
      utteranceId,
      rate: 1.0,
      pitch: 1.05,
      timestamp: Date.now(),
    };
    broadcastPubSub('SpeechStatus', {
      utteranceId,
      text: kf.speech.text,
      isSpeaking: true,
    });
    if (bridgeConfig.mode === 'bridge') {
      void (async () => {
        try {
          const wav = await synthesizeBrazilianSpeechWav({
            text: kf.speech!.text,
            voiceName: 'Kore',
            style: 'friendly',
          });
          await sendToRealMisty('/api/audio', 'POST', {
            FileName: 'misty_ptbr.wav',
            Data: wav.audioBase64,
            ImmediatelyApply: true,
            OverwriteExisting: true,
          });
        } catch {
          await sendToRealMisty('/api/tts/speak', 'POST', {
            Text: kf.speech!.text,
            Pitch: 1.05,
            SpeechRate: 1.0,
            Flush: true,
            UtteranceId: utteranceId,
          });
        }
      })();
    }
  }
};

const startChoreography = (seq: ChoreographySequence) => {
  for (const t of choreographyTimers) clearTimeout(t);
  choreographyTimers = [];

  const sortedKeyframes = [...seq.keyframes].sort((a, b) => a.timeMs - b.timeMs);
  const maxKfTime = sortedKeyframes.reduce((acc, k) => Math.max(acc, k.timeMs), 0);
  const effectiveDuration = Math.max(seq.durationMs || 1000, maxKfTime + 350);
  const usesDrive = sortedKeyframes.some((k) => Boolean(k.drive));

  state.activeChoreography = {
    id: seq.id,
    name: seq.name,
    startedAt: Date.now(),
    durationMs: effectiveDuration,
    isPlaying: true,
  };

  for (const kf of sortedKeyframes) {
    const delay = Math.max(0, Number(kf.timeMs) || 0);
    if (delay <= 10) {
      applyChoreographyKeyframe(kf);
    } else {
      const timer = setTimeout(() => {
        applyChoreographyKeyframe(kf);
      }, delay);
      choreographyTimers.push(timer);
    }
  }

  const endTimer = setTimeout(() => {
    if (state.activeChoreography?.id === seq.id) {
      state.activeChoreography = null;
    }
    if (usesDrive) {
      state.drive = { linearVelocity: 0, angularVelocity: 0, leftTrack: 0, rightTrack: 0 };
      if (bridgeConfig.mode === 'bridge') {
        void sendToRealMisty('/api/drive/stop', 'POST', {});
      }
    }
  }, effectiveDuration + 100);
  choreographyTimers.push(endTimer);
};

// 20Hz Physics, Kinematics & Telemetry Loop
let tickCount = 0;
setInterval(() => {
  tickCount += 1;
  const dt = 0.05; // 50ms
  if (tickCount % 20 === 0) {
    state.deviceInfo.uptimeSeconds += 1;
  }

  // Smooth kinematics interpolation
  const lerpRate = currentEasing === 'spring' ? 0.24 : currentEasing === 'linear' ? 0.14 : 0.18;
  state.head.pitch += (state.head.targetPitch - state.head.pitch) * lerpRate;
  state.head.roll += (state.head.targetRoll - state.head.roll) * lerpRate;
  state.head.yaw += (state.head.targetYaw - state.head.yaw) * lerpRate;
  state.arms.left += (state.arms.targetLeft - state.arms.left) * lerpRate;
  state.arms.right += (state.arms.targetRight - state.arms.right) * lerpRate;

  // Natural blinking every ~4 seconds
  state.eyes.isBlinking = tickCount % 85 >= 82;

  // Autonomous Waypoint Steering
  if (state.waypointTarget) {
    const dx = state.waypointTarget.x - state.pose.x;
    const dy = state.waypointTarget.y - state.pose.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.12) {
      state.waypointTarget = null;
      state.drive.linearVelocity = 0;
      state.drive.angularVelocity = 0;
      state.eyes.displayText = 'Destino alcançado.';
    } else {
      const targetAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      let angleErr = normalizeAngleDeg(targetAngle - state.pose.heading);

      // Reactive obstacle avoidance using ToF
      if (state.tof.FrontCenter < 0.45) {
        angleErr += state.tof.FrontLeft > state.tof.FrontRight ? 55 : -55;
      }

      const speed = clamp(state.waypointTarget.speed, 15, 80);
      state.drive.angularVelocity = clamp(angleErr * 1.4, -70, 70);
      state.drive.linearVelocity = Math.abs(angleErr) > 55 ? 12 : speed;
    }
  }

  // Differential drive kinematics (calibrated to realistic indoor Misty II speed)
  const vMetersPerSec = (state.drive.linearVelocity / 100) * 0.42;
  const omegaDegPerSec = (state.drive.angularVelocity / 100) * 95;

  const nextHeading = normalizeAngleDeg(state.pose.heading + omegaDegPerSec * dt);
  const headingRad = (nextHeading * Math.PI) / 180;
  const nextX = state.pose.x + Math.cos(headingRad) * vMetersPerSec * dt;
  const nextY = state.pose.y + Math.sin(headingRad) * vMetersPerSec * dt;

  const collision = checkCircleCollision(nextX, nextY);
  if (collision.collided && Math.abs(vMetersPerSec) > 0.001) {
    state.bump.frontLeft = state.drive.angularVelocity >= -5;
    state.bump.frontRight = state.drive.angularVelocity <= 5;
    state.drive.linearVelocity = 0;
    state.waypointTarget = null;
  } else {
    state.pose.x = Number(nextX.toFixed(4));
    state.pose.y = Number(nextY.toFixed(4));
    state.pose.heading = Number(nextHeading.toFixed(2));
    if (Math.abs(vMetersPerSec) > 0.01) {
      state.bump.frontLeft = false;
      state.bump.frontRight = false;
      const last = state.pose.trail[state.pose.trail.length - 1];
      if (!last || Math.hypot(last.x - state.pose.x, last.y - state.pose.y) > 0.06) {
        state.pose.trail.push({ x: state.pose.x, y: state.pose.y });
        if (state.pose.trail.length > 180) {
          state.pose.trail.shift();
        }
      }
    }
  }

  // Update 8 ToF sensors
  const hRad = (state.pose.heading * Math.PI) / 180;
  const headYawRad = (state.head.yaw * Math.PI) / 180;
  state.tof.FrontCenter = computeTofDistance(state.pose.x, state.pose.y, hRad + headYawRad * 0.35);
  state.tof.FrontLeft = computeTofDistance(state.pose.x, state.pose.y, hRad + 0.48);
  state.tof.FrontRight = computeTofDistance(state.pose.x, state.pose.y, hRad - 0.48);
  state.tof.FrontBack = computeTofDistance(state.pose.x, state.pose.y, hRad + Math.PI);

  // Update IMU
  state.imu = {
    yaw: Number(state.pose.heading.toFixed(2)),
    pitch: Number((state.head.pitch * 0.15).toFixed(2)),
    roll: Number((state.head.roll * 0.1).toFixed(2)),
    accelX: Number(((state.drive.linearVelocity / 100) * 1.4).toFixed(3)),
    accelY: Number(((state.drive.angularVelocity / 100) * 0.8).toFixed(3)),
    accelZ: 9.81,
  };

  // Gentle battery drain when moving
  const powerDraw =
    0.35 +
    (Math.abs(state.drive.linearVelocity) + Math.abs(state.drive.angularVelocity)) * 0.025;
  state.battery.currentAmps = Number(powerDraw.toFixed(2));
  if (tickCount % 40 === 0 && !state.battery.isCharging) {
    state.battery.chargePercent = Number(
      Math.max(12, state.battery.chargePercent - powerDraw * 0.015).toFixed(2)
    );
    state.battery.voltage = Number(
      (10.8 + (state.battery.chargePercent / 100) * 1.8).toFixed(2)
    );
  }

  // Auto-clear speech speaking flag proportionally to utterance length & speech rate
  if (state.speech.isSpeaking) {
    const estMs = clamp(
      (state.speech.lastUtterance.length * 72) / Math.max(0.5, state.speech.rate || 1),
      1800,
      12000
    );
    if (Date.now() - state.speech.timestamp > estMs) {
      state.speech.isSpeaking = false;
    }
  }

  // Evaluate Automation Rules
  const now = Date.now();
  for (const rule of automationRules) {
    if (!rule.enabled) continue;
    if (rule.lastTriggeredAt && now - rule.lastTriggeredAt < rule.cooldownMs) continue;

    if (
      rule.triggerType === 'tof_front_below' &&
      state.tof.FrontCenter < rule.threshold &&
      Math.abs(state.drive.linearVelocity) > 2
    ) {
      runAutomationAction(rule);
    } else if (
      rule.triggerType === 'bump_any' &&
      (state.bump.frontLeft || state.bump.frontRight || state.bump.backLeft || state.bump.backRight)
    ) {
      runAutomationAction(rule);
    } else if (
      rule.triggerType === 'cap_touch' &&
      rule.sensorKey &&
      state.capTouch[rule.sensorKey]
    ) {
      runAutomationAction(rule);
    } else if (
      rule.triggerType === 'battery_below' &&
      state.battery.chargePercent < rule.threshold
    ) {
      runAutomationAction(rule);
    }
  }

  // Broadcast telemetry over WebSocket /pubsub
  broadcastPubSub('StateSnapshot', state as unknown as Record<string, unknown>);

  if (tickCount % 4 === 0) {
    broadcastPubSub('TimeOfFlight', {
      FrontCenter: state.tof.FrontCenter,
      FrontLeft: state.tof.FrontLeft,
      FrontRight: state.tof.FrontRight,
      FrontBack: state.tof.FrontBack,
    });
    broadcastPubSub('IMU', state.imu);
    broadcastPubSub('RobotOdometry', {
      x: state.pose.x,
      y: state.pose.y,
      heading: state.pose.heading,
      linearVelocity: state.drive.linearVelocity,
      angularVelocity: state.drive.angularVelocity,
    });
  }
  if (tickCount % 20 === 0) {
    broadcastPubSub('BatteryCharge', state.battery);
    broadcastPubSub('ActuatorPosition', {
      headPitch: Number(state.head.pitch.toFixed(1)),
      headRoll: Number(state.head.roll.toFixed(1)),
      headYaw: Number(state.head.yaw.toFixed(1)),
      leftArm: Number(state.arms.left.toFixed(1)),
      rightArm: Number(state.arms.right.toFixed(1)),
    });
  }
}, 50);

// Internal command dispatcher (used by both REST endpoints and /api/misty/batch)
const executeMistyCommand = async (
  endpointPath: string,
  body: Record<string, unknown>,
  source: ApiLogEntry['source'] = 'studio'
): Promise<{ status: number; data: Record<string, unknown>; summary: string }> => {
  switch (endpointPath) {
    case '/api/misty/drive': {
      const linear = clamp(Number(body.linearVelocity ?? 0), -100, 100);
      const angular = clamp(Number(body.angularVelocity ?? 0), -100, 100);
      const durationMs = body.durationMs ? Number(body.durationMs) : 0;
      state.waypointTarget = null;
      state.drive.linearVelocity = linear;
      state.drive.angularVelocity = angular;
      state.drive.leftTrack = clamp(linear - angular * 0.5, -100, 100);
      state.drive.rightTrack = clamp(linear + angular * 0.5, -100, 100);

      if (driveStopTimer) clearTimeout(driveStopTimer);
      if (durationMs > 0) {
        driveStopTimer = setTimeout(() => {
          state.drive.linearVelocity = 0;
          state.drive.angularVelocity = 0;
          state.drive.leftTrack = 0;
          state.drive.rightTrack = 0;
        }, clamp(durationMs, 50, 30000));
      }
      return {
        status: 200,
        data: { result: true, status: 'Success', drive: state.drive },
        summary: `Drive L:${linear} A:${angular}${durationMs ? ` (${durationMs}ms)` : ''}`,
      };
    }

    case '/api/misty/drive/track': {
      const left = clamp(Number(body.leftTrackSpeed ?? 0), -100, 100);
      const right = clamp(Number(body.rightTrackSpeed ?? 0), -100, 100);
      const durationMs = body.durationMs ? Number(body.durationMs) : 0;
      state.waypointTarget = null;
      state.drive.leftTrack = left;
      state.drive.rightTrack = right;
      state.drive.linearVelocity = (left + right) / 2;
      state.drive.angularVelocity = (right - left) * 0.6;
      if (driveStopTimer) clearTimeout(driveStopTimer);
      if (durationMs > 0) {
        driveStopTimer = setTimeout(() => {
          state.drive.linearVelocity = 0;
          state.drive.angularVelocity = 0;
          state.drive.leftTrack = 0;
          state.drive.rightTrack = 0;
        }, clamp(durationMs, 50, 30000));
      }
      return {
        status: 200,
        data: { result: true, status: 'Success', drive: state.drive },
        summary: `Track L:${left} R:${right}`,
      };
    }

    case '/api/misty/drive/waypoint': {
      const x = clamp(Number(body.x ?? 0), -ARENA_HALF_W + 0.2, ARENA_HALF_W - 0.2);
      const y = clamp(Number(body.y ?? 0), -ARENA_HALF_H + 0.2, ARENA_HALF_H - 0.2);
      const speed = clamp(Number(body.speed ?? 45), 15, 80);
      state.waypointTarget = { x, y, speed };
      state.eyes.displayText = `Navegando para (${x.toFixed(2)}, ${y.toFixed(2)})`;
      return {
        status: 200,
        data: { result: true, status: 'Navigating', waypointTarget: state.waypointTarget },
        summary: `Waypoint (${x.toFixed(2)}, ${y.toFixed(2)})`,
      };
    }

    case '/api/misty/drive/stop': {
      if (driveStopTimer) clearTimeout(driveStopTimer);
      state.waypointTarget = null;
      state.drive.linearVelocity = 0;
      state.drive.angularVelocity = 0;
      state.drive.leftTrack = 0;
      state.drive.rightTrack = 0;
      return {
        status: 200,
        data: { result: true, status: 'Stopped' },
        summary: 'Parada imediata executada',
      };
    }

    case '/api/misty/head': {
      const pitch = clamp(Number(body.pitch ?? state.head.targetPitch), -40, 26);
      const roll = clamp(Number(body.roll ?? state.head.targetRoll), -40, 40);
      const yaw = clamp(Number(body.yaw ?? state.head.targetYaw), -81, 81);
      const easing = (body.easing as EasingCurve) || 'easeInOut';
      currentEasing = easing;
      state.head.targetPitch = pitch;
      state.head.targetRoll = roll;
      state.head.targetYaw = yaw;
      return {
        status: 200,
        data: { result: true, status: 'Success', target: { pitch, roll, yaw, easing } },
        summary: `Cabeça P:${pitch}° R:${roll}° Y:${yaw}°`,
      };
    }

    case '/api/misty/arms': {
      const left = clamp(Number(body.leftArmPosition ?? state.arms.targetLeft), -29, 90);
      const right = clamp(Number(body.rightArmPosition ?? state.arms.targetRight), -29, 90);
      state.arms.targetLeft = left;
      state.arms.targetRight = right;
      return {
        status: 200,
        data: { result: true, status: 'Success', arms: { left, right } },
        summary: `Braços E:${left}° D:${right}°`,
      };
    }

    case '/api/misty/pose/preset': {
      const preset = String(body.preset ?? 'neutral');
      applyPosePreset(preset);
      return {
        status: 200,
        data: { result: true, preset, head: state.head, arms: state.arms, led: state.led },
        summary: `Preset corporal: ${preset}`,
      };
    }

    case '/api/misty/led': {
      const r = clamp(Number(body.red ?? body.r ?? 0), 0, 255);
      const g = clamp(Number(body.green ?? body.g ?? 0), 0, 255);
      const b = clamp(Number(body.blue ?? body.b ?? 0), 0, 255);
      state.led = { r, g, b, mode: 'solid', periodMs: 1200 };
      return {
        status: 200,
        data: { result: true, led: state.led },
        summary: `LED RGB(${r}, ${g}, ${b})`,
      };
    }

    case '/api/misty/led/transition': {
      const r = clamp(Number(body.red ?? 14), 0, 255);
      const g = clamp(Number(body.green ?? 165), 0, 255);
      const b = clamp(Number(body.blue ?? 233), 0, 255);
      const mode = (body.mode as LedMode) || 'breathe';
      const periodMs = clamp(Number(body.periodMs ?? 1400), 300, 6000);
      state.led = { r, g, b, mode, periodMs };
      return {
        status: 200,
        data: { result: true, led: state.led },
        summary: `LED ${mode} (${periodMs}ms)`,
      };
    }

    case '/api/misty/eyes': {
      const mood = (body.mood as EyeMood) || state.eyes.mood;
      const gazeX = clamp(Number(body.gazeX ?? state.eyes.gazeX), -1, 1);
      const gazeY = clamp(Number(body.gazeY ?? state.eyes.gazeY), -1, 1);
      const displayText =
        body.displayText !== undefined ? String(body.displayText) : state.eyes.displayText;
      state.eyes = {
        ...state.eyes,
        mood,
        gazeX,
        gazeY,
        displayText,
      };
      return {
        status: 200,
        data: { result: true, eyes: state.eyes },
        summary: `Visor olhos: ${mood}`,
      };
    }

    case '/api/misty/tts/speak': {
      const text = String(body.text ?? '').trim();
      if (!text) {
        return { status: 400, data: { error: 'Campo text é obrigatório.' }, summary: 'TTS inválido' };
      }
      const rate = clamp(Number(body.rate ?? 1.0), 0.5, 2.0);
      const pitch = clamp(Number(body.pitch ?? 1.0), 0.5, 2.0);
      const utteranceId = String(body.utteranceId ?? `utt-${Date.now()}`);
      state.speech = {
        isSpeaking: true,
        lastUtterance: text,
        utteranceId,
        rate,
        pitch,
        timestamp: Date.now(),
      };
      if (body.mood) {
        state.eyes.mood = body.mood as EyeMood;
      }
      state.eyes.displayText = body.displayText !== undefined ? String(body.displayText) : text;
      if (body.led && typeof body.led === 'object') {
        const l = body.led as Record<string, unknown>;
        state.led = {
          r: clamp(Number(l.r ?? state.led.r), 0, 255),
          g: clamp(Number(l.g ?? state.led.g), 0, 255),
          b: clamp(Number(l.b ?? state.led.b), 0, 255),
          mode: (l.mode as LedMode) || 'solid',
          periodMs: 1200,
        };
      }
      if (body.headGesture === 'nod') {
        const basePitch = state.head.targetPitch;
        state.head.targetPitch = clamp(basePitch + 10, -40, 26);
        setTimeout(() => {
          state.head.targetPitch = clamp(basePitch - 4, -40, 26);
        }, 280);
        setTimeout(() => {
          state.head.targetPitch = basePitch;
        }, 620);
      } else if (body.headGesture === 'tilt') {
        const baseRoll = state.head.targetRoll;
        state.head.targetRoll = 14;
        setTimeout(() => {
          state.head.targetRoll = baseRoll;
        }, 900);
      }
      broadcastPubSub('SpeechStatus', { utteranceId, text, isSpeaking: true, rate, pitch });
      return {
        status: 200,
        data: { result: true, speech: state.speech },
        summary: `TTS: "${text.slice(0, 32)}${text.length > 32 ? '...' : ''}"`,
      };
    }

    case '/api/misty/tts/stop': {
      state.speech.isSpeaking = false;
      broadcastPubSub('SpeechStatus', {
        utteranceId: state.speech.utteranceId,
        text: state.speech.lastUtterance,
        isSpeaking: false,
      });
      return {
        status: 200,
        data: { result: true, speech: state.speech },
        summary: 'Fala interrompida',
      };
    }

    case '/api/misty/audio/tone': {
      const frequency = clamp(Number(body.frequency ?? 587), 120, 2200);
      const durationMs = clamp(Number(body.durationMs ?? 250), 50, 2000);
      const waveform = (body.waveform as 'sine' | 'triangle' | 'square') || 'triangle';
      state.audioTone = { frequency, durationMs, waveform, timestamp: Date.now() };
      return {
        status: 200,
        data: { result: true, audioTone: state.audioTone },
        summary: `Tom ${frequency}Hz (${waveform})`,
      };
    }

    case '/api/misty/slam/reset': {
      state.pose = { x: 0, y: 0, heading: 0, trail: [{ x: 0, y: 0 }] };
      state.waypointTarget = null;
      state.drive = { linearVelocity: 0, angularVelocity: 0, leftTrack: 0, rightTrack: 0 };
      state.bump = { frontLeft: false, frontRight: false, backLeft: false, backRight: false };
      return {
        status: 200,
        data: { result: true, pose: state.pose },
        summary: 'Odometria SLAM resetada (0,0)',
      };
    }

    case '/api/misty/touch/simulate': {
      const kind = String(body.kind ?? 'capTouch');
      const sensor = String(body.sensor ?? 'chin');
      if (kind === 'capTouch' && sensor in state.capTouch) {
        const key = sensor as CapTouchSensorId;
        state.capTouch[key] = true;
        broadcastPubSub('CapTouch', { sensorPosition: key, isContacted: true });
        setTimeout(() => {
          state.capTouch[key] = false;
        }, 600);
        return {
          status: 200,
          data: { result: true, sensor: key, active: true },
          summary: `Toque capacitivo: ${key}`,
        };
      }
      if (kind === 'bump' && sensor in state.bump) {
        const bKey = sensor as keyof RobotState['bump'];
        state.bump[bKey] = true;
        broadcastPubSub('BumpSensor', { sensorName: bKey, isContacted: true });
        setTimeout(() => {
          state.bump[bKey] = false;
        }, 700);
        return {
          status: 200,
          data: { result: true, sensor: bKey, active: true },
          summary: `Bump acionado: ${bKey}`,
        };
      }
      return { status: 400, data: { error: 'Sensor desconhecido' }, summary: 'Sensor inválido' };
    }

    case '/api/misty/vision/scan': {
      const entities: DetectedEntity[] = [];
      const hRad = (state.pose.heading * Math.PI) / 180;

      if (body.detectFaces !== false) {
        entities.push({
          id: 'face-01',
          type: 'face',
          label: 'Operador (Luiz)',
          confidence: 0.96,
          distanceMeters: Number((0.85 + Math.random() * 0.45).toFixed(2)),
          bearingDeg: Number((state.head.yaw * 0.5).toFixed(1)),
          bbox: { x: 0.34, y: 0.22, w: 0.24, h: 0.32 },
        });
      }
      if (body.detectObjects !== false) {
        for (const obs of state.obstacles) {
          const dx = obs.x - state.pose.x;
          const dy = obs.y - state.pose.y;
          const dist = Math.hypot(dx, dy);
          const bearing = normalizeAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI - (hRad * 180) / Math.PI);
          if (Math.abs(bearing) < 65 && dist < 2.6) {
            entities.push({
              id: `obj-${obs.id}`,
              type: 'object',
              label: obs.label,
              confidence: 0.89,
              distanceMeters: Number(dist.toFixed(2)),
              bearingDeg: Number(bearing.toFixed(1)),
              bbox: { x: 0.15 + (bearing + 65) / 220, y: 0.45, w: 0.18, h: 0.25 },
            });
          }
        }
      }
      if (body.detectAprilTags !== false) {
        entities.push({
          id: 'tag-42',
          type: 'apriltag',
          label: 'AprilTag #42 (Doca)',
          confidence: 0.99,
          distanceMeters: Number(state.tof.FrontCenter.toFixed(2)),
          bearingDeg: 4.2,
          bbox: { x: 0.62, y: 0.38, w: 0.12, h: 0.12 },
        });
      }

      state.vision = { lastScanAt: Date.now(), entities };
      broadcastPubSub('VisionEvent', { entities });
      return {
        status: 200,
        data: { result: true, count: entities.length, entities },
        summary: `Visão: ${entities.length} detecções`,
      };
    }

    case '/api/misty/choreography/run': {
      let seq: ChoreographySequence | undefined;
      if (
        body.sequence &&
        typeof body.sequence === 'object' &&
        Array.isArray((body.sequence as ChoreographySequence).keyframes)
      ) {
        const incoming = body.sequence as ChoreographySequence;
        const idx = choreographies.findIndex((c) => c.id === incoming.id);
        if (idx >= 0) {
          choreographies[idx] = incoming;
        } else {
          choreographies.push(incoming);
        }
        seq = incoming;
      } else {
        const id = String(body.choreographyId ?? 'chor-greeting');
        seq = choreographies.find((c) => c.id === id);
      }

      if (!seq || seq.keyframes.length === 0) {
        return {
          status: 404,
          data: { error: 'Coreografia não encontrada ou sem keyframes' },
          summary: 'Coreografia 404',
        };
      }
      startChoreography(seq);
      return {
        status: 200,
        data: {
          result: true,
          playing: seq.name,
          durationMs: state.activeChoreography?.durationMs ?? seq.durationMs,
          activeChoreography: state.activeChoreography,
        },
        summary: `Coreografia: ${seq.name} (${seq.keyframes.length} passos)`,
      };
    }

    default:
      return {
        status: 404,
        data: { error: `Endpoint não suportado no batch: ${endpointPath}` },
        summary: `404 ${endpointPath}`,
      };
  }
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const wssBridgeAgent = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/pubsub') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/bridge-agent') {
      wssBridgeAgent.handleUpgrade(request, socket, head, (ws) => {
        wssBridgeAgent.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wssBridgeAgent.on('connection', (ws) => {
    bridgeAgentWs = ws;
    bridgeConfig.agentConnected = true;
    bridgeConfig.reachable = true;
    bridgeConfig.connectionMethod = 'relay-agent';
    bridgeConfig.lastError = null;
    bridgeConfig.lastCheckedAt = new Date().toISOString();
    addLog('POST', '/bridge-agent', 200, 1, 'Agente local Misty II conectado', 'external');

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (msg.type === 'http_response' && typeof msg.reqId === 'string') {
          const pending = pendingBridgeCalls.get(msg.reqId);
          if (pending) {
            clearTimeout(pending.timer);
            pendingBridgeCalls.delete(msg.reqId);
            pending.resolve({
              ok: Boolean(msg.ok),
              status: Number(msg.status ?? 200),
              data: msg.data ?? {},
            });
          }
        } else if (msg.type === 'misty_telemetry' && msg.eventName) {
          const eventName = String(msg.eventName);
          const payload = (msg.message as Record<string, unknown>) ?? {};
          if (eventName === 'BatteryCharge' && typeof payload.chargePercent === 'number') {
            state.battery.chargePercent = payload.chargePercent;
            if (typeof payload.voltage === 'number') state.battery.voltage = payload.voltage;
          }
          broadcastPubSub(eventName, payload);
        }
      } catch {
        // ignore malformed agent frame
      }
    });

    ws.on('close', () => {
      if (bridgeAgentWs === ws) {
        bridgeAgentWs = null;
      }
      bridgeConfig.agentConnected = false;
      if (bridgeConfig.connectionMethod === 'relay-agent') {
        bridgeConfig.reachable = false;
        bridgeConfig.connectionMethod = 'none';
      }
    });
  });

  wss.on('connection', (ws) => {
    const clientSub: ClientSub = { ws, subscriptions: new Set(['StateSnapshot']) };
    wsClients.add(clientSub);

    ws.send(
      JSON.stringify({
        eventName: 'StateSnapshot',
        created: new Date().toISOString(),
        message: state,
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        const op = String(msg.Operation ?? msg.type ?? '').toLowerCase();
        const evtType = String(msg.Type ?? msg.eventName ?? '');

        if (op === 'subscribe' && evtType) {
          clientSub.subscriptions.add(evtType);
          ws.send(
            JSON.stringify({
              eventName: 'SubscriptionStatus',
              created: new Date().toISOString(),
              message: { subscribed: Array.from(clientSub.subscriptions) },
            })
          );
        } else if (op === 'unsubscribe' && evtType) {
          clientSub.subscriptions.delete(evtType);
        } else if (Array.isArray(msg.events)) {
          clientSub.subscriptions = new Set(msg.events.map(String));
        }
      } catch {
        // ignore malformed client frame
      }
    });

    ws.on('close', () => {
      wsClients.delete(clientSub);
    });
  });

  // Helper to wrap REST routes with logging, timing, and hardware forwarding
  const registerCommandRoute = (routePath: string) => {
    app.post(routePath, async (req, res) => {
      const start = performance.now();
      const source = (req.headers['x-misty-source'] as ApiLogEntry['source']) || 'studio';
      const result = await executeMistyCommand(routePath, req.body ?? {}, source);
      const bridgeResult = await forwardCommandToRealMisty(routePath, req.body ?? {});
      const elapsed = Number((performance.now() - start).toFixed(2));
      const suffix = bridgeResult.forwarded
        ? ` → Hardware (${bridgeResult.ok ? 'OK' : `Erro ${bridgeResult.status}`})`
        : '';
      addLog('POST', routePath, result.status, elapsed, `${result.summary}${suffix}`, source);
      res.status(result.status).json({
        ...result.data,
        ...(bridgeResult.forwarded ? { hardwareBridge: bridgeResult } : {}),
      });
    });
  };

  registerCommandRoute('/api/misty/drive');
  registerCommandRoute('/api/misty/drive/track');
  registerCommandRoute('/api/misty/drive/waypoint');
  registerCommandRoute('/api/misty/drive/stop');
  registerCommandRoute('/api/misty/head');
  registerCommandRoute('/api/misty/arms');
  registerCommandRoute('/api/misty/pose/preset');
  registerCommandRoute('/api/misty/led');
  registerCommandRoute('/api/misty/led/transition');
  registerCommandRoute('/api/misty/eyes');
  registerCommandRoute('/api/misty/tts/speak');
  registerCommandRoute('/api/misty/tts/stop');
  registerCommandRoute('/api/misty/audio/tone');
  registerCommandRoute('/api/misty/slam/reset');
  registerCommandRoute('/api/misty/touch/simulate');
  registerCommandRoute('/api/misty/vision/scan');
  registerCommandRoute('/api/misty/choreography/run');

  // Batch Macro Route (Exclusive v2)
  app.post('/api/misty/batch', async (req, res) => {
    const start = performance.now();
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
    const results: Array<{ endpoint: string; status: number }> = [];

    let cumulativeDelay = 0;
    for (const step of steps) {
      const delay = clamp(Number(step.delayMs ?? 0), 0, 10000);
      cumulativeDelay += delay;
      const endpoint = String(step.endpoint ?? '');
      const body = (step.body as Record<string, unknown>) ?? {};
      if (cumulativeDelay === 0) {
        const r = await executeMistyCommand(endpoint, body, 'studio');
        await forwardCommandToRealMisty(endpoint, body);
        results.push({ endpoint, status: r.status });
      } else {
        setTimeout(() => {
          void executeMistyCommand(endpoint, body, 'choreography');
          void forwardCommandToRealMisty(endpoint, body);
        }, cumulativeDelay);
        results.push({ endpoint, status: 202 });
      }
    }

    const elapsed = Number((performance.now() - start).toFixed(2));
    addLog('POST', '/api/misty/batch', 200, elapsed, `Batch com ${steps.length} passos`, 'studio');
    res.json({ result: true, scheduledSteps: steps.length, totalDurationMs: cumulativeDelay, results });
  });

  // Read-only Telemetry & System Routes
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', robotId: state.deviceInfo.robotId, wsClients: wsClients.size });
  });

  app.get('/api/misty/state', (_req, res) => {
    res.json(state);
  });

  // Multi-Stream Camera API (Compatible with Misty II /api/cameras/rgb, /depth, /fisheye + Streaming)
  const registerCameraStreamRoutes = (streamType: CameraStreamType) => {
    app.get(`/api/misty/camera/${streamType}`, async (req, res) => {
      const start = performance.now();
      const width = Number(req.query.width ?? 640);
      const height = Number(req.query.height ?? 480);
      const frame = await captureCameraFrame(streamType, width, height);
      const elapsed = Number((performance.now() - start).toFixed(2));
      addLog(
        'GET',
        `/api/misty/camera/${streamType}`,
        200,
        elapsed,
        `Câmera ${streamType.toUpperCase()} (${frame.source})`
      );
      res.json({ result: frame });
    });

    app.get(`/api/misty/camera/${streamType}/raw`, async (req, res) => {
      const width = Number(req.query.width ?? 640);
      const height = Number(req.query.height ?? 480);
      const frame = await captureCameraFrame(streamType, width, height);
      const buf = Buffer.from(frame.base64, 'base64');
      res.setHeader('Content-Type', frame.contentType);
      res.setHeader('Cache-Control', 'no-store');
      res.send(buf);
    });
  };

  registerCameraStreamRoutes('rgb');
  registerCameraStreamRoutes('depth');
  registerCameraStreamRoutes('fisheye');

  app.post('/api/misty/camera/stream/start', async (req, res) => {
    const start = performance.now();
    const streamType = normalizeStreamType(req.body?.streamType ?? state.camera.streamType);
    const width = clamp(Number(req.body?.width ?? 640), 160, 1280);
    const height = clamp(Number(req.body?.height ?? 480), 120, 720);
    const fps = clamp(Number(req.body?.fps ?? 3), 1, 6);

    if (cameraStreamTimer) clearInterval(cameraStreamTimer);
    state.camera.streamActive = true;
    state.camera.streamType = streamType;
    state.camera.width = width;
    state.camera.height = height;
    state.camera.fps = fps;

    let busy = false;
    const pushFrame = async () => {
      if (busy || !state.camera.streamActive) return;
      busy = true;
      try {
        const frame = await captureCameraFrame(state.camera.streamType, width, height);
        broadcastPubSub('CameraFrame', frame as unknown as Record<string, unknown>);
      } finally {
        busy = false;
      }
    };

    void pushFrame();
    cameraStreamTimer = setInterval(() => {
      void pushFrame();
    }, Math.round(1000 / fps));

    const elapsed = Number((performance.now() - start).toFixed(2));
    addLog(
      'POST',
      '/api/misty/camera/stream/start',
      200,
      elapsed,
      `Stream ${streamType.toUpperCase()} ${fps} FPS`
    );
    res.json({ result: true, camera: state.camera });
  });

  app.post('/api/misty/camera/stream/stop', (_req, res) => {
    if (cameraStreamTimer) {
      clearInterval(cameraStreamTimer);
      cameraStreamTimer = null;
    }
    state.camera.streamActive = false;
    addLog('POST', '/api/misty/camera/stream/stop', 200, 0.3, 'Stream câmera encerrado');
    res.json({ result: true, camera: state.camera });
  });

  app.get('/api/misty/device', (_req, res) => {
    addLog('GET', '/api/misty/device', 200, 0.4, 'Device info');
    res.json({ result: state.deviceInfo });
  });

  app.get('/api/misty/battery', (_req, res) => {
    addLog('GET', '/api/misty/battery', 200, 0.3, `Bateria ${state.battery.chargePercent}%`);
    res.json({ result: state.battery });
  });

  app.post('/api/misty/battery/recharge', (_req, res) => {
    state.battery.chargePercent = 100;
    state.battery.voltage = 12.6;
    state.battery.isCharging = false;
    addLog('POST', '/api/misty/battery/recharge', 200, 0.5, 'Bateria recarregada 100%');
    res.json({ result: state.battery });
  });

  app.get('/api/misty/slam/map', (_req, res) => {
    addLog('GET', '/api/misty/slam/map', 200, 0.5, 'Mapa SLAM lido');
    res.json({
      result: {
        arenaBounds: { halfWidth: ARENA_HALF_W, halfHeight: ARENA_HALF_H },
        pose: state.pose,
        obstacles: state.obstacles,
        waypointTarget: state.waypointTarget,
      },
    });
  });

  app.post('/api/misty/slam/obstacles', (req, res) => {
    const { action, obstacle, id } = req.body ?? {};
    if (action === 'add' && obstacle) {
      const newObs: ArenaObstacle = {
        id: `obs-${Date.now()}`,
        x: clamp(Number(obstacle.x ?? 0), -2.4, 2.4),
        y: clamp(Number(obstacle.y ?? 0), -1.6, 1.6),
        width: clamp(Number(obstacle.width ?? 0.5), 0.25, 1.2),
        height: clamp(Number(obstacle.height ?? 0.5), 0.25, 1.2),
        label: String(obstacle.label ?? 'Obstáculo'),
      };
      state.obstacles.push(newObs);
      addLog('POST', '/api/misty/slam/obstacles', 200, 0.4, `Obstáculo adicionado: ${newObs.label}`);
      res.json({ result: true, obstacles: state.obstacles });
      return;
    }
    if (action === 'remove' && id) {
      state.obstacles = state.obstacles.filter((o) => o.id !== id);
      addLog('POST', '/api/misty/slam/obstacles', 200, 0.4, `Obstáculo removido: ${id}`);
      res.json({ result: true, obstacles: state.obstacles });
      return;
    }
    if (action === 'reset') {
      state.obstacles = [...defaultObstacles];
      res.json({ result: true, obstacles: state.obstacles });
      return;
    }
    res.status(400).json({ error: 'Ação inválida' });
  });

  // Choreography CRUD
  app.get('/api/misty/choreography', (_req, res) => {
    res.json({ result: choreographies });
  });

  app.post('/api/misty/choreography/save', (req, res) => {
    const seq = req.body as ChoreographySequence;
    if (!seq || !seq.name || !Array.isArray(seq.keyframes)) {
      res.status(400).json({ error: 'Coreografia inválida' });
      return;
    }
    const savedSeq: ChoreographySequence = {
      ...seq,
      id: seq.id || `chor-${Date.now()}`,
      keyframes: [...seq.keyframes].sort((a, b) => a.timeMs - b.timeMs),
    };
    const existingIdx = choreographies.findIndex((c) => c.id === savedSeq.id);
    if (existingIdx >= 0) {
      choreographies[existingIdx] = savedSeq;
    } else {
      choreographies.push(savedSeq);
    }
    addLog('POST', '/api/misty/choreography/save', 200, 0.6, `Coreografia salva: ${savedSeq.name}`);
    res.json({ result: true, sequence: savedSeq, choreographies });
  });

  app.delete('/api/misty/choreography/:id', (req, res) => {
    if (choreographies.length <= 1) {
      res.status(400).json({ error: 'Mantenha ao menos uma coreografia na biblioteca.' });
      return;
    }
    const idx = choreographies.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Coreografia não encontrada' });
      return;
    }
    const [removed] = choreographies.splice(idx, 1);
    addLog('DELETE', `/api/misty/choreography/${req.params.id}`, 200, 0.4, `Coreografia removida: ${removed.name}`);
    res.json({ result: true, choreographies });
  });

  app.post('/api/misty/choreography/stop', (_req, res) => {
    for (const t of choreographyTimers) clearTimeout(t);
    choreographyTimers = [];
    state.activeChoreography = null;
    state.drive = { linearVelocity: 0, angularVelocity: 0, leftTrack: 0, rightTrack: 0 };
    if (bridgeConfig.mode === 'bridge') {
      void sendToRealMisty('/api/drive/stop', 'POST', {});
    }
    addLog('POST', '/api/misty/choreography/stop', 200, 0.4, 'Coreografia interrompida');
    res.json({ result: true });
  });

  // Automations CRUD
  app.get('/api/misty/automations', (_req, res) => {
    res.json({ result: automationRules });
  });

  app.post('/api/misty/automations', (req, res) => {
    const body = req.body as Partial<AutomationRule>;
    if (body.id) {
      const existing = automationRules.find((r) => r.id === body.id);
      if (existing) {
        if (typeof body.enabled === 'boolean') existing.enabled = body.enabled;
        if (typeof body.threshold === 'number') existing.threshold = body.threshold;
        if (body.name) existing.name = body.name;
        res.json({ result: automationRules });
        return;
      }
    }
    const newRule: AutomationRule = {
      id: `rule-${Date.now()}`,
      name: String(body.name ?? 'Nova Regra Autônoma'),
      enabled: body.enabled ?? true,
      triggerType: body.triggerType ?? 'tof_front_below',
      threshold: Number(body.threshold ?? 0.35),
      sensorKey: body.sensorKey,
      actionType: body.actionType ?? 'stop_and_alert',
      actionPayload: body.actionPayload ?? { text: 'Regra disparada.', mood: 'alert', r: 239, g: 68, b: 68 },
      cooldownMs: Number(body.cooldownMs ?? 3000),
      lastTriggeredAt: null,
      triggerCount: 0,
    };
    automationRules.push(newRule);
    addLog('POST', '/api/misty/automations', 200, 0.5, `Regra criada: ${newRule.name}`);
    res.json({ result: automationRules });
  });

  app.delete('/api/misty/automations/:id', (req, res) => {
    const idx = automationRules.findIndex((r) => r.id === req.params.id);
    if (idx >= 0) {
      automationRules.splice(idx, 1);
    }
    res.json({ result: automationRules });
  });

  app.get('/api/misty/logs', (_req, res) => {
    res.json({ result: apiLogs });
  });

  // Hardware Bridge Configuration & Proxy
  app.get('/api/bridge/config', (_req, res) => {
    res.json({ result: bridgeConfig });
  });

  app.post('/api/bridge/config', async (req, res) => {
    const { mode, robotIp, testConnection } = req.body ?? {};
    if (mode === 'simulator' || mode === 'bridge') {
      bridgeConfig.mode = mode;
    }
    if (typeof robotIp === 'string' && robotIp.trim()) {
      bridgeConfig.robotIp = robotIp.trim();
    }
    if (testConnection) {
      bridgeConfig.lastCheckedAt = new Date().toISOString();
      const probe = await sendToRealMisty('/api/device', 'GET');
      bridgeConfig.reachable = probe.ok;
      if (probe.ok) {
        bridgeConfig.connectionMethod =
          probe.via === 'relay-agent' ? 'relay-agent' : 'direct-http';
        bridgeConfig.lastError = null;
      } else {
        bridgeConfig.connectionMethod = 'none';
        const d = probe.data as Record<string, unknown>;
        bridgeConfig.lastError =
          typeof d?.error === 'string'
            ? `Não foi possível alcançar ${bridgeConfig.robotIp}: ${d.error}`
            : 'Falha ao conectar na Misty II física.';
      }
    }
    res.json({ result: bridgeConfig });
  });

  app.post('/api/bridge/proxy', async (req, res) => {
    const { mistyPath, method = 'POST', body } = req.body ?? {};
    if (!mistyPath) {
      res.status(400).json({ error: 'mistyPath obrigatório' });
      return;
    }
    const resp = await sendToRealMisty(String(mistyPath), method === 'GET' ? 'GET' : 'POST', body);
    addLog(method === 'GET' ? 'GET' : 'POST', String(mistyPath), resp.status, 15, `Proxy (${resp.via})`);
    res.status(resp.status).json(resp.data);
  });

  // Server-Side Gemini AI Brain for Misty II (Embodied Agent + Scene Analysis)

  const mistyAiTools: FunctionDeclaration[] = [
    {
      name: 'move_robot',
      description: 'Move a base da Misty II com velocidade linear e angular por uma duração em milissegundos.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          linearVelocity: {
            type: Type.NUMBER,
            description: 'Velocidade linear de -50 (ré) a +50 (frente). Use valores moderados (15 a 35).',
          },
          angularVelocity: {
            type: Type.NUMBER,
            description: 'Velocidade angular de -50 (direita) a +50 (esquerda).',
          },
          durationMs: {
            type: Type.NUMBER,
            description: 'Duração do movimento em ms (entre 250 e 2500).',
          },
        },
        required: ['linearVelocity', 'angularVelocity', 'durationMs'],
      },
    },
    {
      name: 'navigate_waypoint',
      description: 'Navega autonomamente até uma coordenada (x, y) na arena SLAM evitando obstáculos.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          x: { type: Type.NUMBER, description: 'Coordenada X entre -2.4 e 2.4 metros.' },
          y: { type: Type.NUMBER, description: 'Coordenada Y entre -1.6 e 1.6 metros.' },
          speed: { type: Type.NUMBER, description: 'Velocidade entre 20 e 60.' },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'stop_robot',
      description: 'Interrompe imediatamente os motores de locomoção da Misty.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          reason: { type: Type.STRING, description: 'Motivo da parada.' },
        },
      },
    },
    {
      name: 'move_head',
      description: 'Move a cabeça 3-DOF da Misty (pitch vertical, roll lateral, yaw giro horizontal).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          pitch: { type: Type.NUMBER, description: 'Inclinação vertical de -40 (cima) a 26 (baixo).' },
          roll: { type: Type.NUMBER, description: 'Inclinação lateral de -40 a 40.' },
          yaw: { type: Type.NUMBER, description: 'Giro horizontal de -81 (direita) a 81 (esquerda).' },
        },
        required: ['pitch', 'roll', 'yaw'],
      },
    },
    {
      name: 'move_arms',
      description: 'Move os braços esquerdo e direito em graus (-29 erguido até 90 abaixado).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          leftArmPosition: { type: Type.NUMBER, description: 'Ângulo do braço esquerdo (-29 a 90).' },
          rightArmPosition: { type: Type.NUMBER, description: 'Ângulo do braço direito (-29 a 90).' },
        },
        required: ['leftArmPosition', 'rightArmPosition'],
      },
    },
    {
      name: 'set_expression',
      description: 'Define o humor dos olhos no visor OLED, texto no visor e cor do LED torácico.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          mood: {
            type: Type.STRING,
            description: 'Um de: neutral, happy, curious, surprised, processing, alert, sleepy.',
          },
          displayText: { type: Type.STRING, description: 'Texto curto exibido no visor OLED.' },
          red: { type: Type.NUMBER, description: 'LED vermelho 0..255.' },
          green: { type: Type.NUMBER, description: 'LED verde 0..255.' },
          blue: { type: Type.NUMBER, description: 'LED azul 0..255.' },
        },
        required: ['mood'],
      },
    },
    {
      name: 'run_choreography',
      description: 'Executa uma coreografia salva (ex: chor-greeting, chor-patrol, chor-alert).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          choreographyId: { type: Type.STRING, description: 'ID da coreografia.' },
        },
        required: ['choreographyId'],
      },
    },
    {
      name: 'scan_vision',
      description: 'Executa varredura de visão computacional para detectar rostos, obstáculos e AprilTags.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          detectFaces: { type: Type.BOOLEAN, description: 'Detectar rostos.' },
          detectObjects: { type: Type.BOOLEAN, description: 'Detectar objetos e obstáculos.' },
          detectAprilTags: { type: Type.BOOLEAN, description: 'Detectar AprilTags.' },
        },
      },
    },
    {
      name: 'capture_camera',
      description: 'Captura um quadro atual da câmera frontal (rgb, depth ou fisheye).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          streamType: { type: Type.STRING, description: 'rgb, depth ou fisheye.' },
        },
      },
    },
  ];

  const executeAiToolCall = async (
    name: string,
    args: Record<string, unknown>
  ): Promise<{ summary: string; result: Record<string, unknown> }> => {
    switch (name) {
      case 'move_robot': {
        const body = {
          linearVelocity: clamp(Number(args.linearVelocity ?? 0), -60, 60),
          angularVelocity: clamp(Number(args.angularVelocity ?? 0), -60, 60),
          durationMs: clamp(Number(args.durationMs ?? 500), 150, 3000),
        };
        const r = await executeMistyCommand('/api/misty/drive', body, 'studio');
        await forwardCommandToRealMisty('/api/misty/drive', body);
        return {
          summary: `move_robot(L:${body.linearVelocity}, A:${body.angularVelocity}, ${body.durationMs}ms)`,
          result: r.data,
        };
      }
      case 'navigate_waypoint': {
        const body = {
          x: Number(args.x ?? 0),
          y: Number(args.y ?? 0),
          speed: clamp(Number(args.speed ?? 35), 15, 65),
        };
        const r = await executeMistyCommand('/api/misty/drive/waypoint', body, 'studio');
        return {
          summary: `navigate_waypoint(${body.x.toFixed(2)}, ${body.y.toFixed(2)})`,
          result: r.data,
        };
      }
      case 'stop_robot': {
        const r = await executeMistyCommand('/api/misty/drive/stop', {}, 'studio');
        await forwardCommandToRealMisty('/api/misty/drive/stop', {});
        return { summary: 'stop_robot()', result: r.data };
      }
      case 'move_head': {
        const body = {
          pitch: clamp(Number(args.pitch ?? 0), -40, 26),
          roll: clamp(Number(args.roll ?? 0), -40, 40),
          yaw: clamp(Number(args.yaw ?? 0), -81, 81),
          easing: 'easeInOut',
        };
        const r = await executeMistyCommand('/api/misty/head', body, 'studio');
        await forwardCommandToRealMisty('/api/misty/head', body);
        return {
          summary: `move_head(P:${body.pitch}°, R:${body.roll}°, Y:${body.yaw}°)`,
          result: r.data,
        };
      }
      case 'move_arms': {
        const body = {
          leftArmPosition: clamp(Number(args.leftArmPosition ?? 42), -29, 90),
          rightArmPosition: clamp(Number(args.rightArmPosition ?? 42), -29, 90),
        };
        const r = await executeMistyCommand('/api/misty/arms', body, 'studio');
        await forwardCommandToRealMisty('/api/misty/arms', body);
        return {
          summary: `move_arms(E:${body.leftArmPosition}°, D:${body.rightArmPosition}°)`,
          result: r.data,
        };
      }
      case 'set_expression': {
        const eyesBody = {
          mood: String(args.mood ?? 'neutral'),
          ...(args.displayText !== undefined ? { displayText: String(args.displayText) } : {}),
        };
        const rEyes = await executeMistyCommand('/api/misty/eyes', eyesBody, 'studio');
        await forwardCommandToRealMisty('/api/misty/eyes', eyesBody);

        if (args.red !== undefined || args.green !== undefined || args.blue !== undefined) {
          const ledBody = {
            red: clamp(Number(args.red ?? state.led.r), 0, 255),
            green: clamp(Number(args.green ?? state.led.g), 0, 255),
            blue: clamp(Number(args.blue ?? state.led.b), 0, 255),
          };
          await executeMistyCommand('/api/misty/led', ledBody, 'studio');
          await forwardCommandToRealMisty('/api/misty/led', ledBody);
        }
        return {
          summary: `set_expression(${eyesBody.mood})`,
          result: rEyes.data,
        };
      }
      case 'run_choreography': {
        const body = { choreographyId: String(args.choreographyId ?? 'chor-greeting') };
        const r = await executeMistyCommand('/api/misty/choreography/run', body, 'studio');
        return {
          summary: `run_choreography(${body.choreographyId})`,
          result: r.data,
        };
      }
      case 'scan_vision': {
        const body = {
          detectFaces: args.detectFaces !== false,
          detectObjects: args.detectObjects !== false,
          detectAprilTags: args.detectAprilTags !== false,
        };
        const r = await executeMistyCommand('/api/misty/vision/scan', body, 'studio');
        await forwardCommandToRealMisty('/api/misty/vision/scan', body);
        return {
          summary: 'scan_vision()',
          result: r.data,
        };
      }
      case 'capture_camera': {
        const streamType = normalizeStreamType(args.streamType ?? state.camera.streamType);
        const frame = await captureCameraFrame(streamType, 640, 480);
        broadcastPubSub('CameraFrame', frame as unknown as Record<string, unknown>);
        return {
          summary: `capture_camera(${streamType})`,
          result: {
            streamType: frame.streamType,
            source: frame.source,
            width: frame.width,
            height: frame.height,
            tof: state.tof,
          },
        };
      }
      default:
        return {
          summary: `unknown(${name})`,
          result: { error: `Ferramenta desconhecida: ${name}` },
        };
    }
  };

  const buildMistyTelemetryContext = (): string => {
    const chorList = choreographies.map((c) => `${c.id} (${c.name})`).join(', ');
    const obsSummary = state.obstacles
      .map((o) => {
        const dx = o.x - state.pose.x;
        const dy = o.y - state.pose.y;
        const dist = Math.hypot(dx, dy).toFixed(2);
        return `${o.label} a ${dist}m em (${o.x.toFixed(1)}, ${o.y.toFixed(1)})`;
      })
      .join('; ');
    return [
      `Modo atual: ${bridgeConfig.mode === 'bridge' ? `Hardware Real (${bridgeConfig.robotIp})` : 'Gêmeo Digital Simulador'}`,
      `Pose SLAM: x=${state.pose.x.toFixed(2)}m, y=${state.pose.y.toFixed(2)}m, heading=${state.pose.heading.toFixed(0)}°`,
      `Bateria: ${state.battery.chargePercent.toFixed(1)}% (${state.battery.voltage.toFixed(2)}V)`,
      `Sensores ToF frontais: Esq=${state.tof.FrontLeft.toFixed(2)}m, Centro=${state.tof.FrontCenter.toFixed(2)}m, Dir=${state.tof.FrontRight.toFixed(2)}m, Trás=${state.tof.FrontBack.toFixed(2)}m`,
      `Cabeça (P/R/Y): ${Math.round(state.head.pitch)}° / ${Math.round(state.head.roll)}° / ${Math.round(state.head.yaw)}°`,
      `Braços (E/D): ${Math.round(state.arms.left)}° / ${Math.round(state.arms.right)}°`,
      `Humor atual dos olhos: ${state.eyes.mood}`,
      `Coreografias disponíveis: ${chorList}`,
      `Obstáculos na arena: ${obsSummary}`,
    ].join('\n');
  };

  app.post('/api/misty/ai/chat', async (req, res) => {
    const start = performance.now();
    const message = String(req.body?.message ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'Mensagem é obrigatória.' });
      return;
    }

    const historyInput = Array.isArray(req.body?.history) ? req.body.history : [];
    const includeCamera = Boolean(req.body?.includeCamera);
    const autoSpeak = req.body?.autoSpeak !== false;
    const streamType = normalizeStreamType(req.body?.streamType ?? state.camera.streamType);

    try {
      const ai = getGeminiClient();
      const telemetryContext = buildMistyTelemetryContext();
      const systemInstruction = [
        'Você é a inteligência artificial embarcada da robô Misty II no laboratório MistyForge.',
        'Responda sempre em português do Brasil, de forma simpática, objetiva, técnica quando útil e natural para ser falada em voz alta (sem markdown pesado ou listas longas quando estiver respondendo ao operador).',
        'Você pode executar ações físicas no robô usando as ferramentas disponíveis (mover base, cabeça, braços, expressões/LED, coreografias, visão e câmera).',
        'Sempre que o usuário pedir uma ação física ou reação expressiva, chame as ferramentas apropriadas antes de responder.',
        '',
        'TELEMETRIA ATUAL DO ROBÔ:',
        telemetryContext,
      ].join('\n');

      const contents: Content[] = [];
      for (const h of historyInput.slice(-10)) {
        const role = h?.role === 'model' ? 'model' : 'user';
        const textVal = String(h?.text ?? '').trim();
        if (textVal) {
          contents.push({ role, parts: [{ text: textVal }] });
        }
      }

      const userParts: Part[] = [{ text: message }];
      if (includeCamera) {
        const frame = await captureCameraFrame(streamType, 640, 480);
        broadcastPubSub('CameraFrame', frame as unknown as Record<string, unknown>);
        if (
          frame.contentType === 'image/jpeg' ||
          frame.contentType === 'image/png' ||
          frame.contentType === 'image/webp'
        ) {
          userParts.unshift({
            inlineData: {
              mimeType: frame.contentType,
              data: frame.base64,
            },
          });
        } else {
          userParts.push({
            text: `[Contexto visual da câmera ${streamType.toUpperCase()} em modo simulador: ToF frontal=${state.tof.FrontCenter.toFixed(2)}m, Esq=${state.tof.FrontLeft.toFixed(2)}m, Dir=${state.tof.FrontRight.toFixed(2)}m.]`,
          });
        }
      }

      contents.push({ role: 'user', parts: userParts });

      const executedActions: string[] = [];
      let { response: finalResponse, model: activeModel } = await generateContentWithFallback(ai, {
        contents,
        systemInstruction,
        tools: [{ functionDeclarations: mistyAiTools }],
      });

      for (let round = 0; round < 4; round++) {
        const calls = finalResponse.functionCalls;
        const modelContent = finalResponse.candidates?.[0]?.content;
        if (!calls || calls.length === 0 || !modelContent) break;

        contents.push(modelContent);
        const responseParts: Part[] = [];
        for (const call of calls) {
          const fnName = call.name ?? '';
          const fnArgs = (call.args as Record<string, unknown>) ?? {};
          const outcome = await executeAiToolCall(fnName, fnArgs);
          executedActions.push(outcome.summary);
          responseParts.push({
            functionResponse: {
              ...(call.id ? { id: call.id } : {}),
              name: fnName,
              response: outcome.result,
            },
          });
        }
        contents.push({ role: 'user', parts: responseParts });

        const nextStep = await generateContentWithFallback(ai, {
          contents,
          systemInstruction,
          tools: [{ functionDeclarations: mistyAiTools }],
          preferredModel: activeModel,
        });
        finalResponse = nextStep.response;
        activeModel = nextStep.model;
      }

      const replyText =
        (finalResponse.text ?? '').trim() ||
        (executedActions.length > 0
          ? 'Comandos executados com sucesso.'
          : 'Estou pronta para ajudar!');

      if (autoSpeak) {
        const speakBody = {
          text: replyText,
          rate: 1.0,
          pitch: 1.05,
          displayText: replyText,
        };
        await executeMistyCommand('/api/misty/tts/speak', speakBody, 'studio');
        await forwardCommandToRealMisty('/api/misty/tts/speak', speakBody);
      }

      const elapsed = Number((performance.now() - start).toFixed(2));
      addLog(
        'POST',
        '/api/misty/ai/chat',
        200,
        elapsed,
        `IA [${activeModel}] (${executedActions.length} ações): "${replyText.slice(0, 32)}..."`
      );
      res.json({
        result: true,
        model: activeModel,
        reply: replyText,
        executedActions,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      const elapsed = Number((performance.now() - start).toFixed(2));
      addLog('POST', '/api/misty/ai/chat', formatted.status, elapsed, formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/misty/ai/analyze-scene', async (req, res) => {
    const start = performance.now();
    const streamType = normalizeStreamType(req.body?.streamType ?? state.camera.streamType);
    const autoSpeak = req.body?.autoSpeak !== false;

    try {
      const ai = getGeminiClient();
      const frame = await captureCameraFrame(streamType, 640, 480);
      broadcastPubSub('CameraFrame', frame as unknown as Record<string, unknown>);
      await executeMistyCommand('/api/misty/vision/scan', {
        detectFaces: true,
        detectObjects: true,
        detectAprilTags: true,
      });

      const parts: Part[] = [];
      if (
        frame.contentType === 'image/jpeg' ||
        frame.contentType === 'image/png' ||
        frame.contentType === 'image/webp'
      ) {
        parts.push({
          inlineData: {
            mimeType: frame.contentType,
            data: frame.base64,
          },
        });
      }

      parts.push({
        text: [
          `Analise o ambiente atual da Misty II usando o fluxo ${streamType.toUpperCase()} (${frame.source}).`,
          buildMistyTelemetryContext(),
          `Detecções de visão: ${JSON.stringify(state.vision.entities)}`,
          'Forneça um resumo curto (máximo 3 frases em pt-BR) sobre obstáculos próximos, segurança de deslocamento e uma sugestão de ação.',
        ].join('\n'),
      });

      const { response, model: activeModel } = await generateContentWithFallback(ai, {
        contents: [{ role: 'user', parts }],
        systemInstruction:
          'Você é o módulo de percepção ambiental da robô Misty II. Seja conciso, objetivo e claro em português do Brasil.',
      });

      const analysis = (response.text ?? '').trim();
      if (autoSpeak && analysis) {
        const speakBody = {
          text: analysis,
          rate: 1.0,
          pitch: 1.02,
          mood: state.tof.FrontCenter < 0.5 ? 'alert' : 'curious',
          displayText: analysis,
        };
        await executeMistyCommand('/api/misty/tts/speak', speakBody, 'studio');
        await forwardCommandToRealMisty('/api/misty/tts/speak', speakBody);
      }

      const elapsed = Number((performance.now() - start).toFixed(2));
      addLog('POST', '/api/misty/ai/analyze-scene', 200, elapsed, `Análise IA [${activeModel}] (${streamType})`);
      res.json({
        result: true,
        model: activeModel,
        streamType,
        source: frame.source,
        analysis,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      const elapsed = Number((performance.now() - start).toFixed(2));
      addLog('POST', '/api/misty/ai/analyze-scene', formatted.status, elapsed, formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/misty/tts/synthesize', async (req, res) => {
    const start = performance.now();
    const rawText = String(req.body?.text ?? '').trim();
    if (!rawText) {
      res.status(400).json({ error: 'Campo text é obrigatório.' });
      return;
    }

    try {
      const synthesized = await synthesizeBrazilianSpeechWav({
        text: rawText,
        voiceName: typeof req.body?.voiceName === 'string' ? req.body.voiceName : 'Kore',
        style: typeof req.body?.style === 'string' ? req.body.style : 'natural',
        mood: typeof req.body?.mood === 'string' ? req.body.mood : '',
      });
      const elapsed = Number((performance.now() - start).toFixed(2));
      addLog(
        'POST',
        '/api/misty/tts/synthesize',
        200,
        elapsed,
        `TTS Neural pt-BR [${synthesized.cached ? 'cache/' : ''}${synthesized.model}/${synthesized.voiceName}]`
      );
      res.json({
        result: true,
        ...synthesized,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      const elapsed = Number((performance.now() - start).toFixed(2));
      addLog('POST', '/api/misty/tts/synthesize', formatted.status, elapsed, formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Vite dev middleware or static dist serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('/{*splat}', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MistyForge Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MistyForge server:', err);
  process.exit(1);
});
