import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// A big dramatic shockwave + light flash for "eureka" click moments.
export const ClickBurst: React.FC<{
  x: number;
  y: number;
  clickFrame?: number;
  color?: string;
}> = ({ x, y, clickFrame, color = "#60a5fa" }) => {
  const frame = useCurrentFrame();

  if (clickFrame === undefined) return null;
  const t = frame - clickFrame;
  if (t < 0 || t > 46) return null;

  const progress = interpolate(t, [0, 46], [0, 1]);
  const ringScale = interpolate(progress, [0, 1], [0.15, 4.2]);
  const ringOpacity = interpolate(progress, [0, 0.12, 1], [0, 0.9, 0]);
  const ring2Scale = interpolate(progress, [0.1, 1], [0.15, 3]);
  const ring2Opacity = interpolate(progress, [0.1, 0.25, 1], [0, 0.7, 0]);
  const flashOpacity = interpolate(t, [0, 4, 16], [0, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: y,
          left: x,
          translate: "-50% -50%",
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: color,
          opacity: flashOpacity * 0.4,
          filter: "blur(70px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: y,
          left: x,
          translate: "-50% -50%",
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `2px solid ${color}`,
          scale: ringScale,
          opacity: ringOpacity,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: y,
          left: x,
          translate: "-50% -50%",
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `1.5px solid ${color}`,
          scale: ring2Scale,
          opacity: ring2Opacity,
          pointerEvents: "none",
        }}
      />
    </>
  );
};

export const Cursor: React.FC<{
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startFrame: number;
  travelFrames: number;
  clickFrame?: number;
}> = ({ fromX, fromY, toX, toY, startFrame, travelFrames, clickFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const travel = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 16, stiffness: 90, mass: 0.8 },
    durationInFrames: travelFrames,
  });

  const x = interpolate(travel, [0, 1], [fromX, toX]);
  const y = interpolate(travel, [0, 1], [fromY, toY]);

  const opacity = interpolate(
    frame,
    [startFrame - 6, startFrame + 4],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const clickPress =
    clickFrame === undefined
      ? 0
      : spring({
          frame: frame - clickFrame,
          fps,
          config: { damping: 10, stiffness: 260, mass: 0.5 },
        });
  const pressScale = interpolate(clickPress, [0, 0.5, 1], [1, 0.82, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ringProgress =
    clickFrame === undefined
      ? 0
      : interpolate(frame - clickFrame, [0, 22], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        translate: `${x}px ${y}px`,
        opacity,
        zIndex: 200,
        pointerEvents: "none",
      }}
    >
      {clickFrame !== undefined ? (
        <div
          style={{
            position: "absolute",
            top: -20 - ringProgress * 14,
            left: -20 - ringProgress * 14,
            width: 40 + ringProgress * 28,
            height: 40 + ringProgress * 28,
            borderRadius: "50%",
            border: "2px solid #60a5fa",
            opacity: interpolate(ringProgress, [0, 0.7, 1], [0.8, 0.3, 0]),
          }}
        />
      ) : null}
      <div style={{ scale: pressScale }}>
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.55))" }}
        >
          <path
            d="M4 2.5 L4 19.5 L8.6 15.4 L11.6 21.5 L14.6 20 L11.6 13.9 L18 13.9 Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};
