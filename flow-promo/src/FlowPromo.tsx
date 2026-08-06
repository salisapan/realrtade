import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';

const BG = '#07090F';
const GREEN = '#22C55E';
const BLUE = '#6E9BFF';
const ORANGE = '#E5642A';
const TEXT = '#FFFFFF';
const MUTED = '#8f9bb4';

const FONT_STACK =
  '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif';

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

const FlowMark: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 0.5, y: 0.08, delay: 0 },
    { x: 0.15, y: 0.42, delay: 6 },
    { x: 0.85, y: 0.42, delay: 12 },
    { x: 0.5, y: 0.92, delay: 18 },
  ];

  const lineOpacity = (delay: number) =>
    interpolate(frame - delay, [10, 26], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <line
        x1={50}
        y1={8}
        x2={15}
        y2={42}
        stroke={BLUE}
        strokeWidth={2}
        opacity={lineOpacity(4)}
      />
      <line
        x1={15}
        y1={42}
        x2={85}
        y2={42}
        stroke={GREEN}
        strokeWidth={2}
        opacity={lineOpacity(10)}
      />
      <line
        x1={85}
        y1={42}
        x2={50}
        y2={92}
        stroke={ORANGE}
        strokeWidth={2}
        opacity={lineOpacity(16)}
      />
      <line
        x1={15}
        y1={42}
        x2={50}
        y2={92}
        stroke={BLUE}
        strokeWidth={2}
        opacity={lineOpacity(20)}
      />
      {nodes.map((node, i) => {
        const scale = spring({
          frame: frame - node.delay,
          fps,
          config: { damping: 12, stiffness: 140, mass: 0.6 },
        });
        return (
          <circle
            key={i}
            cx={node.x * 100}
            cy={node.y * 100}
            r={5 * scale}
            fill={TEXT}
          />
        );
      })}
    </svg>
  );
};

const Logo: React.FC<{ from: number }> = ({ from }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;

  const scale = spring({
    frame: local,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });
  const opacity = interpolate(local, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
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

const Tagline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
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

const Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
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

const ClosingLockup: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 110, mass: 0.8 },
  });
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ctaOpacity = interpolate(frame, [30, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 40,
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <FlowMark size={90} />
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: 92,
              fontWeight: 700,
              color: TEXT,
              letterSpacing: -3,
            }}
          >
            Flow
          </span>
        </div>
        <span
          style={{
            fontFamily: FONT_STACK,
            fontSize: 32,
            fontWeight: 400,
            color: MUTED,
            opacity: ctaOpacity,
            letterSpacing: 1,
          }}
        >
          Cognitive Workflow Engine — coming to your device
        </span>
      </div>
    </AbsoluteFill>
  );
};

const FadeToBlack: React.FC<{ from: number; duration: number }> = ({
  from,
  duration,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [from, from + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: BG, opacity, pointerEvents: 'none' }} />
  );
};

export const FlowPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Background />

      <Sequence from={0} durationInFrames={150}>
        <Logo from={10} />
      </Sequence>

      <Sequence from={130} durationInFrames={170}>
        <Tagline />
      </Sequence>

      <Sequence from={300} durationInFrames={180}>
        <Features />
      </Sequence>

      <Sequence from={470} durationInFrames={130}>
        <ClosingLockup />
      </Sequence>

      <FadeToBlack from={585} duration={15} />
    </AbsoluteFill>
  );
};
