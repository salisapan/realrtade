'use strict';
// Perf benchmark (Node, single thread, shared box): per-mail latency of each stage of the shadow tier.
//   prepare      = content-script side (normalize + engine re-run on the normalized body + facts + featurize v2/v2.1 + veto inputs;
//                  plus one more engine run when normalize-v21 changed the text, for incumbent.normalizedFlip). The incumbent verdict is
//                  passed in (as the extension will), so the page's own judge run is not re-done.
//   score v2 / v21 = SW side model decision (sparse int8 binary search)
//   handle       = SW side end to end (gate, HMAC msgKey, both models, enum guard, AES-GCM, memory store, prune, tripwire stats)
// Writes bench/out/bench.json.
const fs = require('fs'), path = require('path');
const M = path.join(__dirname, '..', '..');
const { EVAL } = require(path.join(M, '..', 'paths.cjs'));
const P = require('../src/gs-prepare.js'), MD = require('../src/gs-model.js'), SW = require('../src/gs-sw.js'), LG = require('../src/gs-log.js');
const { loadCore, optsFor } = require('../test/core-loader.cjs');
const N = Number(process.env.BENCH_N || 2000), WARM = 200;
const now = () => Number(process.hrtime.bigint()) / 1e6;
const core = loadCore();
const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'weights', 'manifest.json'), 'utf8'));
const load = {};
const models = {};
for (const k of ['v2', 'v21']) {
  const buf = fs.readFileSync(path.join(__dirname, '..', man.models[k].file));
  const t0 = now(); models[k] = MD.load(buf, k, man.models[k].sha256.slice(0, 8)); load[k] = { parseMs: +(now() - t0).toFixed(2), residentBytesEst: models[k].residentBytes, fileBytes: buf.length };
}
const rows = fs.readFileSync(EVAL.v2Test(), 'utf8').trim().split('\n').map(JSON.parse);
const T = { prepare: [], v2: [], v21: [], handle: [] };
const sis = [];
for (let i = 0; i < N + WARM; i++) {
  const r = rows[i % rows.length];
  const o = Object.assign(optsFor(r, core), { judgeResult: { show: false, reason: 'intent-null' } });
  let t0 = now(); const si = P.prepare(r, o); const tp = now() - t0;
  t0 = now(); MD.decide(models.v2, si); const t2 = now() - t0;
  t0 = now(); MD.decide(models.v21, si); const t21 = now() - t0;
  if (i >= WARM) { T.prepare.push(tp); T.v2.push(t2); T.v21.push(t21); sis.push(si); }
}
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))].toFixed(3); };
const sum = (a) => ({ n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), p99: pct(a, 0.99), max: pct(a, 1), mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) });
(async () => {
  const R = SW.createRunner({ manifest: man, loadWeights: (f) => Promise.resolve(new Uint8Array(fs.readFileSync(path.join(__dirname, '..', f))).buffer),
    kv: LG.memoryKv({ 'consent.shadow': true, 'shadow.config': { verified: true, enabled: true, modelAllowlist: Object.values(man.models).map((m) => m.tag), sampleRate: 1, maxMsP95: 50 } }),
    backend: LG.memoryBackend(), ext: '0.9.39' });
  await R.ensureModels();
  for (let i = 0; i < sis.length; i++) { const t0 = now(); await R.handle(Object.assign({}, sis[i], { prepMs: 0 })); T.handle.push(now() - t0); }
  const out = { builtAt: new Date().toISOString(), node: process.version, n: N, warmup: WARM, note: 'shared box: llama-server + LoRA worker running; single Node thread',
    load, ms: { prepare: sum(T.prepare), scoreV2: sum(T.v2), scoreV21: sum(T.v21), handleSW: sum(T.handle) },
    perMailTotal: { p50: +(pct(T.prepare, 0.5) + pct(T.handle, 0.5)).toFixed(3), p95: +(pct(T.prepare, 0.95) + pct(T.handle, 0.95)).toFixed(3) } };
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'bench.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
})();
