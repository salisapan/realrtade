import React from "react";
import { inter } from "../fonts";

type IconKind = "mail" | "sheet" | "form" | "legal";

const iconGlyph: Record<IconKind, string> = {
  mail: "✉",
  sheet: "▦",
  form: "☷",
  legal: "§",
};

const iconColor: Record<IconKind, string> = {
  mail: "#60a5fa",
  sheet: "#34d399",
  form: "#f472b6",
  legal: "#fbbf24",
};

export const WindowCard: React.FC<{
  title: string;
  meta: string;
  icon: IconKind;
  top: number;
  left: number;
  width: number;
  rotateDeg: number;
  scale: number;
  opacity: number;
  zIndex: number;
  filter?: string;
  badge?: number;
}> = ({
  title,
  meta,
  icon,
  top,
  left,
  width,
  rotateDeg,
  scale,
  opacity,
  zIndex,
  filter,
  badge,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        width,
        opacity,
        zIndex,
        scale,
        rotate: `${rotateDeg}deg`,
        borderRadius: 14,
        overflow: "visible",
        fontFamily: inter,
        filter,
      }}
    >
      {badge ? (
        <div
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "#ef4444",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            boxShadow: "0 0 16px rgba(239,68,68,0.7)",
            zIndex: 2,
          }}
        >
          {badge}
        </div>
      ) : null}
      <div
        style={{
          borderRadius: 14,
          overflow: "hidden",
          background: "#131b2e",
          border: "1px solid rgba(148,163,184,0.18)",
          boxShadow: "0 30px 60px -20px rgba(0,0,0,0.65)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "#1a2338",
            borderBottom: "1px solid rgba(148,163,184,0.12)",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#f87171",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#fbbf24",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#34d399",
            }}
          />
          <div
            style={{
              marginLeft: 8,
              color: "#94a3b8",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: `${iconColor[icon]}22`,
                color: iconColor[icon],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              {iconGlyph[icon]}
            </div>
            <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>
              {meta}
            </div>
          </div>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 8,
                borderRadius: 4,
                width: i === 2 ? "55%" : "88%",
                background: "rgba(148,163,184,0.16)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
