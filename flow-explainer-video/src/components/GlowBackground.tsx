import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export const GlowBackground: React.FC<{ accent?: string }> = ({
  accent = "#4285F4",
}) => {
  const frame = useCurrentFrame();
  const cycle = (frame % 300) / 300;
  const sweep = (frame % 480) / 480;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(160deg, #0a0e1a 0%, #0f1830 55%, #0a0e1a 100%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -220,
          left: -160,
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: accent,
          opacity: interpolate(
            Math.sin(cycle * Math.PI * 2),
            [-1, 1],
            [0.05, 0.14],
          ),
          filter: "blur(180px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -260,
          right: -180,
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: accent,
          opacity: interpolate(
            Math.sin(cycle * Math.PI * 2 + Math.PI),
            [-1, 1],
            [0.04, 0.1],
          ),
          filter: "blur(200px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse at center, black 0%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 0%, transparent 75%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: `${interpolate(sweep, [0, 1], [-30, 130])}%`,
          width: "22%",
          height: "100%",
          background:
            "linear-gradient(100deg, transparent, rgba(110,160,255,0.05), transparent)",
          rotate: "-8deg",
        }}
      />
      {[
        { top: 48, left: 48, rot: 0 },
        { top: 48, right: 48, rot: 90 },
        { bottom: 48, left: 48, rot: -90 },
        { bottom: 48, right: 48, rot: 180 },
      ].map((corner, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: corner.top,
            left: corner.left,
            right: corner.right,
            bottom: corner.bottom,
            width: 46,
            height: 46,
            rotate: `${corner.rot}deg`,
            opacity: 0.5,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: 2,
              background: accent,
              boxShadow: `0 0 8px ${accent}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 2,
              height: "100%",
              background: accent,
              boxShadow: `0 0 8px ${accent}`,
            }}
          />
        </div>
      ))}
    </div>
  );
};
