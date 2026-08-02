import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GlowBackground } from "../components/GlowBackground";
import { DoItButton } from "../components/DoItButton";
import { KineticText, words } from "../components/KineticText";
import { inter, spaceGrotesk } from "../fonts";

const SPRING_CONFIG = { damping: 14, stiffness: 130, mass: 0.8 };
const SENTENCE = "Send the signed lease + update the tenant file";

const chips = [
  { label: "EXTRACT", delay: 260, color: "#f472b6" },
  { label: "VERIFY", delay: 300, color: "#fbbf24" },
  { label: "EXECUTE", delay: 340, color: "#60a5fa" },
];

export const Scene4IntentCompiler: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const typedLength = Math.floor(
    interpolate(frame, [40, 210], [0, SENTENCE.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const typed = SENTENCE.slice(0, typedLength);
  const cursorOn = Math.floor(frame / 12) % 2 === 0;

  const barOpacity = interpolate(frame, [10, 40, 235, 270], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const barScale = interpolate(frame, [235, 270], [1, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const barFloat = Math.sin(frame * 0.03) * 4;

  const arrowsIn = interpolate(frame, [255, 300], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const buttonAppear = spring({ frame: frame - 400, fps, config: SPRING_CONFIG });
  const buttonArrow = interpolate(frame, [390, 420], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      name="Scene 4 - Intent Compiler"
      style={{ fontFamily: inter }}
    >
      <GlowBackground accent="#8b5cf6" />

      <div
        style={{
          position: "absolute",
          top: 110,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <KineticText
          tokens={words("It understands what you mean.", ["understands"])}
          from={12}
          fontSize={54}
          fontWeight={700}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: 300,
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
            padding: "26px 34px",
            borderRadius: 20,
            background: "rgba(15,20,36,0.75)",
            border: "1px solid rgba(139,92,246,0.35)",
            boxShadow: "0 0 50px -10px rgba(139,92,246,0.35)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#a78bfa",
              boxShadow: "0 0 10px #a78bfa",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontFamily: spaceGrotesk,
              fontSize: 32,
              color: "#f1f5f9",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {typed}
            <span style={{ opacity: cursorOn ? 1 : 0, color: "#a78bfa" }}>
              |
            </span>
          </div>
        </div>
      </div>

      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <line
          x1={760}
          y1={600}
          x2={860}
          y2={600}
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeDasharray={100}
          strokeDashoffset={100 * (1 - arrowsIn)}
          opacity={0.6}
        />
        <line
          x1={1060}
          y1={600}
          x2={1160}
          y2={600}
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeDasharray={100}
          strokeDashoffset={100 * (1 - arrowsIn)}
          opacity={0.6}
        />
        <line
          x1={960}
          y1={650}
          x2={960}
          y2={745}
          stroke="#60a5fa"
          strokeWidth={2}
          strokeDasharray={95}
          strokeDashoffset={95 * (1 - buttonArrow)}
          opacity={0.7}
        />
      </svg>

      {chips.map((c, i) => {
        const local = spring({
          frame: frame - c.delay,
          fps,
          config: SPRING_CONFIG,
        });
        const floatY = Math.sin(frame * 0.035 + c.delay) * 4;
        const cx = 660 + i * 300;
        return (
          <div
            key={c.label}
            style={{
              position: "absolute",
              top: 600,
              left: cx,
              translate: `-50% -50%`,
              opacity: Math.min(local, 1),
              scale: 0.7 + Math.min(local, 1) * 0.3,
            }}
          >
            <div
              style={{
                translate: `0 ${floatY}px`,
                padding: "16px 30px",
                borderRadius: 14,
                background: "rgba(15,20,36,0.75)",
                border: `1px solid ${c.color}77`,
                boxShadow: `0 0 26px -6px ${c.color}88`,
                fontFamily: spaceGrotesk,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 2,
                color: c.color,
                whiteSpace: "nowrap",
              }}
            >
              {c.label}
            </div>
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          top: 800,
          left: 960,
          translate: "-50% -50%",
          opacity: Math.min(buttonAppear, 1),
          scale: Math.max(buttonAppear, 0),
        }}
      >
        <DoItButton fontSize={22} />
      </div>
    </AbsoluteFill>
  );
};
