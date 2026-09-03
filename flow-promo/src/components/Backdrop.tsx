import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BG, VIOLET, BLUE, TEAL } from '../theme';

type Blob = { x: number; y: number; size: number; color: string; seed: number; alpha: number };

const BLOBS: Blob[] = [
  { x: 0.22, y: 0.28, size: 2400, color: VIOLET, seed: 1, alpha: 0.4 },
  { x: 0.78, y: 0.24, size: 2200, color: BLUE, seed: 2, alpha: 0.34 },
  { x: 0.62, y: 0.8, size: 2600, color: TEAL, seed: 3, alpha: 0.22 },
  { x: 0.14, y: 0.82, size: 1900, color: BLUE, seed: 4, alpha: 0.24 },
];

/**
 * The atmosphere. Always mounted, so the frame is never empty and every
 * element has light to sit in.
 */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: 'hidden' }}>
      {BLOBS.map((b) => {
        const dx = Math.sin(t * 0.13 + b.seed) * 160;
        const dy = Math.cos(t * 0.1 + b.seed * 1.3) * 130;
        const pulse = 1 + Math.sin(t * 0.22 + b.seed) * 0.06;

        return (
          <div
            key={b.seed}
            style={{
              position: 'absolute',
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: b.size,
              height: b.size,
              marginLeft: -b.size / 2,
              marginTop: -b.size / 2,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${b.color} 0%, transparent 68%)`,
              opacity: b.alpha,
              filter: 'blur(120px)',
              transform: `translate(${dx}px, ${dy}px) scale(${pulse})`,
            }}
          />
        );
      })}

      {/* horizon lift so the lower frame does not go dead flat */}
      <AbsoluteFill
        style={{ background: 'radial-gradient(ellipse 120% 70% at 50% 115%, rgba(124,92,255,0.16), transparent 60%)' }}
      />
      {/* vignette */}
      <AbsoluteFill
        style={{ background: 'radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.55) 100%)' }}
      />
    </AbsoluteFill>
  );
};
