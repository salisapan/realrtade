import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, LIGHT } from "./theme";

/**
 * Recreation of the live site's `.doit` button (flow-landing/index.html) —
 * same three-layer structure (glass shell, glowing ring, diagonal shine sweep),
 * light-mode token values. `clickFrame` (absolute composition frame, or null
 * before the click happens) drives the ring-flash + shine-sweep + press-dip.
 */
export const DoItButton: React.FC<{
  readonly scale?: number;
  readonly clickFrame?: number | null;
  readonly label?: string;
  readonly outerStyle?: React.CSSProperties;
}> = ({ scale = 1, clickFrame = null, label = "[Do It]", outerStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sinceClick = clickFrame == null ? null : (frame - clickFrame) / fps;
  const clicked = sinceClick != null && sinceClick >= 0;

  // idle "breathe" glow pulse — matches the site's 3.6s ease-in-out infinite keyframe
  const breathe = 0.5 + 0.5 * Math.sin((frame / fps / 3.6) * Math.PI * 2);

  // press dip: quick scale-down-and-rebound right at the click frame
  const press = clicked
    ? interpolate(sinceClick as number, [0, 0.08, 0.22], [1, 0.94, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  // shine sweep: 0.85s diagonal highlight, matches the site's hover-sweep timing
  const sweepX = clicked
    ? interpolate(sinceClick as number, [0, 0.85], [-130, 130], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : -130;
  const sweepOpacity = clicked
    ? interpolate(sinceClick as number, [0, 0.1, 0.85], [0, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  const ringGlow = clicked
    ? interpolate(sinceClick as number, [0, 0.12, 0.6], [breathe, 1, breathe], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : breathe;

  return (
    <div style={{ position: "absolute", pointerEvents: "none", ...outerStyle }}>
      <div
        style={{
          transform: `scale(${scale * press})`,
          position: "relative",
          borderRadius: 999,
          padding: "18px 40px",
          fontFamily: FONT.disp,
          fontWeight: 700,
          fontSize: 22,
          color: LIGHT.doitText,
          isolation: "isolate",
        }}
      >
        {/* shell — glass fill */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            background: `linear-gradient(180deg, rgba(255,255,255,.97) 0%, transparent 24%), linear-gradient(180deg, rgba(255,255,255,.97), rgba(219,230,250,.72))`,
            border: "1px solid rgba(40,70,150,.3)",
            boxShadow: `inset 0 1.5px 0 rgba(255,255,255,.95), 0 16px 46px -10px ${LIGHT.glow}`,
          }}
        />
        {/* ring — glowing outline */}
        <div
          style={{
            position: "absolute",
            inset: 6,
            borderRadius: 999,
            border: `2px solid ${LIGHT.ring}`,
            boxShadow: `0 0 ${8 + ringGlow * 10}px ${LIGHT.glow}, inset 0 0 ${
              4 + ringGlow * 8
            }px ${LIGHT.glow}`,
            opacity: 0.5 + ringGlow * 0.5,
          }}
        />
        {/* shine sweep */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            overflow: "hidden",
            opacity: sweepOpacity,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${sweepX}%`,
              width: "40%",
              background:
                "linear-gradient(105deg, transparent, rgba(255,255,255,.7), transparent)",
              transform: "skewX(-18deg)",
            }}
          />
        </div>
        <span style={{ position: "relative", whiteSpace: "nowrap" }}>{label}</span>
      </div>
    </div>
  );
};
