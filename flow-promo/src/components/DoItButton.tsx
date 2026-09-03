import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Trail } from '@remotion/motion-blur';
import { ACCENT, ACCENT_DARK, FONT_STACK } from '../theme';
import { CLICK_LOCAL } from '../timeline';

const CURSOR_START = { x: 0.94, y: 0.94 };
const CURSOR_END = { x: 0.5, y: 0.5 };
const CURSOR_ENTER = 30;
const CURSOR_ARRIVE = CLICK_LOCAL - 5;
const CLICK_FRAME = CLICK_LOCAL;

const CursorArrow: React.FC = () => {
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

const Cursor: React.FC = () => (
  <Trail layers={5} lagInFrames={1} trailOpacity={0.45}>
    <CursorArrow />
  </Trail>
);

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
        width: 500,
        height: 184,
        borderRadius: 100,
        border: `2px solid ${ACCENT}`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
      }}
    />
  );
};

const PARTICLE_COUNT = 10;

const ParticleBurst: React.FC = () => {
  const frame = useCurrentFrame();
  const local = frame - CLICK_FRAME;
  if (local < 0 || local > 35) return null;

  const progress = local / 35;

  return (
    <>
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + 0.3;
        const distance = interpolate(progress, [0, 1], [0, 330], {
          easing: Easing.out(Easing.cubic),
        });
        const px = Math.cos(angle) * distance;
        const py = Math.sin(angle) * distance;
        const opacity = interpolate(progress, [0, 0.2, 1], [0, 1, 0]);
        const size = interpolate(progress, [0, 1], [10, 2]);

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: i % 2 === 0 ? ACCENT : ACCENT_DARK,
              opacity,
              transform: `translate(${px - size / 2}px, ${py - size / 2}px)`,
            }}
          />
        );
      })}
    </>
  );
};

const AnticipationRing: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame >= CLICK_FRAME) return null;

  const period = 26;
  const t = (frame % period) / period;
  const scale = interpolate(t, [0, 1], [1, 1.18]);
  const opacity = interpolate(t, [0, 1], [0.4, 0]);

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 470,
        height: 168,
        borderRadius: 100,
        border: `1.5px solid ${ACCENT}`,
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
  const entranceOpacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const clickLocal = frame - CLICK_FRAME;
  const pressScale = clickLocal >= 0 && clickLocal < 12 ? interpolate(clickLocal, [0, 6, 12], [1, 0.9, 1]) : 1;

  const idlePulse = frame < CLICK_FRAME ? 1 + Math.sin((frame / fps) * 3.2) * 0.012 : 1;

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
          transform: `scale(${burst * pressScale * idlePulse * exitScale})`,
        }}
      >
        <AnticipationRing />
        <Ripple />
        <ParticleBurst />
        {/* Outer halo ring, matching the reference lockup */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 'calc(100% + 128px)',
            height: 'calc(100% + 76px)',
            transform: 'translate(-50%, -50%)',
            borderRadius: 200,
            border: `3px solid ${ACCENT}55`,
            background: 'linear-gradient(180deg, #FFFFFF 0%, #EEF2F8 100%)',
            boxShadow: '0 30px 70px rgba(17,17,17,0.13)',
          }}
        />
        <div
          style={{
            position: 'relative',
            padding: '52px 148px',
            borderRadius: 100,
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F4F6FA 52%, #E4E9F1 100%)',
            border: `3px solid ${ACCENT}`,
            boxShadow:
              'inset 0 2px 0 rgba(255,255,255,0.95), inset 0 -3px 8px rgba(17,17,17,0.06), 0 18px 40px rgba(17,17,17,0.12)',
          }}
        >
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: 88,
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
