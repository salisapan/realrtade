import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SUCCESS_POP_SPRING } from "./springs";
import { FONT, LIGHT } from "./theme";

const STEPS = [
  { label: "Email sent" },
  { label: "Logged in CRM" },
  { label: "Marked Done" },
] as const;

/**
 * Reusable three-icon completion sequence, shared by all three Act 4 use-case
 * cards: email sent -> logged in CRM -> marked Done. Each icon pops in with
 * SUCCESS_POP_SPRING — the one place in the piece a small overshoot is wanted.
 */
export const CompletionBadges: React.FC<{
  readonly startSec: number;
  readonly stepGapSec?: number;
  readonly outerStyle?: React.CSSProperties;
}> = ({ startSec, stepGapSec = 0.3, outerStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ position: "absolute", pointerEvents: "none", ...outerStyle }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {STEPS.map((step, i) => {
          const stepStartFrame = (startSec + i * stepGapSec) * fps;
          const p = spring({
            frame: frame - stepStartFrame,
            fps,
            config: SUCCESS_POP_SPRING,
          });
          if (p <= 0.001) return null;
          return (
            <div
              key={step.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: Math.min(1, p),
                transform: `scale(${0.6 + p * 0.4})`,
                transformOrigin: "left center",
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: LIGHT.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="#fff" strokeWidth={2.6}>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <span
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  color: LIGHT.txt,
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
