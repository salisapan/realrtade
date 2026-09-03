import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { MUTED, FONT_STACK, VIOLET, BLUE } from '../theme';
import { FlowLogo } from './FlowLogo';
import { hasAsset } from './Plate';

const TAGLINE = 'The first cognitive operating system for the AI era.';
const LOGO_FILE = 'flow-logo.png';

const Wordmark: React.FC = () => {
  /* Uses the real logo once it is added to public/; falls back to the drawn
     mark so the composition renders before the asset lands. */
  if (hasAsset(LOGO_FILE)) {
    return (
      <Img
        src={staticFile(LOGO_FILE)}
        style={{
          height: 620,
          objectFit: 'contain',
          filter: `drop-shadow(0 0 120px ${VIOLET}66) drop-shadow(0 0 240px ${BLUE}44) drop-shadow(0 30px 60px rgba(0,0,0,0.6))`,
        }}
      />
    );
  }

  return <FlowLogo height={300} />;
};

export const Outro: React.FC<{ durationInFrames?: number }> = ({ durationInFrames = 100 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { stiffness: 170, damping: 15, mass: 0.7 } });
  const entranceOpacity = interpolate(frame, [0, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const breathe = frame > 50 ? 1 + Math.sin((frame / fps) * 1.6) * 0.012 : 1;

  const fadeOutStart = durationInFrames - 30;
  const fadeOutOpacity = interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const words = TAGLINE.split(' ');

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 44,
          opacity: entranceOpacity * fadeOutOpacity,
          transform: `scale(${(0.6 + scale * 0.4) * breathe})`,
        }}
      >
        <Wordmark />
        <div style={{ display: 'flex', gap: 12 }}>
          {words.map((word, i) => {
            const wordDelay = 26 + i * 2.5;
            const wOpacity = interpolate(frame, [wordDelay, wordDelay + 16], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const wY = spring({ frame: frame - wordDelay, fps, config: { damping: 16 } });

            return (
              <span
                key={i}
                style={{
                  fontFamily: FONT_STACK,
                  fontSize: 52,
                  fontWeight: 500,
                  color: MUTED,
                  opacity: wOpacity,
                  transform: `translateY(${(1 - wY) * 18}px)`,
                  letterSpacing: 0.3,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
