import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BG, GREEN, MUTED, FONT_STACK } from '../theme';

export const DoItButton: React.FC<{ durationInFrames?: number }> = ({ durationInFrames = 150 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const clickFrame = durationInFrames - 55;
  const exitStart = durationInFrames - 30;

  const entrance = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });

  const press = spring({
    frame: frame - clickFrame,
    fps,
    config: { damping: 10, stiffness: 300, mass: 0.4 },
  });
  const pressScale = interpolate(press, [0, 0.5, 1], [1, 0.92, 1]);

  const ripple = interpolate(frame, [clickFrame, clickFrame + 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rippleOpacity = interpolate(
    frame,
    [clickFrame, clickFrame + 10, clickFrame + 30],
    [0, 0.6, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const promptOpacity = interpolate(frame, [10, 30], [0, 1], {
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
          opacity: entrance * exit,
          transform: `scale(${entrance})`,
        }}
      >
        <span
          style={{
            fontFamily: FONT_STACK,
            fontSize: 44,
            fontWeight: 500,
            color: MUTED,
            opacity: promptOpacity,
          }}
        >
          One click. Flow handles the rest.
        </span>
        <div style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              inset: -20,
              borderRadius: 100,
              border: `2px solid ${GREEN}`,
              opacity: rippleOpacity,
              transform: `scale(${1 + ripple * 1.6})`,
            }}
          />
          <div
            style={{
              padding: '36px 96px',
              borderRadius: 100,
              backgroundColor: GREEN,
              boxShadow: `0 0 80px ${GREEN}66`,
              transform: `scale(${pressScale})`,
            }}
          >
            <span style={{ fontFamily: FONT_STACK, fontSize: 56, fontWeight: 700, color: BG, letterSpacing: 0.5 }}>
              Do it.
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
