import React from 'react';
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { BG, GREEN, BLUE, ORANGE, TEXT, MUTED, FONT_STACK } from './theme';
import { FlowMark } from './components/FlowMark';
import { UIChaos } from './components/UIChaos';
import { DoItButton } from './components/DoItButton';
import { Outro } from './components/Outro';

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const drift = interpolate(frame, [0, durationInFrames], [0, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 20% 15%, rgba(255,255,255,0.05), transparent 60%)',
        }}
      />
      <AbsoluteFill
        style={{
          transform: `translate(${drift * 60}px, ${drift * -40}px)`,
          background:
            `radial-gradient(600px circle at 22% 30%, ${BLUE}33, transparent 65%),` +
            `radial-gradient(700px circle at 78% 68%, ${GREEN}2b, transparent 65%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '120px 120px',
          maskImage:
            'radial-gradient(ellipse at center, black 0%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 0%, transparent 75%)',
        }}
      />
    </AbsoluteFill>
  );
};

const Logo: React.FC<{ from: number; durationInFrames: number }> = ({ from, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;
  const exitStart = durationInFrames - 25;

  const scale = spring({
    frame: local,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });
  const entranceOpacity = interpolate(local, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity: entranceOpacity * exitOpacity,
        transform: `scale(${scale})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
        <FlowMark size={140} />
        <span
          style={{
            fontFamily: FONT_STACK,
            fontSize: 140,
            fontWeight: 700,
            color: TEXT,
            letterSpacing: -4,
          }}
        >
          Flow
        </span>
      </div>
    </AbsoluteFill>
  );
};

const Tagline: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitStart = durationInFrames - 30;

  const words = ['Cognitive', 'Workflow', 'Engine'];

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const subY = spring({ frame: frame - 30, fps, config: { damping: 16 } });
  const subOpacity = interpolate(frame, [30, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: exitOpacity }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36 }}>
        <div style={{ display: 'flex', gap: 28, opacity: titleOpacity }}>
          {words.map((word, i) => {
            const wOpacity = interpolate(
              frame,
              [i * 8, i * 8 + 18],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            );
            const wY = interpolate(
              frame,
              [i * 8, i * 8 + 18],
              [24, 0],
              {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.out(Easing.cubic),
              },
            );
            return (
              <span
                key={word}
                style={{
                  fontFamily: FONT_STACK,
                  fontSize: 96,
                  fontWeight: 600,
                  color: i === 1 ? GREEN : TEXT,
                  opacity: wOpacity,
                  transform: `translateY(${wY}px)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
        <p
          style={{
            fontFamily: FONT_STACK,
            fontSize: 40,
            fontWeight: 400,
            color: MUTED,
            opacity: subOpacity,
            transform: `translateY(${(1 - subY) * 20}px)`,
            margin: 0,
            letterSpacing: 1,
          }}
        >
          A secure, local-first AI workflow engine.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const FEATURES = [
  { label: 'Secure', color: GREEN },
  { label: 'Local-first', color: BLUE },
  { label: 'Runs on-device', color: ORANGE },
];

const Features: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitStart = durationInFrames - 25;
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: exitOpacity }}>
      <div style={{ display: 'flex', gap: 64 }}>
        {FEATURES.map((feature, i) => {
          const delay = i * 12;
          const scale = spring({
            frame: frame - delay,
            fps,
            config: { damping: 13, stiffness: 130, mass: 0.7 },
          });
          const opacity = interpolate(
            frame,
            [delay, delay + 18],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          return (
            <div
              key={feature.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 24,
                opacity,
                transform: `scale(${scale})`,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: feature.color,
                  boxShadow: `0 0 40px ${feature.color}`,
                }}
              />
              <span
                style={{
                  fontFamily: FONT_STACK,
                  fontSize: 44,
                  fontWeight: 500,
                  color: TEXT,
                  letterSpacing: 0.5,
                }}
              >
                {feature.label}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const FlowPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Background />

      <Sequence from={0} durationInFrames={130}>
        <UIChaos durationInFrames={130} />
      </Sequence>

      <Sequence from={100} durationInFrames={150}>
        <DoItButton durationInFrames={150} />
      </Sequence>

      <Sequence from={220} durationInFrames={140}>
        <Logo from={10} durationInFrames={140} />
      </Sequence>

      <Sequence from={340} durationInFrames={140}>
        <Tagline durationInFrames={140} />
      </Sequence>

      <Sequence from={450} durationInFrames={110}>
        <Features durationInFrames={110} />
      </Sequence>

      <Sequence from={520} durationInFrames={80}>
        <Outro durationInFrames={80} />
      </Sequence>
    </AbsoluteFill>
  );
};
