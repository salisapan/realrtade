import { Link } from "react-router-dom";
import AsIsLayout from "@/components/as-is/AsIsLayout";
import { PageHero, Section } from "@/components/as-is/AsIsUI";
import { useAsIsJsonLd, useAsIsSeo } from "@/components/as-is/useAsIsSeo";
import { articles, company } from "@/data/as-is-content";

export default function AsIsArticles() {
  useAsIsSeo({
    title: "כתבות ומדריכים בהתחדשות עירונית",
    description: 'מדריכים מקצועיים על התחדשות עירונית, פינוי-בינוי ותמ"א 38 מבית AS-IS GROUP — לבעלי דירות שרוצים להבין את התהליך לעומק.',
    path: "/as-is/articles",
  });

  useAsIsJsonLd("as-is-articles-jsonld", {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: articles.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://www.as-isgroup.co.il/as-is/articles/${a.slug}`,
      name: a.title,
    })),
    publisher: { "@type": "Organization", name: company.name },
  });

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
