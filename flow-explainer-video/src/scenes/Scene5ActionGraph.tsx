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
import { KineticText, words } from "../components/KineticText";
import { CheckIcon } from "../components/Icons";
import { inter, spaceGrotesk } from "../fonts";

const SPRING_CONFIG = { damping: 14, stiffness: 130, mass: 0.8 };

const chain = [
  { label: "SIGNAL", delay: 130 },
  { label: "PATTERN", delay: 210 },
  { label: "INTUITION", delay: 290 },
  { label: "EXECUTION MEMORY", delay: 370 },
];
const CHAIN_Y = 560;
const NODE_X = [420, 700, 980, 1300];

const teammates = [
  { x: 1560, y: 400, delay: 470 },
  { x: 1620, y: 560, delay: 510 },
  { x: 1560, y: 720, delay: 550 },
];

export const Scene5ActionGraph: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineIn = spring({ frame: frame - 8, fps, config: SPRING_CONFIG });
  const subIn = interpolate(frame, [50, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill name="Scene 5 - Action Graph" style={{ fontFamily: inter }}>
      <GlowBackground accent="#8b5cf6" />

      <div style={{ position: "absolute", top: 76, left: 120, right: 120 }}>
        <Interactive.Div
          name="Kicker"
          style={{
            fontFamily: spaceGrotesk,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: 3,
            color: "#a78bfa",
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
          fontSize={46}
          fontWeight={700}
          align="left"
          maxWidth={1500}
        />
        <div
          style={{
            fontFamily: inter,
            fontSize: 21,
            fontWeight: 400,
            color: "#94a3b8",
            marginTop: 16,
            maxWidth: 1100,
            lineHeight: 1.55,
            opacity: subIn,
            translate: `0 ${interpolate(subIn, [0, 1], [14, 0])}px`,
          }}
        >
          Flow decodes causal chains and hidden work patterns at the OS
          level, turning professional intuition into Execution Memory. The
          judgment of your most senior experts is replicated automatically
          to every teammate's machine.
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
              stroke="#a78bfa"
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
                  ? "linear-gradient(135deg, rgba(96,165,250,0.25), rgba(139,92,246,0.15))"
                  : "linear-gradient(135deg, rgba(139,92,246,0.22), rgba(139,92,246,0.04))",
                border: `1.5px solid rgba(167,139,250,${(0.5 + pulse * 0.4).toFixed(2)})`,
                boxShadow: `0 0 ${20 + pulse * 24}px rgba(139,92,246,0.45)`,
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
                color: "#e0d9ff",
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
          bottom: 90,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <KineticText
          tokens={words("Zero clicks. Exactly on time.", ["Zero", "Exactly"])}
          from={600}
          fontSize={42}
          fontWeight={700}
        />
      </div>
    </AbsoluteFill>
  );
};
