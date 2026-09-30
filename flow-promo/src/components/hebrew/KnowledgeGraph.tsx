import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ACCENT, BLUE, FONT_STACK_HE, VIOLET } from '../../theme';
import { GRAPH_SETTLE_LOCAL } from '../../timelineHebrew';

type Node = { label: string; x: number; y: number; scatterX: number; scatterY: number; delay: number };

const NODES: Node[] = [
  { label: 'לקוח', x: 0.14, y: 0.5, scatterX: 0.05, scatterY: 0.2, delay: 0 },
  { label: 'מסמך', x: 0.34, y: 0.28, scatterX: 0.5, scatterY: 0.08, delay: 8 },
  { label: 'הסכם / פוליסה', x: 0.5, y: 0.62, scatterX: 0.5, scatterY: 0.92, delay: 16 },
  { label: 'מבטח / רשות', x: 0.68, y: 0.28, scatterX: 0.92, scatterY: 0.1, delay: 24 },
  { label: 'סוכן', x: 0.86, y: 0.5, scatterX: 0.95, scatterY: 0.85, delay: 32 },
];

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
];

const NodeDot: React.FC<{ node: Node; settle: number; color: string }> = ({ node, settle, color }) => {
  const x = interpolate(settle, [0, 1], [node.scatterX * 100, node.x * 100]);
  const y = interpolate(settle, [0, 1], [node.scatterY * 100, node.y * 100]);
  const scale = interpolate(settle, [0, 1], [0.4, 1]);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity: settle,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          backgroundColor: color,
          boxShadow: `0 0 30px ${color}99`,
        }}
      />
      <span style={{ fontFamily: FONT_STACK_HE, fontSize: 22, fontWeight: 700, color: '#FFFFFF', direction: 'rtl', whiteSpace: 'nowrap' }}>
        {node.label}
      </span>
    </div>
  );
};

export const KnowledgeGraph: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodeSettle = (i: number) => {
    const node = NODES[i];
    const s = spring({ frame: frame - node.delay, fps, config: { stiffness: 140, damping: 16, mass: 0.7 } });
    return Math.min(1, Math.max(0, s));
  };

  const overallSettle = interpolate(frame, [GRAPH_SETTLE_LOCAL.start, GRAPH_SETTLE_LOCAL.end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const captionOpacity = interpolate(frame, [GRAPH_SETTLE_LOCAL.end + 20, GRAPH_SETTLE_LOCAL.end + 44], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: '18% 12% 26% 12%' }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {EDGES.map(([a, b], i) => {
            const na = NODES[a];
            const nb = NODES[b];
            const sa = nodeSettle(a);
            const sb = nodeSettle(b);
            const lineOpacity = Math.min(sa, sb) * overallSettle;
            const ax = interpolate(sa, [0, 1], [na.scatterX, na.x]) * 100;
            const ay = interpolate(sa, [0, 1], [na.scatterY, na.y]) * 100;
            const bx = interpolate(sb, [0, 1], [nb.scatterX, nb.x]) * 100;
            const by = interpolate(sb, [0, 1], [nb.scatterY, nb.y]) * 100;
            return (
              <line
                key={i}
                x1={`${ax}%`}
                y1={`${ay}%`}
                x2={`${bx}%`}
                y2={`${by}%`}
                stroke={ACCENT}
                strokeWidth={1.5}
                opacity={lineOpacity * 0.55}
              />
            );
          })}
        </svg>
        {NODES.map((node, i) => (
          <NodeDot key={node.label} node={node} settle={nodeSettle(i)} color={i % 2 === 0 ? BLUE : VIOLET} />
        ))}
      </div>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 100 }}>
        <span
          style={{
            fontFamily: FONT_STACK_HE,
            fontSize: 30,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.85)',
            direction: 'rtl',
            opacity: captionOpacity,
            textAlign: 'center',
          }}
        >
          כל פעולה — מתועדת. כל טעות — נתפסת. כל ביצוע — באישורכם.
        </span>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
