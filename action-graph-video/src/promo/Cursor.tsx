import React from "react";
import { LIGHT } from "./theme";

/**
 * Minimal glowing cursor — a soft accent-tinted point with a thin ring, not a
 * literal OS pointer icon. Position/opacity/scale are all driven by the
 * caller (spring-computed per-frame in PromoScene) — this component is pure
 * paint, no internal frame access, so it can't drift out of sync or flicker.
 */
export const Cursor: React.FC<{
  readonly opacity?: number;
  readonly scale?: number;
  readonly outerStyle?: React.CSSProperties;
}> = ({ opacity = 1, scale = 1, outerStyle }) => {
  return (
    <div style={{ position: "absolute", pointerEvents: "none", ...outerStyle }}>
      <div
        style={{
          position: "relative",
          width: 28,
          height: 28,
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `1.5px solid ${LIGHT.accent}`,
            boxShadow: `0 0 14px ${LIGHT.glow}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 9,
            borderRadius: "50%",
            background: LIGHT.accent,
          }}
        />
      </div>
    </div>
  );
};
