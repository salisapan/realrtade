import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { spaceGrotesk } from "../fonts";

const Droplet: React.FC<{
  leftPct: number;
  topPct: number;
  size: number;
  delay: number;
  flip?: boolean;
}> = ({ leftPct, topPct, size, delay, flip }) => {
  const frame = useCurrentFrame();
  const bob = Math.sin(frame * 0.05 + delay) * 3;

  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 20 28"
      style={{
        position: "absolute",
        left: `${leftPct}%`,
        top: `${topPct}%`,
        translate: `0 ${bob}px`,
        scale: flip ? "-1 1" : "1 1",
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
      }}
    >
      <defs>
        <linearGradient id={`drop-${leftPct}-${topPct}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="45%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>
      <path
        d="M10 1 C13 8 18 14 18 19 A8 8 0 1 1 2 19 C2 14 7 8 10 1 Z"
        fill={`url(#drop-${leftPct}-${topPct})`}
      />
    </svg>
  );
};

// Chrome/metallic "Flow" wordmark — matches the brand's hero logo treatment,
// with small liquid-splash droplet accents echoing the reference art.
export const LiquidLogo: React.FC<{ width?: number }> = ({ width = 480 }) => {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame % 140, [0, 140], [-30, 130]);
  const fontSize = width * 0.24;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div
        style={{
          position: "relative",
          fontFamily: spaceGrotesk,
          fontSize,
          fontWeight: 700,
          letterSpacing: 2,
          lineHeight: 1,
          backgroundImage:
            "linear-gradient(180deg, #ffffff 0%, #e2e8f0 30%, #94a3b8 48%, #64748b 54%, #cbd5e1 72%, #f8fafc 100%)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          color: "transparent",
          filter:
            "drop-shadow(0 3px 2px rgba(0,0,0,0.4)) drop-shadow(0 0 26px rgba(148,163,184,0.35))",
        }}
      >
        Flow
      </div>
      <Droplet leftPct={4} topPct={-24} size={16} delay={0} />
      <Droplet leftPct={21} topPct={-30} size={12} delay={1.4} />
      <Droplet leftPct={46} topPct={-20} size={10} delay={2.6} />
      <Droplet leftPct={88} topPct={-26} size={14} delay={0.7} flip />
      <Droplet leftPct={97} topPct={-10} size={8} delay={3.3} flip />
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          mixBlendMode: "screen",
          opacity: 0.55,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${sweep}%`,
            width: "16%",
            background:
              "linear-gradient(100deg, transparent, rgba(255,255,255,0.9), transparent)",
          }}
        />
      </div>
    </div>
  );
};

// Compact nav-style wordmark for header contexts.
export const NavLogo: React.FC<{ size?: number; color?: string }> = ({
  size = 26,
  color = "#f8fafc",
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontFamily: spaceGrotesk,
      fontSize: size,
      fontWeight: 700,
      color,
      letterSpacing: 0.5,
    }}
  >
    Flow
    <svg
      width={size * 0.42}
      height={size * 0.42}
      viewBox="0 0 24 24"
      style={{ marginBottom: size * 0.06 }}
    >
      <path
        d="M12 2c3.5 4.5 6 8 6 11.5A6 6 0 0 1 6 13.5C6 10 8.5 6.5 12 2z"
        fill="#4285F4"
      />
    </svg>
  </div>
);
