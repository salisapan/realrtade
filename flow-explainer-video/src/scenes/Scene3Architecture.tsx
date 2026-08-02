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
import { GlassCard } from "../components/GlassCard";
import { DoItButton } from "../components/DoItButton";
import { Cursor, ClickBurst } from "../components/Cursor";
import { KineticText, words, node } from "../components/KineticText";
import { EyeOffIcon, BellIcon, CheckIcon } from "../components/Icons";
import { inter, spaceGrotesk } from "../fonts";

const SPRING_CONFIG = { damping: 14, stiffness: 130, mass: 0.8 };

const CURSOR_TRAVEL_START = 260;
const CURSOR_TRAVEL_FRAMES = 55;
const CLICK_FRAME = CURSOR_TRAVEL_START + CURSOR_TRAVEL_FRAMES + 4;

const BUTTON_POS = { x: 960, y: 430 };
const LEFT_CARD = { x: 560, y: 600 };
const RIGHT_CARD = { x: 1360, y: 600 };

const tasks = ["Verify risk parameters", "Update properties database", "Notify regional inspector"];

export const Scene3Architecture: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineIn = spring({ frame: frame - 8, fps, config: SPRING_CONFIG });
  const subIn = interpolate(frame, [40, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const diamondIn = spring({
    frame: frame - 90,
    fps,
    config: SPRING_CONFIG,
  });
  const lineProgress = interpolate(frame, [130, 210], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const leftCardIn = spring({
    frame: frame - 150,
    fps,
    config: SPRING_CONFIG,
  });
  const rightCardIn = spring({
    frame: frame - 200,
    fps,
    config: SPRING_CONFIG,
  });

  const lineLen = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(b.x - a.x, b.y - a.y);
  const leftLen = lineLen(BUTTON_POS, LEFT_CARD);
  const rightLen = lineLen(BUTTON_POS, RIGHT_CARD);

  return (
    <AbsoluteFill
      name="Scene 3 - Dual-Core Architecture"
      style={{ fontFamily: inter }}
    >
      <GlowBackground accent="#4285F4" />

      <div style={{ position: "absolute", top: 88, left: 130, right: 130 }}>
        <Interactive.Div
          name="Kicker"
          style={{
            fontFamily: spaceGrotesk,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 3,
            color: "#6EA0FF",
            opacity: interpolate(headlineIn, [0, 1], [0, 1]),
            marginBottom: 14,
          }}
        >
          — DUAL-CORE ARCHITECTURE
        </Interactive.Div>
        <KineticText
          tokens={words("Watch in silence. Act with power.", [
            "silence",
            "power",
          ])}
          from={8}
          fontSize={62}
          fontWeight={700}
          align="left"
        />
        <Interactive.Div
          name="Subheadline"
          style={{
            fontFamily: inter,
            fontSize: 26,
            fontWeight: 400,
            color: "#94a3b8",
            marginTop: 14,
            opacity: subIn,
          }}
        >
          Two engines working together — one visible, one invisible.
        </Interactive.Div>
      </div>

      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <line
          x1={BUTTON_POS.x}
          y1={BUTTON_POS.y + 30}
          x2={LEFT_CARD.x}
          y2={LEFT_CARD.y}
          stroke="#4285F4"
          strokeWidth={2}
          strokeDasharray={leftLen}
          strokeDashoffset={leftLen * (1 - lineProgress)}
          opacity={0.55}
        />
        <line
          x1={BUTTON_POS.x}
          y1={BUTTON_POS.y + 30}
          x2={RIGHT_CARD.x}
          y2={RIGHT_CARD.y}
          stroke="#4285F4"
          strokeWidth={2}
          strokeDasharray={rightLen}
          strokeDashoffset={rightLen * (1 - lineProgress)}
          opacity={0.55}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          left: BUTTON_POS.x - 260,
          top: BUTTON_POS.y - 10,
          width: 520,
          height: 240,
          opacity: diamondIn,
          scale: 0.85 + diamondIn * 0.15,
          rotate: `${Math.sin(frame * 0.02) * 2.2}deg`,
          filter: "drop-shadow(0 0 40px rgba(66,133,244,0.45))",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath:
              "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
            background:
              "linear-gradient(135deg, rgba(66,133,244,0.28), rgba(66,133,244,0.05))",
            border: "2px solid rgba(96,165,250,0.7)",
            backgroundImage:
              "linear-gradient(rgba(96,165,250,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.22) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -30,
            left: "50%",
            translate: "-50% 0",
          }}
        >
          <DoItButton
            fontSize={22}
            clickFrame={frame >= CLICK_FRAME ? CLICK_FRAME : undefined}
          />
        </div>
      </div>

      <Cursor
        fromX={1500}
        fromY={200}
        toX={1030}
        toY={385}
        startFrame={CURSOR_TRAVEL_START}
        travelFrames={CURSOR_TRAVEL_FRAMES}
        clickFrame={frame >= CLICK_FRAME ? CLICK_FRAME : undefined}
      />

      <ClickBurst
        x={1030}
        y={385}
        clickFrame={frame >= CLICK_FRAME ? CLICK_FRAME : undefined}
        color="#60a5fa"
      />

      <div
        style={{
          position: "absolute",
          left: LEFT_CARD.x - 380,
          top: LEFT_CARD.y - 20,
          opacity: interpolate(leftCardIn, [0, 1], [0, 1]),
          translate: `0 ${interpolate(leftCardIn, [0, 1], [40, 0]) + (leftCardIn > 0.9 ? Math.sin(frame * 0.025) * 4 : 0)}px`,
        }}
      >
        <GlassCard width={760} label="SHADOW — INVISIBLE" accent="#94a3b8">
          <div
            style={{
              display: "flex",
              gap: 28,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 260,
                borderRadius: 12,
                overflow: "hidden",
                background: "rgba(6,10,20,0.6)",
                border: "1px solid rgba(148,163,184,0.16)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 10px",
                  borderBottom: "1px solid rgba(148,163,184,0.1)",
                }}
              >
                {["#f87171", "#fbbf24", "#34d399"].map((c) => (
                  <div
                    key={c}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: c,
                    }}
                  />
                ))}
                <div style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>
                  Appraisal_Report.pdf
                </div>
              </div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ height: 6, borderRadius: 3, width: "80%", background: "rgba(148,163,184,0.16)" }} />
                <div style={{ height: 6, borderRadius: 3, width: "92%", background: "rgba(148,163,184,0.16)" }} />
                <div style={{ fontSize: 8, letterSpacing: 1, color: "#64748b", marginTop: 4 }}>
                  MASKED · ASSET VALUE
                </div>
                <div
                  style={{
                    height: 16,
                    borderRadius: 4,
                    width: "60%",
                    background: "rgba(96,165,250,0.14)",
                    border: "1px dashed rgba(96,165,250,0.4)",
                  }}
                />
                <div style={{ height: 6, borderRadius: 3, width: "70%", background: "rgba(148,163,184,0.16)" }} />
              </div>
            </div>
            <EyeOffIcon size={26} color="#94a3b8" />
            <div>
              <div
                style={{
                  fontFamily: spaceGrotesk,
                  fontSize: 24,
                  fontWeight: 700,
                  color: "#f1f5f9",
                  marginBottom: 8,
                }}
              >
                A layer that runs in the background, on-device.
              </div>
              <div style={{ fontSize: 16, color: "#94a3b8", lineHeight: 1.5 }}>
                A local CV & OCR engine passively observes your work patterns
                and builds context — without asking permissions or sending
                data to the cloud.
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <div
        style={{
          position: "absolute",
          left: RIGHT_CARD.x - 380,
          top: RIGHT_CARD.y - 20,
          opacity: interpolate(rightCardIn, [0, 1], [0, 1]),
          translate: `0 ${interpolate(rightCardIn, [0, 1], [40, 0]) + (rightCardIn > 0.9 ? Math.sin(frame * 0.025 + 1.5) * 4 : 0)}px`,
        }}
      >
        <GlassCard width={760} label="DO IT — VISIBLE" accent="#60a5fa">
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            <div
              style={{
                width: 260,
                borderRadius: 12,
                padding: 14,
                background: "rgba(6,10,20,0.6)",
                border: "1px solid rgba(148,163,184,0.16)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(96,165,250,0.3)",
                  width: "fit-content",
                  marginBottom: 12,
                }}
              >
                <BellIcon size={12} color="#60a5fa" />
                <span style={{ fontSize: 10, color: "#93c5fd" }}>
                  New task detected
                </span>
              </div>
              {tasks.map((t, i) => {
                const taskIn = interpolate(
                  rightCardIn,
                  [0.2 + i * 0.15, 0.5 + i * 0.15],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );
                return (
                  <div
                    key={t}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                      opacity: taskIn,
                    }}
                  >
                    <CheckIcon size={14} color="#4ade80" />
                    <span style={{ fontSize: 11, color: "#cbd5e1" }}>{t}</span>
                  </div>
                );
              })}
            </div>
            <div>
              <div
                style={{
                  fontFamily: spaceGrotesk,
                  fontSize: 24,
                  fontWeight: 700,
                  color: "#f1f5f9",
                  marginBottom: 8,
                }}
              >
                The button that appears at the right moment.
              </div>
              <div style={{ fontSize: 16, color: "#94a3b8", lineHeight: 1.5 }}>
                The instant intent is detected, a focused execution button
                surfaces. No hunting for tools, no switching screens — the
                action is already here.
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

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
          tokens={[
            ...words("Every action ends at"),
            node(<DoItButton fontSize={20} />),
          ]}
          from={620}
          fontSize={40}
          fontWeight={700}
        />
      </div>
    </AbsoluteFill>
  );
};
