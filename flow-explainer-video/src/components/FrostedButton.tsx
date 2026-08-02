import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { spaceGrotesk } from "../fonts";

// Glassmorphic [Do It] variant for the promo teaser: frosted, translucent,
// lit from behind — distinct from the dark-neon brand DoItButton.
export const FrostedButton: React.FC<{
  scale?: number;
  clickFrame?: number;
  fontSize?: number;
}> = ({ scale = 1, clickFrame, fontSize = 32 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const idleGlow = interpolate(frame % 120, [0, 60, 120], [0.55, 1, 0.55]);

  const press =
    clickFrame === undefined
      ? 0
      : spring({
          frame: frame - clickFrame,
          fps,
          config: { damping: 10, stiffness: 220, mass: 0.6 },
        });
  const pressScale = interpolate(press, [0, 0.5, 1], [1, 0.92, 1], {
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
          inset: -60,
          borderRadius: 999,
          background:
            "radial-gradient(circle, rgba(147,197,253,0.55), rgba(196,181,253,0.28) 50%, transparent 75%)",
          opacity: glow * 0.75,
          filter: "blur(24px)",
        }}
      />
      <div
        style={{
          position: "relative",
          padding: `${fontSize * 0.55}px ${fontSize * 1.5}px`,
          borderRadius: 999,
          overflow: "hidden",
          background: "rgba(255,255,255,0.12)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          border: "1.5px solid rgba(255,255,255,0.4)",
          boxShadow: `0 8px 36px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.45), 0 0 ${40 + glow * 34}px rgba(147,197,253,0.4)`,
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
              "linear-gradient(180deg, rgba(255,255,255,0.4), transparent)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            color: "#ffffff",
            fontFamily: spaceGrotesk,
            fontSize,
            fontWeight: 700,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            textShadow: "0 1px 4px rgba(0,0,0,0.35)",
          }}
        >
          [Do It]
        </div>
      </div>
    </div>
  );
};
