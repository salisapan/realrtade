import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { spaceGrotesk } from "../fonts";

export const DoItButton: React.FC<{ scale?: number }> = ({ scale = 1 }) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(frame % 90, [0, 45, 90], [0.35, 0.8, 0.35]);

  return (
    <div
      style={{
        position: "relative",
        scale,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: "#4285F4",
          opacity: pulse * 0.4,
          filter: "blur(55px)",
        }}
      />
      <div
        style={{
          position: "relative",
          padding: "26px 64px",
          borderRadius: 999,
          background: "linear-gradient(135deg, #4285F4, #6EA0FF)",
          boxShadow: `0 0 ${40 + pulse * 40}px rgba(66,133,244,${(0.35 + pulse * 0.3).toFixed(2)}), 0 20px 45px -15px rgba(0,0,0,0.6)`,
          border: "1px solid rgba(255,255,255,0.35)",
          color: "#ffffff",
          fontFamily: spaceGrotesk,
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        Do It
      </div>
    </div>
  );
};
