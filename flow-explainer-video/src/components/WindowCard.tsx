import React from "react";
import { inter } from "../fonts";
import { MailIcon, SheetIcon, FormIcon, LegalIcon } from "./Icons";

type IconKind = "mail" | "sheet" | "form" | "legal";

const iconMap: Record<IconKind, React.FC<{ size?: number; color?: string }>> =
  {
    mail: MailIcon,
    sheet: SheetIcon,
    form: FormIcon,
    legal: LegalIcon,
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
  translate?: string;
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
  translate,
  badge,
}) => {
  const Icon = iconMap[icon];

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
        translate: translate ?? "0 0",
        borderRadius: 16,
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
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "#ef4444",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
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
          position: "relative",
          borderRadius: 16,
          overflow: "hidden",
          background:
            "linear-gradient(165deg, rgba(21,29,49,0.95), rgba(13,19,34,0.95))",
          border: "1px solid rgba(148,163,184,0.16)",
          boxShadow: "0 36px 70px -22px rgba(0,0,0,0.7)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "38%",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.07), transparent)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "rgba(255,255,255,0.03)",
            borderBottom: "1px solid rgba(148,163,184,0.1)",
          }}
        >
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#f87171",
            }}
          />
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#fbbf24",
            }}
          />
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#34d399",
            }}
          />
          <div
            style={{
              marginLeft: 8,
              color: "#94a3b8",
              fontSize: 12.5,
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
                width: 32,
                height: 32,
                borderRadius: 8,
                background: `${iconColor[icon]}1f`,
                color: iconColor[icon],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon size={17} color={iconColor[icon]} />
            </div>
            <div style={{ color: "#e2e8f0", fontSize: 13.5, fontWeight: 600 }}>
              {meta}
            </div>
          </div>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 7,
                borderRadius: 4,
                width: i === 2 ? "55%" : "88%",
                background: "rgba(148,163,184,0.14)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
