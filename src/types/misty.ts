export type EyeMood =
  | 'neutral'
  | 'happy'
  | 'curious'
  | 'surprised'
  | 'processing'
  | 'alert'
  | 'sleepy';

export type LedMode = 'solid' | 'breathe' | 'blink' | 'rainbow';

export type EasingCurve = 'linear' | 'easeInOut' | 'spring';

export type CameraStreamType = 'rgb' | 'depth' | 'fisheye';

export type TtsEngine = 'neural' | 'browser';
export type NeuralVoiceName = 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';
export type NeuralSpeechStyle = 'natural' | 'friendly' | 'lab' | 'calm' | 'enthusiastic';

export type TofSensorId =
  | 'FrontCenter'
  | 'FrontLeft'
  | 'FrontRight'
  | 'FrontBack'
  | 'DownFrontLeft'
  | 'DownFrontRight'
  | 'DownBackLeft'
  | 'DownBackRight';

export type CapTouchSensorId =
  | 'chin'
  | 'headFront'
  | 'headBack'
  | 'headLeft'
  | 'headRight'
  | 'scruff';

export type BumpSensorId =
  | 'frontLeft'
  | 'frontRight'
  | 'backLeft'
  | 'backRight';

export interface ArenaObstacle {
  id: string;
  x: number; // meters, arena is -3 to +3
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface DetectedEntity {
  id: string;
  type: 'face' | 'object' | 'apriltag';
  label: string;
  confidence: number;
  distanceMeters: number;
  bearingDeg: number;
  bbox: { x: number; y: number; w: number; h: number };
}

export interface RobotState {
  deviceInfo: {
    robotId: string;
    serialNumber: string;
    firmwareVersion: string;
    apiVersion: string;
    uptimeSeconds: number;
    hardwareModel: string;
  };
  head: {
    pitch: number; // -40 to 26 deg
    roll: number;  // -40 to 40 deg
    yaw: number;   // -81 to 81 deg
    targetPitch: number;
    targetRoll: number;
    targetYaw: number;
  };
  arms: {
    left: number;  // -29 to 90 deg (0 = horizontal forward, 90 = down, -29 = up)
    right: number;
    targetLeft: number;
    targetRight: number;
  };
  drive: {
    linearVelocity: number;  // -100 to 100
    angularVelocity: number; // -100 to 100
    leftTrack: number;
    rightTrack: number;
  };
  pose: {
    x: number;       // meters (-2.8 to 2.8)
    y: number;       // meters (-2.0 to 2.0)
    heading: number; // degrees (-180 to 180)
    trail: Array<{ x: number; y: number }>;
  };
  waypointTarget: {
    x: number;
    y: number;
    speed: number;
  } | null;
  led: {
    r: number;
    g: number;
    b: number;
    mode: LedMode;
    periodMs: number;
  };
  eyes: {
    mood: EyeMood;
    gazeX: number; // -1 to 1
    gazeY: number; // -1 to 1
    displayText: string;
    isBlinking: boolean;
  };
  speech: {
    isSpeaking: boolean;
    lastUtterance: string;
    utteranceId: string;
    rate: number;
    pitch: number;
    timestamp: number;
  };
  audioTone: {
    frequency: number;
    durationMs: number;
    waveform: 'sine' | 'triangle' | 'square';
    timestamp: number;
  } | null;
  battery: {
    chargePercent: number;
    voltage: number;
    isCharging: boolean;
    currentAmps: number;
  };
  imu: {
    yaw: number;
    pitch: number;
    roll: number;
    accelX: number;
    accelY: number;
    accelZ: number;
  };
  tof: Record<TofSensorId, number>;
  bump: Record<BumpSensorId, boolean>;
  capTouch: Record<CapTouchSensorId, boolean>;
  vision: {
    lastScanAt: number;
    entities: DetectedEntity[];
  };
  camera: {
    streamActive: boolean;
    streamType: CameraStreamType;
    width: number;
    height: number;
    lastFrameAt: number;
    source: 'simulator' | 'hardware';
    fps: number;
  };
  obstacles: ArenaObstacle[];
  activeChoreography: {
    id: string;
    name: string;
    startedAt: number;
    durationMs: number;
    isPlaying: boolean;
  } | null;
}

export interface CameraCaptureResult {
  base64: string;
  contentType: string;
  dataUrl: string;
  streamType: CameraStreamType;
  width: number;
  height: number;
  source: 'simulator' | 'hardware';
  capturedAt: string;
  hardwareError?: string;
}

export interface ChoreographyKeyframe {
  id: string;
  timeMs: number;
  label: string;
  easing: EasingCurve;
  head?: { pitch: number; roll: number; yaw: number };
  arms?: { left: number; right: number };
  drive?: { linearVelocity: number; angularVelocity: number };
  led?: { r: number; g: number; b: number; mode: LedMode };
  eyes?: { mood: EyeMood; displayText?: string };
  speech?: { text: string };
}

export interface ChoreographySequence {
  id: string;
  name: string;
  description: string;
  durationMs: number;
  keyframes: ChoreographyKeyframe[];
}

export type AutomationTriggerType =
  | 'tof_front_below'
  | 'bump_any'
  | 'cap_touch'
  | 'battery_below';

export type AutomationActionType =
  | 'stop_and_alert'
  | 'preset_greeting'
  | 'speak_custom'
  | 'set_led_eyes';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: AutomationTriggerType;
  threshold: number;
  sensorKey?: CapTouchSensorId;
  actionType: AutomationActionType;
  actionPayload: {
    text?: string;
    mood?: EyeMood;
    r?: number;
    g?: number;
    b?: number;
  };
  cooldownMs: number;
  lastTriggeredAt: number | null;
  triggerCount: number;
}

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  status: number;
  durationMs: number;
  summary: string;
  source: 'studio' | 'external' | 'automation' | 'choreography';
}

export interface PubSubMessage {
  eventName: string;
  created: string;
  message: Record<string, unknown>;
}

export interface HardwareBridgeConfig {
  mode: 'simulator' | 'bridge';
  robotIp: string;
  lastCheckedAt: string | null;
  reachable: boolean;
  agentConnected: boolean;
  connectionMethod: 'none' | 'direct-http' | 'relay-agent';
  lastError: string | null;
}
