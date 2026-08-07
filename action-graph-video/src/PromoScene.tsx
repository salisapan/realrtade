import { ThreeCanvas } from "@remotion/three";
import { loadFont } from "@remotion/google-fonts/Rubik";
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { GraphScene } from "./graph/GraphScene";
import { Beat, KineticTitle } from "./graph/KineticTitle";
import { BeamRing } from "./promo/BeamRing";
import { CompletionBadges } from "./promo/CompletionBadges";
import { Cursor } from "./promo/Cursor";
import { DoItButton } from "./promo/DoItButton";
import { arcPosition, Camera2D, lerpPlacement, project } from "./promo/layout";
import { PromoEffects } from "./promo/PromoEffects";
import { RecognitionRow, ScanSweep } from "./promo/ScanSweep";
import { FAST_SPRING } from "./promo/springs";
import { FONT, LIGHT } from "./promo/theme";
import { CardVariant, UICard } from "./promo/UICard";

const { fontFamily } = loadFont();

// ---- Act boundaries (seconds), 55s @ 30fps ----
const ACT1_END = 8;
const SCAN_START = 8;
const ACT2A_END = 12;
const ACT2_END = 23;
const ACT3_START = 23;
const CLICK_SEC = 28;
const ACT3_END = 31;
const ACT4_END = 48;
const ACT5_END = 55;

const HERO_ORDER: CardVariant[] = ["contract", "invoice", "test-result"];

// Virtual camera for the manual 2D projection all card/button/cursor content uses
// (see promo/layout.ts's project() for why this replaces drei's <Html>).
const CARD_CAM: Camera2D = { fov: 42, distance: 6 };

type ChaosCard = {
  variant: CardVariant;
  x: number;
  y: number;
  z: number;
  phase: number;
  isHero: boolean;
};

const CHAOS_CARDS: ChaosCard[] = [
  { variant: "contract", x: -2.3, y: 0.6, z: 0, phase: 0, isHero: true },
  { variant: "invoice", x: 1.8, y: -0.5, z: -0.6, phase: 1.4, isHero: true },
  { variant: "test-result", x: -0.4, y: -1.1, z: 0.5, phase: 2.7, isHero: true },
  { variant: "spreadsheet", x: 2.7, y: 1.0, z: 0.3, phase: 3.9, isHero: false },
  { variant: "chat", x: -1.7, y: 1.4, z: -0.4, phase: 5.1, isHero: false },
];

function jitter(t: number, phase: number) {
  return {
    dx: Math.sin(t * 0.9 + phase) * 0.12 + Math.sin(t * 2.3 + phase * 1.7) * 0.05,
    dy: Math.cos(t * 0.7 + phase * 1.3) * 0.1,
    dz: Math.sin(t * 0.5 + phase * 0.6) * 0.08,
  };
}

function cardStyle(left: number, top: number, scale: number, zBase: number): React.CSSProperties {
  return {
    left,
    top,
    transform: `translate(-50%, -50%) scale(${scale})`,
    zIndex: Math.round(zBase),
  };
}

export const PromoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const inChaosPhase = t < ACT2A_END;

  // ---- Act 2b: cards spring from scatter into arc slots ----
  const arcInStart = ACT2A_END;
  const arcInP = spring({ frame: frame - arcInStart * fps, fps, config: FAST_SPRING });

  // ---- Act 3: the arc collapses toward a single center point as the click approaches ----
  const convergeStart = ACT3_START + 2.2;
  const convergeP = spring({ frame: frame - convergeStart * fps, fps, config: FAST_SPRING });

  const clickFrame = CLICK_SEC * fps;
  const clicked = t >= CLICK_SEC;

  const cursorStart = CLICK_SEC - 1.6;
  const cursorP = spring({ frame: frame - cursorStart * fps, fps, config: FAST_SPRING });
  const cursorVisible = t >= cursorStart - 0.1 && t < CLICK_SEC + 0.5;

  const act4Start = ACT3_END;
  const act4P = spring({ frame: frame - act4Start * fps, fps, config: FAST_SPRING });

  const closeStart = ACT4_END;
  const closeOut = interpolate(t, [closeStart, closeStart + 1.4], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const showArcCards = t >= arcInStart && t < ACT4_END;
  const showTriptych = t >= act4Start;

  return (
    <AbsoluteFill style={{ backgroundColor: LIGHT.bg }}>
      <ThreeCanvas linear width={width} height={height} gl={{ antialias: true }}>
        <color attach="background" args={[LIGHT.bg]} />
        {!inChaosPhase && (
          <>
            <GraphScene light assemble startFrame={ACT2A_END * fps} />
            <PromoEffects clickFrame={clicked ? clickFrame : null} />
          </>
        )}
      </ThreeCanvas>

      {/* ---- Act 1 + 2a: chaotic field, plain 2D projected cards ---- */}
      {inChaosPhase &&
        CHAOS_CARDS.map((c) => {
          const j = jitter(t, c.phase);
          const heroIdx = HERO_ORDER.indexOf(c.variant);
          const scanCrossSec = SCAN_START + 0.2 + heroIdx * 1.0;
          const isRecognized = c.isHero && t >= scanCrossSec;
          const decoyFade =
            !c.isHero && t > SCAN_START + 0.5
              ? Math.max(0.1, 1 - (t - SCAN_START - 0.5) * 0.7)
              : 1;
          const opacity = c.isHero
            ? t < SCAN_START
              ? 0.6
              : isRecognized
                ? 1
                : 0.6
            : Math.min(1, decoyFade);
          const p = project(c.x + j.dx, c.y + j.dy, c.z + j.dz, CARD_CAM, width, height);
          return (
            <React.Fragment key={c.variant}>
              {isRecognized && (
                <BeamRing size={340} opacity={1} outerStyle={cardStyle(p.left, p.top, p.scale, 100 + c.z * 10)} />
              )}
              <UICard
                variant={c.variant}
                opacity={opacity}
                highlighted={isRecognized}
                outerStyle={cardStyle(p.left, p.top, p.scale, 101 + c.z * 10)}
              />
            </React.Fragment>
          );
        })}

      {/* ---- Act 2b + 3: hero arc cards converging toward the [Do It] button ---- */}
      {showArcCards &&
        HERO_ORDER.map((variant, i) => {
          const arc = arcPosition(i, 3, 1, 2.4, 1.0);
          const center = { x: 0, y: 0.1, z: 1.6, scale: 0.001, opacity: 0 };
          const placement =
            t < convergeStart
              ? { ...arc, opacity: arc.opacity * Math.min(1, arcInP) }
              : lerpPlacement(arc, center, Math.min(1, convergeP));
          if (placement.opacity <= 0.01) return null;
          const p = project(placement.x, placement.y, placement.z, CARD_CAM, width, height);
          const s = p.scale * placement.scale;
          return (
            <React.Fragment key={variant}>
              <BeamRing
                size={340}
                opacity={placement.opacity}
                outerStyle={cardStyle(p.left, p.top, s, 200)}
              />
              <UICard
                variant={variant}
                opacity={placement.opacity}
                highlighted
                width={280}
                outerStyle={cardStyle(p.left, p.top, s, 201)}
              />
            </React.Fragment>
          );
        })}

      {/* ---- Act 3: the [Do It] button, formed at the convergence point ---- */}
      {t >= convergeStart &&
        t < act4Start + 0.6 &&
        (() => {
          const p = project(0, 0.05, 1.9, CARD_CAM, width, height);
          const btnScale = Math.min(
            1,
            spring({ frame: frame - convergeStart * fps, fps, config: FAST_SPRING }),
          );
          return (
            <DoItButton
              scale={p.scale * btnScale}
              clickFrame={clicked ? clickFrame : null}
              outerStyle={cardStyle(p.left, p.top, 1, 300)}
            />
          );
        })()}

      {/* ---- Act 3: cursor gliding in to click ---- */}
      {cursorVisible &&
        (() => {
          const cx = interpolate(cursorP, [0, 1], [1.6, 0.55]);
          const cy = interpolate(cursorP, [0, 1], [-1.1, -0.35]);
          const p = project(cx, cy, 2.1, CARD_CAM, width, height);
          const pressScale = interpolate(
            t,
            [CLICK_SEC, CLICK_SEC + 0.08, CLICK_SEC + 0.2],
            [1, 0.82, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          return (
            <Cursor
              opacity={Math.min(1, cursorP * 3)}
              scale={p.scale * pressScale}
              outerStyle={cardStyle(p.left, p.top, 1, 400)}
            />
          );
        })()}

      {/* ---- Act 4: value-realization triptych ---- */}
      {showTriptych &&
        HERO_ORDER.map((variant, i) => {
          const x = (i - 1) * 1.9;
          const revealStart = act4Start + 0.5 + i * 0.4;
          const revealCount = Math.floor(
            interpolate(t - revealStart, [0, 1.6], [0, 4], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          );
          const badgeStart = revealStart + 1.9;
          const p = project(x, 0.2, 0.4, CARD_CAM, width, height);
          const s = p.scale * Math.min(1, act4P);
          const opacity = Math.min(1, act4P) * closeOut;
          const badgeP = project(x, -1.55, 0.4, CARD_CAM, width, height);
          return (
            <React.Fragment key={`triptych-${variant}`}>
              <UICard
                variant={variant}
                opacity={opacity}
                highlighted
                revealCount={revealCount}
                width={280}
                outerStyle={cardStyle(p.left, p.top, s, 200)}
              />
              <CompletionBadges
                startSec={badgeStart}
                outerStyle={{
                  left: badgeP.left,
                  top: badgeP.top,
                  transform: `translate(-50%, 0) scale(${badgeP.scale})`,
                  zIndex: 201,
                  opacity: closeOut,
                }}
              />
            </React.Fragment>
          );
        })}

      {/* ---- Kinetic text overlays ---- */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 0 90px" }}>
        <Beat start={1.4} end={ACT1_END - 0.4}>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 20,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: LIGHT.accent2,
            }}
          >
            <KineticTitle text="Enterprise workflows are broken" startSec={1.4} />
          </span>
        </Beat>
      </AbsoluteFill>

      {inChaosPhase && t >= SCAN_START && t < ACT2A_END + 0.4 && (
        <ScanSweep startSec={SCAN_START} durSec={3.4} />
      )}
      {inChaosPhase && t >= SCAN_START + 0.2 && t < ACT2A_END + 0.6 && (
        <RecognitionRow startSec={SCAN_START + 0.2} />
      )}

      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", padding: "120px 0 0" }}>
        <Beat start={ACT2A_END + 0.6} end={ACT2_END - 0.5}>
          <div
            style={{
              fontFamily,
              fontWeight: 700,
              fontSize: 44,
              letterSpacing: "-0.02em",
              color: LIGHT.txtHi,
              textAlign: "center",
            }}
          >
            One engine. Every workflow.
          </div>
        </Beat>
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", pointerEvents: "none" }}>
        <Beat
          start={ACT4_END + 0.3}
          end={ACT5_END}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "28px 56px",
            borderRadius: 24,
            backgroundColor: "rgba(255,255,255,.65)",
            backdropFilter: "blur(18px)",
            boxShadow: LIGHT.cardShadow,
          }}
        >
          <div style={{ fontFamily, fontWeight: 700, fontSize: 48, color: LIGHT.txtHi, letterSpacing: "-0.02em" }}>
            Flow
          </div>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 18,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: LIGHT.accent2,
              marginTop: 10,
            }}
          >
            Cognitive Workflow Engine
          </div>
        </Beat>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
