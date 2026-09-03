import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_STACK, GRADIENT_AI, VIOLET, BLUE } from '../theme';

const PHRASES = ['Meet your new...', 'Execution layer', 'Cognitive OS'];
const SLOT = 70;

export const KineticText: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {PHRASES.map((phrase, i) => {
        const start = i * SLOT;
        const local = frame - start;
        if (local < -2 || local > SLOT + 2) return null;

        const exitLocal = local - (SLOT - 14);
        const groupExit =
          exitLocal > 0
            ? spring({
                frame: exitLocal,
                fps,
                config: { stiffness: 220, damping: 17, mass: 0.5 },
              })
            : 0;
        const groupScale = 1 + groupExit * 0.35;
        const groupOpacity = Math.max(0, 1 - groupExit);

        const chars = phrase.split('');

        return (
          <div
            key={phrase}
            style={{
              position: 'absolute',
              display: 'flex',
              opacity: groupOpacity,
              transform: `scale(${groupScale})`,
              filter: `drop-shadow(0 0 90px ${VIOLET}55) drop-shadow(0 0 200px ${BLUE}33)`,
            }}
          >
            {chars.map((ch, ci) => {
              const charDelay = ci * 1.4;
              const enter = spring({
                frame: local - charDelay,
                fps,
                config: { stiffness: 220, damping: 15, mass: 0.5 },
              });
              const scale = 0.3 + enter * 0.7;
              const rotate = (1 - enter) * (ci % 2 === 0 ? -14 : 14);
              const y = (1 - enter) * 40;

              return (
                <span
                  key={ci}
                  style={{
                    display: 'inline-block',
                    fontFamily: FONT_STACK,
                    fontSize: 340,
                    fontWeight: 900,
                    letterSpacing: -14,
                    backgroundImage: GRADIENT_AI,
                    backgroundSize: '200% 100%',
                    backgroundPosition: `${(ci / Math.max(1, chars.length - 1)) * 100}% 50%`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                    whiteSpace: 'pre',
                    opacity: enter,
                    transform: `translateY(${y}px) scale(${scale}) rotate(${rotate}deg)`,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
