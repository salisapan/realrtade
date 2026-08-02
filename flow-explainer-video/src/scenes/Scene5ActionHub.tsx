import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GlowBackground } from "../components/GlowBackground";
import { KineticText, words } from "../components/KineticText";
import {
  MailIcon,
  SheetIcon,
  ChatIcon,
  CalendarIcon,
  DatabaseIcon,
  FormIcon,
} from "../components/Icons";
import { inter, spaceGrotesk } from "../fonts";

const SPRING_CONFIG = { damping: 20, stiffness: 120, mass: 0.8 };
const HUB = { x: 960, y: 610 };
const RADIUS = 300;

const satellites = [
  { Icon: MailIcon, color: "#60a5fa", label: "Mail" },
  { Icon: SheetIcon, color: "#34d399", label: "Sheets" },
  { Icon: ChatIcon, color: "#f472b6", label: "Chat" },
  { Icon: CalendarIcon, color: "#fbbf24", label: "Calendar" },
  { Icon: DatabaseIcon, color: "#a78bfa", label: "Database" },
  { Icon: FormIcon, color: "#f87171", label: "CRM" },
];

export const Scene5ActionHub: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hubAppear = spring({ frame: frame - 30, fps, config: SPRING_CONFIG });
  const ringRotation = frame * 0.12;
  const hubPulse = interpolate(frame % 90, [0, 45, 90], [0.5, 0.95, 0.5]);

  return (
    <AbsoluteFill name="Scene 5 - Action Hub" style={{ fontFamily: inter }}>
      <GlowBackground accent="#38bdf8" />

      <div
        style={{
          position: "absolute",
          top: 100,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <KineticText
          tokens={words("One system. Every digital action.", ["Every"])}
          from={12}
          fontSize={58}
          fontWeight={700}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: HUB.y,
          left: HUB.x,
          width: 0,
          height: 0,
          rotate: `${ringRotation}deg`,
        }}
      >
        {satellites.map((s, i) => {
          const angle = (i * 360) / satellites.length - 90;
          const rad = (angle * Math.PI) / 180;
          const sx = Math.cos(rad) * RADIUS;
          const sy = Math.sin(rad) * RADIUS;

          const local = spring({
            frame: frame - (60 + i * 18),
            fps,
            config: SPRING_CONFIG,
          });

          const period = 90;
          const t = (frame + i * 15) % period;
          const travel = interpolate(t, [0, period], [0, 1]);
          const px = sx * travel;
          const py = sy * travel;
          const dotOpacity = interpolate(
            t,
            [0, 8, period - 14, period],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          const Icon = s.Icon;

          return (
            <React.Fragment key={s.label}>
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 1,
                  height: 1,
                  overflow: "visible",
                  opacity: Math.min(local, 1),
                }}
              >
                <line
                  x1={0}
                  y1={0}
                  x2={sx}
                  y2={sy}
                  stroke="#6EA0FF"
                  strokeWidth={1.5}
                  opacity={0.35}
                />
                <circle
                  cx={px}
                  cy={py}
                  r={4}
                  fill="#93c5fd"
                  opacity={dotOpacity}
                  style={{ filter: "drop-shadow(0 0 6px #60a5fa)" }}
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  top: sy,
                  left: sx,
                  translate: "-50% -50%",
                  opacity: Math.min(local, 1),
                  scale: 0.6 + Math.min(local, 1) * 0.4,
                  rotate: `${-ringRotation}deg`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 18,
                      background: "rgba(15,20,36,0.8)",
                      border: `1px solid ${s.color}66`,
                      boxShadow: `0 0 22px -4px ${s.color}88`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={28} color={s.color} />
                  </div>
                  <span
                    style={{
                      fontFamily: spaceGrotesk,
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#cbd5e1",
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          top: HUB.y,
          left: HUB.x,
          translate: "-50% -50%",
          opacity: Math.min(hubAppear, 1),
          scale: Math.max(hubAppear, 0),
        }}
      >
        <div
          style={{
            position: "relative",
            width: 180,
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: -30,
              borderRadius: "50%",
              background: "#38bdf8",
              opacity: hubPulse * 0.35,
              filter: "blur(30px)",
            }}
          />
          <div
            style={{
              width: 170,
              height: 170,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 35% 30%, rgba(147,197,253,0.4), rgba(15,23,42,0.9) 70%)",
              border: `1.5px solid rgba(96,165,250,${(0.6 + hubPulse * 0.3).toFixed(2)})`,
              boxShadow: `0 0 ${30 + hubPulse * 30}px rgba(56,189,248,0.55)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: spaceGrotesk,
              fontSize: 30,
              fontWeight: 700,
              color: "#f0f6ff",
              letterSpacing: 1,
            }}
          >
            Flow
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
