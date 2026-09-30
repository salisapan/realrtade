import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_STACK_HE, INK, WARNING, WARNING_DARK, SHADOW_LG } from '../../theme';

const ShieldIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path
      d="M12 3 L19 6 V11.5 C19 16.2 16 19.7 12 21 C8 19.7 5 16.2 5 11.5 V6 Z"
      fill={WARNING}
      stroke={WARNING_DARK}
      strokeWidth={0.6}
    />
    <rect x="11.15" y="7.5" width="1.7" height="6.2" rx="0.85" fill="#FFFFFF" />
    <circle cx="12" cy="15.6" r="1.05" fill="#FFFFFF" />
  </svg>
);

const RingPulse: React.FC<{ triggerFrame: number }> = ({ triggerFrame }) => {
  const frame = useCurrentFrame();
  const local = frame - triggerFrame;
  if (local < 0 || local > 40) return null;

  const progress = local / 40;
  const scale = interpolate(progress, [0, 1], [0.5, 2.6]);
  const opacity = interpolate(progress, [0, 0.15, 1], [0, 0.5, 0]);

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 340,
        height: 110,
        borderRadius: 24,
        border: `2px solid ${WARNING}`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
      }}
    />
  );
};

/**
 * The Malpractice Shield's signature moment: an amber callout that pops in
 * when Flow catches a mismatch, before it acts. Per the brief this is the
 * strongest USP beat in the film — it gets real hang-time, not a flash.
 */
export const ShieldCatch: React.FC<{
  triggerFrame: number;
  message: string;
  fadeOutFrame?: number;
}> = ({ triggerFrame, message, fadeOutFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - triggerFrame;
  if (local < -5) return null;

  const pop = spring({ frame: local, fps, config: { stiffness: 220, damping: 15, mass: 0.6 } });
  const shake =
    local >= 0 && local < 14
      ? Math.sin(local * 2.4) * interpolate(local, [0, 14], [6, 0], { extrapolateRight: 'clamp' })
      : 0;

  const fadeOut = fadeOutFrame
    ? interpolate(frame, [fadeOutFrame, fadeOutFrame + 16], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  if (pop <= 0.01 && fadeOut <= 0.01) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(calc(-50% + ${shake}px), -50%) scale(${pop})`,
        opacity: fadeOut,
      }}
    >
      <RingPulse triggerFrame={triggerFrame} />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '20px 30px',
          borderRadius: 18,
          backgroundColor: '#FFF6E7',
          border: `2px solid ${WARNING}`,
          boxShadow: `${SHADOW_LG}, 0 0 50px ${WARNING}44`,
          maxWidth: 720,
          direction: 'rtl',
        }}
      >
        <ShieldIcon size={44} />
        <span
          style={{
            fontFamily: FONT_STACK_HE,
            fontSize: 27,
            fontWeight: 700,
            color: INK,
            lineHeight: 1.35,
          }}
        >
          {message}
        </span>
      </div>
    </div>
  );
};
