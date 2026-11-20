// Thompson sampling for a passive chip. About one screen of code.
// A Do It is never an arm. The guard is the lowest threshold an arm may use.
const FlowPersonalThompson = (() => {
  const GUARD = 0.8;

  function gamma(shape, rnd) {
    if (shape < 1) {
      const u = rnd();
      return gamma(1 + shape, rnd) * Math.pow(u, 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (let i = 0; i < 64; i++) {
      let x, v;
      do {
        const u1 = rnd();
        const u2 = rnd();
        x = Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = rnd();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
    return shape;
  }

  function beta(a, b, rnd) {
    const x = gamma(Math.max(a, 1e-3), rnd);
    const y = gamma(Math.max(b, 1e-3), rnd);
    return x / (x + y || 1);
  }

  function clusterKey(intent, day) {
    return String(intent || 'other') + '|' + String(day || '');
  }

  function choose(input) {
    const o = input || {};
    if (o.enabled !== true) return { applied: false, mode: 'off', threshold: null };
    if (o.mode === 'action') return { applied: false, mode: 'blocked', threshold: GUARD, reason: 'action-not-explored' };
    const key = clusterKey(o.intent, o.day);
    const seen = o.seen || {};
    if (seen[key]) return { applied: false, mode: 'quiet', threshold: null, reason: 'one-per-cluster' };
    const rnd = typeof o.rnd === 'function' ? o.rnd : Math.random;
    const arms = (o.arms || [{ id: 't80', threshold: 0.8, yes: 1, no: 1 }, { id: 't90', threshold: 0.9, yes: 1, no: 1 }])
      .filter((arm) => arm && arm.threshold >= GUARD);
    if (!arms.length) return { applied: false, mode: 'blocked', threshold: GUARD, reason: 'guard' };
    let best = arms[0];
    let bestDraw = -1;
    arms.forEach((arm) => {
      const draw = beta(arm.yes || 1, arm.no || 1, rnd);
      if (draw > bestDraw) { bestDraw = draw; best = arm; }
    });
    seen[key] = best.id;
    return { applied: true, mode: 'passive', threshold: best.threshold, arm: best.id, cluster: key };
  }

  function quiet(events, intent) {
    let undone = 0;
    let closed = 0;
    (events || []).forEach((ev) => {
      const type = String(ev && ev.type || '');
      const chosen = ev && ev.data && ev.data.chosen_intent_type;
      if (chosen && chosen !== intent) return;
      if (type.indexOf('.undone.') >= 0) undone += 1;
      if (type.indexOf('.closed.') >= 0) closed += 1;
    });
    if (undone > 0 && undone >= closed) return { propose: false, reason: 'undo' };
    return { propose: true, reason: 'ok' };
  }

  return { GUARD: GUARD, choose: choose, quiet: quiet, beta: beta, clusterKey: clusterKey };
})();

if (typeof module !== 'undefined') module.exports = { FlowPersonalThompson };
else if (typeof globalThis !== 'undefined') globalThis.FlowPersonalThompson = FlowPersonalThompson;
