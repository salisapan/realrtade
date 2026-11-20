/* Action Graph on the About page. Moved from the homepage unchanged: the same scroll-driven canvas (chaos settles into the
   ordered cone as the band reaches the top of the screen), the same palette in day and night, the same gentle headline rise.
   It runs only while the band is on screen (IntersectionObserver), reads layout before it writes, and draws on one rAF loop. */
(function () {
const root = document.documentElement;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('rm');
const C = { graph: { sysR: 0.47, sysY: -0.01, sysPhase: 0.62 } };
const $ = (s) => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, [a, b]) => clamp((p - a) / (b - a));
const bez = (() => { const [x1, y1, x2, y2] = [0.22, 1, 0.36, 1];
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { let t = x; for (let i = 0; i < 6; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= (X(t) - x) / d; } return Y(clamp(t)); }; })();
const ease = (t) => bez(clamp(t));
function makeGraph() {
  const cv = $('#agraphCanvas'); if (!cv || !cv.getContext) return null;
  const g = cv.getContext('2d'); if (!g) return null;
  const gst = cv.parentNode;
  let EXP, TEAM, LINE, DIM, FOG, SHA, SHC, HALO;
  function pal() {   // v13r6: light in day (fog = white), Flow dark at night (verbatim live palette)
    if (root.dataset.theme === 'dark') { EXP = '201,214,255'; TEAM = '45,94,255'; LINE = '45,94,255'; DIM = '120,140,185'; FOG = '7,9,15'; SHA = 0.32; SHC = '2,4,10'; HALO = 0.35; }
    else { EXP = '31,70,214'; TEAM = '45,94,255'; LINE = '45,94,255'; DIM = '140,152,182'; FOG = '255,255,255'; SHA = 0.14; SHC = '15,22,45'; HALO = 0.25; }
  }
  pal();
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const NODES = [], EDGES = [], RINGS = 6, COLS = 16, rowStart = [];
  (function build() {
    const r = rng(20260905);
    NODES.push({ ox: 0, oy: -0.60, oz: 0, rad: 9, kind: 'core', d: 0 });
    for (let k = 1; k < RINGS; k++) {
      rowStart.push(NODES.length);
      const t = k / (RINGS - 1), y = -0.60 + t * 1.18, rad = t * 0.56, twist = k * 0.11;
      const kind = k === RINGS - 1 ? 'team' : k === 1 ? 'hub' : 'leaf';
      const nodeRad = k === RINGS - 1 ? 5 : k === 1 ? 6 : 3 + (RINGS - 1 - k) * 0.4;
      for (let i = 0; i < COLS; i++) { const a = -Math.PI / 2 + twist + i * (Math.PI * 2 / COLS), jit = (r() - 0.5) * 0.02;
        NODES.push({ ox: Math.cos(a) * rad, oy: y + jit, oz: Math.sin(a) * rad, rad: nodeRad, kind, d: t * 0.62 }); }
    }
    for (let i = 0; i < COLS; i++) EDGES.push({ a: 0, b: rowStart[0] + i, d: 0.08, w: 1.5, spine: true });
    for (let k = 0; k < rowStart.length - 1; k++) { const d = 0.10 + k * 0.10;
      for (let i = 0; i < COLS; i++) EDGES.push({ a: rowStart[k] + i, b: rowStart[k + 1] + i, d, w: 1.15, spine: k < 2 }); }
    for (let k = 0; k < rowStart.length; k++) { const d2 = 0.16 + k * 0.10;
      for (let i = 0; i < COLS; i++) EDGES.push({ a: rowStart[k] + i, b: rowStart[k] + ((i + 1) % COLS), d: d2, w: 0.9, beam: k === rowStart.length - 1 }); }
    for (let n = 0; n < NODES.length; n++) { const q = NODES[n];
      q.cx = (r() - 0.5) * 1.15; q.cy = (r() - 0.5) * 0.9; q.cz = (r() - 0.5) * 1.15; q.ph = r() * 6.283; q.sp = 0.5 + r() * 0.9; }
  })();
  // five system nodes (added after the original build, so the original lattice is byte-identical):
  // satellites just outside the cone between rings 2 and 3, each wired to its nearest ring-2 and ring-3 node
  const G = C.graph, SYSN = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + G.sysPhase + i * (Math.PI * 2 / 5);
    const n = { ox: Math.cos(a) * G.sysR, oy: G.sysY, oz: Math.sin(a) * G.sysR, rad: 4, kind: 'sys', d: 0, sys: i, ph: i * 1.3, sp: 0.8 };
    n.cx = n.ox; n.cy = n.oy; n.cz = n.oz; SYSN.push(NODES.length); NODES.push(n);
    [2, 3].forEach((k) => { const tw = k * 0.11, j = ((Math.round((a + Math.PI / 2 - tw) / (Math.PI * 2 / COLS)) % COLS) + COLS) % COLS;
      EDGES.push({ a: SYSN[i], b: rowStart[k - 1] + j, d: 0.3, w: 1.1, sysE: i }); });
  }
  let W2 = 0, H2 = 0, DPR = 1, FITS = 1, FITX = 0, FITY = 0, NSC = 1;
  const TILT = -0.30, TCOS = Math.cos(TILT), TSIN = Math.sin(TILT), CAM = 2.35;
  function size() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    const w = gst.clientWidth || 1, h = gst.clientHeight || 1;
    W2 = Math.max(1, Math.round(w * DPR)); H2 = Math.max(1, Math.round(h * DPR));
    if (cv.width !== W2) cv.width = W2; if (cv.height !== H2) cv.height = H2;
    fit();
  }
  function fit() {   // worst-case projected bounds over a full revolution and both ends of the settle (verbatim)
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let s = 0; s < 48; s++) { const ya = s * (Math.PI * 2 / 48), cy = Math.cos(ya), sy = Math.sin(ya);
      for (const n of NODES) for (let k = 1; k < 2; k++) {   // v13r6: fit the settled graph (the one people read) to the stage
        const x = k ? n.ox : n.cx, y = k ? n.oy : n.cy, z = k ? n.oz : n.cz;
        const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * TCOS - z1 * TSIN, z2 = y * TSIN + z1 * TCOS;
        const f = CAM / (CAM + z2), ax = x1 * f, ay = y2 * f;
        if (ax < minx) minx = ax; if (ax > maxx) maxx = ax; if (ay < miny) miny = ay; if (ay > maxy) maxy = ay; } }
    const bw = Math.max(1e-6, maxx - minx), bh = Math.max(1e-6, maxy - miny), pad = 9 * DPR * 2.4 + 8 * DPR;
    FITS = Math.min(Math.max(1, W2 - pad * 2) / bw, Math.max(1, H2 - pad * 2) / bh);
    FITX = W2 / 2 - ((minx + maxx) / 2) * FITS; FITY = H2 / 2 - ((miny + maxy) / 2) * FITS;
    NSC = Math.max(0.5, Math.min(1.4, FITS / 850));
  }
  function scrollProg() {   // v13r6: the cone finishes settling exactly as the band reaches the top of the viewport (whole graph in one frame)
    const b = gst.getBoundingClientRect(), off = gst.offsetTop, travel = Math.max(1, innerHeight - off); return clamp((innerHeight - b.top) / travel); }
  const ez = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  const yaw = (p, tm) => (RM ? 0 : tm * 0.00005) + p * 1.05;
  function project(x, y, z, ya) { const cy = Math.cos(ya), sy = Math.sin(ya);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * TCOS - z1 * TSIN, z2 = y * TSIN + z1 * TCOS, f = CAM / (CAM + z2);
    return [FITX + x1 * f * FITS, FITY + y2 * f * FITS, f, z2]; }
  function px(node, p, tm, ya) {
    const e = node.kind === 'sys' ? 1 : ez((p - node.d) / Math.max(0.18, 0.72 - node.d * 0.45)), amp = (1 - e * 0.86) * 0.02;
    const dx = Math.cos(tm * 0.00042 * node.sp + node.ph) * amp, dy = Math.sin(tm * 0.00037 * node.sp + node.ph * 1.7) * amp, dz = Math.sin(tm * 0.00031 * node.sp + node.ph * 2.3) * amp;
    const P2 = project(node.cx + (node.ox - node.cx) * e + dx, node.cy + (node.oy - node.cy) * e + dy, node.cz + (node.oz - node.cz) * e + dz, ya);
    return [P2[0], P2[1], P2[2], P2[3], e];
  }
  function fogMix(col, f) { const amt = Math.max(0, Math.min(1, (1 - f) * 2.2)); if (!amt) return col;
    const c = col.split(','), g0 = FOG.split(',');
    return Math.round(+c[0] + (+g0[0] - c[0]) * amt) + ',' + Math.round(+c[1] + (+g0[1] - c[1]) * amt) + ',' + Math.round(+c[2] + (+g0[2] - c[2]) * amt); }
  let pos = [], prog = 0, tm = 0;
  const sysP = SYSN.map(() => [0, 0, 1, 0]);
  function update(t) {          // positions only (cheap), needed by the logo flight even before the canvas is on screen
    if (!W2) size();
    prog = RM ? 1 : scrollProg(); tm = RM ? 0 : t * 1000;
    const ya = yaw(prog, tm); pos = NODES.map((n) => px(n, prog, tm, ya));
    SYSN.forEach((ni, i) => { const q = pos[ni]; sysP[i] = [q[0] / DPR, q[1] / DPR, q[2], q[3]]; });
  }
  function draw(land) {
    const p = prog; pal();
    g.clearRect(0, 0, W2, H2); g.lineCap = 'round';
    for (let i = 0; i < EDGES.length; i++) {
      const ed = EDGES[i], A = pos[ed.a], B = pos[ed.b], favg = (A[2] + B[2]) / 2;
      let t, svis;
      if (ed.sysE != null) { t = clamp(((land[ed.sysE] || 0) - 0.55) / 0.45); svis = clamp((B[4] - 0.42) / 0.58) ** 2; }
      else { t = (p - ed.d) / 0.16; if (t > 1) t = 1; const settle = Math.min(A[4], B[4]); svis = Math.max(0, (settle - 0.42) / 0.58); svis *= svis; }
      if (t <= 0 || svis <= 0) continue;
      const ex = A[0] + (B[0] - A[0]) * t, ey = A[1] + (B[1] - A[1]) * t;
      g.strokeStyle = 'rgba(' + fogMix(LINE, favg) + ',' + (t * (ed.sysE != null ? 0.5 : ed.spine ? 0.62 : ed.beam ? 0.46 : 0.34) * Math.max(0.35, favg) * svis).toFixed(3) + ')';
      g.lineWidth = ed.w * DPR * NSC * Math.max(0.5, favg);
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(ex, ey); g.stroke();
      if (t === 1 && !RM && p > 0.5 && svis > 0.6) {     // a signal keeps travelling every finished edge
        const ph = ((tm * 0.00028) + i * 0.137) % 1, gx = A[0] + (B[0] - A[0]) * ph, gy = A[1] + (B[1] - A[1]) * ph;
        const fade = Math.min(1, (p - 0.5) / 0.18) * (1 - Math.abs(ph - 0.5) * 1.1);
        if (fade > 0) { g.fillStyle = 'rgba(' + fogMix(TEAM, favg) + ',' + (fade * 0.85 * Math.max(0.4, favg)).toFixed(3) + ')';
          g.beginPath(); g.arc(gx, gy, 1.5 * DPR * NSC * Math.max(0.5, favg), 0, 6.283); g.fill(); }
      }
    }
    const order = NODES.map((_, i) => i).sort((a, b) => pos[b][3] - pos[a][3]);
    for (const i of order) {
      const nd = NODES[i], P2 = pos[i], e = P2[4], f = Math.max(0.18, P2[2]);
      if (nd.kind === 'sys') {      // a soft socket under each logo chip once it has landed
        const lk = land[nd.sys] || 0; if (lk <= 0) continue;
        const rr = 15 * DPR * NSC * f, halo = g.createRadialGradient(P2[0], P2[1], 0, P2[0], P2[1], rr * 2.2);
        halo.addColorStop(0, 'rgba(116,149,255,' + (0.10 * lk * f).toFixed(3) + ')'); halo.addColorStop(1, 'rgba(116,149,255,0)');
        g.fillStyle = halo; g.beginPath(); g.arc(P2[0], P2[1], rr * 2.2, 0, 6.283); g.fill(); continue;
      }
      const col = fogMix(nd.kind === 'team' ? TEAM : nd.kind === 'leaf' ? DIM : EXP, P2[2]);
      const alpha = (nd.kind === 'leaf' ? 0.32 + e * 0.50 : 0.44 + e * 0.54) * Math.max(0.3, f);
      const rr = nd.rad * DPR * NSC * (0.62 + e * 0.38) * f;
      const shOff = rr * 1.1 * Math.max(0, f - 0.7) * 3;
      if (shOff > 0.3) { const shg = g.createRadialGradient(P2[0] + shOff * 0.5, P2[1] + shOff * 0.7, 0, P2[0] + shOff * 0.5, P2[1] + shOff * 0.7, rr * 2.4);
        shg.addColorStop(0, 'rgba(' + SHC + ',' + (SHA * Math.min(1, f - 0.6)).toFixed(3) + ')'); shg.addColorStop(1, 'rgba(' + SHC + ',0)');
        g.fillStyle = shg; g.beginPath(); g.arc(P2[0] + shOff * 0.5, P2[1] + shOff * 0.7, rr * 2.4, 0, 6.283); g.fill(); }
      if (nd.kind === 'core' || nd.kind === 'hub' || nd.kind === 'team') {
        const halo = g.createRadialGradient(P2[0], P2[1], 0, P2[0], P2[1], rr * 4.6);
        halo.addColorStop(0, 'rgba(' + col + ',' + (HALO * e * (nd.kind === 'core' ? 0.40 : 0.24) * f).toFixed(3) + ')'); halo.addColorStop(1, 'rgba(' + col + ',0)');
        g.fillStyle = halo; g.beginPath(); g.arc(P2[0], P2[1], rr * 4.6, 0, 6.283); g.fill(); }
      g.fillStyle = 'rgba(' + col + ',' + Math.max(0, alpha).toFixed(3) + ')';
      g.beginPath(); g.arc(P2[0], P2[1], rr, 0, 6.283); g.fill();
    }
  }
  let vis = true; if ('IntersectionObserver' in window) new IntersectionObserver((es) => { vis = es[es.length - 1].isIntersecting; }, { rootMargin: '40px' }).observe(gst);
  const visible = () => vis;
  return { size, update, draw, visible, sysP, el: gst, get prog() { return prog; } };
}


const sec = $('#graph'); if (!sec) return;
const graph = makeGraph(); if (!graph) return;
const heads = [...sec.querySelectorAll('.ghead > *')], land = [0, 0, 0, 0, 0];
const t0 = performance.now(); let raf = 0, on = false;
function frame(now) {
  raf = 0;
  graph.update((now - t0) / 1000);                                  // reads first (band position) ...
  const gq = RM ? 2 : (innerHeight - sec.getBoundingClientRect().top) / innerHeight;
  heads.forEach((el, i) => { const k = ease(seg(gq, [0.06 + i * 0.045, 0.36 + i * 0.045]));   // ... then writes (opacity + transform only)
    el.style.opacity = k.toFixed(3); el.style.transform = `translate3d(0,${(14 * (1 - k)).toFixed(2)}px,0)`; });
  graph.draw(land);
  if (on && !RM) raf = requestAnimationFrame(frame);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
new IntersectionObserver((es) => { on = es[es.length - 1].isIntersecting; if (on) { graph.size(); kick(); } }, { rootMargin: '80px 0px' }).observe(sec);
let lw = innerWidth, lh = innerHeight;
addEventListener('resize', () => { if (innerWidth === lw && Math.abs(innerHeight - lh) < 160) return; lw = innerWidth; lh = innerHeight; graph.size(); kick(); });
new MutationObserver(kick).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
document.fonts && document.fonts.ready.then(() => { graph.size(); kick(); });
kick();
})();
