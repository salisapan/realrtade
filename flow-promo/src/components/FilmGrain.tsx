import React from 'react';
import { AbsoluteFill } from 'remotion';

export const FilmGrain: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.05) 100%)',
      }}
    />
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.035 }}>
      <filter id="filmGrain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#filmGrain)" />
    </svg>
  </AbsoluteFill>
);
