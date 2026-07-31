import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { inter } from "../fonts";

export const Caption: React.FC<{
  children: React.ReactNode;
  from: number;
  to: number;
  fontSize?: number;
}> = ({ children, from, to, fontSize = 42 }) => {
  const frame = useCurrentFrame();
  const inDur = 18;
  const outDur = 18;

  const opacity = interpolate(
    frame,
    [from, from + inDur, to - outDur, to],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );

  const translateY = interpolate(frame, [from, from + inDur], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 90,
        display: "flex",
        justifyContent: "center",
        padding: "0 170px",
        opacity,
        translate: `0 ${translateY}px`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 1520,
          textAlign: "center",
          fontFamily: inter,
          fontSize,
          lineHeight: 1.4,
          fontWeight: 500,
          color: "#f1f5f9",
          textShadow: "0 4px 24px rgba(0,0,0,0.7)",
        }}
      >
        {children}
      </div>
    </div>
  );
};
