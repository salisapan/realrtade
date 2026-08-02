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
import { WindowCard } from "../components/WindowCard";
import { KineticText, words } from "../components/KineticText";
import { inter, spaceGrotesk } from "../fonts";

const SPRING_CONFIG = { damping: 20, stiffness: 120, mass: 0.8 };

const windows = [
  {
    title: "inbox.mail",
    meta: "34 unread messages",
    icon: "mail" as const,
    top: 150,
    left: 190,
    width: 380,
    rotate: -7,
    start: 8,
    badge: 12,
  },
  {
    title: "quarterly.xlsx",
    meta: "Row 1,204 selected",
    icon: "sheet" as const,
    top: 600,
    left: 130,
    width: 420,
    rotate: 5,
    start: 34,
    badge: undefined,
  },
  {
    title: "intake-form.web",
    meta: "New submission",
    icon: "form" as const,
    top: 100,
    left: 1010,
    width: 380,
    rotate: 6,
    start: 60,
    badge: 3,
  },
  {
    title: "contract-review.legal",
    meta: "Awaiting signature",
    icon: "legal" as const,
    top: 560,
    left: 1140,
    width: 400,
    rotate: -5,
    start: 86,
    badge: undefined,
  },
  {
    title: "inbox.mail — 2",
    meta: "Client escalation",
    icon: "mail" as const,
    top: 330,
    left: 660,
    width: 300,
    rotate: -10,
    start: 130,
    badge: 5,
  },
  {
    title: "billing.xlsx",
    meta: "Formula error, cell F12",
    icon: "sheet" as const,
    top: 770,
    left: 800,
    width: 340,
    rotate: 8,
    start: 170,
    badge: undefined,
  },
];

export const Scene1Chaos: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const openCount = windows.filter((w) => frame >= w.start).length;

  const tension = interpolate(frame, [0, 460], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const heartbeat = Math.max(
    Math.sin(frame * (0.12 + tension * 0.08)) * 0.5 + 0.5,
    0,
  );

  return (
    <AbsoluteFill
      name="Scene 1 - Chaos"
      style={{
        fontFamily: inter,
        perspective: 1800,
      }}
    >
      <GlowBackground accent="#4285F4" />

      <div
        style={{
          position: "absolute",
          inset: 0,
          rotate: "1 0.3 0 3deg",
        }}
      >
        {windows.map((w, i) => {
          const appear = spring({
            frame: frame - w.start,
            fps,
            config: SPRING_CONFIG,
          });

          return (
            <WindowCard
              key={w.title}
              title={w.title}
              meta={w.meta}
              icon={w.icon}
              top={w.top}
              left={w.left}
              width={w.width}
              rotateDeg={w.rotate}
              scale={0.82 + appear * 0.18}
              opacity={Math.min(appear, 1)}
              zIndex={10 + i}
              badge={frame >= w.start + 22 ? w.badge : undefined}
            />
          );
        })}
      </div>

      <Interactive.Div
        name="Status badge"
        style={{
          position: "absolute",
          top: 56,
          left: 56,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          borderRadius: 999,
          background: "rgba(15,23,42,0.65)",
          border: `1px solid rgba(248,113,113,${(0.4 + heartbeat * 0.35).toFixed(2)})`,
          boxShadow: `0 0 ${10 + heartbeat * 18}px rgba(248,113,113,${(0.15 + heartbeat * 0.25).toFixed(2)})`,
          fontFamily: spaceGrotesk,
          fontSize: 20,
          fontWeight: 600,
          color: "#fca5a5",
          scale: 1 + heartbeat * 0.035,
          opacity: interpolate(frame, [0, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {`${openCount} apps open · switching every 40s`}
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: `inset 0 0 ${160 + tension * 120}px rgba(220,38,38,${(tension * 0.16).toFixed(2)})`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 400,
          background:
            "linear-gradient(to top, rgba(10,14,26,0.94), rgba(10,14,26,0))",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 130,
          display: "flex",
          justifyContent: "center",
          padding: "0 140px",
        }}
      >
        <KineticText
          tokens={words(
            "40% of the day, lost switching between apps.",
            ["40%", "lost"],
          )}
          from={210}
          to={455}
          fontSize={52}
          fontWeight={700}
          maxWidth={1500}
        />
      </div>
    </AbsoluteFill>
  );
};
