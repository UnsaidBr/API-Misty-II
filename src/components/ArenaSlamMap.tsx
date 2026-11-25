import React, { useState } from 'react';
import { Navigation, PlusSquare, RotateCcw } from 'lucide-react';
import type { RobotState } from '../types/misty';

interface ArenaSlamMapProps {
  state: RobotState;
  onNavigateWaypoint: (x: number, y: number) => void;
  onAddObstacle: (x: number, y: number) => void;
  onRemoveObstacle: (id: string) => void;
  onResetSlam: () => void;
}

const ARENA_W_METERS = 5.7; // -2.85 to +2.85
const ARENA_H_METERS = 3.9; // -1.95 to +1.95
const SVG_W = 570;
const SVG_H = 390;

const toSvgX = (xMeters: number) => ((xMeters + ARENA_W_METERS / 2) / ARENA_W_METERS) * SVG_W;
const toSvgY = (yMeters: number) => ((-yMeters + ARENA_H_METERS / 2) / ARENA_H_METERS) * SVG_H;

const toMetersX = (svgX: number) => (svgX / SVG_W) * ARENA_W_METERS - ARENA_W_METERS / 2;
const toMetersY = (svgY: number) => -((svgY / SVG_H) * ARENA_H_METERS - ARENA_H_METERS / 2);

export const ArenaSlamMap: React.FC<ArenaSlamMapProps> = ({
  state,
  onNavigateWaypoint,
  onAddObstacle,
  onRemoveObstacle,
  onResetSlam,
}) => {
  const [interactionMode, setInteractionMode] = useState<'waypoint' | 'obstacle'>('waypoint');

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = SVG_W / rect.width;
    const scaleY = SVG_H / rect.height;
    const sx = (e.clientX - rect.left) * scaleX;
    const sy = (e.clientY - rect.top) * scaleY;
    const mx = Number(toMetersX(sx).toFixed(2));
    const my = Number(toMetersY(sy).toFixed(2));

    if (interactionMode === 'waypoint') {
      onNavigateWaypoint(mx, my);
    } else {
      onAddObstacle(mx, my);
    }
  };

  const robotSvgX = toSvgX(state.pose.x);
  const robotSvgY = toSvgY(state.pose.y);
  const headingRad = (state.pose.heading * Math.PI) / 180;
  const headYawRad = (state.head.yaw * Math.PI) / 180;

  // Compute beam endpoints for visual ToF lasers
  const beams = [
    {
      key: 'FrontCenter',
      label: 'FC',
      angle: headingRad + headYawRad * 0.35,
      dist: state.tof.FrontCenter,
      color: state.tof.FrontCenter < 0.4 ? '#EF4444' : '#38BDF8',
    },
    {
      key: 'FrontLeft',
      label: 'FL',
      angle: headingRad + 0.48,
      dist: state.tof.FrontLeft,
      color: state.tof.FrontLeft < 0.4 ? '#F59E0B' : '#0EA5E9',
    },
    {
      key: 'FrontRight',
      label: 'FR',
      angle: headingRad - 0.48,
      dist: state.tof.FrontRight,
      color: state.tof.FrontRight < 0.4 ? '#F59E0B' : '#0EA5E9',
    },
    {
      key: 'FrontBack',
      label: 'BK',
      angle: headingRad + Math.PI,
      dist: state.tof.FrontBack,
      color: '#64748B',
    },
  ];

  const trailPoints = state.pose.trail
    .map((p) => `${toSvgX(p.x).toFixed(1)},${toSvgY(p.y).toFixed(1)}`)
    .join(' ');

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setInteractionMode('waypoint')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              interactionMode === 'waypoint'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            Navegar por Waypoint
          </button>
          <button
            type="button"
            onClick={() => setInteractionMode('obstacle')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              interactionMode === 'obstacle'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <PlusSquare className="w-3.5 h-3.5" />
            Editar Obstáculos
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono tabular-nums">
            Pose: ({state.pose.x.toFixed(2)}m, {state.pose.y.toFixed(2)}m) · {state.pose.heading.toFixed(0)}°
          </span>
          <button
            type="button"
            onClick={onResetSlam}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Zerar SLAM
          </button>
        </div>
      </div>

      {/* Arena Canvas */}
      <div className="relative bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          onClick={handleSvgClick}
          className="w-full h-auto block cursor-crosshair select-none"
          role="img"
          aria-label="Mapa 2D SLAM e sensores Time-of-Flight da Arena"
        >
          {/* 0.5m Grid Lines */}
          {Array.from({ length: 11 }).map((_, idx) => {
            const x = ((idx + 0.5) * 50);
            return (
              <line
                key={`gx-${idx}`}
                x1={x}
                y1={0}
                x2={x}
                y2={SVG_H}
                stroke="#1E293B"
                strokeWidth="1"
              />
            );
          })}
          {Array.from({ length: 7 }).map((_, idx) => {
            const y = ((idx + 0.5) * 50);
            return (
              <line
                key={`gy-${idx}`}
                x1={0}
                y1={y}
                x2={SVG_W}
                y2={y}
                stroke="#1E293B"
                strokeWidth="1"
              />
            );
          })}

          {/* Origin Axes */}
          <line x1={SVG_W / 2} y1={0} x2={SVG_W / 2} y2={SVG_H} stroke="#334155" strokeDasharray="4 4" strokeWidth="1" />
          <line x1={0} y1={SVG_H / 2} x2={SVG_W} y2={SVG_H / 2} stroke="#334155" strokeDasharray="4 4" strokeWidth="1" />

          {/* Odometry Trail */}
          {state.pose.trail.length > 1 && (
            <polyline
              points={trailPoints}
              fill="none"
              stroke="#0284C7"
              strokeWidth="2"
              strokeDasharray="3 3"
              opacity="0.7"
            />
          )}

          {/* Waypoint Target */}
          {state.waypointTarget && (
            <g transform={`translate(${toSvgX(state.waypointTarget.x)}, ${toSvgY(state.waypointTarget.y)})`}>
              <line
                x1={robotSvgX - toSvgX(state.waypointTarget.x)}
                y1={robotSvgY - toSvgY(state.waypointTarget.y)}
                x2={0}
                y2={0}
                stroke="#10B981"
                strokeWidth="1.5"
                strokeDasharray="5 4"
                opacity="0.65"
              />
              <circle cx={0} cy={0} r={10} fill="none" stroke="#10B981" strokeWidth="1.5" />
              <circle cx={0} cy={0} r={3.5} fill="#10B981" />
            </g>
          )}

          {/* Obstacles */}
          {state.obstacles.map((obs) => {
            const w = (obs.width / ARENA_W_METERS) * SVG_W;
            const h = (obs.height / ARENA_H_METERS) * SVG_H;
            const x = toSvgX(obs.x) - w / 2;
            const y = toSvgY(obs.y) - h / 2;
            return (
              <g
                key={obs.id}
                onClick={(ev) => {
                  if (interactionMode === 'obstacle') {
                    ev.stopPropagation();
                    onRemoveObstacle(obs.id);
                  }
                }}
                className={interactionMode === 'obstacle' ? 'cursor-pointer' : ''}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx="4"
                  fill="#1E293B"
                  stroke={interactionMode === 'obstacle' ? '#F59E0B' : '#475569'}
                  strokeWidth="1.5"
                />
                <text
                  x={x + w / 2}
                  y={y + h / 2 + 3}
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {obs.label}
                </text>
              </g>
            );
          })}

          {/* ToF Laser Beams */}
          {beams.map((b) => {
            const totalMeters = b.dist + 0.18;
            const endX = state.pose.x + Math.cos(b.angle) * totalMeters;
            const endY = state.pose.y + Math.sin(b.angle) * totalMeters;
            const sx2 = toSvgX(endX);
            const sy2 = toSvgY(endY);
            return (
              <g key={b.key}>
                <line
                  x1={robotSvgX}
                  y1={robotSvgY}
                  x2={sx2}
                  y2={sy2}
                  stroke={b.color}
                  strokeWidth="1.5"
                  opacity="0.7"
                />
                <circle cx={sx2} cy={sy2} r="3" fill={b.color} />
              </g>
            );
          })}

          {/* Misty Top-Down Robot Footprint */}
          <g transform={`translate(${robotSvgX}, ${robotSvgY}) rotate(${-state.pose.heading})`}>
            {/* Chassis Footprint */}
            <circle cx={0} cy={0} r={18} fill="#F8FAFC" stroke="#0284C7" strokeWidth="2.5" />
            {/* Side Treads */}
            <rect x={-12} y={-20} width={24} height={5} rx="2" fill="#334155" />
            <rect x={-12} y={15} width={24} height={5} rx="2" fill="#334155" />
            {/* Heading Arrow */}
            <polygon points="14,0 2,-6 2,6" fill="#0284C7" />
            {/* Chest LED Dot */}
            <circle
              cx={0}
              cy={0}
              r={4.5}
              fill={`rgb(${state.led.r}, ${state.led.g}, ${state.led.b})`}
            />
          </g>
        </svg>

        {/* Bottom Map Hint Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-t border-slate-800 text-[11px] text-slate-400">
          <span>
            {interactionMode === 'waypoint'
              ? 'Clique em qualquer ponto da arena para enviar POST /api/misty/drive/waypoint'
              : 'Clique no chão para adicionar obstáculo ou clique em um bloco existente para remover'}
          </span>
          <span className="font-mono tabular-nums text-slate-300">
            ToF Frontal: {state.tof.FrontCenter.toFixed(2)}m · Esq: {state.tof.FrontLeft.toFixed(2)}m · Dir: {state.tof.FrontRight.toFixed(2)}m
          </span>
        </div>
      </div>
    </div>
  );
};
