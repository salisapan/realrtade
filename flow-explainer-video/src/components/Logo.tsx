import React from "react";
import { CanvasImage, interpolate, staticFile, useCurrentFrame } from "remotion";
import { spaceGrotesk } from "../fonts";

const LOGO_SRC = staticFile("logo/flow-liquid.png");
const LOGO_RATIO = 419 / 950;

// The real liquid-metal "Flow" wordmark, with a moving specular sheen
// clipped to the logo's own alpha shape.
export const RealLogo: React.FC<{ width?: number }> = ({ width = 480 }) => {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame % 140, [0, 140], [-30, 130]);
  const height = width * LOGO_RATIO;

  return (
    <div style={{ position: "relative", width, height }}>
      <CanvasImage
        src={LOGO_SRC}
        style={{
          width,
          height,
          filter:
            "drop-shadow(0 8px 20px rgba(0,0,0,0.45)) drop-shadow(0 0 44px rgba(148,163,184,0.4))",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          mixBlendMode: "screen",
          opacity: 0.65,
          WebkitMaskImage: `url(${LOGO_SRC})`,
          WebkitMaskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskImage: `url(${LOGO_SRC})`,
          maskSize: "contain",
          maskRepeat: "no-repeat",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${sweep}%`,
            width: "18%",
            background:
              "linear-gradient(100deg, transparent, rgba(255,255,255,0.95), transparent)",
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
