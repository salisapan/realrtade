import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ACCENT, TEXT } from '../theme';

export const FlowMark: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 0.5, y: 0.08, delay: 0 },
    { x: 0.15, y: 0.42, delay: 4 },
    { x: 0.85, y: 0.42, delay: 8 },
    { x: 0.5, y: 0.92, delay: 12 },
  ];

  const lineOpacity = (delay: number) =>
    interpolate(frame - delay, [4, 16], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
      <line x1={50} y1={8} x2={15} y2={42} stroke={TEXT} strokeWidth={3} strokeLinecap="round" opacity={lineOpacity(0)} />
      <line x1={15} y1={42} x2={85} y2={42} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" opacity={lineOpacity(4)} />
      <line x1={85} y1={42} x2={50} y2={92} stroke={TEXT} strokeWidth={3} strokeLinecap="round" opacity={lineOpacity(8)} />
      <line x1={15} y1={42} x2={50} y2={92} stroke={TEXT} strokeWidth={3} strokeLinecap="round" opacity={lineOpacity(10)} />
      {nodes.map((node, i) => {
        const scale = spring({
          frame: frame - node.delay,
          fps,
          config: { damping: 13, stiffness: 190, mass: 0.5 },
        });
        return (
          <circle
            key={i}
            cx={node.x * 100}
            cy={node.y * 100}
            r={5.5 * scale}
            fill={i === 1 ? ACCENT : TEXT}
          />
        );
      })}
    </svg>
  );
};
