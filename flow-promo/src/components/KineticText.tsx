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

        const enter = spring({
          frame: local,
          fps,
          config: { stiffness: 200, damping: 14, mass: 0.6 },
        });

        const exitLocal = local - (SLOT - 9);
        const exit =
          exitLocal > 0
            ? spring({
                frame: exitLocal,
                fps,
                config: { stiffness: 220, damping: 17, mass: 0.5 },
              })
            : 0;

        const scale = 0.4 + enter * 0.6 + exit * 0.35;
        const rotate = (1 - enter) * -9 + exit * 6;
        const opacity = Math.max(0, Math.min(enter, 1 - exit));

        return (
          <div
            key={phrase}
            style={{
              position: 'absolute',
              opacity,
              transform: `scale(${scale}) rotate(${rotate}deg)`,
            }}
          >
            <span
              style={{
                fontFamily: FONT_STACK,
                fontSize: 132,
                fontWeight: 800,
                color: TEXT,
                letterSpacing: -4,
                whiteSpace: 'nowrap',
              }}
            >
              {phrase}
            </span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
