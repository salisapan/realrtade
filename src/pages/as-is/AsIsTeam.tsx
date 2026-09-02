import AsIsLayout from "@/components/as-is/AsIsLayout";
import { PageHero, Section } from "@/components/as-is/AsIsUI";
import { team, testimonials } from "@/data/as-is-content";

export default function AsIsTeam() {
  return (
    <AsIsLayout>
      <PageHero
        eyebrow="מי מוביל אותנו"
        title="הצוות שלנו"
        subtitle="האנשים שילוו אתכם מהיום הראשון ועד המפתח"
      />

      <Section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
          {team.map((m) => (
            <div key={m.name} className="asis-card asis-beam" style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  margin: "0 auto 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(135deg,var(--accent),var(--accent-2))",
                  boxShadow: "0 0 0 4px color-mix(in srgb,var(--accent) 16%,transparent),0 8px 20px -8px var(--glow)",
                }}
              >
                <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 22, color: "#fff" }}>
                  {m.initials}
                </span>
              </div>
              <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 18, color: "var(--txt-hi)" }}>
                {m.name}
              </div>
              <div
                className="asis-mono"
                style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--accent-2)", textTransform: "uppercase", margin: "4px 0 12px" }}
              >
                {m.role}
              </div>
              <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>{m.bio}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <h2 style={{ fontSize: "clamp(24px,3vw,32px)", margin: "0 0 20px" }}>דיירים ממליצים</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
          {testimonials.slice(0, 3).map((t) => (
            <div key={t.name} className="asis-glass" style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg,var(--accent),var(--accent-2))",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 700, color: "#fff", fontSize: 15 }}>
                    {t.initials}
                  </span>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, color: "var(--txt-hi)" }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.role}</div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--txt)" }}>"{t.quote}"</p>
            </div>
          ))}
        </div>
      </Section>
    </AsIsLayout>
  );
}
