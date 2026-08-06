import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TEXT, FONT_STACK } from '../theme';

const PHRASES = ['Meet your new...', 'Execution layer', 'Cognitive OS'];
const SLOT = 30;

export const KineticText: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {PHRASES.map((phrase, i) => {
        const start = i * SLOT;
        const local = frame - start;
        if (local < -2 || local > SLOT + 2) return null;

        const exitLocal = local - (SLOT - 9);
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
                    fontSize: 132,
                    fontWeight: 800,
                    color: TEXT,
                    letterSpacing: -4,
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
