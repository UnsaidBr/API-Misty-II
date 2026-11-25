import React, { useEffect, useState } from 'react';
import type { CapTouchSensorId, RobotState } from '../types/misty';

interface MistyDigitalTwinProps {
  state: RobotState;
  compact?: boolean;
  onTouchSensor?: (kind: 'capTouch' | 'bump', sensor: string) => void;
}

export const MistyDigitalTwin: React.FC<MistyDigitalTwinProps> = ({
  state,
  compact = false,
  onTouchSensor,
}) => {
  const [pulsePhase, setPulsePhase] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      setPulsePhase((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Compute dynamic chest LED color
  let ledR = state.led.r;
  let ledG = state.led.g;
  let ledB = state.led.b;
  let ledOpacity = 0.95;

  const periodSec = Math.max(0.3, state.led.periodMs / 1000);
  if (state.led.mode === 'breathe') {
    ledOpacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((pulsePhase * Math.PI * 2) / periodSec));
  } else if (state.led.mode === 'blink') {
    ledOpacity = Math.floor((pulsePhase / (periodSec / 2)) % 2) === 0 ? 1 : 0.15;
  } else if (state.led.mode === 'rainbow') {
    const hue = (pulsePhase * (360 / periodSec)) % 360;
    const c = (h: number) => Math.round(128 + 127 * Math.sin(((hue + h) * Math.PI) / 180));
    ledR = c(0);
    ledG = c(120);
    ledB = c(240);
  }

  const ledCss = `rgba(${ledR}, ${ledG}, ${ledB}, ${ledOpacity.toFixed(2)})`;
  const ledGlowCss = `rgba(${ledR}, ${ledG}, ${ledB}, ${(ledOpacity * 0.45).toFixed(2)})`;

  // Kinematics transforms
  const headOffsetX = (state.head.yaw / 81) * 18;
  const headOffsetY = (state.head.pitch / 40) * 10;
  const headRoll = state.head.roll * 0.65;

  // Arms: 0 is straight out/horizontal, 90 is hanging down, -29 is raised
  const leftArmAngle = state.arms.left - 15;
  const rightArmAngle = -(state.arms.right - 15);

  const eyeColor =
    state.eyes.mood === 'alert'
      ? '#EF4444'
      : state.eyes.mood === 'happy'
        ? '#34D399'
        : state.eyes.mood === 'processing'
          ? '#F59E0B'
          : '#38BDF8';

  const gazeShiftX = state.eyes.gazeX * 5 + (state.head.yaw / 81) * 4;
  const gazeShiftY = state.eyes.gazeY * 4 + (state.head.pitch / 40) * 3;

  const renderEye = (cx: number, cy: number, side: 'left' | 'right') => {
    if (state.eyes.isBlinking) {
      return (
        <line
          x1={cx - 11}
          y1={cy}
          x2={cx + 11}
          y2={cy}
          stroke={eyeColor}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      );
    }

    switch (state.eyes.mood) {
      case 'happy':
        return (
          <path
            d={`M ${cx - 11} ${cy + 3} Q ${cx} ${cy - 10} ${cx + 11} ${cy + 3}`}
            fill="none"
            stroke={eyeColor}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        );
      case 'sleepy':
        return (
          <path
            d={`M ${cx - 11} ${cy - 1} Q ${cx} ${cy + 7} ${cx + 11} ${cy - 1}`}
            fill="none"
            stroke="#94A3B8"
            strokeWidth="3"
            strokeLinecap="round"
          />
        );
      case 'alert':
        return (
          <g>
            <ellipse cx={cx} cy={cy} rx="11" ry="12" fill="#1E293B" stroke={eyeColor} strokeWidth="2.5" />
            <circle cx={cx + gazeShiftX} cy={cy + gazeShiftY} r="4.5" fill={eyeColor} />
            <line
              x1={side === 'left' ? cx - 10 : cx - 12}
              y1={side === 'left' ? cy - 12 : cy - 8}
              x2={side === 'left' ? cx + 12 : cx + 10}
              y2={side === 'left' ? cy - 8 : cy - 12}
              stroke={eyeColor}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </g>
        );
      case 'curious': {
        const radiusY = side === 'left' ? 14 : 10;
        return (
          <g>
            <ellipse cx={cx} cy={cy} rx="11" ry={radiusY} fill="#0F172A" stroke={eyeColor} strokeWidth="2.2" />
            <circle cx={cx + gazeShiftX} cy={cy + gazeShiftY} r="5.5" fill={eyeColor} />
            <circle cx={cx + gazeShiftX - 2} cy={cy + gazeShiftY - 2} r="1.8" fill="#FFFFFF" />
          </g>
        );
      }
      case 'surprised':
        return (
          <g>
            <circle cx={cx} cy={cy} r="13.5" fill="#0F172A" stroke={eyeColor} strokeWidth="2.5" />
            <circle cx={cx + gazeShiftX} cy={cy + gazeShiftY} r="4.5" fill={eyeColor} />
            <circle cx={cx + gazeShiftX - 1.5} cy={cy + gazeShiftY - 1.5} r="1.5" fill="#FFFFFF" />
          </g>
        );
      case 'processing': {
        const spinOffset = (pulsePhase * 4) % 2;
        return (
          <g>
            <rect
              x={cx - 11}
              y={cy - 9}
              width="22"
              height="18"
              rx="6"
              fill="#0F172A"
              stroke={eyeColor}
              strokeWidth="2"
            />
            <rect
              x={cx - 6 + (spinOffset > 1 ? 4 : -2)}
              y={cy - 3}
              width="8"
              height="6"
              rx="2"
              fill={eyeColor}
            />
          </g>
        );
      }
      default:
        return (
          <g>
            <ellipse cx={cx} cy={cy} rx="11.5" ry="13" fill="#0F172A" stroke={eyeColor} strokeWidth="2.2" />
            <circle cx={cx + gazeShiftX} cy={cy + gazeShiftY} r="5.5" fill={eyeColor} />
            <circle cx={cx + gazeShiftX - 2} cy={cy + gazeShiftY - 2} r="1.8" fill="#FFFFFF" />
          </g>
        );
    }
  };

  const triggerCap = (sensor: CapTouchSensorId) => {
    onTouchSensor?.('capTouch', sensor);
  };

  return (
    <div className="flex flex-col justify-between h-full">
      {/* Dark Stage for Misty Hardware Rendering */}
      <div className="relative bg-slate-950 rounded-lg border border-slate-800 overflow-hidden flex flex-col items-center justify-center p-4">
        <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-medium text-slate-300">Gêmeo Digital Misty II</span>
          <span className="font-mono tabular-nums text-[11px] text-slate-400">
            {state.activeChoreography
              ? `Coreografia: ${state.activeChoreography.name}`
              : state.waypointTarget
                ? `Rota: (${state.waypointTarget.x.toFixed(1)}, ${state.waypointTarget.y.toFixed(1)})`
                : 'Pronta'}
          </span>
        </div>

        <svg
          viewBox="0 0 280 270"
          className={compact ? 'w-full max-w-[220px] h-auto' : 'w-full max-w-[265px] h-auto'}
          role="img"
          aria-label="Representação interativa do robô Misty II"
        >
          <defs>
            <linearGradient id="mistyShell" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F8FAFC" />
              <stop offset="100%" stopColor="#CBD5E1" />
            </linearGradient>
            <linearGradient id="mistyDarkBase" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0F172A" />
            </linearGradient>
            <filter id="ledGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Subtle Floor Shadow */}
          <ellipse cx="140" cy="248" rx="76" ry="11" fill="#020617" opacity="0.7" />

          {/* Tank Treads & Base */}
          <g>
            {/* Left & Right Treads */}
            <rect x="64" y="205" width="30" height="40" rx="10" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
            <rect x="186" y="205" width="30" height="40" rx="10" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
            {/* Chassis Body */}
            <path
              d="M 86 142 C 86 130, 194 130, 194 142 L 200 222 C 200 232, 80 232, 80 222 Z"
              fill="url(#mistyShell)"
              stroke="#94A3B8"
              strokeWidth="1.5"
            />
            {/* Front Skirt / Bumper Hotspots */}
            <path
              d="M 80 214 Q 110 224 140 224 L 140 235 Q 108 235 80 225 Z"
              fill={state.bump.frontLeft ? '#EF4444' : 'url(#mistyDarkBase)'}
              className="cursor-pointer transition-colors"
              onClick={() => onTouchSensor?.('bump', 'frontLeft')}
            >
              <title>Clique para simular colisão frontal esquerda</title>
            </path>
            <path
              d="M 200 214 Q 170 224 140 224 L 140 235 Q 172 235 200 225 Z"
              fill={state.bump.frontRight ? '#EF4444' : 'url(#mistyDarkBase)'}
              className="cursor-pointer transition-colors"
              onClick={() => onTouchSensor?.('bump', 'frontRight')}
            >
              <title>Clique para simular colisão frontal direita</title>
            </path>

            {/* Chest LED Bar + Halo */}
            <ellipse cx="140" cy="175" rx="28" ry="14" fill={ledGlowCss} />
            <rect
              x="120"
              y="169"
              width="40"
              height="10"
              rx="5"
              fill={ledCss}
              filter="url(#ledGlow)"
              stroke="#E2E8F0"
              strokeWidth="1"
            />

            {/* Chest Power / Battery indicator bar */}
            <rect x="124" y="192" width="32" height="4" rx="2" fill="#CBD5E1" />
            <rect
              x="124"
              y="192"
              width={(32 * state.battery.chargePercent) / 100}
              height="4"
              rx="2"
              fill={state.battery.chargePercent > 25 ? '#10B981' : '#EF4444'}
            />
          </g>

          {/* Left Arm (Viewer's Left = Misty's Right Arm in front view, labeled clearly) */}
          <g transform={`translate(76, 152) rotate(${leftArmAngle})`}>
            <circle cx="0" cy="0" r="11" fill="#475569" stroke="#94A3B8" strokeWidth="1.5" />
            <rect x="-18" y="-7" width="22" height="50" rx="9" fill="url(#mistyShell)" stroke="#94A3B8" strokeWidth="1.5" />
            <rect x="-15" y="34" width="16" height="12" rx="5" fill="#334155" />
          </g>

          {/* Right Arm */}
          <g transform={`translate(204, 152) rotate(${rightArmAngle})`}>
            <circle cx="0" cy="0" r="11" fill="#475569" stroke="#94A3B8" strokeWidth="1.5" />
            <rect x="-4" y="-7" width="22" height="50" rx="9" fill="url(#mistyShell)" stroke="#94A3B8" strokeWidth="1.5" />
            <rect x="-1" y="34" width="16" height="12" rx="5" fill="#334155" />
          </g>

          {/* Neck Column */}
          <rect x="128" y="114" width="24" height="26" rx="4" fill="#334155" />

          {/* Articulated Head Group */}
          <g transform={`translate(${140 + headOffsetX}, ${74 + headOffsetY}) rotate(${headRoll})`}>
            {/* Outer Head Shell */}
            <rect
              x="-72"
              y="-46"
              width="144"
              height="92"
              rx="32"
              fill="url(#mistyShell)"
              stroke="#94A3B8"
              strokeWidth="1.8"
            />

            {/* Capacitive Touch Hotspots */}
            <rect
              x="-34"
              y="-48"
              width="68"
              height="12"
              rx="6"
              fill={state.capTouch.headFront ? '#38BDF8' : 'transparent'}
              opacity={state.capTouch.headFront ? 0.7 : 0}
              className="cursor-pointer"
              onClick={() => triggerCap('headFront')}
            >
              <title>Toque capacitivo: Topo frontal da cabeça</title>
            </rect>
            <rect
              x="-74"
              y="-22"
              width="12"
              height="44"
              rx="6"
              fill={state.capTouch.headRight ? '#38BDF8' : '#E2E8F0'}
              opacity={state.capTouch.headRight ? 0.8 : 0.45}
              className="cursor-pointer"
              onClick={() => triggerCap('headRight')}
            >
              <title>Toque capacitivo: Lateral direita</title>
            </rect>
            <rect
              x="62"
              y="-22"
              width="12"
              height="44"
              rx="6"
              fill={state.capTouch.headLeft ? '#38BDF8' : '#E2E8F0'}
              opacity={state.capTouch.headLeft ? 0.8 : 0.45}
              className="cursor-pointer"
              onClick={() => triggerCap('headLeft')}
            >
              <title>Toque capacitivo: Lateral esquerda</title>
            </rect>

            {/* Dark OLED Visor */}
            <rect
              x="-58"
              y="-32"
              width="116"
              height="64"
              rx="22"
              fill="#020617"
              stroke="#1E293B"
              strokeWidth="2"
            />

            {/* Top Camera Lens on Visor */}
            <circle cx="0" cy="-23" r="3" fill="#1E293B" stroke="#475569" strokeWidth="1" />
            <circle cx="0" cy="-23" r="1.2" fill="#38BDF8" />

            {/* Vector Eyes */}
            {renderEye(-24, -2, 'left')}
            {renderEye(24, -2, 'right')}

            {/* Speech Voice Waveform when speaking */}
            {state.speech.isSpeaking && (
              <g transform="translate(0, 20)">
                {[-16, -8, 0, 8, 16].map((x, idx) => {
                  const h = 3 + Math.abs(Math.sin(pulsePhase * 16 + idx * 1.1)) * 7;
                  return (
                    <rect
                      key={x}
                      x={x - 1.5}
                      y={-h / 2}
                      width="3"
                      height={h}
                      rx="1.5"
                      fill="#38BDF8"
                    />
                  );
                })}
              </g>
            )}

            {/* Chin Capacitive Touch Hotspot */}
            <rect
              x="-24"
              y="36"
              width="48"
              height="10"
              rx="5"
              fill={state.capTouch.chin ? '#10B981' : '#94A3B8'}
              opacity={state.capTouch.chin ? 0.9 : 0.35}
              className="cursor-pointer transition-opacity hover:opacity-80"
              onClick={() => triggerCap('chin')}
            >
              <title>Clique no queixo para simular toque capacitivo (chin)</title>
            </rect>
          </g>
        </svg>

        {/* Visor Display Text Readout */}
        <div className="w-full mt-2 px-3 py-2 rounded bg-slate-900 border border-slate-800 text-center">
          <p className="text-xs font-mono text-sky-300 truncate">
            {state.eyes.displayText || 'Visor OLED em espera'}
          </p>
        </div>
      </div>

      {/* Kinematics & Telemetry Numeric Strip */}
      <div className="grid grid-cols-3 gap-2 pt-3 text-xs">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Cabeça (P/R/Y)</div>
          <div className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 mt-0.5">
            {Math.round(state.head.pitch)}° / {Math.round(state.head.roll)}° / {Math.round(state.head.yaw)}°
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Braços (E / D)</div>
          <div className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 mt-0.5">
            {Math.round(state.arms.left)}° / {Math.round(state.arms.right)}°
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Bateria</div>
          <div className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 mt-0.5">
            {state.battery.chargePercent.toFixed(1)}% · {state.battery.voltage.toFixed(2)}V
          </div>
        </div>
      </div>
    </div>
  );
};
