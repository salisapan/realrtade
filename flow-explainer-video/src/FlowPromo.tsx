import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { PromoBackground } from "./components/PromoBackground";
import { WindowCard } from "./components/WindowCard";
import { FrostedButton } from "./components/FrostedButton";
import { Cursor, ClickBurst } from "./components/Cursor";
import { RealLogo } from "./components/Logo";
import { KineticText, words } from "./components/KineticText";
import { inter } from "./fonts";

const CONVERGE = { x: 960, y: 540 };

const windows = [
  { title: "quarterly-report.pdf", icon: "legal" as const, top: 160, left: 220, width: 360, rotate: -8, start: 430 },
  { title: "budget.xlsx", icon: "sheet" as const, top: 620, left: 160, width: 400, rotate: 6, start: 460 },
  { title: "proposal.web", icon: "form" as const, top: 130, left: 1150, width: 380, rotate: 7, start: 490 },
  { title: "inbox.mail", icon: "mail" as const, top: 640, left: 1180, width: 360, rotate: -6, start: 520 },
  { title: "notes.web", icon: "form" as const, top: 380, left: 700, width: 300, rotate: -4, start: 550 },
  { title: "invoice.pdf", icon: "legal" as const, top: 820, left: 720, width: 320, rotate: 5, start: 580 },
];

const CURSOR_START = { x: 1600, y: 900 };
const CURSOR_TRAVEL_START = 990;
const CURSOR_TRAVEL_FRAMES = 70;
const CLICK_FRAME = CURSOR_TRAVEL_START + CURSOR_TRAVEL_FRAMES + 30;

const SPRING_CONFIG = { damping: 20, stiffness: 120, mass: 0.8 };

export const FlowPromo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // One continuous camera timeline drives the whole 24s shot.
  const cameraScale = interpolate(
    frame,
    [0, 400, 420, 470, 720, 1080, CLICK_FRAME, CLICK_FRAME + 60, 1260, 1440],
    [1, 1, 2.15, 0.86, 1, 1.08, 1.34, 1, 0.95, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    },
  );
  const cameraBlur = interpolate(
    frame,
    [400, 420, 460, CLICK_FRAME - 4, CLICK_FRAME + 4, CLICK_FRAME + 30],
    [0, 14, 0, 0, 6, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const tilt = Math.sin(frame * 0.008) * 1.4;

  const titleZoomOut = interpolate(frame, [400, 430], [1, 2.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.6, 0, 1, 1),
  });
  const titleFade = interpolate(frame, [400, 430], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const buttonAppear = spring({
    frame: frame - 780,
    fps,
    config: SPRING_CONFIG,
  });

  const flashOpacity = interpolate(
    frame,
    [CLICK_FRAME, CLICK_FRAME + 3, CLICK_FRAME + 26],
    [0, 0.55, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const sceneOpacity = interpolate(frame, [1150, 1250], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logoOpacity = interpolate(frame, [1260, 1310], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoScale = spring({ frame: frame - 1260, fps, config: SPRING_CONFIG });
  const logoGlow = interpolate(frame % 120, [0, 60, 120], [0.5, 0.9, 0.5]);

  return (
    <AbsoluteFill style={{ fontFamily: inter, overflow: "hidden" }}>
      <PromoBackground />

      <div
        style={{
          position: "absolute",
          inset: 0,
          scale: cameraScale,
          rotate: `1 0.2 0 ${tilt}deg`,
          filter: cameraBlur > 0.1 ? `blur(${cameraBlur}px)` : undefined,
          opacity: sceneOpacity,
        }}
      >
        {/* Beat 1 — kinetic title swap */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: titleFade,
            scale: titleZoomOut,
          }}
        >
          <div style={{ position: "absolute" }}>
            <KineticText
              tokens={words("Meet your new...")}
              from={10}
              to={145}
              fontSize={78}
              fontWeight={700}
            />
          </div>
          <div style={{ position: "absolute" }}>
            <KineticText
              tokens={words("execution layer", ["execution"])}
              from={130}
              to={275}
              fontSize={82}
              fontWeight={700}
            />
          </div>
          <div style={{ position: "absolute" }}>
            <KineticText
              tokens={words("cognitive OS", ["cognitive", "OS"])}
              from={260}
              fontSize={98}
              fontWeight={700}
            />
          </div>
        </div>

        {/* Beat 2+3 — scattered windows collapsing into the button */}
        {windows.map((w) => {
          const morph = spring({
            frame: frame - w.start,
            fps,
            config: SPRING_CONFIG,
            durationInFrames: 90,
          });
          const collapse = interpolate(frame, [720, 950], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.6, 0, 0.4, 1),
          });
          const centerX = w.left + w.width / 2;
          const centerY = w.top + 70;
          const dx = CONVERGE.x - centerX;
          const dy = CONVERGE.y - centerY;
          const idleFloat = Math.sin(frame * 0.03 + w.left) * 3;

          const entryScale = interpolate(morph, [0, 1], [0.7, 1]);
          const entryOpacity = Math.min(morph, 1);
          const collapseScale = interpolate(collapse, [0, 1], [1, 0.08]);
          const collapseOpacity = interpolate(collapse, [0, 0.75, 1], [1, 1, 0]);

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
              scale={entryScale * collapseScale}
              opacity={entryOpacity * collapseOpacity}
              zIndex={5}
              translate={`${interpolate(collapse, [0, 1], [0, dx])}px ${interpolate(collapse, [0, 1], [0, dy]) + idleFloat}px`}
            />
          );
        })}

        {/* Frosted button materializing at the convergence point */}
        <div
          style={{
            position: "absolute",
            top: CONVERGE.y,
            left: CONVERGE.x,
            translate: "-50% -50%",
            scale: Math.max(buttonAppear, 0),
            opacity: Math.min(buttonAppear, 1),
          }}
        >
          <FrostedButton
            fontSize={34}
            clickFrame={frame >= CLICK_FRAME ? CLICK_FRAME : undefined}
          />
        </div>

        <ClickBurst
          x={CONVERGE.x}
          y={CONVERGE.y}
          clickFrame={frame >= CLICK_FRAME ? CLICK_FRAME : undefined}
          color="#93c5fd"
        />

        <Cursor
          fromX={CURSOR_START.x}
          fromY={CURSOR_START.y}
          toX={CONVERGE.x + 60}
          toY={CONVERGE.y - 40}
          startFrame={CURSOR_TRAVEL_START}
          travelFrames={CURSOR_TRAVEL_FRAMES}
          clickFrame={frame >= CLICK_FRAME ? CLICK_FRAME : undefined}
        />
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#ffffff",
          opacity: flashOpacity,
          pointerEvents: "none",
        }}
      />

      {/* Beat 5 — logo close */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          translate: "-50% -50%",
          opacity: logoOpacity,
          scale: 0.85 + Math.min(logoScale, 1) * 0.15,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            translate: "-50% -50%",
            width: 700,
            height: 300,
            borderRadius: "50%",
            background: "#4285F4",
            opacity: logoGlow * 0.25,
            filter: "blur(120px)",
          }}
        />
        <div
          style={{
            position: "relative",
            filter: `drop-shadow(0 0 ${30 + logoGlow * 26}px rgba(66,133,244,0.6))`,
          }}
        >
          <RealLogo width={440} />
        </div>
        <div
          style={{
            position: "relative",
            marginTop: 14,
            fontFamily: inter,
            fontSize: 24,
            fontWeight: 500,
            color: "#cbd5e1",
          }}
        >
          Stop managing software. Let software work for you.
        </div>
      </div>
    </AbsoluteFill>
  );
};
