import React from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { GlowBackground } from "../components/GlowBackground";
import { WindowCard } from "../components/WindowCard";
import { Caption } from "../components/Caption";
import { inter, spaceGrotesk } from "../fonts";

const windows = [
  {
    title: "inbox.mail",
    meta: "34 unread messages",
    icon: "mail" as const,
    top: 150,
    left: 190,
    width: 380,
    rotate: -7,
    start: 15,
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
    start: 60,
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
    start: 105,
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
    start: 150,
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
    start: 220,
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
    start: 290,
    badge: undefined,
  },
];

export const Scene1Chaos: React.FC = () => {
  const frame = useCurrentFrame();

  const openCount = windows.filter((w) => frame >= w.start).length;

  return (
    <AbsoluteFill name="Scene 1 - Chaos" style={{ fontFamily: inter }}>
      <GlowBackground accent="#4285F4" />

      {windows.map((w, i) => {
        const appear = interpolate(frame, [w.start, w.start + 20], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.spring({ damping: 200 }),
        });
        const jitter =
          Math.sin(frame * 0.04 + i * 12) * (frame >= w.start ? 1.4 : 0);

        return (
          <WindowCard
            key={w.title}
            title={w.title}
            meta={w.meta}
            icon={w.icon}
            top={w.top}
            left={w.left}
            width={w.width}
            rotateDeg={w.rotate + jitter}
            scale={0.85 + appear * 0.15}
            opacity={appear}
            zIndex={10 + i}
            badge={frame >= w.start + 25 ? w.badge : undefined}
          />
        );
      })}

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
          border: "1px solid rgba(248,113,113,0.4)",
          fontFamily: spaceGrotesk,
          fontSize: 20,
          fontWeight: 600,
          color: "#fca5a5",
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
          left: 0,
          right: 0,
          bottom: 0,
          height: 340,
          background:
            "linear-gradient(to top, rgba(10,14,26,0.92), rgba(10,14,26,0))",
        }}
      />

      <Caption from={45} to={555} fontSize={44}>
        Knowledge workers waste up to{" "}
        <span style={{ color: "#93c5fd", fontWeight: 700 }}>
          40% of their day
        </span>{" "}
        manually jumping between dozens of applications and re-entering data.
      </Caption>
    </AbsoluteFill>
  );
};
