import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { inter } from "../fonts";

export type KineticToken =
  | { text: string; emphasis?: boolean }
  | { node: React.ReactNode };

const SPRING_CONFIG = { damping: 12, stiffness: 150, mass: 0.8 };

// Splits a sentence into word tokens, marking any word containing one of the
// given (case-insensitive) substrings as an emphasis token.
export const words = (
  sentence: string,
  emphasisPhrases: string[] = [],
): KineticToken[] =>
  sentence.split(" ").map((text) => ({
    text,
    emphasis: emphasisPhrases.some((p) =>
      text.toLowerCase().includes(p.toLowerCase()),
    ),
  }));

export const node = (n: React.ReactNode): KineticToken => ({ node: n });

const VARIANTS = ["rise", "drop", "zoom", "slideLeft", "slideRight", "pop"] as const;
type Variant = (typeof VARIANTS)[number];

const wordMotion = (variant: Variant, enter: number) => {
  switch (variant) {
    case "rise":
      return {
        x: 0,
        y: interpolate(enter, [0, 1], [30, 0]),
        scale: interpolate(enter, [0, 1], [0.82, 1]),
        rotate: 0,
      };
    case "drop":
      return {
        x: 0,
        y: interpolate(enter, [0, 1], [-36, 0]),
        scale: interpolate(enter, [0, 1], [1.22, 1]),
        rotate: 0,
      };
    case "zoom":
      return {
        x: 0,
        y: 0,
        scale: interpolate(enter, [0, 1], [2.6, 1]),
        rotate: 0,
      };
    case "slideLeft":
      return {
        x: interpolate(enter, [0, 1], [52, 0]),
        y: 0,
        scale: interpolate(enter, [0, 1], [0.9, 1]),
        rotate: 0,
      };
    case "slideRight":
      return {
        x: interpolate(enter, [0, 1], [-52, 0]),
        y: 0,
        scale: interpolate(enter, [0, 1], [0.9, 1]),
        rotate: 0,
      };
    case "pop":
      return {
        x: 0,
        y: 0,
        scale: interpolate(enter, [0, 1], [0, 1]),
        rotate: interpolate(enter, [0, 1], [-12, 0]),
      };
  }
};

export const KineticText: React.FC<{
  tokens: KineticToken[];
  from: number;
  to?: number;
  stagger?: number;
  fontSize?: number;
  fontWeight?: number;
  align?: "center" | "left";
  lineHeight?: number;
  maxWidth?: number;
  style?: React.CSSProperties;
}> = ({
  tokens,
  from,
  to,
  stagger = 4,
  fontSize = 46,
  fontWeight = 600,
  align = "center",
  lineHeight = 1.25,
  maxWidth,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const exitProgress =
    to === undefined
      ? 0
      : interpolate(frame, [to - 14, to], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        alignItems: "baseline",
        gap: "0.3em",
        maxWidth,
        fontFamily: inter,
        fontSize,
        fontWeight,
        lineHeight,
        textAlign: align,
        ...style,
      }}
    >
      {tokens.map((token, i) => {
        const enter = spring({
          frame: frame - from - i * stagger,
          fps,
          config: SPRING_CONFIG,
        });
        const clampedEnter = Math.min(Math.max(enter, 0), 1.15);
        const opacity = Math.min(enter, 1) * (1 - exitProgress);
        const idleBob =
          enter >= 1 ? Math.sin(frame * 0.05 + i * 1.7) * 2.2 : 0;

        const isNode = "node" in token;
        const variant: Variant = isNode ? "rise" : VARIANTS[i % VARIANTS.length];
        const motion = wordMotion(variant, clampedEnter);
        const blur = interpolate(clampedEnter, [0, 1], [10, 0]) + exitProgress * 7;
        const translateY = motion.y + idleBob + exitProgress * -24;
        const translateX = motion.x;

        if (isNode) {
          return (
            <span
              key={i}
              style={{
                display: "inline-flex",
                opacity,
                translate: `${translateX}px ${translateY}px`,
                scale: motion.scale,
                filter: `blur(${blur}px)`,
              }}
            >
              {token.node}
            </span>
          );
        }

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity,
              translate: `${translateX}px ${translateY}px`,
              scale: motion.scale,
              rotate: `${motion.rotate}deg`,
              filter: `blur(${blur}px)`,
              color: token.emphasis ? "#7dc0ff" : "#f8fafc",
              textShadow: token.emphasis
                ? "0 0 24px rgba(59,130,246,0.85), 0 0 46px rgba(59,130,246,0.4)"
                : "0 4px 20px rgba(0,0,0,0.5)",
              fontWeight: token.emphasis ? 700 : fontWeight,
            }}
          >
            {token.text}
          </span>
        );
      })}
    </div>
  );
};
