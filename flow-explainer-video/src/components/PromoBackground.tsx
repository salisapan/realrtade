import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

// Clean, minimalist backdrop for the promo teaser — deliberately lighter
// than GlowBackground (no HUD grid/corners/neural-network); just a soft
// gradient and two slow, large ambient blooms.
export const PromoBackground: React.FC<{
  accentA?: string;
  accentB?: string;
}> = ({ accentA = "#4285F4", accentB = "#a78bfa" }) => {
  const frame = useCurrentFrame();
  const cycle = (frame % 400) / 400;
  const driftX = Math.sin(frame * 0.006) * 60;
  const driftY = Math.cos(frame * 0.005) * 40;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(150deg, #0b0f1a 0%, #10162a 60%, #0b0f1a 100%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -260,
          left: -200,
          width: 1000,
          height: 1000,
          borderRadius: "50%",
          background: accentA,
          translate: `${driftX}px ${driftY}px`,
          opacity: interpolate(
            Math.sin(cycle * Math.PI * 2),
            [-1, 1],
            [0.08, 0.18],
          ),
          filter: "blur(220px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -300,
          right: -220,
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: accentB,
          translate: `${-driftX}px ${-driftY}px`,
          opacity: interpolate(
            Math.sin(cycle * Math.PI * 2 + Math.PI),
            [-1, 1],
            [0.06, 0.15],
          ),
          filter: "blur(240px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 45%, transparent 0%, rgba(11,15,26,0.5) 75%)",
        }}
      />
    </div>
  );
};
