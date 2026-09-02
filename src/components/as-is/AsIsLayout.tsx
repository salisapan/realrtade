import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "@/styles/as-is-theme.css";
import { AsIsThemeToggle, useAsIsTheme } from "./AsIsThemeToggle";
import { company } from "@/data/as-is-content";

const NAV_LINKS = [
  { to: "/as-is", label: "בית" },
  { to: "/as-is/about", label: "אודות" },
  { to: "/as-is/services", label: "תהליך העבודה" },
  { to: "/as-is/projects", label: "פרויקטים" },
  { to: "/as-is/investors", label: "יזמים ומשקיעים" },
  { to: "/as-is/team", label: "צוות" },
  { to: "/as-is/articles", label: "כתבות" },
  { to: "/as-is/contact", label: "צור קשר" },
];

export default function AsIsLayout({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useAsIsTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="asis" data-theme={theme} style={{ minHeight: "100vh", position: "relative" }}>
      <div className="asis-bg" aria-hidden="true">
        <div className="asis-blob b1" />
        <div className="asis-blob b2" />
      </div>

      <header className="asis-header">
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <Link to="/as-is" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <img
              src="/as-is-logo.jpeg"
              alt={company.name}
              style={{ width: 36, height: 36, borderRadius: 9, objectFit: "cover" }}
            />
            <span style={{ fontFamily: "var(--disp)", fontWeight: 700, color: "var(--txt-hi)", fontSize: 17 }}>
              AS-IS GROUP
            </span>
          </Link>

          <nav style={{ display: "flex", gap: 22, alignItems: "center" }} className="asis-nav-desktop">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`asis-nav-link${location.pathname === l.to ? " active" : ""}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <Link to="/as-is/contact" className="asis-btn-outline asis-nav-desktop" style={{ padding: "10px 20px", fontSize: 14 }}>
            בואו נדבר
          </Link>

          <button
            type="button"
            className="asis-nav-mobile-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="תפריט"
            style={{
              display: "none",
              width: 38,
              height: 38,
              borderRadius: 10,
              border: "1px solid var(--line-hi)",
              background: "var(--panel-2)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="var(--txt-hi)" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {menuOpen && (
          <nav
            className="asis-nav-mobile"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: "4px 20px 16px",
              borderTop: "1px solid var(--line)",
            }}
          >
            {NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="asis-nav-link"
                style={{ padding: "10px 0" }}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main style={{ position: "relative", zIndex: 1 }}>{children}</main>

      <footer className="asis-footer">
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "40px 20px",
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/as-is-logo.jpeg"
              alt={company.name}
              style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover" }}
            />
            <div>
              <div style={{ fontFamily: "var(--disp)", fontWeight: 700, color: "var(--txt-hi)", fontSize: 15 }}>
                AS-IS GROUP
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{company.tagline}</div>
            </div>
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--accent-2)" }}>
            {company.email} · {company.website}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            © {new Date().getFullYear()} AS-IS GROUP. כל הזכויות שמורות.
          </div>
        </div>
      </footer>

      <AsIsThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />

      <style>{`
        @media (max-width: 900px) {
          .asis-nav-desktop { display: none !important; }
          .asis-nav-mobile-toggle { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
