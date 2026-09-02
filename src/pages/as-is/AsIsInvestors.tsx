import { Link } from "react-router-dom";
import AsIsLayout from "@/components/as-is/AsIsLayout";
import ProjectSketch from "@/components/as-is/ProjectSketch";
import { BeamCard, PageHero, Section, StatTile } from "@/components/as-is/AsIsUI";
import { useAsIsSeo } from "@/components/as-is/useAsIsSeo";
import { heroStats, projects, totals } from "@/data/as-is-content";

const largeProjects = projects.filter((p) => p.buildings >= 10);

export default function AsIsInvestors() {
  useAsIsSeo({
    title: "ליזמים ומשקיעים",
    description: "פורטפוליו פרויקטי התחדשות עירונית בשלים ומאורגנים לשיתופי פעולה עם יזמים ומשקיעים — נציגות דיירים מוכנה וליווי מקצועי מלא.",
    path: "/as-is/investors",
  });
  return (
    <AsIsLayout>
      <PageHero
        eyebrow="שיתופי פעולה"
        title="ליזמים ומשקיעים"
        subtitle="פורטפוליו פרויקטים בשלים ומאורגנים, עם נציגות דיירים מוכנה ולווי מקצועי מלא לאורך כל התהליך"
      />

      <Section>
        <BeamCard>
          <p style={{ margin: 0, fontSize: 19, lineHeight: 1.75, color: "var(--txt)" }}>
            AS-IS GROUP מביאה ליזמים ולמשקיעים פרויקטי התחדשות עירונית מאורגנים היטב — נציגות דיירים מגובשת, בדיקת
            התכנות כלכלית שנעשתה מראש, וליווי משפטי וניהולי צמוד שמקצר את זמני ההבשלה ומפחית סיכונים לאורך
            הפרויקט.
          </p>
        </BeamCard>
      </Section>

      <Section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
          {heroStats.slice(1).map((s) => (
            <StatTile key={s.label} num={s.num} label={s.label} />
          ))}
        </div>

        <h3 style={{ fontSize: 20, margin: "0 0 14px" }}>הפרויקטים המובילים בפורטפוליו</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
          {largeProjects.map((p) => (
            <Link key={p.slug} to={`/as-is/projects/${p.slug}`} className="asis-card" style={{ textDecoration: "none", display: "block" }}>
              <div style={{ height: 56, marginBottom: 10 }}>
                <ProjectSketch sketch={p.sketch} />
              </div>
              <div className="asis-proj-city">{p.city}</div>
              <h4 style={{ fontSize: 16, margin: "6px 0 12px", color: "var(--txt-hi)" }}>{p.name}</h4>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)" }}>
                <span>
                  <b className="asis-mono" style={{ color: "var(--accent-2)", fontSize: 14 }}>
                    {p.buildings}
                  </b>{" "}
                  בניינים
                </span>
                <span>
                  <b className="asis-mono" style={{ color: "var(--accent-2)", fontSize: 14 }}>
                    {p.plannedUnits}
                  </b>{" "}
                  בתכנון
                </span>
              </div>
            </Link>
          ))}
        </div>
        <p style={{ marginTop: 16, fontSize: 13.5, color: "var(--muted)" }}>
          {largeProjects.length} מתוך {projects.length} פרויקטים בפורטפוליו הם מתחמים בהיקף 10 בניינים ומעלה,
          ומהווים חלק משמעותי מ-{totals.plannedUnits.toLocaleString()} יח"ד בתכנון.
        </p>
      </Section>

      <Section style={{ textAlign: "center" }}>
        <div className="asis-glass" style={{ padding: "32px 26px" }}>
          <h2 style={{ fontSize: "clamp(24px,3.2vw,32px)", margin: "0 0 12px" }}>מעוניינים לבחון שיתוף פעולה?</h2>
          <p style={{ color: "var(--muted)", maxWidth: 520, margin: "0 auto 22px" }}>
            נשמח להציג את הפורטפוליו המלא ואת מודל העבודה שלנו מול יזמים.
          </p>
          <Link to="/as-is/contact" className="asis-btn">
            קביעת שיחה
          </Link>
        </div>
      </Section>
    </AsIsLayout>
  );
}
