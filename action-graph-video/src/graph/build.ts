// Layered-cone knowledge graph — same topology as the live site's canvas
// (flow-landing/index.html, the "Action Graph" section), ported to feed a
// real 3D scene instead of a 2D canvas projection.

export type GraphNode = {
  // rest position on the cone (4D: x, y, z, w)
  mx: number;
  my: number;
  mz: number;
  mw: number;
  // scattered "4D fold" position — used as the other end of the fold interpolation
  cx: number;
  cy: number;
  cz: number;
  cw: number;
  layer: number;
  apex: boolean;
  expert: boolean;
};

export type GraphEdge = [number, number];

export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

function rnd(seed: { s: number }, a: number, b: number) {
  // deterministic PRNG (mulberry32) so every render is frame-identical
  seed.s |= 0;
  seed.s = (seed.s + 0x6d2b79f5) | 0;
  let t = Math.imul(seed.s ^ (seed.s >>> 15), 1 | seed.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return a + r * (b - a);
}

export function buildGraph(): Graph {
  const seed = { s: 1337 };
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const layers = [
    { n: 6, r: 0.05, y: -0.36, li: -1, apex: true },
    { n: 12, r: 0.19, y: -0.15, li: 0, apex: false },
    { n: 18, r: 0.32, y: 0.06, li: 1, apex: false },
    { n: 24, r: 0.45, y: 0.28, li: 2, apex: false },
  ];

  const idx: number[][] = [];
  layers.forEach((L) => {
    const arr: number[] = [];
    for (let i = 0; i < L.n; i++) {
      const a = (i / L.n) * Math.PI * 2 + (L.apex ? rnd(seed, -0.5, 0.5) : 0);
      const rr = L.r * (L.apex ? rnd(seed, 0.15, 1) : rnd(seed, 0.94, 1.06));
      nodes.push({
        mx: Math.cos(a) * rr,
        my: L.y,
        mz: Math.sin(a) * rr,
        mw: (L.y + 0.1) * 0.6 + rnd(seed, -0.18, 0.18),
        cx: rnd(seed, -1.1, 1.1),
        cy: rnd(seed, -1.1, 1.1),
        cz: rnd(seed, -1.1, 1.1),
        cw: rnd(seed, -1.1, 1.1),
        layer: L.li,
        apex: L.apex,
        expert: false,
      });
      arr.push(nodes.length - 1);
    }
    idx.push(arr);
  });

  nodes[idx[0][0]].expert = true;

  idx[0].forEach((e) => {
    idx[1].forEach((t) => {
      if (rnd(seed, 0, 1) < 0.42) edges.push([e, t]);
    });
  });
  const link = (A: number[], B: number[], pr: number) => {
    A.forEach((a) => {
      B.forEach((b) => {
        if (rnd(seed, 0, 1) < pr) edges.push([a, b]);
      });
    });
  };
  link(idx[1], idx[2], 0.11);
  link(idx[2], idx[3], 0.09);
  [idx[1], idx[2], idx[3]].forEach((R) => {
    for (let i = 0; i < R.length; i++) edges.push([R[i], R[(i + 1) % R.length]]);
  });
  for (let k = 0; k < 5; k++) {
    edges.push([
      idx[1][Math.floor(rnd(seed, 0, idx[1].length))],
      idx[3][Math.floor(rnd(seed, 0, idx[3].length))],
    ]);
  }

  return { nodes, edges };
}

/** Rotate a 4D point in the ZW and XW planes, mirroring r4() from the live canvas. */
export function rotate4(
  x: number,
  y: number,
  z: number,
  w: number,
  azw: number,
  axw: number,
) {
  const c1 = Math.cos(azw);
  const s1 = Math.sin(azw);
  const z1 = z * c1 - w * s1;
  const w1 = z * s1 + w * c1;
  const c2 = Math.cos(axw);
  const s2 = Math.sin(axw);
  const x1 = x * c2 - w1 * s2;
  const w2 = x * s2 + w1 * c2;
  return { x: x1, y, z: z1, w: w2 };
}

/** Perspective-divide the 4th dimension away — same falloff curve as the canvas WD constant. */
export function project4to3(x: number, y: number, z: number, w: number, WD = 2.7) {
  const k = WD / (WD - w * 0.9);
  return { x: x * k, y: y * k, z: z * k };
}

/**
 * The "4D Fold" envelope: 0 = fully assembled cone, 1 = scattered hypercube-like burst.
 * `loop`: sine period across the whole clip so frame 0 === last frame (seamless loop).
 * otherwise: a single clamp-eased pulse around the 40-68% mark of the clip (narrative cut).
 */
export function foldEnvelope(
  t: number,
  durSec: number,
  loop: boolean,
  interpolateFn: (
    input: number,
    inputRange: number[],
    outputRange: number[],
    options?: Record<string, unknown>,
  ) => number,
  easing: { inOut: (fn: (x: number) => number) => (x: number) => number; cubic: (x: number) => number },
) {
  const raw = loop
    ? (Math.sin((t / durSec) * Math.PI * 2 - Math.PI / 2) + 1) / 2
    : interpolateFn(t, [durSec * 0.4, durSec * 0.54, durSec * 0.68], [0, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: easing.inOut(easing.cubic),
      });
  return Math.max(0, raw - 0.02) / 0.98;
}
