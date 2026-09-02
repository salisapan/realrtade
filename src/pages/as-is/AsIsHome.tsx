import { Link } from "react-router-dom";
import AsIsLayout from "@/components/as-is/AsIsLayout";
import AsIsFaq from "@/components/as-is/AsIsFaq";
import AsIsPillarCarousel from "@/components/as-is/AsIsPillarCarousel";
import AsIsTestimonialStack from "@/components/as-is/AsIsTestimonialStack";
import ProjectSketch from "@/components/as-is/ProjectSketch";
import { BeamCard, Eyebrow, Section, StatTile } from "@/components/as-is/AsIsUI";
import { useAsIsSeo } from "@/components/as-is/useAsIsSeo";
import { company, heroStats, phases, projects, totals } from "@/data/as-is-content";

export default function AsIsHome() {
  useAsIsSeo({
    title: "AS-IS GROUP — מנהלת התחדשות עירונית",
    description:
      "AS-IS GROUP מלווה בעלי דירות בתהליכי התחדשות עירונית, פינוי-בינוי ותמ\"א 38 מקצה לקצה — מהצעד הראשון ועד קבלת המפתח.",
    path: "/as-is",
  });
  const topProjects = [...projects].sort((a, b) => b.plannedUnits - a.plannedUnits).slice(0, 4);

  return (
    <AsIsLayout>
      {/* Hero */}
      <Section style={{ paddingTop: 64, textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <span className="asis-tag">{company.tagline}</span>
          <h1 style={{ fontSize: "clamp(38px,6vw,58px)", fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15, maxWidth: 900 }}>
            מכירים את <span className="asis-chrome-text">AS-IS GROUP</span>
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "clamp(16px,2vw,20px)", maxWidth: 640, margin: 0 }}>
            אנחנו מארגנים ומלווים בעלי דירות בתהליכי התחדשות עירונית מקצה לקצה — מהצעד הראשון ועד קבלת המפתח.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
            <Link to="/as-is/contact" className="asis-btn">
              קביעת פגישת היכרות
            </Link>
            <Link to="/as-is/projects" className="asis-btn-outline">
              הפרויקטים שלנו
            </Link>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 12,
              width: "100%",
              maxWidth: 620,
              marginTop: 30,
            }}
          >
            {heroStats.map((s) => (
              <StatTile key={s.label} num={s.num} label={s.label} />
            ))}
          </div>
        </div>
      </Section>

      {/* Who we are */}
      <Section>
        <Eyebrow>מה אנחנו עושים</Eyebrow>
        <h2 style={{ fontSize: "clamp(26px,3.4vw,36px)", margin: "0 0 22px", maxWidth: 720 }}>
          מלווים דיירים בהתחדשות עירונית
        </h2>
        <div style={{ display: "grid", gap: 16 }}>
          <BeamCard>
            <p style={{ margin: 0, fontSize: 20, lineHeight: 1.75, color: "var(--txt)" }}>
              אנחנו מלווים דיירים בתהליכי התחדשות עירונית מהיום הראשון ועד מסירת המפתח — מארגנים את הבניין, מנהלים
              את המשא ומתן מול היזם והרשויות, ודואגים שתקבלו את המקסימום מהזכויות שלכם.
            </p>
          </BeamCard>
          <div className="asis-takeaway">
            <span className="ic">◆</span>
            <p>
              הפלטפורמה הייחודית שלנו הופכת את התהליך לפשוט ושקוף — מעקב סטטוס, ריכוז מסמכים ותקשורת ישירה לאורך
              כל הדרך.
            </p>
          </div>
        </div>
      </Section>

      {/* Pillars */}
      <Section>
        <Eyebrow>מה מייחד אותנו</Eyebrow>
        <h2 style={{ fontSize: "clamp(26px,3.4vw,36px)", margin: "0 0 22px" }}>היתרונות שמייחדים אותנו</h2>
        <AsIsPillarCarousel />
      </Section>

      {/* Process teaser */}
      <Section>
        <Eyebrow>מפת דרכים · מההתארגנות ועד המפתח</Eyebrow>
        <h2 style={{ fontSize: "clamp(26px,3.4vw,36px)", margin: "0 0 22px" }}>איך אנחנו עובדים</h2>
        <div style={{ position: "relative", paddingInlineStart: 46 }}>
          <div
            style={{
              position: "absolute",
              insetInlineStart: 15,
              top: 4,
              bottom: 4,
              width: 3,
              borderRadius: 3,
              background: "linear-gradient(180deg,var(--accent-2),var(--accent) 55%,transparent)",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {phases.slice(0, 4).map((p) => (
              <div key={p.n} style={{ position: "relative" }}>
                <div
                  className="asis-mono"
                  style={{
                    position: "absolute",
                    insetInlineStart: -46,
                    top: 2,
                    width: 31,
                    height: 31,
                    borderRadius: 9,
                    background: "linear-gradient(135deg,var(--accent),var(--accent-2))",
                    color: "#fff",
                    fontSize: 12.5,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {p.n}
                </div>
                <div className="asis-card" style={{ padding: "12px 16px" }}>
                  <h4 style={{ fontSize: 16, margin: "0 0 3px" }}>{p.t}</h4>
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>{p.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <Link to="/as-is/services" className="asis-btn-outline">
            כל שלבי התהליך
          </Link>
        </div>
      </Section>

      {/* Projects teaser */}
      <Section>
        <Eyebrow>הרקורד שלנו</Eyebrow>
        <h2 style={{ fontSize: "clamp(26px,3.4vw,36px)", margin: "0 0 6px" }}>
          הפרויקטים שלנו — ההיקף מדבר בעד עצמו
        </h2>
        <p style={{ color: "var(--muted)", margin: "0 0 22px" }}>
          {totals.buildings} בניינים · {totals.existingUnits} דירות קיימות · {totals.plannedUnits.toLocaleString()}{" "}
          יח"ד בתכנון
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
          {topProjects.map((p) => (
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
        <div style={{ marginTop: 20 }}>
          <Link to="/as-is/projects" className="asis-btn-outline">
            כל הפרויקטים
          </Link>
        </div>
      </Section>

      {/* Testimonial teaser */}
      <Section style={{ maxWidth: 620 }}>
        <Eyebrow>מה אומרים עלינו</Eyebrow>
        <h2 style={{ fontSize: "clamp(26px,3.4vw,36px)", margin: "0 0 22px" }}>דיירים ממליצים</h2>
        <AsIsTestimonialStack />
      </Section>

      {/* FAQ */}
      <Section style={{ maxWidth: 820 }}>
        <Eyebrow>שאלות נפוצות</Eyebrow>
        <h2 style={{ fontSize: "clamp(26px,3.4vw,36px)", margin: "0 0 22px" }}>שאלות שבעלי דירות שואלים אותנו</h2>
        <AsIsFaq />
      </Section>

      {/* CTA */}
      <Section style={{ textAlign: "center", paddingTop: 20, paddingBottom: 80 }}>
        <h2 style={{ fontSize: "clamp(28px,4vw,42px)", margin: "0 0 16px" }}>מזהים הזדמנות בבניין שלכם?</h2>
        <p style={{ color: "var(--muted)", maxWidth: 560, margin: "0 auto 24px" }}>
          אנו רוצים לפגוש אתכם, בעלי הדירות, ולבחון יחד את ההתכנות למיצוי מלוא זכויותיכם — ללא התחייבות.
        </p>
        <Link to="/as-is/contact" className="asis-btn">
          קביעת פגישת היכרות
        </Link>
      </Section>
    </AsIsLayout>
  );
}
