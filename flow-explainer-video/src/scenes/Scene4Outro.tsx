import React from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { GlowBackground } from "../components/GlowBackground";
import { inter, spaceGrotesk } from "../fonts";

const bars = [0.4, 0.65, 0.5, 0.85, 1];

export const Scene4Outro: React.FC = () => {
  const frame = useCurrentFrame();

  const dashboardOpacity = interpolate(
    frame,
    [10, 40, 210, 255],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const dashboardScale = interpolate(frame, [10, 40, 255], [0.94, 1, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
    output: "perceptual-scale",
  });

  const hoursCount = interpolate(frame, [40, 190], [0, 14.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const line1Opacity = interpolate(
    frame,
    [250, 280, 370, 405],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const line2Opacity = interpolate(frame, [330, 365, 420, 455], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logoOpacity = interpolate(frame, [465, 510], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoScale = interpolate(frame, [465, 520], [0.85, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 200 }),
    output: "perceptual-scale",
  });
  const glow = interpolate(frame % 120, [0, 60, 120], [0.5, 0.9, 0.5]);

  return (
    <AbsoluteFill name="Scene 4 - Outro" style={{ fontFamily: inter }}>
      <GlowBackground accent="#4285F4" />

      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          translate: "-50% -50%",
          opacity: dashboardOpacity,
          scale: dashboardScale,
          width: 760,
          borderRadius: 28,
          padding: 48,
          background: "rgba(19,27,46,0.65)",
          border: "1px solid rgba(110,160,255,0.25)",
          boxShadow: "0 40px 100px -30px rgba(0,0,0,0.6)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div
          style={{
            fontFamily: spaceGrotesk,
            fontSize: 22,
            letterSpacing: 2,
            color: "#94a3b8",
            marginBottom: 12,
          }}
        >
          AVERAGE TIME RECLAIMED / WEEK
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 14,
            marginBottom: 32,
          }}
        >
          <span
            style={{
              fontFamily: spaceGrotesk,
              fontSize: 108,
              fontWeight: 700,
              color: "#ffffff",
              textShadow: "0 0 40px rgba(66,133,244,0.5)",
            }}
          >
            {hoursCount.toFixed(1)}
          </span>
          <span
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: "#93c5fd",
            }}
          >
            hrs saved
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 16,
            height: 120,
          }}
        >
          {bars.map((h, i) => {
            const barLocal = interpolate(
              frame,
              [80 + i * 12, 130 + i * 12],
              [0, h],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              },
            );
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${barLocal * 100}%`,
                  borderRadius: 8,
                  background: "linear-gradient(180deg, #6EA0FF, #4285F4)",
                  boxShadow: "0 0 18px rgba(66,133,244,0.5)",
                }}
              />
            );
          })}
        </div>
      </div>

      <Interactive.Div
        name="Thesis line 1"
        style={{
          position: "absolute",
          top: "42%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: line1Opacity,
          translate: `0 ${interpolate(frame, [250, 290], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
          fontFamily: spaceGrotesk,
          fontSize: 56,
          fontWeight: 600,
          color: "#94a3b8",
        }}
      >
        Applications are the Backend.
      </Interactive.Div>

      <Interactive.Div
        name="Thesis line 2"
        style={{
          position: "absolute",
          top: "52%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: line2Opacity,
          translate: `0 ${interpolate(frame, [330, 370], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
          fontFamily: spaceGrotesk,
          fontSize: 72,
          fontWeight: 700,
          color: "#ffffff",
          textShadow: "0 0 30px rgba(66,133,244,0.4)",
        }}
      >
        Flow is the Interface.
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          translate: "-50% -50%",
          opacity: logoOpacity,
          scale: logoScale,
          textAlign: "center",
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
            opacity: glow * 0.25,
            filter: "blur(120px)",
          }}
        />
        <div
          style={{
            position: "relative",
            fontFamily: spaceGrotesk,
            fontSize: 130,
            fontWeight: 700,
            letterSpacing: 14,
            color: "#ffffff",
            textShadow: `0 0 ${40 + glow * 30}px rgba(66,133,244,0.65)`,
          }}
        >
          FLOW
        </div>
        <div
          style={{
            position: "relative",
            marginTop: 8,
            fontFamily: inter,
            fontSize: 28,
            fontWeight: 500,
            color: "#cbd5e1",
          }}
        >
          Stop managing software. Let software work for you.
        </div>
        <div
          style={{
            position: "relative",
            marginTop: 28,
            fontFamily: inter,
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: 1,
            color: "#6EA0FF",
          }}
        >
          the-flow-ai.netlify.app
        </div>
      </div>
    </AbsoluteFill>
  );
};
