import { useState } from "react";
import { useAsIsJsonLd } from "./useAsIsSeo";
import { faqs } from "@/data/as-is-content";

export default function AsIsFaq() {
  const [open, setOpen] = useState<number | null>(0);

  useAsIsJsonLd("as-is-faq-jsonld", {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {faqs.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q} className="asis-card" style={{ padding: 0, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              style={{
                width: "100%",
                textAlign: "start",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                fontFamily: "var(--disp)",
                fontSize: 15.5,
                fontWeight: 700,
                color: "var(--txt-hi)",
              }}
            >
              <span>{f.q}</span>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  color: "var(--accent-2)",
                  transform: isOpen ? "rotate(45deg)" : "none",
                  transition: "transform .2s",
                  fontSize: 20,
                  lineHeight: 1,
                }}
              >
                +
              </span>
            </button>
            {isOpen && (
              <p style={{ margin: 0, padding: "0 20px 18px", fontSize: 14, color: "var(--muted)", lineHeight: 1.65 }}>
                {f.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
