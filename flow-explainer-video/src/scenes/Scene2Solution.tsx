import React from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { GlowBackground } from "../components/GlowBackground";
import { WindowCard } from "../components/WindowCard";
import { DoItButton } from "../components/DoItButton";
import { Caption } from "../components/Caption";
import { inter, spaceGrotesk } from "../fonts";

const fadingWindows = [
  { title: "inbox.mail", icon: "mail" as const, top: 150, left: 190, width: 380, rotate: -7 },
  { title: "quarterly.xlsx", icon: "sheet" as const, top: 600, left: 130, width: 420, rotate: 5 },
  { title: "intake-form.web", icon: "form" as const, top: 100, left: 1010, width: 380, rotate: 6 },
  { title: "contract-review.legal", icon: "legal" as const, top: 560, left: 1140, width: 400, rotate: -5 },
];

const iconChips = [
  { label: "Mail", color: "#60a5fa", angle: -140, delay: 0 },
  { label: "Sheets", color: "#34d399", angle: -60, delay: 10 },
  { label: "Forms", color: "#f472b6", angle: 40, delay: 20 },
  { label: "Legal", color: "#fbbf24", angle: 130, delay: 30 },
];

export const Scene2Solution: React.FC = () => {
  const frame = useCurrentFrame();

  const calm = interpolate(frame, [0, 130], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  const panelRise = interpolate(frame, [50, 190], [520, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 200 }),
  });

  const panelOpacity = interpolate(frame, [50, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const buttonAppear = interpolate(frame, [200, 260], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 200 }),
    output: "perceptual-scale",
  });

  return (
    <AbsoluteFill name="Scene 2 - Flow Solution" style={{ fontFamily: inter }}>
      <GlowBackground accent="#4285F4" />

      {fadingWindows.map((w) => (
        <WindowCard
          key={w.title}
          title={w.title}
          meta=""
          icon={w.icon}
          top={w.top}
          left={w.left}
          width={w.width}
          rotateDeg={w.rotate}
          scale={0.8 + calm * 0.2}
          opacity={calm * 0.35}
          zIndex={5}
          filter={`blur(${(1 - calm) * 0 + (1 - calm) * 6}px) grayscale(${1 - calm})`}
        />
      ))}

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          width: 1400,
          height: 640,
          translate: `-50% ${panelRise}px`,
          opacity: panelOpacity,
          borderRadius: "32px 32px 0 0",
          background: "rgba(19,27,46,0.55)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(110,160,255,0.25)",
          borderBottom: "none",
          boxShadow: "0 -40px 120px -20px rgba(66,133,244,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingTop: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 22px",
              borderRadius: 999,
              border: "1px solid rgba(110,160,255,0.4)",
              background: "rgba(66,133,244,0.12)",
              color: "#93c5fd",
              fontFamily: spaceGrotesk,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: 1,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#4ade80",
                boxShadow: "0 0 10px #4ade80",
              }}
            />
            LOCAL LAYER — RUNNING ON-DEVICE
          </div>
        </div>

        <div
          style={{
            position: "relative",
            width: "100%",
            height: 420,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {iconChips.map((chip) => {
            const t = interpolate(
              frame,
              [180 + chip.delay, 240 + chip.delay],
              [1, 0],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.4, 0, 0.2, 1),
              },
            );
            const radius = 260 * t;
            const rad = (chip.angle * Math.PI) / 180;
            const x = Math.cos(rad) * radius;
            const y = Math.sin(rad) * radius * 0.5;
            const chipOpacity = interpolate(
              frame,
              [150 + chip.delay, 180 + chip.delay, 210 + chip.delay, 245 + chip.delay],
              [0, 1, 1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );

            return (
              <div
                key={chip.label}
                style={{
                  position: "absolute",
                  translate: `${x}px ${y}px`,
                  scale: 0.6 + t * 0.4,
                  opacity: chipOpacity,
                  padding: "8px 16px",
                  borderRadius: 999,
                  background: `${chip.color}22`,
                  border: `1px solid ${chip.color}66`,
                  color: chip.color,
                  fontFamily: inter,
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                {chip.label}
              </div>
            );
          })}

          <div style={{ scale: buttonAppear }}>
            <DoItButton />
          </div>
        </div>
      </div>

      <Interactive.Div
        name="Kicker"
        style={{
          position: "absolute",
          top: 90,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: spaceGrotesk,
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: 2,
          color: "#6EA0FF",
          opacity: interpolate(frame, [60, 100], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        ONE BUTTON. EVERY APP.
      </Interactive.Div>

      <Caption from={70} to={340} fontSize={40}>
        We eliminated this chaos. Meet{" "}
        <span style={{ color: "#93c5fd", fontWeight: 700 }}>Flow</span> — a
        local runtime that silently sits in the background and learns your
        patterns.
      </Caption>
      <Caption from={370} to={670} fontSize={40}>
        It serves a single execution button that completes the entire
        workflow in{" "}
        <span style={{ color: "#93c5fd", fontWeight: 700 }}>one click</span>.
      </Caption>
    </AbsoluteFill>
  );
};
