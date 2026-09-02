import AsIsLayout from "@/components/as-is/AsIsLayout";
import { PageHero, Section, StatTile } from "@/components/as-is/AsIsUI";
import { heroStats, projects } from "@/data/as-is-content";

export default function AsIsProjects() {
  const sorted = [...projects].sort((a, b) => b.plannedUnits - a.plannedUnits);

  return (
    <AsIsLayout>
      <PageHero
        eyebrow="הרקורד שלנו"
        title='הפרויקטים שלנו — ההיקף מדבר בעד עצמו'
        subtitle={`${heroStats[1].num} בניינים · ${heroStats[2].num} דירות קיימות · ${heroStats[3].num} יח"ד בתכנון`}
      />

      <Section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
          {heroStats.slice(1).map((s) => (
            <StatTile key={s.label} num={s.num} label={s.label} />
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          {sorted.map((p) => (
            <div key={p.name} className="asis-card">
              <div className="asis-proj-city">{p.city}</div>
              <h4 style={{ fontSize: 16.5, margin: "6px 0 14px" }}>{p.name}</h4>
              <div style={{ display: "flex", gap: 18, fontSize: 12, color: "var(--muted)" }}>
                <span>
                  <b className="asis-mono" style={{ color: "var(--accent-2)", fontSize: 14, display: "block" }}>
                    {p.buildings}
                  </b>
                  בניינים
                </span>
                <span>
                  <b className="asis-mono" style={{ color: "var(--accent-2)", fontSize: 14, display: "block" }}>
                    {p.existingUnits}
                  </b>
                  דירות קיימות
                </span>
                <span>
                  <b className="asis-mono" style={{ color: "var(--accent-2)", fontSize: 14, display: "block" }}>
                    {p.plannedUnits}
                  </b>
                  בתכנון
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </AsIsLayout>
  );
}
