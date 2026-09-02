import { useRef, useState } from "react";
import { testimonials } from "@/data/as-is-content";

export default function AsIsTestimonialStack() {
  const [active, setActive] = useState(0);
  const [dragX, setDragX] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const total = testimonials.length;

  function next() {
    setActive((i) => (i + 1) % total);
  }
  function prev() {
    setActive((i) => (i - 1 + total) % total);
  }

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    setDragX(e.clientX - startX.current);
  }
  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragX > 60) prev();
    else if (dragX < -60) next();
    setDragX(0);
  }

  return (
    <div>
      <div style={{ position: "relative", minHeight: 210 }}>
        {testimonials.map((t, i) => {
          const order = (i - active + total) % total;
          if (order > 2) return null;
          const isActive = order === 0;
          const scale = 1 - order * 0.045;
          const ty = -order * 14;
          const tx = isActive ? dragX : 0;
          return (
            <div
              key={t.name}
              onPointerDown={isActive ? onPointerDown : undefined}
              onPointerMove={isActive ? onPointerMove : undefined}
              onPointerUp={isActive ? onPointerUp : undefined}
              onPointerCancel={isActive ? onPointerUp : undefined}
              className="asis-glass"
              style={{
                position: "absolute",
                inset: 0,
                padding: "22px 24px",
                cursor: isActive ? "grab" : "default",
                userSelect: "none",
                touchAction: "pan-y",
                transform: `translateX(${tx}px) scale(${scale}) translateY(${ty}px)`,
                opacity: 1 - order * 0.22,
                zIndex: total - order,
                transition: dragging.current && isActive ? "none" : "transform .35s cubic-bezier(.2,.75,.2,1), opacity .35s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg,var(--accent),var(--accent-2))",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 700, color: "#fff", fontSize: 16 }}>
                    {t.initials}
                  </span>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15.5, color: "var(--txt-hi)" }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.role}</div>
                </div>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 15, lineHeight: 1.6, color: "var(--txt)" }}>"{t.quote}"</p>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {t.tags.map((tag) => (
                  <span
                    key={tag.t}
                    className="asis-mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.04em",
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--line-hi)",
                      color: tag.hl ? "var(--accent-2)" : "var(--muted)",
                      background: tag.hl ? "color-mix(in srgb,var(--accent) 10%,transparent)" : "transparent",
                    }}
                  >
                    {tag.t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 18, marginTop: 24 }}>
        <button type="button" onClick={prev} aria-label="הקודם" className="asis-carousel-nav">
          ‹
        </button>
        <div style={{ display: "flex", gap: 7 }}>
          {testimonials.map((t, i) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`עדות ${i + 1} מתוך ${total}`}
              style={{
                width: i === active ? 20 : 7,
                height: 7,
                padding: 0,
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                background: i === active ? "linear-gradient(90deg,var(--accent),var(--accent-2))" : "var(--line-hi)",
                transition: "width .25s, background .25s",
              }}
            />
          ))}
        </div>
        <button type="button" onClick={next} aria-label="הבא" className="asis-carousel-nav">
          ›
        </button>
      </div>
    </div>
  );
}
