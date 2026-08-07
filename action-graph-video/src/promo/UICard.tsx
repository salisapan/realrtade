import React from "react";
import { FONT, LIGHT, RADIUS } from "./theme";

export type CardVariant = "contract" | "invoice" | "test-result" | "spreadsheet" | "chat";

const VARIANT_COPY: Record<
  CardVariant,
  { tag: string; title: string; iconColor: string; rows: string[] }
> = {
  contract: {
    tag: "Contract · Legal",
    title: "MasterAgreement.pdf",
    iconColor: LIGHT.accent,
    rows: ["Party", "Effective Date", "Term", "Governing Law"],
  },
  invoice: {
    tag: "Invoice · Finance",
    title: "Vendor_INV-central.pdf",
    iconColor: LIGHT.accent,
    rows: ["Line Item", "Quantity", "Unit Price", "Total"],
  },
  "test-result": {
    tag: "Test Result · Healthcare",
    title: "Lab_Result_2847.pdf",
    iconColor: LIGHT.accent,
    rows: ["Panel", "Reference Range", "Result", "Flag"],
  },
  spreadsheet: {
    tag: "Ledger",
    title: "Q3_Reconciliation.xlsx",
    iconColor: LIGHT.muted,
    rows: ["Row", "Row", "Row", "Row"],
  },
  chat: {
    tag: "Thread",
    title: "#ops-standup",
    iconColor: LIGHT.muted,
    rows: ["Message", "Message", "Message"],
  },
};

const ICONS: Record<CardVariant, React.ReactNode> = {
  contract: (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#fff" strokeWidth={1.8}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  invoice: (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#fff" strokeWidth={1.8}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M8 8h8M8 12h5M15 15.5l1.5 1.5L19 14" />
    </svg>
  ),
  "test-result": (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#fff" strokeWidth={1.8}>
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </svg>
  ),
  spreadsheet: (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#fff" strokeWidth={1.8}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 10h18M9 4v16" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#fff" strokeWidth={1.8}>
      <path d="M4 5h16v11H8l-4 3z" />
    </svg>
  ),
};

export const UICard: React.FC<{
  readonly variant: CardVariant;
  readonly opacity?: number;
  readonly highlighted?: boolean;
  readonly width?: number;
  /** How many content rows are "populated" (bar -> real-looking filled state). Defaults to none filled. */
  readonly revealCount?: number;
  /** Outer positioning (left/top/transform/zIndex) — computed by the caller via promo/layout.ts's project(). */
  readonly outerStyle?: React.CSSProperties;
}> = ({ variant, opacity = 1, highlighted = false, width = 300, revealCount = 0, outerStyle }) => {
  const copy = VARIANT_COPY[variant];

  return (
    <div style={{ position: "absolute", pointerEvents: "none", ...outerStyle }}>
      <div
        style={{
          width,
          opacity,
          borderRadius: RADIUS.card,
          padding: "24px 22px 26px",
          background: `linear-gradient(180deg, ${LIGHT.panel}, ${LIGHT.panel2})`,
          border: `1px solid ${highlighted ? LIGHT.accent : LIGHT.line}`,
          boxShadow: highlighted
            ? `${LIGHT.cardShadow}, 0 0 0 3px ${LIGHT.glow}`
            : LIGHT.cardShadow,
          fontFamily: FONT.disp,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: copy.iconColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
          >
            {ICONS[variant]}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: LIGHT.accent2,
              }}
            >
              {copy.tag}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: LIGHT.txtHi,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {copy.title}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {copy.rows.map((label, i) => {
            const filled = i < revealCount;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 10, color: LIGHT.muted, flex: "0 0 auto" }}>{label}</span>
                <span
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    background: filled ? LIGHT.accent : LIGHT.line,
                    maxWidth: 120 - i * 10,
                    boxShadow: filled ? `0 0 0 1px ${LIGHT.accent}` : "none",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
