import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { spaceGrotesk } from "../fonts";

// Matches the real product's [Do It] pill: double-ring neon-blue glow with a
// glass highlight arc, dark glass fill.
export const DoItButton: React.FC<{
  scale?: number;
  clickFrame?: number;
  fontSize?: number;
}> = ({ scale = 1, clickFrame, fontSize = 26 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const idleGlow = interpolate(frame % 110, [0, 55, 110], [0.45, 0.9, 0.45]);

  const press =
    clickFrame === undefined
      ? 0
      : spring({
          frame: frame - clickFrame,
          fps,
          config: { damping: 10, stiffness: 220, mass: 0.6 },
        });
  const pressScale = interpolate(press, [0, 0.5, 1], [1, 0.93, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const clickGlow =
    clickFrame === undefined
      ? 0
      : interpolate(frame - clickFrame, [0, 10, 40], [0, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  const glow = Math.max(idleGlow, clickGlow);
  const padY = fontSize * 0.5;
  const padX = fontSize * 1.3;

  return (
    <div
      style={{
        position: "relative",
        scale: scale * pressScale,
        display: "inline-flex",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -34,
          borderRadius: 999,
          background: "#3b82f6",
          opacity: glow * 0.4,
          filter: "blur(30px)",
        }}
      />
      <div
        style={{
          position: "relative",
          padding: 3,
          borderRadius: 999,
          background: `rgba(96,165,250,${(0.35 + glow * 0.35).toFixed(2)})`,
          boxShadow: `0 0 ${18 + glow * 28}px rgba(59,130,246,${(0.4 + glow * 0.4).toFixed(2)})`,
        }}
      >
        <div
          style={{
            position: "relative",
            borderRadius: 999,
            padding: `${padY}px ${padX}px`,
            background:
              "linear-gradient(180deg, rgba(15,23,42,0.9), rgba(4,8,18,0.92))",
            border: `1.5px solid rgba(147,197,253,${(0.75 + glow * 0.25).toFixed(2)})`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "55%",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.24), transparent)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "relative",
              color: "#e0edff",
              fontFamily: spaceGrotesk,
              fontSize,
              fontWeight: 700,
              letterSpacing: 1,
              whiteSpace: "nowrap",
              textShadow: "0 0 14px rgba(147,197,253,0.6)",
            }}
          >
            [Do It]
          </div>
        </div>
      </div>
    </div>
  );
};
