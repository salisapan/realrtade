import { Link } from "react-router-dom";
import AsIsLayout from "@/components/as-is/AsIsLayout";
import AsIsCityDonut from "@/components/as-is/AsIsCityDonut";
import ProjectSketch from "@/components/as-is/ProjectSketch";
import { PageHero, Section, StatTile } from "@/components/as-is/AsIsUI";
import { useAsIsSeo } from "@/components/as-is/useAsIsSeo";
import { heroStats, projects } from "@/data/as-is-content";

export default function AsIsProjects() {
  useAsIsSeo({
    title: "הפרויקטים שלנו",
    description: 'פורטפוליו פרויקטי ההתחדשות העירונית של AS-IS GROUP — 8 מתחמים, 82 בניינים ו-3,072 יח"ד בתכנון בערים שונות בישראל.',
    path: "/as-is/projects",
  });
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

        <div className="asis-glass" style={{ padding: "24px 26px", marginBottom: 32 }}>
          <h3 style={{ fontSize: 17, margin: "0 0 18px" }}>פילוח יח"ד בתכנון לפי עיר</h3>
          <AsIsCityDonut />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          {sorted.map((p) => (
            <Link
              key={p.slug}
              to={`/as-is/projects/${p.slug}`}
              className="asis-card"
              style={{ textDecoration: "none", display: "block" }}
            >
              <div style={{ height: 72, marginBottom: 12 }}>
                <ProjectSketch sketch={p.sketch} />
              </div>
              <div className="asis-proj-city">{p.city}</div>
              <h4 style={{ fontSize: 16.5, margin: "6px 0 14px", color: "var(--txt-hi)" }}>{p.name}</h4>
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
            </Link>
          ))}
        </div>
      </Section>
    </AsIsLayout>
  );
}
