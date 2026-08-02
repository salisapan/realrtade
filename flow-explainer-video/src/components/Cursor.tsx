import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

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
