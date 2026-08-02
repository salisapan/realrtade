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
import { KineticText, words } from "../components/KineticText";
import { ShieldIcon, CheckIcon, BracketsIcon } from "../components/Icons";
import { inter, spaceGrotesk } from "../fonts";

const SPRING_CONFIG = { damping: 14, stiffness: 130, mass: 0.8 };

const features = [
  { label: "Zero Data Leaks", Icon: ShieldIcon, delay: 460 },
  { label: "Zero Hallucinations", Icon: CheckIcon, delay: 510 },
  { label: "Deterministic Execution", Icon: BracketsIcon, delay: 560 },
];

const particles = [0, 1, 2, 3, 4];

const CIRCUIT_PATHS = [
  "M46,104 L82,66 L124,66 L156,104",
  "M44,140 L92,140 L118,168 L164,168",
  "M64,42 L64,88 L102,118",
  "M148,44 L148,82 L178,110",
  "M52,176 L98,176 L138,148",
  "M156,58 L128,90 L128,130",
];

const Ring: React.FC<{
  size: number;
  rotateSpeed: number;
  dasharray: string;
  opacity: number;
  color: string;
  reverse?: boolean;
}> = ({ size, rotateSpeed, dasharray, opacity, color, reverse }) => {
  const frame = useCurrentFrame();
  const rot = ((reverse ? -1 : 1) * frame * rotateSpeed) % 360;
  const r = size / 2 - 2;

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        translate: "-50% -50%",
        rotate: `${rot}deg`,
        opacity,
      }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeDasharray={dasharray}
      />
    </svg>
  );
};

const CircuitCore: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <radialGradient id="orbGlass" cx="35%" cy="28%" r="78%">
          <stop offset="0%" stopColor="rgba(134,239,172,0.32)" />
          <stop offset="55%" stopColor="rgba(6,20,14,0.55)" />
          <stop offset="100%" stopColor="rgba(3,10,7,0.9)" />
        </radialGradient>
      </defs>
      <circle
        cx="100"
        cy="100"
        r="96"
        fill="url(#orbGlass)"
        stroke="rgba(74,222,128,0.45)"
        strokeWidth="1.5"
      />
      <path
        d="M100 38 L152 60 V102 C152 138 129 162 100 172 C71 162 48 138 48 102 V60 Z"
        fill="none"
        stroke="rgba(134,239,172,0.4)"
        strokeWidth="2"
      />
      {CIRCUIT_PATHS.map((d, i) => {
        const speed = 1.5 + i * 0.28;
        const offset = (frame * speed + i * 40) % 240;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="#4ade80"
            strokeWidth="1.6"
            strokeDasharray="40 200"
            strokeDashoffset={-offset}
            opacity={0.85}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};

export const Scene6Security: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const chipAppear = spring({ frame: frame - 10, fps, config: SPRING_CONFIG });
  const idleFloat = Math.sin(frame * 0.025) * 6;

  const boundaryAppear = interpolate(frame, [90, 140], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill name="Scene 6 - Security" style={{ fontFamily: inter }}>
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
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path
            d="M7 17a4 4 0 0 1 .3-8 5.5 5.5 0 0 1 10.6 1.6A3.5 3.5 0 0 1 17 17H7z"
            stroke="#94a3b8"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
        </svg>
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
          top: 250 + idleFloat,
          left: "50%",
          translate: "-50% 0",
          scale: Math.max(chipAppear, 0),
          opacity: Math.min(chipAppear, 1),
        }}
      >
        <div style={{ position: "relative", width: 280, height: 280 }}>
          <Ring
            size={280}
            rotateSpeed={0.35}
            dasharray="2 10"
            opacity={0.4}
            color="#4ade80"
          />
          <Ring
            size={320}
            rotateSpeed={0.22}
            dasharray="1 16"
            opacity={0.28}
            color="#86efac"
            reverse
          />
          <Ring
            size={360}
            rotateSpeed={0.14}
            dasharray="6 4"
            opacity={0.16}
            color="#4ade80"
          />
          <div
            style={{
              position: "absolute",
              inset: 40,
              filter: "drop-shadow(0 0 26px rgba(74,222,128,0.5))",
            }}
          >
            <CircuitCore size={200} />
          </div>
        </div>
        <div
          style={{
            textAlign: "center",
            marginTop: 18,
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
          top: 660,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <KineticText
          tokens={words("Zero data leaves the building.", ["Zero"])}
          from={280}
          to={640}
          fontSize={44}
          fontWeight={700}
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 130,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 28,
        }}
      >
        {features.map((f) => {
          const local = spring({
            frame: frame - f.delay,
            fps,
            config: SPRING_CONFIG,
          });
          const floatY = Math.sin(frame * 0.03 + f.delay) * 3;
          const Icon = f.Icon;
          return (
            <div
              key={f.label}
              style={{
                opacity: Math.min(local, 1),
                translate: `0 ${interpolate(local, [0, 1], [24, 0]) + floatY}px`,
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
              <Icon size={24} color="#4ade80" />
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
    </AbsoluteFill>
  );
};
