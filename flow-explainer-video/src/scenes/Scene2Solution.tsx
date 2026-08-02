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
import { WindowCard } from "../components/WindowCard";
import { DoItButton } from "../components/DoItButton";
import { Cursor } from "../components/Cursor";
import { Caption } from "../components/Caption";
import { inter, spaceGrotesk } from "../fonts";

const SPRING_CONFIG = { damping: 14, stiffness: 100, mass: 0.8 };

const CONVERGE_X = 960;
const CONVERGE_Y = 660;

const fadingWindows = [
  {
    title: "inbox.mail",
    icon: "mail" as const,
    top: 150,
    left: 190,
    width: 380,
    rotate: -7,
    morphStart: 20,
  },
  {
    title: "quarterly.xlsx",
    icon: "sheet" as const,
    top: 600,
    left: 130,
    width: 420,
    rotate: 5,
    morphStart: 38,
  },
  {
    title: "intake-form.web",
    icon: "form" as const,
    top: 100,
    left: 1010,
    width: 380,
    rotate: 6,
    morphStart: 56,
  },
  {
    title: "contract-review.legal",
    icon: "legal" as const,
    top: 560,
    left: 1140,
    width: 400,
    rotate: -5,
    morphStart: 74,
  },
];

const CURSOR_START = { x: 1560, y: 160 };
const CURSOR_TRAVEL_START = 210;
const CURSOR_TRAVEL_FRAMES = 70;
const CLICK_FRAME = CURSOR_TRAVEL_START + CURSOR_TRAVEL_FRAMES + 4;

export const Scene2Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const panelRise = spring({
    frame: frame - 40,
    fps,
    config: SPRING_CONFIG,
    durationInFrames: 130,
  });

  const panelOpacity = interpolate(frame, [40, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const buttonAppear = spring({
    frame: frame - 150,
    fps,
    config: SPRING_CONFIG,
  });

  const kickerOpacity = interpolate(
    frame,
    [CLICK_FRAME + 10, CLICK_FRAME + 40],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill name="Scene 2 - Flow Solution" style={{ fontFamily: inter }}>
      <GlowBackground accent="#4285F4" />

      {fadingWindows.map((w) => {
        const morph = spring({
          frame: frame - w.morphStart,
          fps,
          config: SPRING_CONFIG,
          durationInFrames: 100,
        });
        const centerX = w.left + w.width / 2;
        const centerY = w.top + 70;
        const dx = CONVERGE_X - centerX;
        const dy = CONVERGE_Y - centerY;
        const fade = interpolate(morph, [0, 0.75, 1], [1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const shrink = interpolate(morph, [0, 1], [1, 0.12], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <WindowCard
            key={w.title}
            title={w.title}
            meta=""
            icon={w.icon}
            top={w.top}
            left={w.left}
            width={w.width}
            rotateDeg={w.rotate}
            scale={shrink}
            opacity={fade}
            zIndex={5}
            translate={`${interpolate(morph, [0, 1], [0, dx])}px ${interpolate(morph, [0, 1], [0, dy])}px`}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          width: 1400,
          height: 640,
          translate: `-50% ${interpolate(panelRise, [0, 1], [520, 0])}px`,
          opacity: panelOpacity,
          borderRadius: "32px 32px 0 0",
          background:
            "linear-gradient(180deg, rgba(19,27,46,0.6), rgba(11,17,32,0.72))",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(110,160,255,0.22)",
          borderBottom: "none",
          boxShadow: "0 -40px 120px -20px rgba(66,133,244,0.22)",
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
          <div style={{ scale: Math.max(buttonAppear, 0) }}>
            <DoItButton
              clickFrame={frame >= CLICK_FRAME ? CLICK_FRAME : undefined}
            />
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
          opacity: kickerOpacity,
        }}
      >
        ONE BUTTON. EVERY APP.
      </Interactive.Div>

      <Cursor
        fromX={CURSOR_START.x}
        fromY={CURSOR_START.y}
        toX={CONVERGE_X + 70}
        toY={CONVERGE_Y - 30}
        startFrame={CURSOR_TRAVEL_START}
        travelFrames={CURSOR_TRAVEL_FRAMES}
        clickFrame={frame >= CLICK_FRAME ? CLICK_FRAME : undefined}
      />

      <Caption from={90} to={380} fontSize={40}>
        We eliminated this chaos. Meet{" "}
        <span style={{ color: "#93c5fd", fontWeight: 700 }}>Flow</span> — a
        local runtime that silently sits in the background and learns your
        patterns.
      </Caption>
      <Caption from={410} to={790} fontSize={40}>
        It serves a single execution button that completes the entire
        workflow in{" "}
        <span style={{ color: "#93c5fd", fontWeight: 700 }}>one click</span>.
      </Caption>
    </AbsoluteFill>
  );
};
