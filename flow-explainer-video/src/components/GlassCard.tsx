import React from "react";
import { inter } from "../fonts";

export const GlassCard: React.FC<{
  children: React.ReactNode;
  label?: string;
  width?: number;
  style?: React.CSSProperties;
  accent?: string;
}> = ({ children, label, width, style, accent = "#60a5fa" }) => {
  return (
    <div
      style={{
        position: "relative",
        width,
        borderRadius: 24,
        padding: label ? "56px 32px 32px 32px" : 32,
        background:
          "linear-gradient(165deg, rgba(19,27,46,0.72), rgba(11,17,32,0.72))",
        border: "1px solid rgba(148,163,184,0.14)",
        boxShadow: "0 24px 60px -18px rgba(0,0,0,0.55)",
        backdropFilter: "blur(16px)",
        ...style,
      }}
    >
      {label ? (
        <div
          style={{
            position: "absolute",
            top: 24,
            right: 28,
            padding: "5px 14px",
            borderRadius: 999,
            border: `1px solid ${accent}55`,
            color: accent,
            fontFamily: inter,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 1.2,
          }}
        >
          {label}
        </div>
      ) : null}
      {children}
    </div>
  );
};
