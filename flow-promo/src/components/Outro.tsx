import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TEXT, MUTED, FONT_STACK } from '../theme';
import { FlowMark } from './FlowMark';

export const Outro: React.FC<{ durationInFrames?: number }> = ({ durationInFrames = 200 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { stiffness: 170, damping: 15, mass: 0.7 },
  });
  const entranceOpacity = interpolate(frame, [0, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const taglineOpacity = interpolate(frame, [40, 68], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const taglineY = spring({ frame: frame - 40, fps, config: { damping: 16 } });

  const fadeOutStart = durationInFrames - 40;
  const fadeOutOpacity = interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 44,
          opacity: entranceOpacity * fadeOutOpacity,
          transform: `scale(${0.6 + scale * 0.4})`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 38 }}>
          <FlowMark size={110} />
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: 118,
              fontWeight: 800,
              color: TEXT,
              letterSpacing: -4,
            }}
          >
            Flow
          </span>
        </div>
        <span
          style={{
            fontFamily: FONT_STACK,
            fontSize: 34,
            fontWeight: 500,
            color: MUTED,
            opacity: taglineOpacity,
            transform: `translateY(${(1 - taglineY) * 18}px)`,
            letterSpacing: 0.3,
            textAlign: 'center',
          }}
        >
          The first cognitive operating system for the AI era.
        </span>
      </div>
    </AbsoluteFill>
  );
};
