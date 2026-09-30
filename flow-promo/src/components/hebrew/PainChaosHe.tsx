import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Trail } from '@remotion/motion-blur';
import { BLUE, FONT_STACK_HE, VIOLET } from '../../theme';
import { DocKind, DocumentPage } from '../DocumentPage';

type Doc = { kind: DocKind; x: number; y: number; depth: number; rotate: number; seed: number; delay: number };

const DOCS: Doc[] = [
  { kind: 'outlook', x: 0.28, y: 0.29, depth: 1.14, rotate: -5, seed: 1, delay: 0 },
  { kind: 'excel', x: 0.73, y: 0.26, depth: 1.06, rotate: 4, seed: 2, delay: 6 },
  { kind: 'gov', x: 0.5, y: 0.53, depth: 1.2, rotate: -2, seed: 3, delay: 12 },
  { kind: 'salesforce', x: 0.79, y: 0.65, depth: 1.0, rotate: 6, seed: 4, delay: 18 },
  { kind: 'insurer', x: 0.21, y: 0.67, depth: 1.04, rotate: 5, seed: 5, delay: 24 },
  { kind: 'slack', x: 0.63, y: 0.8, depth: 0.94, rotate: -6, seed: 6, delay: 30 },
  { kind: 'calendar', x: 0.43, y: 0.14, depth: 0.9, rotate: 3, seed: 7, delay: 36 },
  { kind: 'outlook', x: 0.88, y: 0.4, depth: 0.86, rotate: -4, seed: 8, delay: 42 },
  { kind: 'gov', x: 0.12, y: 0.42, depth: 0.88, rotate: 6, seed: 9, delay: 48 },
  { kind: 'salesforce', x: 0.34, y: 0.85, depth: 0.82, rotate: 4, seed: 10, delay: 54 },
];

const ORDERED = [...DOCS].sort((a, b) => a.depth - b.depth);

const DocsLayer: React.FC<{ collapseStart: number }> = ({ collapseStart }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <>
      {ORDERED.map((doc, i) => {
        const enter = spring({ frame: frame - doc.delay, fps, config: { stiffness: 150, damping: 15, mass: 0.7 } });

        const t = frame / fps;
        const jitterX = Math.sin(t * 0.9 + doc.seed) * 18 + Math.sin(t * 2.3 + doc.seed * 1.7) * 7;
        const jitterY = Math.cos(t * 0.7 + doc.seed * 1.4) * 18 + Math.cos(t * 1.9 + doc.seed * 2.1) * 7;
        const rotateY = Math.sin(t * 0.5 + doc.seed) * 9;
        const rotateX = Math.cos(t * 0.6 + doc.seed) * 5;
        const breathe = 1 + Math.sin(t * 1.3 + doc.seed * 2) * 0.02;

        const collapseLocal = frame - collapseStart - doc.delay * 0.18;
        const collapse = collapseLocal > 0 ? spring({ frame: collapseLocal, fps, config: { stiffness: 210, damping: 13, mass: 0.4 } }) : 0;
        const c = Math.min(1, collapse);

        const posX = interpolate(c, [0, 1], [doc.x * 100, 50]);
        const posY = interpolate(c, [0, 1], [doc.y * 100, 50]);
        const scale = enter * breathe * doc.depth * interpolate(c, [0, 1], [1, 0.04]);
        const opacity =
          enter *
          interpolate(doc.depth, [0.62, 1.2], [0.72, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
          interpolate(c, [0, 0.75, 1], [1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const blur = interpolate(doc.depth, [0.62, 1.0], [2.2, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

        return (
          <div
            key={`${doc.kind}-${i}`}
            style={{
              position: 'absolute',
              left: `${posX}%`,
              top: `${posY}%`,
              opacity,
              filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
              transform:
                `translate(-50%, -50%) translate(${jitterX * (1 - c)}px, ${jitterY * (1 - c)}px) ` +
                `rotateX(${rotateX * (1 - c)}deg) rotateY(${rotateY * (1 - c)}deg) ` +
                `rotate(${doc.rotate * (1 - c)}deg) scale(${scale})`,
            }}
          >
            <DocumentPage kind={doc.kind} />
          </div>
        );
      })}
    </>
  );
};

const StatCaptions: React.FC<{ collapseStart: number }> = ({ collapseStart }) => {
  const frame = useCurrentFrame();

  const stat1 = interpolate(frame, [60, 90, 220, 250], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const stat2 = interpolate(frame, [260, 290, collapseStart - 30, collapseStart], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 130 }}>
      <div style={{ position: 'absolute', opacity: stat1, fontFamily: FONT_STACK_HE, fontSize: 68, fontWeight: 800, color: '#FFFFFF', direction: 'rtl', textShadow: '0 4px 30px rgba(0,0,0,0.8)' }}>
        339 שעות ברבעון
      </div>
      <div style={{ position: 'absolute', opacity: stat2, fontFamily: FONT_STACK_HE, fontSize: 68, fontWeight: 800, color: '#FFFFFF', direction: 'rtl', textShadow: '0 4px 30px rgba(0,0,0,0.8)' }}>
        53% מהזמן — על עבודה חוזרת
      </div>
    </AbsoluteFill>
  );
};

const CompilerCore: React.FC<{ collapseStart: number }> = ({ collapseStart }) => {
  const frame = useCurrentFrame();
  const local = frame - collapseStart;
  if (local < 0) return null;

  const grow = interpolate(local, [0, 34], [0.1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = interpolate(local, [0, 26, 60, 110], [0, 1, 0.85, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: `radial-gradient(circle, #FFFFFF 0%, ${BLUE}CC 18%, ${VIOLET}66 42%, transparent 68%)`,
          transform: `scale(${grow})`,
          opacity,
          filter: 'blur(20px)',
        }}
      />
    </AbsoluteFill>
  );
};

export const PainChaosHe: React.FC<{ collapseStart?: number }> = ({ collapseStart = 600 }) => (
  <AbsoluteFill style={{ perspective: 1800 }}>
    <Trail layers={2} lagInFrames={2} trailOpacity={0.28}>
      <DocsLayer collapseStart={collapseStart} />
    </Trail>
    <CompilerCore collapseStart={collapseStart} />
    <StatCaptions collapseStart={collapseStart} />
  </AbsoluteFill>
);
