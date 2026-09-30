import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { FONT_STACK, FONT_STACK_HE, MUTED } from '../../theme';
import { FlowLogo } from '../FlowLogo';
import { DoItButtonHe } from './DoItButtonHe';
import { CLOSE_CLICK_FRAME, ACT } from '../../timelineHebrew';

const LOCAL_CLICK_FRAME = CLOSE_CLICK_FRAME - ACT.close.from;

export const ClosingHe: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();

  const logoOpacity = interpolate(frame, [0, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const taglineStart = LOCAL_CLICK_FRAME + 150;
  const taglineOpacity = interpolate(frame, [taglineStart, taglineStart + 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ opacity: logoOpacity, position: 'absolute', top: '30%', transform: 'translateY(-50%)' }}>
        <FlowLogo progress={1} height={290} />
      </div>

      <div style={{ position: 'absolute', inset: 0, transform: 'translateY(160px)' }}>
        <DoItButtonHe clickFrame={LOCAL_CLICK_FRAME} durationInFrames={durationInFrames} />
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 220,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          opacity: taglineOpacity,
        }}
      >
        <span style={{ fontFamily: FONT_STACK, fontSize: 34, fontWeight: 700, color: '#FFFFFF', letterSpacing: 1 }}>
          Flow — The Cognitive OS
        </span>
        <span style={{ fontFamily: FONT_STACK_HE, fontSize: 22, fontWeight: 500, color: MUTED, direction: 'rtl' }}>
          בואו נראה לכם את זה על הנתונים שלכם
        </span>
      </div>
    </AbsoluteFill>
  );
};
