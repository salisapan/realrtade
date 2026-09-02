import { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="asis-eyebrow">
      <span className="dot" />
      {children}
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
}) {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "56px 20px 20px" }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 style={{ fontSize: "clamp(30px,4.2vw,46px)", fontWeight: 700, letterSpacing: "-0.01em", margin: "0 0 12px" }}>
        {title}
      </h1>
      {subtitle && <p style={{ color: "var(--muted)", fontSize: 17, maxWidth: 700, margin: 0 }}>{subtitle}</p>}
    </div>
  );
}

export function Section({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 20px 64px", ...style }}>{children}</section>
  );
}

export function StatTile({ num, label }: { num: string; label: string }) {
  return (
    <div className="asis-stat-tile">
      <div className="num asis-mono">{num}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}

export function BeamCard({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`asis-card asis-beam ${className}`} style={style}>
      {children}
    </div>
  );
}

export const PILLAR_ICONS: Record<string, ReactNode> = {
  star: (
    <>
      <circle cx="12" cy="9" r="5.2" strokeWidth="2" />
      <path d="M9 13.5 7.5 21l4.5-2.4 4.5 2.4L15 13.5" strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  layers: (
    <>
      <path d="M3 17l6-6 4 4 8-8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 7h6v6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" strokeWidth="2" />
      <path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="7" r="2.4" strokeWidth="2" />
      <path d="M15.5 14.3c2.4.3 4.1 2 5 5.2" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="10" height="18" rx="1.2" strokeWidth="2" />
      <path d="M14 21h6V9l-6-3" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7.5 7h.01M10.5 7h.01M7.5 11h.01M10.5 11h.01M7.5 15h.01M10.5 15h.01" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  team: (
    <>
      <circle cx="8" cy="9" r="2.6" strokeWidth="2" />
      <circle cx="16" cy="9" r="2.6" strokeWidth="2" />
      <path d="M2.8 19.5c.8-2.9 2.8-4.5 5.2-4.5s4.4 1.6 5.2 4.5M11 19.5c.7-2.6 2.6-4 4.9-4s4.2 1.4 4.9 4" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.8-3 8-7 9-4-1-7-4.2-7-9V6l7-3Z" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  check: (
    <>
      <path d="M3 17l6-6 4 4 8-8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 7h6v6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" strokeWidth="2" />
      <path d="M8 21h8M12 17v4" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3l7 3v6c0 4.8-3 8-7 9-4-1-7-4.2-7-9V6l7-3Z" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function PillarIcon({ icon }: { icon: string }) {
  return (
    <div className="asis-pillar-icon">
      <svg viewBox="0 0 24 24">{PILLAR_ICONS[icon] ?? PILLAR_ICONS.star}</svg>
    </div>
  );
}
