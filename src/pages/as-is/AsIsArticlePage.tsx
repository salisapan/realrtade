import { Link, useParams } from "react-router-dom";
import AsIsLayout from "@/components/as-is/AsIsLayout";
import { Section } from "@/components/as-is/AsIsUI";
import { useAsIsJsonLd, useAsIsSeo } from "@/components/as-is/useAsIsSeo";
import { articles, company } from "@/data/as-is-content";

export default function AsIsArticlePage() {
  const { slug } = useParams();
  const article = articles.find((a) => a.slug === slug);

  useAsIsSeo({
    title: article?.title ?? "כתבה לא נמצאה",
    description: article?.excerpt ?? "",
    path: `/as-is/articles/${slug ?? ""}`,
  });

  useAsIsJsonLd(
    "as-is-article-jsonld",
    article
      ? {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.excerpt,
          datePublished: article.date,
          author: { "@type": "Organization", name: company.name },
          publisher: { "@type": "Organization", name: company.name },
        }
      : null
  );

  if (!article) {
    return (
      <AsIsLayout>
        <Section style={{ textAlign: "center", paddingTop: 80 }}>
          <h1>הכתבה לא נמצאה</h1>
          <Link to="/as-is/articles" className="asis-btn-outline">
            חזרה לכתבות
          </Link>
        </Section>
      </AsIsLayout>
    );
  }

  return (
    <AsIsLayout>
      <Section style={{ paddingTop: 56, maxWidth: 760 }}>
        <div className="asis-mono" style={{ fontSize: 11, color: "var(--accent-2)", marginBottom: 12 }}>
          {article.category} · {article.readTime}
        </div>
        <h1 style={{ fontSize: "clamp(28px,4vw,40px)", margin: "0 0 20px", lineHeight: 1.25 }}>{article.title}</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {article.body.map((p, i) => (
            <p key={i} style={{ margin: 0, fontSize: 16.5, lineHeight: 1.85, color: "var(--txt)" }}>
              {p}
            </p>
          ))}
        </div>
        <div style={{ marginTop: 36 }}>
          <Link to="/as-is/articles" className="asis-btn-outline">
            כל הכתבות
          </Link>
        </div>
      </Section>
    </AsIsLayout>
  );
}
