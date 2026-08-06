import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BG, TEXT, MUTED, FONT_STACK } from '../theme';
import { FlowMark } from './FlowMark';

export const Outro: React.FC<{ durationInFrames?: number }> = ({ durationInFrames = 80 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 110, mass: 0.8 },
  });
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ctaOpacity = interpolate(frame, [30, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeToBlack = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 40,
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <FlowMark size={90} />
          <span style={{ fontFamily: FONT_STACK, fontSize: 92, fontWeight: 700, color: TEXT, letterSpacing: -3 }}>
            Flow
          </span>
        </div>
        <span
          style={{
            fontFamily: FONT_STACK,
            fontSize: 32,
            fontWeight: 400,
            color: MUTED,
            opacity: ctaOpacity,
            letterSpacing: 1,
          }}
        >
          Cognitive Workflow Engine — coming to your device
        </span>
      </div>
      <AbsoluteFill style={{ backgroundColor: BG, opacity: fadeToBlack, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
