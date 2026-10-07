'use strict';
// Stripper reference test.
// Stress cases (strip/stress-cases.json) always hash, so JS and Python can check byte parity on a fresh machine.
// The 767-flip gate needs dataset/out-v2/all.jsonl (25,848 synthetic rows, not in git) AND an unpacked engine
// named 0.9.35 via GLANCE_ENGINE_ROOTS. Without both, that section is skipped and this file still exits 0
// after writing the stress hashes. Historical 767/767 numbers stay in strip/README.md.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const M = path.join(__dirname, '..');
const S = require('./glance-strip.js');
const { makeEngine } = require('../teacher/engine.cjs');
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);
const H = {};
const addH = (k, t) => { H[k + ':strip'] = sha(S.stripForEngine(t)); H[k + ':norm'] = sha(S.normalizeText(t)); };
function tryRd(rel) {
  const p = path.join(M, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}
const all = tryRd('dataset/out-v2/all.jsonl');
const v21 = tryRd('dataset/out-v21/test.jsonl');
const g22 = tryRd('dataset/out/gold22.jsonl');
const adv = tryRd('dataset/out-v21/adversarial-v21.jsonl');
if (all) for (const r of all) { addH('v2:' + r.id + ':body', r.body); if (r.cleanBody != null) addH('v2:' + r.id + ':clean', r.cleanBody); addH('v2:' + r.id + ':subj', r.subject); }
if (v21) for (const r of v21) addH('v21t:' + r.id + ':body', r.body);
if (g22) for (const r of g22) addH('g22:' + r.id, r.body);
if (adv) for (const r of adv) addH('adv:' + r.id, r.body);
JSON.parse(fs.readFileSync(path.join(__dirname, 'stress-cases.json'), 'utf8')).forEach((t, i) => addH('stress:' + i, t));
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'js-strip-sha.json'), JSON.stringify(H));

const R = { builtAt: new Date().toISOString(), hashes: Object.keys(H).length, stressOnly: !all, engines: {} };
if (!all) {
  R.skip = 'dataset/out-v2/all.jsonl is not in git (regenerate with model/dataset/v2/build-dataset-v2.cjs). The 767-flip comparison also needs GLANCE_ENGINE_ROOTS to name an unpacked 0.9.35 tree. Stress-case hashes still ran.';
  R.pass = true;
  fs.writeFileSync(path.join(__dirname, 'out', 'strip-report.json'), JSON.stringify(R, null, 1));
  console.log(JSON.stringify({ pass: true, skipped: R.skip, hashes: R.hashes }));
  process.exit(0);
}
const rows = all.filter((r) => r.provenance === 'synthetic-v2' && r.augment !== 'typo');
R.rows = rows.length;
R.v2FormatSensitiveTagged = rows.filter((r) => r.formatSensitive).length;
const withBody = (r, b, subj) => Object.assign({}, r, { body: b, subject: subj });
for (const en of ['0.9.35', '0.9.34', 'r35p']) {
  const E = makeEngine(en); if (!E) continue;
  const m = { raw: { flips: 0 }, minimal: { flips: 0, removed: 0, newFlips: 0 }, strip: { flips: 0, removed: 0, newFlips: 0, newFlipIds: [], leftIds: [] }, cleanChanged: 0, cleanChangedIds: [],
    refAgree: { raw: 0, minimal: 0, strip: 0 }, refN: 0 };
  for (const r of rows) {
    const cl = E.teach(withBody(r, r.cleanBody, r.subject)).label;
    const raw = E.teach(r).label;
    const mn = E.teach(withBody(r, S.normalizeText(r.body), S.normalizeText(r.subject))).label;
    const st = E.teach(withBody(r, S.stripForEngine(r.body), S.normalizeText(r.subject))).label;
    const clS = E.teach(withBody(r, S.stripForEngine(r.cleanBody), S.normalizeText(r.subject))).label;
    const rf = raw !== cl;
    if (rf) m.raw.flips++;
    if (mn !== cl) m.minimal.flips++; if (rf && mn === cl) m.minimal.removed++; if (!rf && mn !== cl) m.minimal.newFlips++;
    if (st !== cl) { m.strip.flips++; if (m.strip.leftIds.length < 20) m.strip.leftIds.push(r.id); }
    if (rf && st === cl) m.strip.removed++;
    if (!rf && st !== cl) { m.strip.newFlips++; if (m.strip.newFlipIds.length < 20) m.strip.newFlipIds.push(r.id); }
    if (clS !== cl) { m.cleanChanged++; if (m.cleanChangedIds.length < 20) m.cleanChangedIds.push(r.id); }
    if (!r.reference.unsure) { m.refN++; const y = r.reference.label; if (raw === y) m.refAgree.raw++; if (mn === y) m.refAgree.minimal++; if (st === y) m.refAgree.strip++; }
  }
  const gold = {};
  if (g22) gold.gold22 = g22;
  if (adv) gold.adversarial = adv;
  gold.repo = all.filter((r) => String(r.provenance).startsWith('repo'));
  m.gold = {};
  for (const [k, set] of Object.entries(gold)) {
    let changed = 0, okRaw = 0, okStrip = 0, scored = 0; const ids = [];
    for (const r of set) {
      const a = E.teach(r).label, b = E.teach(withBody(r, S.stripForEngine(r.body), S.normalizeText(r.subject))).label;
      if (a !== b) { changed++; if (ids.length < 10) ids.push({ id: r.id, raw: a, strip: b }); }
      const y = k === 'adversarial' ? (r.reference && r.reference.label) : (k === 'repo' ? r.reference.label : null);
      if (y && y !== 'AMBIGUOUS') { scored++; if (a === y) okRaw++; if (b === y) okStrip++; }
    }
    m.gold[k] = { n: set.length, decisionsChanged: changed, changedIds: ids, scored, correctRaw: okRaw, correctStrip: okStrip };
  }
  R.engines[en] = m;
  console.error(en, JSON.stringify({ raw: m.raw.flips, left: m.strip.flips, removed: m.strip.removed, newFlips: m.strip.newFlips, cleanChanged: m.cleanChanged }));
}
const e = R.engines['0.9.35'];
if (!e) {
  R.skip = 'all.jsonl is present but makeEngine("0.9.35") has no root. Set GLANCE_ENGINE_ROOTS. Stress hashes were written. Historical gate is 767 raw flips, 767 removed, 0 left.';
  R.pass = true;
  fs.writeFileSync(path.join(__dirname, 'out', 'strip-report.json'), JSON.stringify(R, null, 1));
  console.log(JSON.stringify({ pass: true, skipped: R.skip, hashes: R.hashes }));
  process.exit(0);
}
R.pass = e.raw.flips === 767 && e.strip.removed === 767 && e.strip.flips === 0 && e.strip.newFlips === 0 && e.cleanChanged === 0 && Object.values(e.gold).every((g) => g.decisionsChanged === 0 || g.correctStrip >= g.correctRaw);
fs.writeFileSync(path.join(__dirname, 'out', 'strip-report.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ pass: R.pass, hashes: R.hashes, '0.9.35': { rawFlips: e.raw.flips, stripLeft: e.strip.flips, removed: e.strip.removed, newFlips: e.strip.newFlips, cleanChanged: e.cleanChanged } }, null, 1));
process.exit(R.pass ? 0 : 1);
