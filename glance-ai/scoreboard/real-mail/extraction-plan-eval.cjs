// Measures the extraction layer (what, deadline, time, amount) and the plan layer (the ordered close steps) on the INBOX requests the engine offers on.
//   node extraction-plan-eval.cjs [--show] [--json]
// Gold: private/extraction/labels.jsonl (Claude labels, NOT owner-verified, dev sets only: dev2, dev3, personal-dev). Input text: private/extraction/input.jsonl.
// Conditional on detection: a request the engine stays silent on has no extraction or plan to score (that is the detection metric, real-eval.cjs).
// Extraction per field: precision = right / extracted, coverage = right / gold-present, and a hallucination count where the text gives nothing and the engine invented a value.
// Plan: exact = engine steps equal the gold steps as an ordered list; covers = every gold step is present; extra = steps the gold does not have. Held-out sets are not part of this lane (no held-out gold exists).
// GLANCE_EXTRACT_V2=1 switches on the new behaviour behind its flag (OFF by default), see core/plan-extra.js when present.
process.env.GLANCE_SHIPPED = process.env.GLANCE_SHIPPED || 'wave2';
const fs = require('fs'), path = require('path');
const { recognize, OWN } = require('../capabilities/union.cjs');
const D = path.join(process.env.GLANCE_PRIVATE || path.join(__dirname, 'private'), 'extraction');
const show = process.argv.includes('--show'), json = process.argv.includes('--json');
const rd = (f) => fs.readFileSync(path.join(D, f), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const meta = Object.fromEntries(rd('input.jsonl').map((r) => [r.set + '|' + r.id, r]));
const PRIV = path.join(process.env.GLANCE_PRIVATE || path.join(__dirname, 'private'));
// the mail row of each id gives toN / ownInTo (the engine needs the recipients)
const mailRows = {};
for (const [set, files] of [['dev2', ['dev2/dev2-inbox-messages.jsonl']], ['dev3', ['dev3/dev3-inbox-messages.jsonl', 'dev3/dev3b-inbox-messages.jsonl', 'dev3/dev3c-inbox-messages.jsonl']], ['personal-dev', ['personal/dev-inbox.jsonl', 'personal/dev-inbox-x.jsonl']]]) for (const f of files) for (const l of fs.readFileSync(path.join(PRIV, f), 'utf8').split('\n').filter(Boolean)) { try { const r = JSON.parse(l); mailRows[set + '|' + r.id] = r; } catch (e) {} }
const STEP = { gmailDraft: 'reply_draft', googleTask: 'task', calendar: 'calendar_event', drive: 'save_file', oneDrive: 'save_file', saveFile: 'save_file' };
function engine(r) {
  const own = OWN.gmail, col = []; for (let i = 0; i < Math.max(0, (r.toN || 1) - (r.ownInTo ? 1 : 0)); i++) col.push('colleague' + i + '@firm.example');
  const rec = recognize({ surface: 'gmail', sender: { name: 'Person', email: r.fromKind === 'automated' ? 'noreply@firm.example' : 'person@firm.example' }, to: r.ownInTo === false ? col : [own].concat(col), cc: r.ownInTo === false ? [own] : [], subject: r.subject || 'RE: x', ownNames: ['סאלי', 'Sali'], now: new Date('2026-11-17T10:00:00+02:00') }, String(r.body || '').replace(/\[OWNER\]/g, 'סאלי'));
  if (!rec || rec.family === 'none' || !rec.result || !rec.result.intent) return null;
  const I = rec.result.intent, f = I.facts || {}, e = I.entities || {}, steps = (rec.result.process && rec.result.process.steps) || [];
  const money = f.money && f.money.value != null ? f.money.value : (steps.map((s) => s.params && s.params.amount).find((a) => a != null) || null);
  const tm = f.time && f.time.hour != null ? String(f.time.hour).padStart(2, '0') + ':' + String(f.time.minute || 0).padStart(2, '0') : null;
  let plan = steps.map((s) => STEP[s.kind] || s.kind);
  if (rec.family === 'pay') plan = plan.map((k) => (k === 'task' ? 'payment' : k));
  return { what: String(e.what || I.label || ''), deadline: e.deadline || (f.date && f.date.iso) || null, time: tm, amount: money, plan };
}
const F = { deadline: { gold: 0, ext: 0, right: 0, halluc: 0 }, time: { gold: 0, ext: 0, right: 0, halluc: 0 }, amount: { gold: 0, ext: 0, right: 0, halluc: 0 }, what: { gold: 0, ext: 0, right: 0, halluc: 0 } };
const P = { n: 0, exact: 0, covers: 0, extra: 0, goldSteps: 0, coveredSteps: 0, engineSteps: 0 }, bySet = {}, bad = [];
let offered = 0, goldRows = 0;
for (const l of rd('labels.jsonl')) {
  const key = l.set + '|' + l.id, r = mailRows[key]; if (!r) continue; goldRows++;
  let e = null; try { e = engine(r); } catch (x) {} if (!e) continue; offered++;
  const S = bySet[l.set] = bySet[l.set] || { n: 0, exact: 0, covers: 0 }; S.n++;
  for (const k of ['deadline', 'time', 'amount']) {
    const g = l[k] == null ? null : l[k], v = e[k] == null ? null : e[k], f = F[k];
    if (g != null) f.gold++; if (v != null) f.ext++;
    if (g != null && v != null && String(g) === String(v)) f.right++; else if (g == null && v != null) f.halluc++;
  }
  { const kw = (l.what_kw || []).filter(Boolean), f = F.what; if (kw.length) f.gold++; f.ext++; if (kw.length && kw.every((w) => e.what.indexOf(w) >= 0)) f.right++; }
  const gp = l.plan || [], ep = e.plan; P.n++; P.goldSteps += gp.length; P.engineSteps += ep.length; S.n += 0;
  const exact = gp.length === ep.length && gp.every((s, i) => s === ep[i]), covers = gp.every((s) => ep.indexOf(s) >= 0), extra = ep.filter((s) => gp.indexOf(s) < 0).length;
  if (exact) { P.exact++; S.exact++; } if (covers) { P.covers++; S.covers++; } P.extra += extra ? 1 : 0; P.coveredSteps += gp.filter((s) => ep.indexOf(s) >= 0).length;
  if (!exact && show) bad.push([l.set, l.id, 'gold ' + gp.join('+'), 'engine ' + ep.join('+')]);
}
const pct = (a, b) => (b ? Math.round(100 * a / b) + '%' : '-');
const out = { goldRows, engineOffered: offered, fields: {}, plan: { rows: P.n, exact: pct(P.exact, P.n), covers: pct(P.covers, P.n), rowsWithExtraStep: P.extra, stepCoverage: pct(P.coveredSteps, P.goldSteps) }, bySet };
for (const [k, f] of Object.entries(F)) out.fields[k] = { goldPresent: f.gold, extracted: f.ext, right: f.right, precision: pct(f.right, f.ext), coverage: pct(f.right, f.gold), invented: f.halluc };
if (json) { console.log(JSON.stringify(out)); process.exit(0); }
console.log('extraction and plan lane (dev sets, Claude labels, unverified, owner-verified n=0); engine offered on ' + offered + ' of ' + goldRows + ' gold requests');
for (const [k, v] of Object.entries(out.fields)) console.log(('field ' + k).padEnd(16), 'gold-present', String(v.goldPresent).padStart(3), '| extracted', String(v.extracted).padStart(3), '| right', String(v.right).padStart(3), '| precision', v.precision.padStart(4), '| coverage', v.coverage.padStart(4), '| invented', v.invented);
console.log('plan'.padEnd(16), 'rows', P.n, '| exact', out.plan.exact, '| covers all gold steps', out.plan.covers, '| step coverage', out.plan.stepCoverage, '| rows with an extra step', P.extra);
for (const [k, s] of Object.entries(bySet)) console.log('  ', k.padEnd(13), 'rows', s.n, '| plan exact', pct(s.exact, s.n), '| covers', pct(s.covers, s.n));
if (show) for (const b of bad.slice(0, 60)) console.log(b.join(' | '));
