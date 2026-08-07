import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { LIGHT } from "./theme";

/**
 * 3D-mountable version of the site's `.beam-wrap` animated border ring
 * (flow-landing/index.html) — same conic-gradient comet recipe, driven by a
 * frame-based angle instead of the site's rAF loop (Remotion renders each
 * frame deterministically, so there's no live loop to drive it with).
 * Re-tinted for light mode: the comet fades through accent -> near-black
 * instead of accent -> white-hot (a white-hot core would vanish against a
 * white background), and the halo is a soft shadow-tinted blur rather than glow.
 */
export const BeamRing: React.FC<{
  readonly size: number;
  readonly opacity?: number;
  readonly speedDegPerSec?: number;
  readonly outerStyle?: React.CSSProperties;
}> = ({ size, opacity = 1, speedDegPerSec = 70, outerStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const angle = ((frame / fps) * speedDegPerSec) % 360;

  const gradient = `conic-gradient(from ${angle}deg,
    transparent 0deg,
    color-mix(in srgb, ${LIGHT.accent} 12%, transparent) 26deg,
    color-mix(in srgb, ${LIGHT.accent} 75%, transparent) 52deg,
    color-mix(in srgb, #0A1440 55%, ${LIGHT.accent2}) 60deg,
    #0A1440 64deg,
    color-mix(in srgb, #0A1440 55%, ${LIGHT.accent2}) 68deg,
    transparent 94deg,
    transparent 180deg,
    color-mix(in srgb, ${LIGHT.accent2} 10%, transparent) 206deg,
    color-mix(in srgb, ${LIGHT.accent2} 60%, transparent) 230deg,
    color-mix(in srgb, #0A1440 45%, ${LIGHT.accent2}) 236deg,
    transparent 258deg,
    transparent 360deg)`;

  return (
    <div style={{ position: "absolute", pointerEvents: "none", ...outerStyle }}>
      <div style={{ position: "relative", width: size, height: size, opacity }}>
        {/* soft cast halo */}
        <div
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: "inherit",
            background: gradient,
            filter: "blur(10px)",
            opacity: 0.35,
          }}
        />
        {/* thin ring */}
        <div
          style={{
            position: "absolute",
            inset: -1.5,
            borderRadius: "inherit",
            padding: 1.6,
            background: gradient,
            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
      </div>
    </div>
  );
};
