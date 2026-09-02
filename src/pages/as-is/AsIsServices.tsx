import { Link } from "react-router-dom";
import AsIsLayout from "@/components/as-is/AsIsLayout";
import { PageHero, Section } from "@/components/as-is/AsIsUI";
import { phases } from "@/data/as-is-content";

export default function AsIsServices() {
  return (
    <AsIsLayout>
      <PageHero
        eyebrow="מפת דרכים · מההתארגנות ועד המפתח"
        title="איך אנחנו עובדים"
        subtitle="מפה ברורה מהצעד הראשון ועד מסירת המפתח — בלי הפתעות בדרך"
      />

      <Section>
        <div style={{ position: "relative", paddingInlineStart: 50 }}>
          <div
            style={{
              position: "absolute",
              insetInlineStart: 17,
              top: 6,
              bottom: 6,
              width: 3,
              borderRadius: 3,
              background: "linear-gradient(180deg,var(--accent-2),var(--accent) 55%,transparent)",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {phases.map((p) => (
              <div key={p.n} style={{ position: "relative" }}>
                <div
                  className="asis-mono"
                  style={{
                    position: "absolute",
                    insetInlineStart: -50,
                    top: 2,
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: "linear-gradient(135deg,var(--accent),var(--accent-2))",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px -6px var(--glow)",
                  }}
                >
                  {p.n}
                </div>
                <div className="asis-card" style={{ padding: "16px 20px" }}>
                  <h3 style={{ fontSize: 18, margin: "0 0 5px" }}>{p.t}</h3>
                  <p style={{ margin: 0, fontSize: 14.5, color: "var(--muted)", lineHeight: 1.55 }}>{p.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section style={{ textAlign: "center" }}>
        <div className="asis-glass" style={{ padding: "34px 26px" }}>
          <h2 style={{ fontSize: "clamp(24px,3.2vw,32px)", margin: "0 0 12px" }}>מתחילים לבדוק היתכנות?</h2>
          <p style={{ color: "var(--muted)", maxWidth: 520, margin: "0 auto 22px" }}>
            כל תהליך מתחיל בבדיקת התכנות כלכלית ראשונית ללא עלות וללא התחייבות.
          </p>
          <Link to="/as-is/contact" className="asis-btn">
            קביעת פגישת היכרות
          </Link>
        </div>
      </Section>
    </AsIsLayout>
  );
}
