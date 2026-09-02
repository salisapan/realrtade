import { projects } from "@/data/as-is-content";

const CITY_COLORS = [
  "var(--accent)",
  "var(--accent-2)",
  "color-mix(in srgb, var(--accent) 65%, #fff)",
  "color-mix(in srgb, var(--accent-2) 55%, #fff)",
  "color-mix(in srgb, var(--accent) 40%, var(--warm))",
  "color-mix(in srgb, var(--muted) 55%, var(--accent))",
];

export default function AsIsCityDonut() {
  const byCity = new Map<string, number>();
  for (const p of projects) byCity.set(p.city, (byCity.get(p.city) ?? 0) + p.plannedUnits);
  const total = [...byCity.values()].reduce((a, b) => a + b, 0);
  const rows = [...byCity.entries()].sort((a, b) => b[1] - a[1]);

  let acc = 0;
  const stops = rows.map(([city, val], i) => {
    const from = (acc / total) * 100;
    acc += val;
    const to = (acc / total) * 100;
    return `${CITY_COLORS[i % CITY_COLORS.length]} ${from}% ${to}%`;
  });

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 28 }}>
      <div
        style={{
          width: 168,
          height: 168,
          borderRadius: "50%",
          flexShrink: 0,
          background: `conic-gradient(${stops.join(",")})`,
          boxShadow: "0 0 0 1px color-mix(in srgb,var(--accent) 30%,transparent), 0 10px 26px -12px var(--glow)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 20,
            borderRadius: "50%",
            background: "var(--panel-2)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "inset 0 2px 10px rgba(0,0,0,0.15)",
          }}
        >
          <div className="asis-mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--accent-2)" }}>
            {total.toLocaleString()}
          </div>
          <div style={{ fontSize: 9.5, color: "var(--muted)", textAlign: "center", maxWidth: 90 }}>
            יח"ד בתכנון בכל הערים
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 200 }}>
        {rows.map(([city, val], i) => (
          <div key={city} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--txt)" }}>
            <i
              style={{
                width: 12,
                height: 12,
                borderRadius: 4,
                flexShrink: 0,
                background: CITY_COLORS[i % CITY_COLORS.length],
              }}
            />
            <span style={{ flex: 1 }}>{city}</span>
            <b className="asis-mono" style={{ color: "var(--txt-hi)" }}>
              {val.toLocaleString()}
            </b>
            <span style={{ color: "var(--muted)", fontSize: 11.5 }}>({Math.round((val / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
