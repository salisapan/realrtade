import { Link, useParams } from "react-router-dom";
import AsIsLayout from "@/components/as-is/AsIsLayout";
import ProjectSketch from "@/components/as-is/ProjectSketch";
import { BeamCard, Section } from "@/components/as-is/AsIsUI";
import { useAsIsJsonLd, useAsIsSeo } from "@/components/as-is/useAsIsSeo";
import { company, projects } from "@/data/as-is-content";

export default function AsIsProjectDetail() {
  const { slug } = useParams();
  const project = projects.find((p) => p.slug === slug);

  useAsIsSeo({
    title: project ? `${project.name}, ${project.city}` : "פרויקט לא נמצא",
    description: project?.description ?? "",
    path: `/as-is/projects/${slug ?? ""}`,
  });

  useAsIsJsonLd(
    "as-is-project-jsonld",
    project
      ? {
          "@context": "https://schema.org",
          "@type": "RealEstateListing",
          name: project.name,
          description: project.description,
          address: { "@type": "PostalAddress", addressLocality: project.city, addressCountry: "IL" },
          provider: { "@type": "Organization", name: company.name },
        }
      : null
  );

  if (!project) {
    return (
      <AsIsLayout>
        <Section style={{ textAlign: "center", paddingTop: 80 }}>
          <h1>הפרויקט לא נמצא</h1>
          <Link to="/as-is/projects" className="asis-btn-outline">
            כל הפרויקטים
          </Link>
        </Section>
      </AsIsLayout>
    );
  }

  return (
    <AsIsLayout>
      <Section style={{ paddingTop: 56 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 32 }} className="asis-project-detail-grid">
          <div>
            <div className="asis-proj-city">{project.city}</div>
            <h1 style={{ fontSize: "clamp(28px,4vw,40px)", margin: "8px 0 14px" }}>{project.name}</h1>
            <span className="asis-tag" style={{ marginBottom: 18, display: "inline-block" }}>
              {project.stage}
            </span>
            <p style={{ fontSize: 16.5, lineHeight: 1.8, color: "var(--txt)", margin: "18px 0 24px" }}>
              {project.description}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 26 }}>
              <div className="asis-stat-tile">
                <div className="num asis-mono">{project.buildings}</div>
                <div className="lbl">בניינים</div>
              </div>
              <div className="asis-stat-tile">
                <div className="num asis-mono">{project.existingUnits}</div>
                <div className="lbl">דירות קיימות</div>
              </div>
              <div className="asis-stat-tile">
                <div className="num asis-mono">{project.plannedUnits}</div>
                <div className="lbl">יח"ד בתכנון</div>
              </div>
            </div>
            <Link to="/as-is/contact" className="asis-btn">
              מעוניינים בפרטים נוספים
            </Link>
          </div>
          <BeamCard style={{ padding: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "100%", maxWidth: 320 }}>
              <ProjectSketch sketch={project.sketch} />
            </div>
          </BeamCard>
        </div>

        <div style={{ marginTop: 40 }}>
          <Link to="/as-is/projects" className="asis-btn-outline">
            כל הפרויקטים
          </Link>
        </div>
      </Section>

      <style>{`
        @media (max-width: 780px) {
          .asis-project-detail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AsIsLayout>
  );
}
