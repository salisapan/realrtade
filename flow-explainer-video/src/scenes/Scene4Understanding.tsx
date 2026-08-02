import React from "react";
import {
  AbsoluteFill,
  Interactive,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GlowBackground } from "../components/GlowBackground";
import { DoItButton } from "../components/DoItButton";
import { KineticText, words } from "../components/KineticText";
import { CheckIcon } from "../components/Icons";
import { inter, spaceGrotesk } from "../fonts";

const SPRING_CONFIG = { damping: 20, stiffness: 120, mass: 0.8 };
const SENTENCE = "Send the signed lease + update the tenant file";

const chain = [
  { label: "SIGNAL", delay: 330 },
  { label: "PATTERN", delay: 390 },
  { label: "INTUITION", delay: 450 },
  { label: "EXECUTION MEMORY", delay: 510 },
];
const CHAIN_Y = 620;
const NODE_X = [420, 700, 980, 1300];

const teammates = [
  { x: 1560, y: 460, delay: 590 },
  { x: 1620, y: 620, delay: 630 },
  { x: 1560, y: 780, delay: 670 },
];

export const Scene4Understanding: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineIn = spring({ frame: frame - 8, fps, config: SPRING_CONFIG });
  const subIn = interpolate(frame, [45, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const typedLength = Math.floor(
    interpolate(frame, [50, 260], [0, SENTENCE.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const typed = SENTENCE.slice(0, typedLength);
  const cursorOn = Math.floor(frame / 12) % 2 === 0;
  const barOpacity = interpolate(frame, [20, 50, 300, 340], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const barScale = interpolate(frame, [300, 340], [1, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const barFloat = Math.sin(frame * 0.03) * 4;

  const buttonAppear = spring({
    frame: frame - 720,
    fps,
    config: SPRING_CONFIG,
  });

  return (
    <AbsoluteFill name="Scene 4 - Understanding" style={{ fontFamily: inter }}>
      <GlowBackground accent="#22d3ee" />

      <div style={{ position: "absolute", top: 66, left: 120, right: 120 }}>
        <Interactive.Div
          name="Kicker"
          style={{
            fontFamily: spaceGrotesk,
            fontSize: 21,
            fontWeight: 600,
            letterSpacing: 3,
            color: "#67e8f9",
            opacity: interpolate(headlineIn, [0, 1], [0, 1]),
            marginBottom: 10,
          }}
        >
          — THE ACTION GRAPH
        </Interactive.Div>
        <KineticText
          tokens={words(
            "Turning Institutional Wisdom into Local Infrastructure.",
            ["Wisdom", "Infrastructure"],
          )}
          from={8}
          fontSize={58}
          fontWeight={700}
          align="left"
          maxWidth={1600}
        />
        <div
          style={{
            fontFamily: inter,
            fontSize: 24,
            fontWeight: 400,
            color: "#94a3b8",
            marginTop: 14,
            maxWidth: 1150,
            lineHeight: 1.5,
            opacity: subIn,
            translate: `0 ${interpolate(subIn, [0, 1], [14, 0])}px`,
          }}
        >
          Flow decodes causal chains and hidden work patterns at the OS
          level, turning professional intuition into Execution Memory —
          replicated automatically to every teammate's machine.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 380,
          left: "50%",
          translate: `-50% ${barFloat}px`,
          opacity: barOpacity,
          scale: barScale,
          width: 1300,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "24px 32px",
            borderRadius: 20,
            background: "rgba(15,20,36,0.75)",
            border: "1px solid rgba(34,211,238,0.35)",
            boxShadow: "0 0 50px -10px rgba(34,211,238,0.35)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#67e8f9",
              boxShadow: "0 0 10px #67e8f9",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontFamily: spaceGrotesk,
              fontSize: 30,
              color: "#f1f5f9",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {typed}
            <span style={{ opacity: cursorOn ? 1 : 0, color: "#67e8f9" }}>
              |
            </span>
          </div>
        </div>
      </div>

      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        {NODE_X.slice(0, -1).map((x, i) => {
          const len = NODE_X[i + 1] - x - 100;
          const progress = interpolate(
            frame,
            [chain[i + 1].delay - 40, chain[i + 1].delay],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          return (
            <line
              key={i}
              x1={x + 50}
              y1={CHAIN_Y}
              x2={x + 50 + len}
              y2={CHAIN_Y}
              stroke="#22d3ee"
              strokeWidth={2}
              strokeDasharray={len}
              strokeDashoffset={len * (1 - progress)}
              opacity={0.6}
            />
          );
        })}
        {teammates.map((t, i) => {
          const progress = interpolate(
            frame,
            [t.delay - 30, t.delay],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const len = Math.hypot(t.x - (NODE_X[3] + 50), t.y - CHAIN_Y);
          return (
            <line
              key={i}
              x1={NODE_X[3] + 50}
              y1={CHAIN_Y}
              x2={t.x}
              y2={t.y}
              stroke="#60a5fa"
              strokeWidth={1.6}
              strokeDasharray={len}
              strokeDashoffset={len * (1 - progress)}
              opacity={0.5}
            />
          );
        })}
      </svg>

      {chain.map((c, i) => {
        const local = spring({
          frame: frame - c.delay,
          fps,
          config: SPRING_CONFIG,
        });
        const pulse = interpolate(
          (frame + i * 20) % 100,
          [0, 50, 100],
          [0.4, 0.85, 0.4],
        );
        const floatY = Math.sin(frame * 0.03 + i * 2) * 4;
        const isLast = i === chain.length - 1;

        return (
          <div
            key={c.label}
            style={{
              position: "absolute",
              top: CHAIN_Y,
              left: NODE_X[i] + 50,
              translate: `-50% ${-50 + floatY}%`,
              opacity: Math.min(local, 1),
              scale: 0.6 + Math.min(local, 1) * 0.4,
            }}
          >
            <div
              style={{
                width: isLast ? 130 : 100,
                height: isLast ? 130 : 100,
                borderRadius: 22,
                rotate: "45deg",
                background: isLast
                  ? "linear-gradient(135deg, rgba(96,165,250,0.25), rgba(34,211,238,0.15))"
                  : "linear-gradient(135deg, rgba(34,211,238,0.22), rgba(34,211,238,0.04))",
                border: `1.5px solid rgba(103,232,249,${(0.5 + pulse * 0.4).toFixed(2)})`,
                boxShadow: `0 0 ${20 + pulse * 24}px rgba(34,211,238,0.45)`,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                translate: "-50% -50%",
                fontFamily: spaceGrotesk,
                fontSize: isLast ? 13 : 14,
                fontWeight: 700,
                letterSpacing: 1,
                color: "#e0fbff",
                textAlign: "center",
                width: 90,
              }}
            >
              {c.label}
            </div>
          </div>
        );
      })}

      {teammates.map((t, i) => {
        const local = spring({
          frame: frame - t.delay,
          fps,
          config: SPRING_CONFIG,
        });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: t.y,
              left: t.x,
              translate: "-50% -50%",
              opacity: Math.min(local, 1),
              scale: 0.6 + Math.min(local, 1) * 0.4,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              borderRadius: 12,
              background: "rgba(15,20,36,0.75)",
              border: "1px solid rgba(96,165,250,0.4)",
              boxShadow: "0 0 20px -6px rgba(96,165,250,0.6)",
            }}
          >
            <CheckIcon size={16} color="#4ade80" />
            <span
              style={{
                fontFamily: inter,
                fontSize: 14,
                fontWeight: 600,
                color: "#cbd5e1",
                whiteSpace: "nowrap",
              }}
            >
              Teammate {i + 1}
            </span>
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          top: CHAIN_Y + 170,
          left: NODE_X[3] + 50,
          translate: "-50% -50%",
          opacity: Math.min(buttonAppear, 1),
          scale: Math.max(buttonAppear, 0),
        }}
      >
        <DoItButton fontSize={20} />
      </div>
    </AbsoluteFill>
  );
};
