'use strict';
// Decompose v1 in the lab (core/intent-decompose.js, switch forced on here; nothing in the extension calls it).
// Part 1, the frozen set (two-pass agreement labels, NOT owner-verified, one step per mail): does reading each clause change the single
// decision? Product order: the engine first (now the decomposed engine: the whole-mail decision, plus a clause pass only where the judge
// found no intent), then a model only where that is silent and not a hard quiet. Reports wrong Do It, missed, wrong action, and how many
// mails got more than one intention (the frozen labels name one step, so a second intention there is unscored, listed for reading).
// Part 2, composed mails (two TRAINING mails joined into one, labels from the teacher with the v3.3 audit; no frozen, validation or sealed
// text): does the engine find every intention? Gold = the set of steps of the two parts.
// usage: node scoreboard/decompose/run.cjs [--model v33=model/v2x/fz-v33/v33.extra-preds.jsonl] [--batches 007,008] [--pairs 600] [--md out.md]
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const E = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const HQ = require(path.join(G, 'model', 'runtime', 'hard-quiets.cjs')); const HARD = HQ[arg('hard-quiets', 'A')] || new Set();
const STEPS = new Set(['SILENT', 'task', 'calendar', 'draft', 'file_save']);
const stepOf = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const lines = []; const say = (s) => { lines.push(s); console.log(s); };

// ---- part 1: frozen
const ONLY = arg('batches') ? new Set(arg('batches').split(',')) : null;
const overlay = new Set(read(path.join(G, 'labeling', 'owner-convention-overlay.jsonl')).map((r) => r.id));
const frozen = read(path.join(G, 'labeling', 'frozen-eval.jsonl')).filter((r) => (!ONLY || ONLY.has(r.batch)) && !overlay.has(r.id) && r.agreed && STEPS.has(r.agreed));
const [mName, mFile] = (arg('model', 'v33=model/v2x/fz-v33/v33.extra-preds.jsonl')).split('=');
const M = Object.fromEntries(read(path.join(G, mFile)).map((r) => [r.id, r]));
const norm = (r) => Object.assign({}, r, { from: typeof r.from === 'string' ? JSON.parse(r.from.replace(/'/g, '"')) : r.from, to: typeof r.to === 'string' ? JSON.parse(r.to.replace(/'/g, '"')) : r.to,
  cc: typeof r.cc === 'string' ? JSON.parse(r.cc.replace(/'/g, '"')) : r.cc, attachmentCount: Number(r.attachmentCount || 0), ownNames: ['Sali', 'Sali Sapan', 'סאלי'] });
const sys = { 'engine': [], 'decomposed engine': [], ['engine + ' + mName]: [], ['decomposed engine + ' + mName]: [] };
let multi = 0; const multiGold = {}; const changed = [];
for (const r0 of frozen) {
  const r = norm(r0);
  const x = M[r.id];
  const vetoed = x && (x.vb || x.vp);
  const tip = vetoed ? 'SILENT' : r.tip;
  const d = E.decompose(r);
  const dec = vetoed ? 'SILENT' : (d.intentions[0] ? d.intentions[0].anchor : 'SILENT');
  const hard = HARD.has(r.tipReason);
  const model = x ? stepOf(x.pred) : 'SILENT';
  if (d.intentions.length > 1) { multi++; multiGold[r.agreed] = (multiGold[r.agreed] || 0) + 1; }
  if (dec !== tip) changed.push({ id: r.id, batch: r.batch, gold: r.agreed, tip, dec, reason: r.tipReason });
  sys['engine'].push([r, tip]);
  sys['decomposed engine'].push([r, dec]);
  sys['engine + ' + mName].push([r, tip !== 'SILENT' ? tip : (hard ? 'SILENT' : model)]);
  sys['decomposed engine + ' + mName].push([r, dec !== 'SILENT' ? dec : (hard ? 'SILENT' : model)]);
}
const pct = (k, n) => (n ? (100 * k / n).toFixed(1) + '% (' + k + '/' + n + ')' : 'n/a');
function score(pairs) {
  let sil = 0, act = 0, wdi = 0, miss = 0, wa = 0;
  for (const [r, p] of pairs) { if (r.agreed === 'SILENT') { sil++; if (p !== 'SILENT') wdi++; } else { act++; if (p === 'SILENT') miss++; else if (p !== r.agreed) wa++; } }
  return { sil, act, wdi, miss, wa };
}
say('# Decompose v1, lab reading (' + new Date().toISOString().slice(0, 10) + ')'); say('');
say('## 1. Frozen set, two-pass agreement labels (NOT owner-verified), product order' + (ONLY ? ', batches ' + [...ONLY].join(',') : '') + ', n = ' + frozen.length); say('');
say('| system | wrong Do It | missed | wrong action |'); say('|---|---|---|---|');
for (const [n, pairs] of Object.entries(sys)) { const s = score(pairs); say(`| ${n} | ${pct(s.wdi, s.sil)} | ${pct(s.miss, s.act)} | ${s.wa} |`); }
say(''); say(`Mails with more than one intention: ${multi} (gold step of those: ${JSON.stringify(multiGold)}). Single decisions changed by the clause pass: ${changed.length} ${JSON.stringify(changed.map((c) => c.gold + ':' + c.tip + '->' + c.dec))}.`);

// ---- part 2: composed mails from training rows
const NP = Number(arg('pairs', 600));
const feats = read(path.join(G, 'model', 'train', 'features-v33', 'train.jsonl')).filter((f) => f.teacher === true && !f.unsure);
const lab = Object.fromEntries(feats.map((f) => [f.id, stepOf(f.y)]));
// Parts are clean one-line mails (no signature block, no rendering noise, no augmentation, not addressed to someone else), so the joined mail
// reads as one mail. --engine-agrees keeps only parts the engine reads right ALONE: that isolates what joining two intentions costs.
const clean = (r) => r.render && (r.render.style === 'oneline' || r.render.style === 'core') && !(r.render.noise || []).length && !r.augment && r.render.addresseePlan === 'none' && !/\n\s*\n/.test(r.body || '');
const AGREE = process.argv.includes('--engine-agrees');
const rows = {}; for (const r of read(path.join(G, 'model', 'dataset', 'out-v2', 'train.jsonl'))) {
  if (!lab[r.id] || r.direction !== 'inbound' || r.surface !== 'gmail' || !clean(r)) continue;
  if (AGREE) { const t = E.teach(Object.assign({}, r, { body: r.cleanBody || r.body })); if (stepOf(t.label) !== lab[r.id]) continue; }
  rows[r.id] = r;
}
const ids = Object.keys(rows).sort();
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const GREET = /^\s*(?:(?:hi|hey|hello|dear|good (?:morning|afternoon|evening)|greetings|שלום|היי|הי|בוקר טוב|ערב טוב)(?=[\s,!])[^,\n.!?]{0,40}(?:[,!]|(?=\n)))\s*/i;
const SIGN = /\s*(?:thanks|thank you|cheers|best(?: regards)?|regards|תודה(?: רבה)?|בברכה|יום (?:נעים|טוב)|המשך יום טוב|שבוע טוב)\b[\s\S]{0,60}$/i;
const core = (b) => String(b || '').replace(GREET, '').replace(SIGN, '').trim();
const joinWord = { en: 'Also, ', he: 'בנוסף, ' };
const cases = [];
const byStep = {}; for (const id of ids) (byStep[lab[id]] = byStep[lab[id]] || []).push(id);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const acts = ['draft', 'task', 'calendar'];
for (let k = 0; k < NP; k++) {
  const lang = rnd() < 0.5 ? 'en' : 'he';
  const kind = k % 3; // 0: two acts of different steps, 1: act + silent, 2: two acts of the same step
  const pool = (s) => (byStep[s] || []).filter((id) => rows[id].lang === lang && core(rows[id].body).length > 15 && (rows[id].attachmentCount || 0) === 0);
  let a, b;
  if (kind === 0) { const s1 = pick(acts); const s2 = pick(acts.filter((s) => s !== s1)); a = pick(pool(s1)); b = pick(pool(s2)); }
  else if (kind === 1) { a = pick(pool(pick(acts))); b = pick(pool('SILENT')); if (rnd() < 0.5) [a, b] = [b, a]; }
  else { const s1 = pick(acts); a = pick(pool(s1)); b = pick(pool(s1)); }
  if (!a || !b || a === b) continue;
  const A = rows[a], B = rows[b];
  const greet = lang === 'en' ? 'Hi Sali,' : 'היי סאלי,';
  const body = greet + ' ' + core(A.body).replace(/[^.!?]$/, '$&.') + ' ' + joinWord[lang] + core(B.body).replace(/^[A-Z]/, (c) => c.toLowerCase()) + (lang === 'en' ? ' Thanks, Dana' : ' תודה, דנה');
  const gold = new Set([lab[a], lab[b]].filter((s) => s !== 'SILENT'));
  cases.push({ kind, lang, gold, row: { surface: 'gmail', direction: 'inbound', from: { name: lang === 'en' ? 'Dana Levi' : 'דנה לוי', email: 'dana@acme.io' }, to: ['ai.local.flow@gmail.com'], cc: [], ownNames: ['Sali', 'Sali Sapan', 'סאלי'], attachmentCount: 0, subject: A.subject || '', body } });
}
const agg = { whole: { found: 0, extra: 0, exact: 0, silentWrong: 0 }, decomposed: { found: 0, extra: 0, exact: 0, silentWrong: 0 } };
let goldN = 0; const byKind = { 0: { n: 0, whole: 0, dec: 0 }, 1: { n: 0, whole: 0, dec: 0 }, 2: { n: 0, whole: 0, dec: 0 } };
for (const c of cases) {
  const t = E.teach(c.row); const wholeSet = new Set(t.show ? [t.primaryStep] : []);
  const d = E.decompose(c.row); const decSet = new Set(d.intentions.map((x) => x.anchor));
  goldN += c.gold.size; byKind[c.kind].n++;
  for (const [name, set] of [['whole', wholeSet], ['decomposed', decSet]]) {
    const a = agg[name];
    for (const s of c.gold) if (set.has(s)) a.found++;
    for (const s of set) if (!c.gold.has(s)) a.extra++;
    const exact = set.size === c.gold.size && [...set].every((s) => c.gold.has(s)); if (exact) a.exact++;
    if (exact) byKind[c.kind][name === 'whole' ? 'whole' : 'dec']++;
  }
  if (arg('dump') && Number(arg('dump')) === c.kind && !(decSet.size === c.gold.size && [...decSet].every((s) => c.gold.has(s)))) console.error(JSON.stringify({ gold: [...c.gold], whole: [...wholeSet], dec: d.intentions.map((x) => x.anchor + ':' + x.source), why: d.reason === 'whole-mail-quiet' ? d.whole.reason : (d.reason || d.whole.reason), body: c.row.body.slice(0, 230) }));
}
say(''); say('## 2. Composed mails' + (AGREE ? ', parts the engine reads right alone' : '') + ' (two clean training mails joined by "Also," / «בנוסף,»; teacher labels with the v3.3 audit, NOT owner-verified), n = ' + cases.length + ', ' + goldN + ' gold intentions'); say('');
say('| system | intentions found | steps offered that are not in the mail | every intention right, nothing extra |'); say('|---|---|---|---|');
for (const [n, a] of Object.entries(agg)) say(`| ${n === 'whole' ? 'engine (whole mail)' : 'decomposed engine'} | ${pct(a.found, goldN)} | ${a.extra} | ${pct(a.exact, cases.length)} |`);
say(''); say('By kind (every intention right): two acts of different steps ' + pct(byKind[0].whole, byKind[0].n) + ' -> ' + pct(byKind[0].dec, byKind[0].n) + '; an act and a silent mail ' + pct(byKind[1].whole, byKind[1].n) + ' -> ' + pct(byKind[1].dec, byKind[1].n) + '; two acts of the same step ' + pct(byKind[2].whole, byKind[2].n) + ' -> ' + pct(byKind[2].dec, byKind[2].n) + '.');
if (arg('md')) fs.writeFileSync(arg('md'), lines.join('\n') + '\n');
