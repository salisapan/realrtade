import { Link } from "react-router-dom";
import AsIsLayout from "@/components/as-is/AsIsLayout";
import { Section } from "@/components/as-is/AsIsUI";
import { useAsIsSeo } from "@/components/as-is/useAsIsSeo";

export default function AsIsNotFound() {
  useAsIsSeo({
    title: "העמוד לא נמצא",
    description: "העמוד המבוקש לא נמצא באתר AS-IS GROUP.",
    path: "/as-is/404",
  });

  return (
    <AsIsLayout>
      <Section style={{ textAlign: "center", paddingTop: 90, paddingBottom: 90 }}>
        <div className="asis-mono" style={{ fontSize: 15, color: "var(--accent-2)", marginBottom: 10 }}>
          404
        </div>
        <h1 style={{ fontSize: "clamp(26px,3.6vw,38px)", margin: "0 0 14px" }}>העמוד לא נמצא</h1>
        <p style={{ color: "var(--muted)", maxWidth: 480, margin: "0 auto 28px" }}>
          יכול להיות שהקישור שגוי או שהעמוד הועבר. אפשר לחזור לעמוד הבית או לצור איתנו קשר ישירות.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/as-is" className="asis-btn">
            חזרה לעמוד הבית
          </Link>
          <Link to="/as-is/contact" className="asis-btn-outline">
            צור קשר
          </Link>
        </div>
      </Section>
    </AsIsLayout>
  );
}
