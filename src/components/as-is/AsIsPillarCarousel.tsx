import { useRef, useState } from "react";
import { PillarIcon } from "./AsIsUI";
import { pillars } from "@/data/as-is-content";

export default function AsIsPillarCarousel() {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startX: 0, scrollLeft: 0 });

  function onPointerDown(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    setDragging(true);
    drag.current = { startX: e.clientX, scrollLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || !dragging) return;
    el.scrollLeft = drag.current.scrollLeft - (e.clientX - drag.current.startX);
  }
  function onPointerUp() {
    setDragging(false);
  }
  function scrollBy(dir: 1 | -1) {
    ref.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
  }

  return (
    <div>
      <div
        ref={ref}
        className={`asis-hscroll${dragging ? " is-dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {pillars.map((p) => (
          <div key={p.t} className="asis-card" style={{ width: 220, userSelect: "none" }}>
            <PillarIcon icon={p.icon} />
            <h4 style={{ fontSize: 16, margin: "0 0 6px" }}>{p.t}</h4>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>{p.d}</p>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 6 }}>
        <button type="button" onClick={() => scrollBy(1)} aria-label="הקודם" className="asis-carousel-nav">
          ‹
        </button>
        <button type="button" onClick={() => scrollBy(-1)} aria-label="הבא" className="asis-carousel-nav">
          ›
        </button>
      </div>
    </div>
  );
}
