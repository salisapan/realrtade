import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, LIGHT } from "./theme";

/**
 * Act 2a "cognitive trigger": a thin accent scan-line sweeps down the full
 * frame. Plain 2D overlay (not drei Html) — simpler and avoids relying on
 * drei's CSS-pixel-to-3D-unit scaling to line up with the card field below.
 */
export const ScanSweep: React.FC<{
  readonly startSec: number;
  readonly durSec?: number;
}> = ({ startSec, durSec = 1.3 }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps - startSec;

  if (t < -0.05 || t > durSec + 0.3) return null;

  const y = interpolate(t, [0, durSec], [0, height], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(t, [0, 0.08, durSec - 0.15, durSec], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: y,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${LIGHT.accent}, transparent)`,
          boxShadow: `0 0 24px ${LIGHT.glow}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: Math.max(0, y - 70),
          height: 70,
          background: `linear-gradient(180deg, transparent, ${LIGHT.glow})`,
        }}
      />
    </div>
  );
};

/**
 * The three "recognized" tags (Contract·Legal / Invoice·Finance /
 * Test Result·Healthcare) that light up in sequence as the scan crosses each
 * document. Plain 2D row rather than anchored to each card's exact 3D
 * position — reads clearly and sidesteps the same scaling risk as above.
 */
export const RecognitionRow: React.FC<{
  readonly startSec: number;
  readonly stepGapSec?: number;
}> = ({ startSec, stepGapSec = 0.55 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const labels = ["Contract · Legal", "Invoice · Finance", "Test Result · Healthcare"];

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "14%",
        display: "flex",
        justifyContent: "center",
        gap: 14,
        pointerEvents: "none",
      }}
    >
      {labels.map((label, i) => {
        const tagStart = startSec + i * stepGapSec;
        const p = interpolate(t - tagStart, [0, 0.25], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        if (p <= 0.001) return null;
        return (
          <div
            key={label}
            style={{
              opacity: p,
              transform: `translateY(${(1 - p) * 10}px)`,
              fontFamily: FONT.mono,
              fontSize: 13,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: LIGHT.accent2,
              background: "rgba(26,78,245,.06)",
              border: `1px solid ${LIGHT.lineHi}`,
              borderRadius: 999,
              padding: "8px 16px",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
};
