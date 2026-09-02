import { useEffect } from "react";
import { Link } from "react-router-dom";
import AsIsLayout from "@/components/as-is/AsIsLayout";
import { PageHero, Section } from "@/components/as-is/AsIsUI";
import { articles } from "@/data/as-is-content";

export default function AsIsArticles() {
  useEffect(() => {
    document.title = "כתבות ומדריכים בהתחדשות עירונית | AS-IS GROUP";
  }, []);

  return (
    <AsIsLayout>
      <PageHero
        eyebrow="ידע ומידע"
        title="כתבות ומדריכים"
        subtitle="הסברים מקצועיים על התחדשות עירונית, פינוי-בינוי ותמ״א 38 — לבעלי דירות שרוצים להבין את התהליך לעומק"
      />

      <Section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
          {articles.map((a) => (
            <Link key={a.slug} to={`/as-is/articles/${a.slug}`} className="asis-card" style={{ textDecoration: "none", display: "block" }}>
              <div className="asis-mono" style={{ fontSize: 11, color: "var(--accent-2)", marginBottom: 8 }}>
                {a.category} · {a.readTime}
              </div>
              <h3 style={{ fontSize: 18, color: "var(--txt-hi)", margin: "0 0 10px", lineHeight: 1.35 }}>{a.title}</h3>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>{a.excerpt}</p>
            </Link>
          ))}
        </div>
      </Section>
    </AsIsLayout>
  );
}
