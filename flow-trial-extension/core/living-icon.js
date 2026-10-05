// The living icon: ONE body of blue gel that breathes, changes shape and closes with a tick. Portable: no chrome.*, no DOM, no network.
//
// It is not a set of pictures. Every frame is computed from one signed distance field (SDF) over the plane:
//
//   field(p, t) = Σ wᵢ(t) · shapeᵢ(warp(p, t))        a weighted blend of shape fields, never of images
//
// so a ring does not fade into a triangle: the same surface deforms into it, through every shape in between. The weights wᵢ are driven by
// springs (a little overshoot, so it moves like jelly, not like a slide), and a slow domain warp plus a breath make it alive even at rest.
// The material (a round gel tube, a gloss highlight, a soft rim and a glow) is shaded from the same field, so it survives the morph.
//
// Shapes, in the order of the approved storyboard: ring → stretch → split → triangle → cube → ring, and done = the same ring with a tick
// drawn inside its hole, in the same blue. Palette: #123ccb #2f6fff #5B8CFF #6fa8ff (the Do It blues).
//
// Use:
//   const a = FlowLivingIcon.createAnimator();      a.setState('idle'|'working'|'done', nowMs)
//   const params = a.frame(nowMs);                    FlowLivingIcon.render(params, sizePx, opts) -> Uint8ClampedArray RGBA (straight alpha)
// The same two calls draw the 512 px demo and the 16 px toolbar icon: the toolbar is rendered live, not from pre-made frames.
const FlowLivingIcon = (() => {
  const PALETTE = Object.freeze({ deep: '#123ccb', core: '#2f6fff', light: '#5B8CFF', glow: '#6fa8ff' });
  const SHAPES = Object.freeze(['ring', 'stretch', 'split', 'triangle', 'cube']);
  // The working sequence: the shapes the body passes through while Glance is doing something, then back to the ring.
  const WORK_SEQUENCE = Object.freeze(['stretch', 'split', 'triangle', 'cube', 'ring']);
  const HOLD_MS = 1150;               // how long a working target is held before the next one is chased
  const DONE_RING_FIRST = 0.82;       // the tick starts drawing once the ring weight has reached this
  const SPRING = { omega: 7.2, zeta: 0.62 };   // under-damped: a little overshoot, jelly not slide
  const CHECK_SPRING = { omega: 6.2, zeta: 0.78 };

  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const C = { deep: hex(PALETTE.deep), core: hex(PALETTE.core), light: hex(PALETTE.light), glow: hex(PALETTE.glow), spec: [0.93, 0.97, 1] };

  // ---- 2D distance helpers (unit space: the icon spans [-1, 1], y up) ---------------------------------------------------------------
  const len = (x, y) => Math.sqrt(x * x + y * y);
  // A smooth |x|: the tube's centre line has no crease, so two blended tubes melt into each other instead of folding.
  const sabs = (x) => Math.sqrt(x * x + 0.0009) - 0.03;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function segDist(px, py, ax, ay, bx, by) {
    const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
    const hh = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
    return len(pax - bax * hh, pay - bay * hh);
  }
  function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h); }
  // Signed distance to an equilateral triangle pointing up, circumradius-ish size r (Inigo Quilez's form).
  function triDist(px, py, r) {
    const k = Math.sqrt(3);
    px = Math.abs(px) - r; py = py + r / k;
    if (px + k * py > 0) { const nx = (px - k * py) / 2, ny = (-k * px - py) / 2; px = nx; py = ny; }
    px -= clamp(px, -2 * r, 0);
    return -len(px, py) * Math.sign(py);
  }
  // Signed distance to a hexagon with a vertex at the top (an isometric cube's outline).
  function hexDist(px, py, r) {
    const kx = -0.866025404, ky = 0.5, kz = 0.577350269;
    // rotate 30° so the flat-top formula gives a pointy-top hexagon
    let x = Math.abs(py), y = Math.abs(px);
    const d = 2 * Math.min(kx * x + ky * y, 0);
    x -= d * kx; y -= d * ky;
    x -= clamp(x, -kz * r, kz * r); y -= r;
    return len(x, y) * Math.sign(y);
  }

  // ---- the shapes. Each returns a signed distance (negative inside the gel). r is the tube radius. -----------------------------------
  const TUBE = 0.165;
  const SHAPE_FN = {
    ring: (x, y, r) => sabs(len(x, y) - 0.56) - r,
    stretch: (x, y, r) => sabs(segDist(x, y, -0.36, 0, 0.36, 0) - 0.27) - r * 0.92,
    split: (x, y, r) => smin(sabs(len(x + 0.37, y) - 0.27) - r * 0.88, sabs(len(x - 0.37, y) - 0.27) - r * 0.88, 0.09),
    triangle: (x, y, r) => sabs(triDist(x, y + 0.06, 0.42) - 0.12) - r * 0.95,
    cube: (x, y) => hexDist(x, y + 0.02, 0.6) - 0.1
  };
  // The tick, drawn along its path up to `progress` (0..1), inside the ring's hole.
  const TICK = [[-0.2, -0.01], [-0.065, -0.145], [0.205, 0.15]];
  const TICK_LEN = (() => { let s = 0; for (let i = 1; i < TICK.length; i++) s += len(TICK[i][0] - TICK[i - 1][0], TICK[i][1] - TICK[i - 1][1]); return s; })();
  function tickDist(x, y, progress, r) {
    if (progress <= 0.001) return 9;
    let left = TICK_LEN * clamp(progress, 0, 1.15), d = 9;
    for (let i = 1; i < TICK.length && left > 0; i++) {
      const ax = TICK[i - 1][0], ay = TICK[i - 1][1], bx = TICK[i][0], by = TICK[i][1];
      const L = len(bx - ax, by - ay), f = Math.min(1, left / L);
      d = Math.min(d, segDist(x, y, ax, ay, ax + (bx - ax) * f, ay + (by - ay) * f));
      left -= L;
    }
    // The stroke thins as it starts or retracts, so the tick grows from nothing and leaves no dot behind.
    return d - r * Math.min(1, progress / 0.3);
  }

  // ---- the field: the blend, the life (breath, sway, warp), the tick -------------------------------------------------------------------
  // params: { w: {ring, stretch, split, triangle, cube}, tick, t (seconds), energy, breath, tube }
  function field(x, y, P) {
    // Breath: a slow scale; sway: a small rotation; squash: stretch along x when the body is moving fast.
    const s = 1 + 0.028 * Math.sin(P.t * 2.25) * P.breath;
    const a = 0.045 * Math.sin(P.t * 0.83) * P.breath + 0.12 * P.energy * Math.sin(P.t * 3.1);
    const ca = Math.cos(a), sa = Math.sin(a);
    let u = (ca * x + sa * y) / s, v = (-sa * x + ca * y) / s;
    const sq = 1 + 0.1 * P.energy;
    u /= sq; v *= sq;
    // Domain warp: slow travelling waves, stronger while it changes shape. It is what makes the surface flow instead of sit.
    const amp = 0.018 * P.breath + 0.07 * P.energy;
    const wu = amp * (Math.sin(3.1 * v + 1.7 * P.t) + 0.55 * Math.sin(5.3 * u - 2.3 * P.t + 1.1));
    const wv = amp * (Math.cos(2.7 * u - 1.3 * P.t) + 0.5 * Math.sin(4.7 * v + 2.9 * P.t + 0.4));
    u += wu; v += wv;
    const r = P.tube;
    let sum = 0, acc = 0;
    for (let i = 0; i < SHAPES.length; i++) {
      const k = SHAPES[i], wi = P.w[k];
      if (wi > 0.0005 || wi < -0.0005) { acc += wi * SHAPE_FN[k](u, v, r); sum += wi; }
    }
    let f = sum !== 0 ? acc / sum : SHAPE_FN.ring(u, v, r);
    if (P.tick > 0.001) f = Math.min(f, tickDist(u, v, P.tick, r * (P.tickBold || 0.5)));
    return f;
  }

  // The cube's faces: a soft crease along the three inner edges and a per-face light, weighted by how much of the body is cube.
  function cubeFacet(x, y, wc) {
    if (wc < 0.02) return { crease: 0, shade: 1 };
    const ang = Math.atan2(y + 0.02, x);
    const d1 = segDist(x, y + 0.02, 0, 0, 0.52 * 0.866, 0.52 * 0.5);
    const d2 = segDist(x, y + 0.02, 0, 0, -0.52 * 0.866, 0.52 * 0.5);
    const d3 = segDist(x, y + 0.02, 0, 0, 0, -0.52);
    // The creases appear only once the body is mostly cube, so a rounding blob never shows lines through it.
    const sm = (a, b, x) => { const q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); };
    const crease = Math.exp(-Math.pow(Math.min(d1, d2, d3) / 0.035, 2)) * 0.05 * sm(0.6, 0.97, wc);
    const deg = ang * 180 / Math.PI;
    const face = deg > 30 && deg < 150 ? 1.12 : (deg >= 150 || deg < -90) ? 0.98 : 0.86;
    return { crease, shade: 1 + (face - 1) * sm(0.35, 0.95, wc) };
  }

  // ---- the material: height of a round gel tube from the distance, then light ---------------------------------------------------------
  const BEVEL = 0.17;
  function height(f, P, x, y) {
    const d = -f;
    if (d <= 0) return 0;
    const b = BEVEL * (P.tube / TUBE);
    const h = d >= b ? b : Math.sqrt(b * b - (b - d) * (b - d));
    return P.w.cube > 0.02 ? h - cubeFacet(x, y, P.w.cube).crease : h;
  }

  // render(params, size, opts) -> RGBA Uint8ClampedArray, straight (not premultiplied) alpha, transparent background.
  // opts: { glow: 0..1 (default by size), bold: tube scale (default by size), background: [r,g,b] to paint opaque (demo / tests),
  //         rows: [y0, y1] to draw only a band of rows (the demo splits a large frame across workers; the result holds only that band) }
  function render(params, size, opts) {
    const o = opts || {};
    const n = Math.max(8, Math.floor(size));
    const small = n <= 24;
    const P = Object.assign({}, params, { tube: TUBE * (o.bold || (n <= 16 ? 1.28 : n <= 32 ? 1.15 : 1)), tickBold: n <= 16 ? 0.95 : n <= 32 ? 0.72 : 0.5 });
    const glowK = o.glow !== undefined ? o.glow : (small ? 0.35 : 1);
    const y0 = o.rows ? Math.max(0, o.rows[0] | 0) : 0, y1 = o.rows ? Math.min(n, o.rows[1] | 0) : n;
    const out = new Uint8ClampedArray(n * Math.max(0, y1 - y0) * 4);
    const px = 2 / n, e = px * 0.75;
    const L = [0.4, 0.62, 0.68]; const Ln = len(len(L[0], L[1]), L[2]); L[0] /= Ln; L[1] /= Ln; L[2] /= Ln;
    const H = [L[0], L[1], L[2] + 1]; const Hn = len(len(H[0], H[1]), H[2]); H[0] /= Hn; H[1] /= Hn; H[2] /= Hn;
    const glowR = 0.13 * (1 + 0.25 * Math.sin(params.t * 2.25) * params.breath);
    const zoom = o.zoom || (small ? 0.94 : 1.06);
    for (let j = y0; j < y1; j++) {
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) * px - 1) * zoom, y = (1 - (j + 0.5) * px) * zoom;
        const f = field(x, y, P);
        const cover = clamp(0.5 - f / (px * zoom), 0, 1);
        // The glow fades to nothing before the frame's edge, so the picture never shows a square around the body.
        const edgeW = clamp((1 - Math.max(Math.abs(x), Math.abs(y)) / zoom) / 0.16, 0, 1);
        const glowA = (f > 0 ? Math.exp(-f / glowR) : 1) * 0.5 * glowK * edgeW * edgeW * (3 - 2 * edgeW);
        let r = 0, g = 0, b = 0, a = 0;
        if (cover > 0) {
          const h0 = height(f, P, x, y);
          const hx = height(field(x + e, y, P), P, x + e, y), hy = height(field(x, y + e, P), P, x, y + e);
          let nx = -(hx - h0) / e, ny = -(hy - h0) / e, nz = 1;
          const nl = len(len(nx, ny), nz); nx /= nl; ny /= nl; nz /= nl;
          const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          const nh = Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]);
          const spec = Math.pow(nh, 60) * 1.2 + Math.pow(nh, 10) * 0.22;
          const fres = Math.pow(1 - nz, 2);
          const fill = clamp(h0 / (BEVEL * (P.tube / TUBE)), 0, 1);
          const shade = cubeFacet(x, y, P.w.cube).shade;
          // Gel: deep blue where the surface turns away, the Do It blue where it faces the light, and light from inside where it is thick.
          const m = clamp(0.05 + 0.95 * diff * diff, 0, 1) * shade;
          r = C.deep[0] + (C.core[0] - C.deep[0]) * m; g = C.deep[1] + (C.core[1] - C.deep[1]) * m; b = C.deep[2] + (C.core[2] - C.deep[2]) * m;
          const inner = 0.16 * fill * fill;
          r += (C.light[0] - r) * inner; g += (C.light[1] - g) * inner; b += (C.light[2] - b) * inner;
          const rim = clamp(fres * 0.6, 0, 1);
          r += (C.glow[0] - r) * rim; g += (C.glow[1] - g) * rim; b += (C.glow[2] - b) * rim;
          // A thin bright line right at the silhouette, like the edge of glass.
          const edge = Math.exp(-Math.max(0, -f) / (px * zoom * 1.6)) * (small ? 0.18 : 0.45);
          r += (0.86 - r) * edge; g += (0.93 - g) * edge; b += (1 - b) * edge;
          const sp = clamp(spec, 0, 1);
          r += (C.spec[0] - r) * sp; g += (C.spec[1] - g) * sp; b += (C.spec[2] - b) * sp;
          a = cover * 0.97;
        }
        // The glow sits under the body, in the lightest blue.
        const ga = glowA * (1 - a);
        const A = a + ga;
        if (A > 0) { r = (r * a + C.light[0] * ga) / A; g = (g * a + C.light[1] * ga) / A; b = (b * a + C.light[2] * ga) / A; }
        let R = r, G = g, B = b, AA = A;
        if (o.background) { const bg = o.background; R = r * A + bg[0] * (1 - A); G = g * A + bg[1] * (1 - A); B = b * A + bg[2] * (1 - A); AA = 1; }
        const k = ((j - y0) * n + i) * 4;
        out[k] = R * 255; out[k + 1] = G * 255; out[k + 2] = B * 255; out[k + 3] = AA * 255;
      }
    }
    return out;
  }

  // ---- the animator: states drive targets, springs drive the weights, so nothing ever jumps ------------------------------------------
  function createAnimator(opts) {
    const o = opts || {};
    const w = {}, v = {};
    SHAPES.forEach((k) => { w[k] = k === 'ring' ? 1 : 0; v[k] = 0; });
    let tick = 0, tickV = 0, state = 'idle', since = 0, last = null, t0 = null, seqIndex = 0, seqAt = 0, doneAt = null;
    // Energy (how hard it is moving) and breath (how much it breathes) are smoothed, so the wobble swells and fades instead of switching on.
    let energy = 0, breath = 1;
    const target = () => {
      const tg = {}; SHAPES.forEach((k) => { tg[k] = 0; });
      if (state === 'working') tg[WORK_SEQUENCE[seqIndex % WORK_SEQUENCE.length]] = 1; else tg.ring = 1;
      return tg;
    };
    function setState(s, now) {
      if (s !== 'idle' && s !== 'working' && s !== 'done') return state;
      const t = typeof now === 'number' ? now : Date.now();
      if (s === state && s !== 'working') return state;
      if (s === 'working' && state !== 'working') { seqIndex = 0; seqAt = t; }
      if (s !== 'done') doneAt = null; else doneAt = t;
      state = s; since = t;
      return state;
    }
    function step(dt, now) {
      if (state === 'working' && now - seqAt >= HOLD_MS) { seqIndex++; seqAt = now; }
      const tg = target();
      const om = o.omega || SPRING.omega, ze = o.zeta || SPRING.zeta;
      SHAPES.forEach((k) => {
        const acc = om * om * (tg[k] - w[k]) - 2 * ze * om * v[k];
        v[k] += acc * dt; w[k] += v[k] * dt;
        if (w[k] < -0.18) { w[k] = -0.18; v[k] = 0; }
      });
      const wantTick = state === 'done' && w.ring >= DONE_RING_FIRST ? 1 : 0;
      const tacc = CHECK_SPRING.omega * CHECK_SPRING.omega * (wantTick - tick) - 2 * CHECK_SPRING.zeta * CHECK_SPRING.omega * tickV;
      tickV += tacc * dt; tick += tickV * dt;
      if (tick < 0) { tick = 0; tickV = 0; }
      const raw = clamp(SHAPES.reduce((s, k) => s + Math.abs(v[k]), 0) / 3.2, 0, 1);
      energy += (raw - energy) * (1 - Math.exp(-dt / 0.28));
      const wantBreath = state === 'working' ? 0.6 : state === 'done' ? 0.55 : 1;
      breath += (wantBreath - breath) * (1 - Math.exp(-dt / 0.6));
    }
    // frame(now) -> params for render(). Integrates in small fixed steps so a slow device and a fast one give the same motion.
    function frame(now) {
      const t = typeof now === 'number' ? now : Date.now();
      if (t0 === null) { t0 = t; last = t; }
      let dt = Math.min(0.25, (t - last) / 1000);
      const STEP = 1 / 120;
      while (dt > 1e-6) { const h = Math.min(STEP, dt); step(h, last + (h * 1000)); last += h * 1000; dt -= h; }
      last = t;
      return { w: Object.assign({}, w), tick: clamp(tick, 0, 1.08), t: (t - t0) / 1000, energy, breath, state };
    }
    // Is anything still visibly moving beyond the breath? The toolbar driver uses it to stop drawing (and let the worker sleep).
    function settled() {
      const e = SHAPES.reduce((s, k) => s + Math.abs(v[k]), 0) + Math.abs(tickV);
      const tg = target();
      const off = SHAPES.reduce((s, k) => s + Math.abs(tg[k] - w[k]), 0);
      return state !== 'working' && e < 0.01 && off < 0.01 && energy < 0.02 && (state !== 'done' || tick > 0.98);
    }
    return { setState, frame, settled, get state() { return state; }, get since() { return since; }, get doneAt() { return doneAt; } };
  }

  // A fixed pose for tests and static icons: a state settled, at a given time.
  function pose(shape, t, extra) {
    const w = {}; SHAPES.forEach((k) => { w[k] = k === shape ? 1 : 0; });
    return Object.assign({ w, tick: 0, t: t || 0, energy: 0, breath: 1 }, extra || {});
  }

  return { PALETTE, SHAPES, WORK_SEQUENCE, HOLD_MS, field, render, createAnimator, pose };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { FlowLivingIcon };
else if (typeof globalThis !== 'undefined') globalThis.FlowLivingIcon = FlowLivingIcon;
