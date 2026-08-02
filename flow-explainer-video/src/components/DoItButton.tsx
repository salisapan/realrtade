import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { spaceGrotesk } from "../fonts";

// Matches the real product's [Do It] pill: dark glass, neon-blue outline glow.
export const DoItButton: React.FC<{
  scale?: number;
  clickFrame?: number;
  fontSize?: number;
}> = ({ scale = 1, clickFrame, fontSize = 26 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const idleGlow = interpolate(frame % 110, [0, 55, 110], [0.4, 0.85, 0.4]);

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
          inset: -30,
          borderRadius: 999,
          background: "#3b82f6",
          opacity: glow * 0.35,
          filter: "blur(28px)",
        }}
      />
      <div
        style={{
          position: "relative",
          padding: `${fontSize * 0.5}px ${fontSize * 1.3}px`,
          borderRadius: 999,
          background: "rgba(8,14,28,0.78)",
          backdropFilter: "blur(6px)",
          border: `1.5px solid rgba(96,165,250,${0.7 + glow * 0.3})`,
          boxShadow: `0 0 ${16 + glow * 26}px rgba(59,130,246,${(0.35 + glow * 0.4).toFixed(2)}), inset 0 0 18px rgba(59,130,246,0.18)`,
          color: "#bfdbfe",
          fontFamily: spaceGrotesk,
          fontSize,
          fontWeight: 600,
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        [Do It]
      </div>
    </div>
  );
};
