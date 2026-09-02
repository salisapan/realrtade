import AsIsLayout from "@/components/as-is/AsIsLayout";
import { BeamCard, PageHero, PillarIcon, Section } from "@/components/as-is/AsIsUI";
import { useAsIsSeo } from "@/components/as-is/useAsIsSeo";
import { heroStats, whyReasons } from "@/data/as-is-content";

export default function AsIsAbout() {
  useAsIsSeo({
    title: "אודות AS-IS GROUP",
    description: "מי אנחנו, למה כדאי לבחור ב-AS-IS GROUP כחברה המארגנת של הבניין שלכם, והמספרים שמאחורי הניסיון שלנו בהתחדשות עירונית.",
    path: "/as-is/about",
  });
  return (
    <AsIsLayout>
      <PageHero
        eyebrow="האמונה שלנו"
        title="למה התחדשות עירונית"
        subtitle="תהליך שמחולל צמיחה והתפתחות — ועונה על צורך לאומי אמיתי"
      />

      <Section style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <BeamCard>
          <p style={{ margin: 0, fontSize: 20, lineHeight: 1.75, color: "var(--txt)" }}>
            עולם הנדל״ן הוא תחום מורכב הדורש הקפדה על פרטים רבים. כשאתם בוחרים בנו לנהל עבורכם את תהליכי
            ההתחדשות העירונית, אתם ממקסמים את סיכויי ההצלחה — בזכות המוניטין שלנו המבוסס על ניסיון מקצועי, ידע
            עשיר וסטנדרטים גבוהים.
          </p>
        </BeamCard>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
          {whyReasons.map((r) => (
            <div key={r.t} className="asis-card">
              <PillarIcon icon={r.icon} />
              <h4 style={{ fontSize: 16, margin: "0 0 6px" }}>{r.t}</h4>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>{r.d}</p>
            </div>
          ))}
        </div>

        <div className="asis-takeaway">
          <span className="ic">◆</span>
          <p>
            כל שנותר לכם לעשות הוא פשוט לסמוך עלינו — <b>ולצאת לדרך.</b>
          </p>
        </div>
      </Section>

      <Section>
        <h2 style={{ fontSize: "clamp(24px,3vw,32px)", margin: "0 0 18px" }}>החברה במספרים</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
          {heroStats.map((s) => (
            <div key={s.label} className="asis-stat-tile">
              <div className="num asis-mono">{s.num}</div>
              <div className="lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="asis-glass" style={{ padding: "28px 30px" }}>
          <h3 style={{ fontSize: 20, margin: "0 0 12px" }}>מי אנחנו</h3>
          <p style={{ margin: 0, fontSize: 15.5, color: "var(--muted)", lineHeight: 1.7 }}>
            AS-IS GROUP היא חברה מארגנת המתמחה בליווי בעלי דירות בתהליכי התחדשות עירונית — פינוי-בינוי ותמ"א 38 —
            החל משנת 2018. אנחנו מייצגים את בעלי הדירות מול היזמים והרשויות, מנהלים את המשא ומתן, ודואגים למיצוי
            מלוא הזכויות של כל דייר ודיירת בבניין. הצוות שלנו כולל מומחי תכנון, עורכי דין ואנשי מקצוע עם היכרות
            מעמיקה עם המערכת העירונית — כדי שתקבלו ליווי מקצועי, שקוף ואישי מהיום הראשון ועד קבלת המפתח.
          </p>
        </div>
      </Section>
    </AsIsLayout>
  );
}
