import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BLUE, GREEN, ORANGE, TEXT } from '../theme';

export const FlowMark: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 0.5, y: 0.08, delay: 0 },
    { x: 0.15, y: 0.42, delay: 6 },
    { x: 0.85, y: 0.42, delay: 12 },
    { x: 0.5, y: 0.92, delay: 18 },
  ];

  const lineOpacity = (delay: number) =>
    interpolate(frame - delay, [10, 26], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <line x1={50} y1={8} x2={15} y2={42} stroke={BLUE} strokeWidth={2} opacity={lineOpacity(4)} />
      <line x1={15} y1={42} x2={85} y2={42} stroke={GREEN} strokeWidth={2} opacity={lineOpacity(10)} />
      <line x1={85} y1={42} x2={50} y2={92} stroke={ORANGE} strokeWidth={2} opacity={lineOpacity(16)} />
      <line x1={15} y1={42} x2={50} y2={92} stroke={BLUE} strokeWidth={2} opacity={lineOpacity(20)} />
      {nodes.map((node, i) => {
        const scale = spring({
          frame: frame - node.delay,
          fps,
          config: { damping: 12, stiffness: 140, mass: 0.6 },
        });
        return <circle key={i} cx={node.x * 100} cy={node.y * 100} r={5 * scale} fill={TEXT} />;
      })}
    </svg>
  );
};
