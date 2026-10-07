'use strict';
// Task: how many of the v2 dataset's formatSensitive rows (engine 0.9.35 decision differs between the clean render and the
// live render) disappear when a normalization step runs in front of the engine? Three normalizers compared:
//   minimal  = runtime/normalize-v21.cjs (CRLF, nbsp, zero-width, bidi only)
//   clean    = runtime/normalize.cjs cleanText (minimal + whitespace/blank-line collapse, line trim)
//   full     = runtime/normalize.cjs stripBoilerplate (clean + signature / disclaimer / [image] / mobile-footer strip) = v2 model path
// Also counts NEW flips (rows whose engine decision on the normalized live body differs from the clean-render decision
// although the raw live decision agreed). Engines 0.9.35 (reference engine), 0.9.34 and r35p. Output: shadow/out-v21/norm-flips.json
const fs = require('fs'), path = require('path');
const { makeEngine } = require('../teacher/engine.cjs');
const { normalizeText } = require('../runtime/normalize-v21.cjs');
const { cleanText, stripBoilerplate } = require('../runtime/normalize.cjs');
const OUT = path.join(__dirname, 'out-v21'); fs.mkdirSync(OUT, { recursive: true });
const rows = fs.readFileSync(path.join(__dirname, '..', 'dataset', 'out-v2', 'all.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.provenance === 'synthetic-v2' && r.augment !== 'typo');
const NORM = { raw: (t) => t, minimal: normalizeText, clean: cleanText, full: stripBoilerplate };
const res = {};
for (const en of ['0.9.35', '0.9.34', 'r35p']) {
  const E = makeEngine(en); if (!E) continue;
  const m = {}; for (const k of Object.keys(NORM)) m[k] = { flips: 0, fixed: 0, newFlips: 0, byNoise: {} };
  for (const r of rows) {
    const cl = E.teach(Object.assign({}, r, { body: r.cleanBody })).label;
    const rawLab = E.teach(r).label; const rawFlip = rawLab !== cl;
    for (const [k, fn] of Object.entries(NORM)) {
      const lab = k === 'raw' ? rawLab : E.teach(Object.assign({}, r, { body: fn(r.body), subject: k === 'raw' ? r.subject : normalizeText(r.subject) })).label;
      const flip = lab !== cl;
      if (flip) { m[k].flips++; const nk = (r.render && r.render.noise || []).join('+') || (r.render ? r.render.style : 'none'); m[k].byNoise[nk] = (m[k].byNoise[nk] || 0) + 1; }
      if (rawFlip && !flip) m[k].fixed++;
      if (!rawFlip && flip) m[k].newFlips++;
    }
  }
  res[en] = m;
}
const v2fs = rows.filter((r) => r.formatSensitive).length;
const out = { builtAt: new Date().toISOString(), rows: rows.length, v2FormatSensitiveTagged: v2fs, note: 'flips = engine(normalized live body) != engine(clean render); raw = no normalization (the v2 dataset formatSensitive tag, typo twins excluded since they inherit labels)', engines: res };
fs.writeFileSync(path.join(OUT, 'norm-flips.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ rows: rows.length, v2fs, ...Object.fromEntries(Object.entries(res).map(([e, m]) => [e, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { flips: v.flips, fixed: v.fixed, newFlips: v.newFlips }]))])) }, null, 1));
