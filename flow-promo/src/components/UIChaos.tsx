import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Trail } from '@remotion/motion-blur';
import { MUTED, FONT_STACK } from '../theme';
import { DocKind, DocumentPage } from './DocumentPage';

type Doc = {
  kind: DocKind;
  x: number;
  y: number;
  depth: number;
  rotate: number;
  seed: number;
  delay: number;
};

/* Deliberately overlapping and crowding the frame — the density is the point.
   `depth` drives scale, blur and opacity so the storm reads three-dimensional. */
const DOCS: Doc[] = [
  { kind: 'outlook', x: 0.27, y: 0.3, depth: 1.12, rotate: -5, seed: 1, delay: 0 },
  { kind: 'word', x: 0.72, y: 0.27, depth: 1.05, rotate: 4, seed: 2, delay: 3 },
  { kind: 'pdf', x: 0.5, y: 0.52, depth: 1.18, rotate: -2, seed: 3, delay: 6 },
  { kind: 'excel', x: 0.79, y: 0.63, depth: 0.98, rotate: 6, seed: 4, delay: 9 },
  { kind: 'imanage', x: 0.22, y: 0.66, depth: 1.02, rotate: 5, seed: 5, delay: 12 },
  { kind: 'crm', x: 0.62, y: 0.78, depth: 0.92, rotate: -6, seed: 6, delay: 15 },
  { kind: 'gmail', x: 0.42, y: 0.16, depth: 0.88, rotate: 3, seed: 7, delay: 18 },
  { kind: 'powerpoint', x: 0.87, y: 0.4, depth: 0.84, rotate: -4, seed: 8, delay: 21 },
  { kind: 'jira', x: 0.13, y: 0.44, depth: 0.86, rotate: 6, seed: 9, delay: 24 },
  { kind: 'adobe', x: 0.36, y: 0.83, depth: 0.8, rotate: 4, seed: 10, delay: 27 },
  { kind: 'notion', x: 0.66, y: 0.44, depth: 0.76, rotate: -7, seed: 11, delay: 30 },
  { kind: 'browser', x: 0.9, y: 0.16, depth: 0.72, rotate: 5, seed: 12, delay: 33 },
  { kind: 'calendar', x: 0.09, y: 0.16, depth: 0.7, rotate: -5, seed: 13, delay: 36 },
  { kind: 'word', x: 0.53, y: 0.34, depth: 0.66, rotate: 8, seed: 14, delay: 39 },
  { kind: 'pdf', x: 0.83, y: 0.85, depth: 0.62, rotate: -8, seed: 15, delay: 42 },
  { kind: 'outlook', x: 0.16, y: 0.87, depth: 0.6, rotate: 7, seed: 16, delay: 45 },
  { kind: 'excel', x: 0.34, y: 0.5, depth: 0.56, rotate: -9, seed: 17, delay: 48 },
  { kind: 'imanage', x: 0.94, y: 0.55, depth: 0.54, rotate: 6, seed: 18, delay: 51 },
  { kind: 'crm', x: 0.05, y: 0.6, depth: 0.52, rotate: -6, seed: 19, delay: 54 },
  { kind: 'powerpoint', x: 0.75, y: 0.06, depth: 0.5, rotate: 9, seed: 20, delay: 57 },
];

/* Far documents render behind near ones. */
const ORDERED = [...DOCS].sort((a, b) => a.depth - b.depth);

const DocsLayer: React.FC<{ collapseStart: number }> = ({ collapseStart }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <>
      {ORDERED.map((doc, i) => {
        const enter = spring({
          frame: frame - doc.delay,
          fps,
          config: { stiffness: 150, damping: 15, mass: 0.7 },
        });

        const t = frame / fps;
        const jitterX = Math.sin(t * 0.9 + doc.seed) * 18 + Math.sin(t * 2.3 + doc.seed * 1.7) * 7;
        const jitterY = Math.cos(t * 0.7 + doc.seed * 1.4) * 18 + Math.cos(t * 1.9 + doc.seed * 2.1) * 7;
        const rotateY = Math.sin(t * 0.5 + doc.seed) * 9;
        const rotateX = Math.cos(t * 0.6 + doc.seed) * 5;
        const breathe = 1 + Math.sin(t * 1.3 + doc.seed * 2) * 0.02;

        const collapseLocal = frame - collapseStart - doc.delay * 0.18;
        const collapse =
          collapseLocal > 0
            ? spring({ frame: collapseLocal, fps, config: { stiffness: 210, damping: 13, mass: 0.4 } })
            : 0;
        const c = Math.min(1, collapse);

        const posX = interpolate(c, [0, 1], [doc.x * 100, 50]);
        const posY = interpolate(c, [0, 1], [doc.y * 100, 50]);
        const scale = enter * breathe * doc.depth * interpolate(c, [0, 1], [1, 0.04]);
        const opacity =
          enter *
          interpolate(doc.depth, [0.5, 1.2], [0.55, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
          interpolate(c, [0, 0.75, 1], [1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const blur = interpolate(doc.depth, [0.5, 1.0], [3.2, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

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

const OverloadCounter: React.FC<{ collapseStart: number }> = ({ collapseStart }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [60, 90, collapseStart - 10, collapseStart + 10],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const tabs = Math.round(
    interpolate(frame, [60, collapseStart], [6, 47], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 96 }}>
      <span
        style={{
          fontFamily: FONT_STACK,
          fontSize: 46,
          fontWeight: 700,
          color: MUTED,
          opacity,
          letterSpacing: 2,
          textShadow: '0 4px 24px rgba(255,255,255,0.95)',
        }}
      >
        {tabs} tabs · 12 tools · 0 done
      </span>
    </AbsoluteFill>
  );
};

export const UIChaos: React.FC<{ collapseStart?: number }> = ({ collapseStart = 200 }) => (
  <AbsoluteFill style={{ perspective: 1800 }}>
    <Trail layers={2} lagInFrames={2} trailOpacity={0.28}>
      <DocsLayer collapseStart={collapseStart} />
    </Trail>
    <OverloadCounter collapseStart={collapseStart} />
  </AbsoluteFill>
);
