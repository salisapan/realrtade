import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GlowBackground } from "../components/GlowBackground";
import { RealLogo } from "../components/Logo";
import { KineticText, words } from "../components/KineticText";
import { inter, spaceGrotesk } from "../fonts";

const SPRING_CONFIG = { damping: 14, stiffness: 130, mass: 0.8 };
const bars = [0.4, 0.65, 0.5, 0.85, 1];

export const Scene8Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dashboardOpacity = interpolate(
    frame,
    [10, 40, 210, 255],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const dashboardScale = spring({ frame: frame - 10, fps, config: SPRING_CONFIG });
  const barGlow = interpolate(frame % 80, [0, 40, 80], [0.5, 1, 0.5]);

  const hoursCount = interpolate(frame, [40, 190], [0, 14.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const logoOpacity = interpolate(frame, [455, 500], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoScale = spring({ frame: frame - 455, fps, config: SPRING_CONFIG });
  const glow = interpolate(frame % 120, [0, 60, 120], [0.5, 0.9, 0.5]);

  return (
    <AbsoluteFill name="Scene 8 - Outro" style={{ fontFamily: inter }}>
      <GlowBackground accent="#4285F4" />

      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          translate: "-50% -50%",
          opacity: dashboardOpacity,
          scale: 0.85 + Math.min(dashboardScale, 1) * 0.15,
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
            const landed = frame > 130 + i * 12;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${barLocal * 100}%`,
                  borderRadius: 8,
                  background: "linear-gradient(180deg, #6EA0FF, #4285F4)",
                  boxShadow: `0 0 ${landed ? 14 + barGlow * 16 : 18}px rgba(66,133,244,0.5)`,
                }}
              />
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "42%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <KineticText
          tokens={words("Applications are the Backend.", [])}
          from={250}
          to={400}
          fontSize={56}
          fontWeight={600}
          style={{ color: "#94a3b8" }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: "52%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <KineticText
          tokens={words("Flow is the Interface.", ["Flow", "Interface"])}
          from={330}
          to={450}
          fontSize={72}
          fontWeight={700}
        />
      </div>

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
            opacity: glow * 0.25,
            filter: "blur(120px)",
          }}
        />
        <div
          style={{
            position: "relative",
            filter: `drop-shadow(0 0 ${30 + glow * 26}px rgba(66,133,244,0.6))`,
          }}
        >
          <RealLogo width={480} />
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
