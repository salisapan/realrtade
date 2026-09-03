import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GLASS_BG, GLASS_BORDER, MUTED, SHADOW_LG, SUCCESS, TEXT, FONT_STACK } from '../theme';
import { BrandIcon, BrandKey } from './BrandIcon';

type Result = { brand: BrandKey; done: string };

const RESULTS: Result[] = [
  { brand: 'gmail', done: '24 emails answered' },
  { brand: 'hubspot', done: 'CRM updated' },
  { brand: 'jira', done: '8 tickets closed' },
  { brand: 'calendar', done: 'Day cleared' },
  { brand: 'notion', done: 'Docs summarized' },
  { brand: 'zoom', done: '3 calls booked' },
];

const Check: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const draw = interpolate(frame - delay, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <svg width={44} height={44} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <circle cx={12} cy={12} r={11} fill={SUCCESS} opacity={draw} />
      <path
        d="M6.5 12.5 L10.5 16.5 L17.5 8.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />
    </svg>
  );
};

const ResultCard: React.FC<{ result: Result; index: number }> = ({ result, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = index * 10;

  const enter = spring({
    frame: frame - delay,
    fps,
    config: { stiffness: 180, damping: 15, mass: 0.6 },
  });
  const opacity = interpolate(frame - delay, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        width: 620,
        borderRadius: 28,
        backgroundColor: GLASS_BG,
        border: `1px solid ${GLASS_BORDER}`,
        boxShadow: SHADOW_LG,
        backdropFilter: 'blur(20px)',
        padding: '32px 38px',
        display: 'flex',
        alignItems: 'center',
        gap: 26,
        opacity,
        transform: `scale(${enter}) translateY(${(1 - enter) * 40}px)`,
      }}
    >
      <BrandIcon brand={result.brand} size={52} />
      <span
        style={{
          fontFamily: FONT_STACK,
          fontSize: 30,
          fontWeight: 600,
          color: TEXT,
          flex: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {result.done}
      </span>
      <Check delay={delay + 10} />
    </div>
  );
};

export const ResultDeck: React.FC<{ durationInFrames?: number }> = ({ durationInFrames = 240 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineDelay = 150;
  const headline = spring({
    frame: frame - headlineDelay,
    fps,
    config: { stiffness: 170, damping: 14, mass: 0.7 },
  });
  const headlineOpacity = interpolate(frame - headlineDelay, [0, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const exitOpacity = interpolate(frame, [durationInFrames - 30, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const deckLift = interpolate(frame, [headlineDelay, headlineDelay + 30], [0, -70], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: exitOpacity }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 54 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, auto)',
            gap: 28,
            transform: `translateY(${deckLift}px)`,
          }}
        >
          {RESULTS.map((result, i) => (
            <ResultCard key={result.brand} result={result} index={i} />
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 20,
            opacity: headlineOpacity,
            transform: `translateY(${deckLift}px) scale(${0.8 + headline * 0.2})`,
          }}
        >
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: 104,
              fontWeight: 800,
              color: TEXT,
              letterSpacing: -3,
            }}
          >
            3h 40m saved.
          </span>
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: 104,
              fontWeight: 800,
              color: MUTED,
              letterSpacing: -3,
            }}
          >
            Today.
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
