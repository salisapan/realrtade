import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { ACCENT, FONT_STACK_HE, GRADIENT_AI, SUCCESS } from '../../theme';
import { FlowLogo } from '../FlowLogo';
import { LOGO_FORM_LOCAL, INTENT_REVEAL_LOCAL } from '../../timelineHebrew';

const AiIcon: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      background: GRADIENT_AI,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24">
      <path d="M12 2 L14 9 L21 12 L14 15 L12 22 L10 15 L3 12 L10 9 Z" fill="#FFFFFF" />
    </svg>
  </div>
);

const GearIcon: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      backgroundColor: '#1B2233',
      border: `2px solid ${SUCCESS}55`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill={SUCCESS}>
      <path
        d="M12 2 L13.3 4.6 L16.1 4.1 L16.4 7 L19 8.1 L17.7 10.6 L19.3 13 L16.8 14.3 L16.9 17.2 L14 16.9 L12.5 19.4 L10.5 17.3 L7.7 18 L7.4 15.1 L4.7 14 L6 11.5 L4.4 9.1 L6.9 7.8 L6.8 4.9 L9.7 5.2 Z"
        fillRule="evenodd"
      />
      <circle cx="12" cy="12" r="3.6" fill="#1B2233" />
    </svg>
  </div>
);

export const IntentReveal: React.FC = () => {
  const frame = useCurrentFrame();

  const logoProgress = interpolate(frame, [LOGO_FORM_LOCAL.start, LOGO_FORM_LOCAL.end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const logoOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const diagramOpacity = interpolate(
    frame,
    [INTENT_REVEAL_LOCAL.start, INTENT_REVEAL_LOCAL.start + 24],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const diagramY = interpolate(frame, [INTENT_REVEAL_LOCAL.start, INTENT_REVEAL_LOCAL.start + 24], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ opacity: logoOpacity, marginBottom: 90 }}>
        <FlowLogo progress={logoProgress} height={320} />
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 190,
          opacity: diagramOpacity,
          transform: `translateY(${diagramY}px)`,
          display: 'flex',
          alignItems: 'center',
          gap: 36,
          direction: 'ltr',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <AiIcon size={92} />
          <span style={{ fontFamily: FONT_STACK_HE, fontSize: 24, fontWeight: 700, color: '#FFFFFF', direction: 'rtl' }}>
            הבנה
          </span>
        </div>

        <svg width={64} height={24} viewBox="0 0 64 24">
          <path d="M2 12 H56 M56 12 L46 5 M56 12 L46 19" stroke="rgba(255,255,255,0.5)" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <div style={{ width: 2, height: 90, backgroundColor: 'rgba(255,255,255,0.2)' }} />

        <svg width={64} height={24} viewBox="0 0 64 24">
          <path d="M2 12 H56 M56 12 L46 5 M56 12 L46 19" stroke="rgba(255,255,255,0.5)" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <GearIcon size={92} />
          <span style={{ fontFamily: FONT_STACK_HE, fontSize: 24, fontWeight: 700, color: '#FFFFFF', direction: 'rtl' }}>
            ביצוע
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 90,
          opacity: diagramOpacity,
          display: 'flex',
          gap: 40,
          fontFamily: FONT_STACK_HE,
          fontSize: 22,
          fontWeight: 600,
          color: ACCENT,
          direction: 'rtl',
        }}
      >
        <span>Local-First</span>
        <span>·</span>
        <span>AI לכוונה בלבד</span>
        <span>·</span>
        <span>ביצוע דטרמיניסטי</span>
      </div>
    </AbsoluteFill>
  );
};
