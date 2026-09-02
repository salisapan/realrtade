// Abstract, brand-styled building illustrations — no real project photography
// exists yet, so these stand in as honest placeholders (line-art, not photo-real)
// rather than claiming to depict an actual site.

type Sketch = "cluster" | "lowrise" | "campus" | "tower";

function Buildings({ bars }: { bars: { x: number; w: number; h: number }[] }) {
  return (
    <>
      {bars.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={100 - b.h}
            width={b.w}
            height={b.h}
            rx="2"
            fill="color-mix(in srgb, var(--accent) 16%, var(--panel-2))"
            stroke="var(--accent-2)"
            strokeWidth="1"
          />
          {Array.from({ length: Math.max(1, Math.floor(b.h / 10)) }).map((_, row) =>
            Array.from({ length: Math.max(1, Math.floor(b.w / 8)) }).map((_, col) => (
              <rect
                key={`${row}-${col}`}
                x={b.x + 3 + col * 8}
                y={100 - b.h + 4 + row * 10}
                width="4"
                height="5"
                fill="var(--accent-2)"
                opacity="0.55"
              />
            ))
          )}
        </g>
      ))}
    </>
  );
}

const SKETCHES: Record<Sketch, { x: number; w: number; h: number }[]> = {
  tower: [{ x: 42, w: 16, h: 76 }],
  lowrise: [
    { x: 18, w: 22, h: 34 },
    { x: 44, w: 22, h: 44 },
    { x: 70, w: 18, h: 30 },
  ],
  cluster: [
    { x: 8, w: 16, h: 42 },
    { x: 27, w: 16, h: 58 },
    { x: 46, w: 16, h: 36 },
    { x: 65, w: 16, h: 50 },
    { x: 84, w: 12, h: 30 },
  ],
  campus: [
    { x: 4, w: 12, h: 30 },
    { x: 18, w: 12, h: 46 },
    { x: 32, w: 12, h: 62 },
    { x: 46, w: 12, h: 40 },
    { x: 60, w: 12, h: 54 },
    { x: 74, w: 12, h: 34 },
    { x: 88, w: 10, h: 24 },
  ],
};

export default function ProjectSketch({ sketch, className }: { sketch: Sketch; className?: string }) {
  const bars = SKETCHES[sketch];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" style={{ width: "100%", height: "100%", display: "block" }}>
      <line x1="2" y1="100" x2="98" y2="100" stroke="var(--line-hi)" strokeWidth="1" />
      <Buildings bars={bars} />
    </svg>
  );
}
