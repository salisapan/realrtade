import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ACCENT, ACCENT_DARK, SHADOW_LG, FONT_STACK } from '../theme';

const CURSOR_START = { x: 0.94, y: 0.94 };
const CURSOR_END = { x: 0.5, y: 0.5 };
const CURSOR_ENTER = 20;
const CURSOR_ARRIVE = 115;
const CLICK_FRAME = 120;

const Cursor: React.FC = () => {
  const frame = useCurrentFrame();
  const local = frame - CURSOR_ENTER;
  if (local < 0) return null;

  const progress = interpolate(local, [0, CURSOR_ARRIVE - CURSOR_ENTER], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const x = interpolate(progress, [0, 1], [CURSOR_START.x, CURSOR_END.x]) * 100;
  const y = interpolate(progress, [0, 1], [CURSOR_START.y, CURSOR_END.y]) * 100;

  const clickLocal = frame - CLICK_FRAME;
  const pressScale = clickLocal >= 0 && clickLocal < 12 ? interpolate(clickLocal, [0, 6, 12], [1, 0.82, 1]) : 1;

  const fadeOut = interpolate(frame, [CLICK_FRAME + 20, CLICK_FRAME + 40], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-8%, -8%) scale(${pressScale})`,
        opacity: fadeOut,
        filter: 'drop-shadow(0 6px 10px rgba(17,17,17,0.25))',
      }}
    >
      <svg width={64} height={64} viewBox="0 0 24 24" fill="none">
        <path
          d="M4 2 L4 19 L8.5 15.2 L11.3 21.4 L14 20.2 L11.2 14 L17 14 Z"
          fill="#111111"
          stroke="#FFFFFF"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

const Ripple: React.FC = () => {
  const frame = useCurrentFrame();
  const local = frame - CLICK_FRAME;
  if (local < 0 || local > 40) return null;

  const progress = local / 40;
  const scale = interpolate(progress, [0, 1], [0.4, 3.2]);
  const opacity = interpolate(progress, [0, 0.15, 1], [0, 0.55, 0]);

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 360,
        height: 130,
        borderRadius: 100,
        border: `2px solid ${ACCENT}`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
      }}
    />
  );
};

export const DoItButton: React.FC<{ durationInFrames?: number }> = ({ durationInFrames = 180 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitStart = durationInFrames - 40;

  const burst = spring({
    frame,
    fps,
    config: { stiffness: 190, damping: 13, mass: 0.7 },
  });
  const entranceOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const clickLocal = frame - CLICK_FRAME;
  const pressScale = clickLocal >= 0 && clickLocal < 12 ? interpolate(clickLocal, [0, 6, 12], [1, 0.9, 1]) : 1;

  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitScale = interpolate(frame, [exitStart, durationInFrames], [1, 0.85], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: entranceOpacity * exitOpacity,
          transform: `scale(${burst * pressScale * exitScale})`,
        }}
      >
        <Ripple />
        <div
          style={{
            padding: '38px 110px',
            borderRadius: 100,
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F1F3F6 100%)',
            border: `2.5px solid ${ACCENT}`,
            boxShadow: `${SHADOW_LG}, inset 0 1px 0 rgba(255,255,255,0.8)`,
          }}
        >
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: 62,
              fontWeight: 800,
              color: ACCENT_DARK,
              letterSpacing: 0.5,
            }}
          >
            [Do It]
          </span>
        </div>
      </div>
      <Cursor />
    </AbsoluteFill>
  );
};
