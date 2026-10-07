'use strict';
// Builds the Glance close-decision dataset: synthetic (EN+HE, Gmail+Outlook shapes) + repo corpora + repo test strings,
// labels every row with the deterministic 0.9.34 engine (teacher), dedupes, and writes a template-grouped held-out split.
// Usage: node build-dataset.cjs [--per-template 28] [--seed 7]
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { teach, OWN } = require('../teacher/teacher.cjs');
const { EN, HE } = require('./templates.cjs');
const EXTRA = require('./templates-extra.cjs');
for (const [L, X] of [[EN, EXTRA.en], [HE, EXTRA.he]]) for (const [sc, list] of Object.entries(X)) {
  if (!L.scenarios[sc]) continue; L.scenarios[sc].t = L.scenarios[sc].t.concat(list);
}
const TIP = process.env.GLANCE_TIP || process.env.GLANCE_ENGINE_ROOT || require('../../paths.cjs').engineRoot();
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const PER = Number(opt('per-template', 40));
let seed = Number(opt('seed', 7));
function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const EXT = {
  en: [['Dana Levi', 'dana@acme.io'], ['Michael Ross', 'michael@northwind.com'], ['Sarah Cohen', 'sarah.cohen@globex.co'], ['Billing', 'billing@initech.com'], ['Tom Baker', 'tom@hooli.xyz']],
  he: [['דנה לוי', 'dana@acme.co.il'], ['מיכאל כהן', 'michael@globex.co.il'], ['יוסי אברהם', 'yossi@initech.co.il'], ['שרה מזרחי', 'sarah@northwind.co.il']]
};
const MKT = [['Promo Team', 'news@promo-mail.com'], ['Acme Updates', 'no-reply@acme-updates.io']];

function fill(str, slots, depth) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => {
    if (!slots[k]) return m;
    const v = pick(slots[k]);
    return (depth || 0) < 2 ? fill(v, slots, (depth || 0) + 1) : v;
  });
}
function frame(body, slots, lang) {
  const hi = fill(pick(slots.hi), slots), bye = fill(pick(slots.bye), slots);
  const style = rnd();
  if (style < 0.45) return [hi, body, bye].filter(Boolean).join('\n');
  if (style < 0.75) return [hi, body, bye].filter(Boolean).join(' ');
  if (style < 0.9) return body;
  const extra = lang === 'he' ? pick(['מקווה שהכל טוב.', 'שבוע טוב!', 'חג שמח,']) : pick(['Hope you are well.', 'Happy Monday!', 'Following up on my last note.']);
  return [hi, extra, body, bye].filter(Boolean).join('\n');
}

const rows = [];
const seen = new Set();
function push(row) {
  const key = sha([row.surface, row.direction, row.attachmentCount, row.subject, row.body].join('\u0001'));
  if (seen.has(key)) return false;
  seen.add(key);
  row.hash = key.slice(0, 16);
  row.teacher = teach(row);
  rows.push(row);
  return true;
}

// ---- 1. synthetic
for (const [lang, L] of [['en', EN], ['he', HE]]) {
  for (const [scenario, sc] of Object.entries(L.scenarios)) {
    sc.t.forEach((tpl, ti) => {
      const templateId = lang + ':' + scenario + ':' + ti;
      let made = 0, tries = 0;
      while (made < PER && tries < PER * 6) {
        tries++;
        const surface = rnd() < 0.5 ? 'gmail' : 'outlook';
        const own = OWN[surface];
        let direction = sc.dir ? pick(sc.dir) : 'inbound';
        const r = rnd();
        if (!sc.dir && r < 0.08) direction = 'outbound';
        else if (!sc.dir && r < 0.12) direction = 'self';
        const ext = (scenario === 'marketing') ? pick(MKT) : pick(EXT[lang]);
        const from = direction === 'inbound' ? { name: ext[0], email: ext[1] } : { name: 'Sali', email: own };
        const to = direction === 'outbound' ? [ext[1]] : direction === 'self' ? [own] : (scenario === 'third_party' ? ['colleague@acme.io', own] : [own]);
        const body = frame(fill(tpl, L.slots), L.slots, lang);
        const subject = fill(pick(sc.subj), L.slots);
        const attachmentCount = pick(sc.att || [0]);
        if (push({ id: 'syn-' + rows.length, provenance: 'synthetic', ownerVerified: false, lang, scenario, templateId, surface, direction, from, to, subject, body, attachmentCount })) made++;
      }
    });
  }
}
const nSyn = rows.length;

// ---- 2. repo corpora (sentence-level fixtures wrapped as an inbound Gmail + Outlook message from an external sender)
const FIX = path.join(TIP, 'test', 'fixtures');
const fixFiles = ['intent-gold.json', 'intent-blind.json', 'intent-teacher-eval.json', 'intent-teacher-eval-2.json', 'chat-gold.json', 'reply-blind.json', 'reply-fresh.json'];
for (const f of fixFiles) {
  const arr = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
  arr.forEach((c, i) => {
    const text = c.t || c.text; if (!text) return;
    const lang = /[\u0590-\u05FF]/.test(text) ? 'he' : 'en';
    const ext = pick(EXT[lang]);
    for (const surface of ['gmail', 'outlook']) {
      push({ id: 'repo-' + f.replace('.json', '') + '-' + i + '-' + surface, provenance: 'repo:' + f, ownerVerified: false, lang, scenario: 'repo', templateId: 'repo:' + sha(text).slice(0, 10),
        surface, direction: 'inbound', from: { name: ext[0], email: ext[1] }, to: [OWN[surface]], subject: '', body: text, attachmentCount: 0,
        repoLabel: { act: c.act || c.label || null, action: c.action || null, kind: c.kind || null } });
    }
  });
}
const nRepo = rows.length - nSyn;

// ---- 3. natural-language string literals harvested from the tip's test corpora (engineer-written cases)
const testDir = path.join(TIP, 'test');
let nTest = 0;
// Filename order, not directory order. Directory order is not stable across machines, and the
// checked-in v2 dataset hash was produced from this sorted walk (test corpora at engine 0.9.34).
for (const f of fs.readdirSync(testDir).filter((x) => x.endsWith('.cjs')).sort()) {
  const src = fs.readFileSync(path.join(testDir, f), 'utf8');
  const re = /(^|[^\w])(check|test|it|console\.log|describe|ok|eq|assert\w*|fail)?\s*\(?\s*(['"])((?:\\.|(?!\3)[^\\\n]){25,320})\3/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[2]) continue; // test names / log lines, not mail text
    let s = m[4].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"');
    const words = s.trim().split(/\s+/);
    if (words.length < 4) continue;
    if (/=>|function|require\(|\$\{|^\s*[\[{<]|\.js\b|https?:|\/\w+\/|_[a-z]+_|::|\bPASS\b|\bFAIL\b/.test(s)) continue;
    const letters = (s.match(/[A-Za-z\u0590-\u05FF\s.,?!'’\-:;0-9₪$€%]/g) || []).length;
    if (letters / s.length < 0.92) continue;
    const lang = /[\u0590-\u05FF]/.test(s) ? 'he' : 'en';
    const ext = pick(EXT[lang]);
    const surface = rnd() < 0.5 ? 'gmail' : 'outlook';
    const att = /attach|מצורף|המצורף/i.test(s) ? 1 : 0;
    if (push({ id: 'rtest-' + f.replace('.cjs', '') + '-' + nTest, provenance: 'repo-test-strings:' + f, ownerVerified: false, lang, scenario: 'repo-test', templateId: 'rtest:' + sha(s).slice(0, 10),
      surface, direction: 'inbound', from: { name: ext[0], email: ext[1] }, to: [OWN[surface]], subject: '', body: s, attachmentCount: att })) nTest++;
  }
}

// ---- split: template-grouped. 20% of synthetic templates are never seen in training (held-out phrasing);
// repo / test-string rows split 70/30 by text hash.
function bucket(id) { return parseInt(sha('split:' + id).slice(0, 8), 16) % 100; }
for (const r of rows) {
  const b = bucket(r.templateId);
  // val is ALSO template-grouped (unseen phrasing), so the show-threshold is tuned for generalization, not memorization
  if (r.provenance === 'synthetic') r.split = b < 20 ? 'test' : (b < 32 ? 'val' : 'train');
  else r.split = b < 30 ? 'test' : (b < 40 ? 'val' : 'train');
}

// ---- gold22 (model-labeled, NOT owner-verified; eval only, never trained on)
const goldSrc = JSON.parse(fs.readFileSync(path.join(FIX, 'real-mail-gold.json'), 'utf8'));
const gold = goldSrc.cases.map((c) => {
  const own = c.direction === 'own';
  const askOfYou = c.label === 'ASK' && /asked_of_you$/.test(c.family) && !own;
  const row = { id: c.id, provenance: 'gold22-model-labeled', ownerVerified: false, lang: c.lang, sourceKind: c.source, family: c.family,
    surface: 'gmail', direction: own ? 'outbound' : 'inbound',
    from: own ? { name: 'Sali', email: OWN.gmail } : { name: 'Ext', email: 'ext@example.com' }, to: own ? ['ext@example.com'] : [OWN.gmail],
    subject: '', body: c.text, attachmentCount: /attached|מצורף/i.test(c.text) ? 1 : 0,
    modelLabelPrior: c.label, m0Label: askOfYou ? 'ASK' : 'SILENT', wrongDoIt: !askOfYou };
  row.teacher = teach(row);
  // text-only view (as if the same sentence arrived inbound) — the harder, more informative check
  row.teacherTextOnly = teach(Object.assign({}, row, { direction: 'inbound', from: { name: 'Ext', email: 'ext@example.com' }, to: [OWN.gmail] }));
  return row;
});

const w = (name, arr) => fs.writeFileSync(path.join(OUT, name), arr.map((r) => JSON.stringify(r)).join('\n') + '\n');
w('all.jsonl', rows);
for (const s of ['train', 'val', 'test']) w(s + '.jsonl', rows.filter((r) => r.split === s));
w('gold22.jsonl', gold);

const stat = {};
for (const r of rows) {
  const k = r.split; stat[k] = stat[k] || { n: 0, show: 0, synthetic: 0, repo: 0, rtest: 0, he: 0 };
  stat[k].n++; if (r.teacher.show) stat[k].show++; if (r.lang === 'he') stat[k].he++;
  if (r.provenance === 'synthetic') stat[k].synthetic++; else if (r.provenance.startsWith('repo:')) stat[k].repo++; else stat[k].rtest++;
}
const labels = {}; for (const r of rows) labels[r.teacher.label] = (labels[r.teacher.label] || 0) + 1;
const reasons = {}; for (const r of rows) if (!r.teacher.show) reasons[r.teacher.reason] = (reasons[r.teacher.reason] || 0) + 1;
const summary = { builtAt: new Date().toISOString(), teacher: '0.9.34-unpacked (deterministic engine)', perTemplate: PER, total: rows.length, synthetic: nSyn, repoFixtures: nRepo, repoTestStrings: nTest, ownerVerified: 0, splits: stat, teacherLabels: labels, silenceReasons: reasons, gold22: gold.length };
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
