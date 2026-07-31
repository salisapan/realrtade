import React from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { GlowBackground } from "../components/GlowBackground";
import { Caption } from "../components/Caption";
import { inter, spaceGrotesk } from "../fonts";

const features = [
  { label: "Zero Data Leaks", icon: "🛡", delay: 420 },
  { label: "Zero Hallucinations", icon: "✅", delay: 480 },
  { label: "Deterministic Execution", icon: "{ }", delay: 540 },
];

const particles = [0, 1, 2, 3, 4];

export const Scene3Security: React.FC = () => {
  const frame = useCurrentFrame();

  const chipAppear = interpolate(frame, [10, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 200 }),
    output: "perceptual-scale",
  });

  const ringPulse = interpolate(frame % 100, [0, 50, 100], [0.25, 0.6, 0.25]);

  const boundaryAppear = interpolate(frame, [90, 140], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill name="Scene 3 - Security" style={{ fontFamily: inter }}>
      <GlowBackground accent="#34d399" />

      <Interactive.Div
        name="No cloud badge"
        style={{
          position: "absolute",
          top: 96,
          left: "50%",
          translate: "-50% 0",
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: boundaryAppear,
          fontFamily: spaceGrotesk,
          fontSize: 26,
          color: "#94a3b8",
        }}
      >
        <span style={{ fontSize: 32 }}>☁️</span>
        <span
          style={{
            position: "relative",
            top: -2,
            fontWeight: 700,
            color: "#f87171",
          }}
        >
          ✕
        </span>
        <span>no data ever leaves this device</span>
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          top: 190,
          left: "50%",
          translate: "-50% 0",
          width: 1200,
          borderTop: "2px dashed rgba(52,211,153,0.4)",
          opacity: boundaryAppear,
        }}
      />

      {particles.map((p) => {
        const period = 70;
        const local = (frame + p * 14) % period;
        const rising = local < period * 0.5;
        const progress = rising
          ? interpolate(local, [0, period * 0.5], [0, 1])
          : interpolate(local, [period * 0.5, period], [1, 0]);
        const y = interpolate(progress, [0, 1], [420, 210]);
        const x = 960 + (p - 2) * 70;
        const opacity =
          interpolate(local, [0, 6, period - 10, period], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * boundaryAppear;

        return (
          <div
            key={p}
            style={{
              position: "absolute",
              top: y,
              left: x,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#4ade80",
              opacity,
              boxShadow: "0 0 10px #4ade80",
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          top: 260,
          left: "50%",
          translate: "-50% 0",
          scale: chipAppear,
          opacity: chipAppear,
        }}
      >
        <div
          style={{
            position: "relative",
            width: 260,
            height: 260,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: -30,
              borderRadius: 34,
              border: "1px solid rgba(74,222,128,0.5)",
              opacity: ringPulse,
              boxShadow: "0 0 40px rgba(74,222,128,0.35)",
            }}
          />
          {[...Array(4)].map((_, side) =>
            [...Array(3)].map((__, pin) => (
              <div
                key={`${side}-${pin}`}
                style={{
                  position: "absolute",
                  width: side % 2 === 0 ? 18 : 10,
                  height: side % 2 === 0 ? 10 : 18,
                  background: "#4ade80",
                  opacity: 0.6,
                  top:
                    side === 0
                      ? -14
                      : side === 2
                        ? 264
                        : 70 + pin * 60,
                  left:
                    side === 1
                      ? 264
                      : side === 3
                        ? -14
                        : 70 + pin * 60,
                }}
              />
            )),
          )}
          <div
            style={{
              width: 220,
              height: 220,
              borderRadius: 24,
              background:
                "linear-gradient(145deg, #132018, #0d1712 60%, #132018)",
              border: "1px solid rgba(74,222,128,0.4)",
              backgroundImage:
                "linear-gradient(rgba(74,222,128,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.08) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 92,
              filter: "drop-shadow(0 0 22px rgba(74,222,128,0.55))",
            }}
          >
            🛡
          </div>
        </div>
        <div
          style={{
            textAlign: "center",
            marginTop: 22,
            fontFamily: spaceGrotesk,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 3,
            color: "#86efac",
          }}
        >
          ON-DEVICE · 100% LOCAL
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 250,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 28,
        }}
      >
        {features.map((f) => {
          const local = interpolate(
            frame,
            [f.delay, f.delay + 24],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            },
          );
          return (
            <div
              key={f.label}
              style={{
                opacity: local,
                translate: `0 ${interpolate(local, [0, 1], [24, 0])}px`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "18px 26px",
                borderRadius: 16,
                background: "rgba(19,27,46,0.6)",
                border: "1px solid rgba(74,222,128,0.3)",
                boxShadow: "0 0 30px -8px rgba(74,222,128,0.35)",
              }}
            >
              <span style={{ fontSize: 26 }}>{f.icon}</span>
              <span
                style={{
                  fontFamily: inter,
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#e2e8f0",
                }}
              >
                {f.label}
              </span>
            </div>
          );
        })}
      </div>

      <Caption from={60} to={330} fontSize={40}>
        Unlike cloud assistants that upload your data to the web,
      </Caption>
      <Caption from={355} to={700} fontSize={40}>
        Flow runs{" "}
        <span style={{ color: "#86efac", fontWeight: 700 }}>
          100% locally
        </span>{" "}
        on your computer — deterministic execution at the code level.
      </Caption>
    </AbsoluteFill>
  );
};
