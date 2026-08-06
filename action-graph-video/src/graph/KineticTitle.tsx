import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/** Staggers each character in from below on entry — same feel as the site's hero kinetic text. */
export const KineticTitle: React.FC<{
  readonly text: string;
  readonly startSec: number;
  readonly style?: React.CSSProperties;
}> = ({ text, startSec, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - startSec;

  return (
    <span style={{ display: "inline-block", ...style }}>
      {text.split("").map((ch, i) => {
        const charDelay = i * 0.02;
        const p = interpolate(t - charDelay, [0, 0.4], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              transform: `translateY(${(1 - p) * 22}px)`,
              whiteSpace: ch === " " ? "pre" : "normal",
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
};

/** A text/graphic "beat" that fades/slides in at `start`, holds, then fades out before `end`. */
export const Beat: React.FC<{
  readonly start: number;
  readonly end: number;
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}> = ({ start, end, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const fadeIn = interpolate(t, [start, start + 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(t, [end - 0.5, end], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut);
  if (t < start - 0.05 || t > end + 0.05) return null;
  return (
    <div style={{ opacity, transform: `translateY(${(1 - fadeIn) * 18}px)`, ...style }}>
      {children}
    </div>
  );
};

export const FadeUp: React.FC<{
  readonly startSec: number;
  readonly durSec?: number;
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}> = ({ startSec, durSec = 0.6, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - startSec;
  const p = interpolate(t, [0, durSec], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 16}px)`, ...style }}>
      {children}
    </div>
  );
};
