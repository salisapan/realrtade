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

const SPRING_CONFIG = { damping: 20, stiffness: 120, mass: 0.8 };

const features = [
  { label: "Zero Data Leaks", Icon: ShieldIcon, delay: 460 },
  { label: "Zero Hallucinations", Icon: CheckIcon, delay: 510 },
  { label: "Deterministic Execution", Icon: BracketsIcon, delay: 560 },
];

const beams = [0, 1, 2, 3, 4];
const MERIDIANS = 9;

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

// A genuine 3D CSS wireframe globe: layered meridian + latitude rings inside
// a perspective container, spinning continuously.
const WireframeGlobe: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame();
  const spin = frame * 0.55;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        perspective: 1000,
      }}
    >
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          transformStyle: "preserve-3d",
          transform: `rotateX(16deg) rotateY(${spin}deg)`,
        }}
      >
        {[...Array(MERIDIANS)].map((_, i) => (
          <div
            key={`m-${i}`}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "1.4px solid rgba(74,222,128,0.5)",
              boxShadow: "0 0 10px rgba(74,222,128,0.3)",
              transform: `rotateY(${(i * 180) / MERIDIANS}deg)`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1.3px solid rgba(134,239,172,0.45)",
            transform: "rotateX(90deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1px solid rgba(134,239,172,0.32)",
            transform: `rotateX(90deg) translateY(-${size * 0.32}px) scale(0.58)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1px solid rgba(134,239,172,0.32)",
            transform: `rotateX(90deg) translateY(${size * 0.32}px) scale(0.58)`,
          }}
        />
      </div>
    </div>
  );
};

export const Scene6Security: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const coreAppear = spring({ frame: frame - 10, fps, config: SPRING_CONFIG });
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

      {beams.map((p) => {
        const period = 80;
        const local = (frame + p * 16) % period;
        const progress = interpolate(local, [0, period], [0, 1]);
        const y = interpolate(progress, [0, 1], [430, 200]);
        const x = 960 + (p - 2) * 50;
        const opacity =
          interpolate(local, [0, 12, period - 24, period], [0, 0.85, 0.85, 0], {
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
              translate: "-50% 0",
              width: 3,
              height: 70,
              borderRadius: 2,
              background:
                "linear-gradient(to bottom, transparent, rgba(134,239,172,0.95), transparent)",
              opacity,
              filter: "blur(0.6px)",
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
          scale: Math.max(coreAppear, 0),
          opacity: Math.min(coreAppear, 1),
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
            size={330}
            rotateSpeed={0.22}
            dasharray="1 16"
            opacity={0.28}
            color="#86efac"
            reverse
          />
          <Ring
            size={378}
            rotateSpeed={0.14}
            dasharray="6 4"
            opacity={0.16}
            color="#4ade80"
          />
          <div
            style={{
              position: "absolute",
              inset: 60,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 38% 32%, rgba(134,239,172,0.4), rgba(6,20,14,0.2) 70%)",
              filter: "blur(18px)",
            }}
          />
          <WireframeGlobe size={190} />
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
          fontSize={48}
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
