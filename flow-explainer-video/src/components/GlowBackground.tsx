import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

const NODES: [number, number][] = [
  [120, 140],
  [380, 90],
  [640, 220],
  [900, 60],
  [1180, 180],
  [1450, 100],
  [1720, 230],
  [150, 860],
  [420, 940],
  [700, 820],
  [980, 960],
  [1260, 840],
  [1540, 920],
  [1800, 780],
];

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [12, 13],
  [0, 7],
  [2, 9],
  [4, 11],
  [6, 13],
  [1, 8],
  [5, 12],
];

// Reusable animated node-link "neural network" motif. Used as the ambient
// background layer, and reused denser/clipped inside the Scene 4 core.
export const NeuralField: React.FC<{
  accent?: string;
  opacity?: number;
  nodeRadius?: number;
}> = ({ accent = "#6EA0FF", opacity = 1, nodeRadius = 3 }) => {
  const frame = useCurrentFrame();

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity,
      }}
      viewBox="0 0 1920 1080"
      preserveAspectRatio="none"
    >
      {EDGES.map(([a, b], i) => {
        const [ax, ay] = NODES[a];
        const [bx, by] = NODES[b];
        const pulse = interpolate(
          Math.sin(frame * 0.05 - i * 0.6),
          [-1, 1],
          [0.05, 0.28],
        );
        return (
          <line
            key={i}
            x1={ax}
            y1={ay}
            x2={bx}
            y2={by}
            stroke={accent}
            strokeWidth={1}
            opacity={pulse}
          />
        );
      })}
      {NODES.map(([x, y], i) => {
        const dx = Math.sin(frame * 0.02 + i) * 8;
        const dy = Math.cos(frame * 0.017 + i * 2) * 8;
        return (
          <circle
            key={i}
            cx={x + dx}
            cy={y + dy}
            r={nodeRadius}
            fill={accent}
            opacity={0.5}
          />
        );
      })}
    </svg>
  );
};

export const GlowBackground: React.FC<{ accent?: string }> = ({
  accent = "#4285F4",
}) => {
  const frame = useCurrentFrame();
  const cycle = (frame % 300) / 300;
  const sweep = (frame % 480) / 480;
  const driftX = Math.sin(frame * 0.008) * 40;
  const driftY = Math.cos(frame * 0.006) * 26;
  const gridDrift = (frame * 0.35) % 64;
  const breathe = 1 + Math.sin(frame * 0.011) * 0.012;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        scale: breathe,
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
          translate: `${driftX}px ${driftY}px`,
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
          translate: `${-driftX}px ${-driftY}px`,
          opacity: interpolate(
            Math.sin(cycle * Math.PI * 2 + Math.PI),
            [-1, 1],
            [0.04, 0.1],
          ),
          filter: "blur(200px)",
        }}
      />
      <NeuralField accent="#6EA0FF" opacity={0.55} />
      <div
        style={{
          position: "absolute",
          inset: -64,
          translate: `${gridDrift}px ${gridDrift}px`,
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
