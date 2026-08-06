import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BLUE, GREEN, ORANGE, TEXT, FONT_STACK } from '../theme';

type App = { label: string; color: string; x: number; y: number; seed: number };

const APPS: App[] = [
  { label: 'Email', color: BLUE, x: 0.16, y: 0.24, seed: 1 },
  { label: 'Slack', color: GREEN, x: 0.74, y: 0.16, seed: 2 },
  { label: 'Notion', color: ORANGE, x: 0.28, y: 0.64, seed: 3 },
  { label: 'Jira', color: BLUE, x: 0.82, y: 0.56, seed: 4 },
  { label: 'Calendar', color: GREEN, x: 0.52, y: 0.28, seed: 5 },
  { label: 'Docs', color: ORANGE, x: 0.12, y: 0.72, seed: 6 },
  { label: 'Sheets', color: BLUE, x: 0.6, y: 0.8, seed: 7 },
  { label: 'Zoom', color: GREEN, x: 0.86, y: 0.34, seed: 8 },
];

export const UIChaos: React.FC<{ durationInFrames?: number }> = ({ durationInFrames = 130 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitStart = durationInFrames - 40;

  const messageOpacity = interpolate(
    frame,
    [40, 70, exitStart, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill>
      {APPS.map((app, i) => {
        const enter = spring({
          frame: frame - i * 4,
          fps,
          config: { damping: 11, stiffness: 130, mass: 0.6 },
        });
        const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const jitterX = Math.sin(frame / 9 + app.seed) * 14;
        const jitterY = Math.cos(frame / 11 + app.seed * 1.3) * 14;
        const rotate = Math.sin(frame / 15 + app.seed) * 6;
        const flyX = (1 - exit) * (app.x - 0.5) * 900;
        const flyY = (1 - exit) * (app.y - 0.5) * 900;

        return (
          <div
            key={app.label}
            style={{
              position: 'absolute',
              left: `${app.x * 100}%`,
              top: `${app.y * 100}%`,
              transform: `translate(-50%, -50%) translate(${jitterX + flyX}px, ${jitterY + flyY}px) scale(${enter * exit}) rotate(${rotate}deg)`,
              opacity: enter * exit,
              padding: '28px 44px',
              borderRadius: 24,
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: `2px solid ${app.color}`,
              boxShadow: `0 0 50px ${app.color}44`,
            }}
          >
            <span style={{ fontFamily: FONT_STACK, fontSize: 36, fontWeight: 600, color: TEXT }}>
              {app.label}
            </span>
          </div>
        );
      })}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span
          style={{
            fontFamily: FONT_STACK,
            fontSize: 52,
            fontWeight: 500,
            color: TEXT,
            opacity: messageOpacity,
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          Too many tools.
          <br />
          Too much noise.
        </span>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
