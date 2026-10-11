'use strict';
// SFT v3 for Glance's own model: the same mails as SFT v2, but the target is the Understanding contract (milestone M1,
// flow-trial-extension/core/understanding.js), where every claim quotes the mail. Training on quotes teaches the model to cite, so the
// device-side validator can keep its answers grounded at run time.
//
// For each SFT v2 row (chat format: system, user, assistant JSON {decision, family, action, title, due}):
//   silence -> { relevant:'unknown', state:'open', needs:[], intentions:[] }
//   act     -> one intention whose ask_span / evidence_span is the sentence of the mail that carries the ask (a verbatim quote), and
//              whose due_span is the words the DEVICE reads as that date (core/extract.js), widened to the time for a meeting.
// Every target is then put through the validator and proposal() the extension will run. A row is kept only when the device, reading
// the target exactly as it would read a model's answer, reaches the SAME step as the v2 label. Every other row is listed with why, so a
// disagreement is fixed in the data or the parser, never trained in.
//
// --repair-dates: SFT v2 was generated with a reference day one day after the "Today:" line the prompt shows, so "tomorrow" / «מחר» /
//   "today" / "by EOD" are labelled one day late, and a weekday said the day before it ("by Thursday" on a Wednesday) is labelled a week
//   late (audit 2026-10-11: 86 of 476 act rows of the val set). With this flag a row whose ask sentence the device reads as a date that
//   differs from the label by exactly 1 or 7 days is kept with the DEVICE's date (meta.repaired), because at run time the device's
//   reading of the quoted words wins anyway (understanding.js). Any other disagreement stays flagged.
// usage: node build_sft_v3_grounded.cjs [--in <sft-v2.jsonl>]... [--out <dir>] [--understanding <path to understanding.js>] [--repair-dates]
//   defaults: --in ../../eval-data/sft-v2-val.jsonl (+ data/v2/sft_train.jsonl when present), --out data/v3,
//             --understanding ../../../flow-trial-extension/core/understanding.js
// Writes <out>/sft_<name>.jsonl (chat rows, SYSTEM_V3), <out>/flags.jsonl, <out>/report.json and prints the report.
// No model is run. Nothing here leaves the machine.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const { FlowExtract: E } = require(path.join(ROOT, 'flow-trial-extension/core/extract.js'));

const args = process.argv.slice(2);
const opt = (k) => { const out = []; args.forEach((a, i) => { if (a === k && args[i + 1]) out.push(args[i + 1]); }); return out; };
const ins = opt('--in').length ? opt('--in') : [path.join(ROOT, 'glance-ai/eval-data/sft-v2-val.jsonl')].concat(
  fs.existsSync(path.join(__dirname, 'data/v2/sft_train.jsonl')) ? [path.join(__dirname, 'data/v2/sft_train.jsonl')] : []);
const OUT = opt('--out')[0] || path.join(__dirname, 'data', 'v3');
const REPAIR = args.indexOf('--repair-dates') >= 0;
const UPATH = opt('--understanding')[0] || path.join(ROOT, 'flow-trial-extension/core/understanding.js');
if (!fs.existsSync(UPATH)) { console.error('understanding.js not found at ' + UPATH + ' (milestone M1, PR #128). Pass --understanding <path>.'); process.exit(2); }
const { FlowUnderstanding: U } = require(path.resolve(UPATH));

const SYSTEM_V3 = [
  "You are Glance's reader. Glance closes open loops. You read ONE message the user received or sent and return ONE JSON object, nothing else:",
  '{"relevant":"yes|no|unknown","state":"open|answered|waiting|released","needs":["file"|"event"|"reply"|"task"|"payment"],',
  ' "intentions":[{"kind":"ask_of_me|promise_to_me|promise_by_me|ask_by_me|meeting|fyi","actor":"me|sender|other|unknown",',
  '   "ask_span":"<exact words from the message>","evidence_span":"<exact words from the message>",',
  '   "due":"YYYY-MM-DD","due_span":"<the exact words that say when>","confidence":0.0-1.0}]}',
  'Rules: every *_span is copied character for character from the message; if you cannot quote it, leave the intention out.',
  'A date is only given together with the words that say it. No intention is better than a wrong one: when unsure, return "intentions":[].',
  'You never decide that anything is done, sent or closed; you only say what the message asks or promises.'
].join('\n');

const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const HEB = /[֐-׿]/;
const FAM_STEP = { task: 'task', calendar: 'calendar', reply: 'draft', file: 'file_save', none: 'SILENT' };
const FAM_NEED = { task: 'task', calendar: 'event', reply: 'reply', file: 'file' };
const FAM_KIND = { task: 'promise_to_me', calendar: 'meeting', reply: 'ask_of_me', file: 'ask_of_me' };
const STOP = new Set('the a an to of for and or on in at by with your you me my our we i is are be please can could would this that it from about hi hello thanks best regards'.split(' '));

function parseUser(u) {
  const i = u.indexOf('\nBody:\n');
  const head = i >= 0 ? u.slice(0, i) : u, body = i >= 0 ? u.slice(i + 7) : '';
  const h = {}; head.split('\n').forEach((l) => { const k = l.indexOf(': '); if (k > 0) h[l.slice(0, k)] = l.slice(k + 2); });
  const today = (String(h.Today || '').match(/\d{4}-\d{2}-\d{2}/) || [null])[0];
  const atts = h.Attachments && h.Attachments !== 'none' ? h.Attachments.split(', ').length : 0;
  return { body, today, attachmentCount: atts };
}
function sentences(body) {
  const out = [];
  body.split(/\n+/).forEach((line) => {
    const l = line.trim(); if (!l) return;
    l.split(/(?<=[.!?])\s+(?=\S)/).forEach((s) => { const t = s.trim(); if (t.split(/\s+/).length >= 3) out.push(t); });
  });
  return out;
}
function words(s) {
  return String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (HEB.test(w) && w.length > 3 ? w.replace(/^(?:ו?ה|ו|ב|ל|מ|ש)(?=[֐-׿]{2})/, '') : w));
}
const SAVE_WORDS = /\b(?:save|upload|store|drive|onedrive|folder)\b|שמור|לשמור|תשמור|להעלות|תעלה|דרייב|תיקי/i;

// The narrowest piece of the sentence that the device reads as the label's date (and, for a meeting, its time).
function dueSpanIn(sentence, dueIso, now, wantTime) {
  const d = E.parseDate(sentence, now);
  if (!d || d.iso !== dueIso || !d.raw) return null;
  let a = sentence.indexOf(d.raw); if (a < 0) return null;
  let b = a + d.raw.length;
  if (wantTime && E.parseTime) {
    const t = E.parseTime(sentence);
    if (t && t.raw) { const ta = sentence.indexOf(t.raw); if (ta >= 0) { a = Math.min(a, ta); b = Math.max(b, ta + t.raw.length); } }
  }
  const span = sentence.slice(a, b).trim();
  return span.length >= 3 ? span : sentence;
}

function convert(row) {
  const user = row.messages.find((m) => m.role === 'user').content;
  const v2 = JSON.parse(row.messages.find((m) => m.role === 'assistant').content);
  const u = parseUser(user);
  const now = new Date((u.today || '2026-10-07') + 'T12:00:00');
  if (v2.decision !== 'act') return { target: { relevant: 'unknown', state: 'open', needs: [], intentions: [] }, u, v2 };
  const fam = v2.family;
  const ss = sentences(u.body);
  const tw = new Set(words(v2.title));
  let best = null;
  for (const s of ss) {
    let score = 0;
    words(s).forEach((w) => { if (tw.has(w)) score += 1; });
    if (v2.due && dueSpanIn(s, v2.due, now, false)) score += 10;
    if (fam === 'file' && SAVE_WORDS.test(s)) score += 5;
    if (score > 0 && (!best || score > best.score)) best = { s, score };
  }
  if (!best) return { flag: 'no-sentence-carries-the-ask', u, v2 };
  if (best.s.length > 400) return { flag: 'ask-sentence-too-long', u, v2 };
  const it = { kind: FAM_KIND[fam], actor: 'sender', ask_span: best.s, evidence_span: best.s, confidence: 0.9 };
  if (v2.due) {
    let ds = dueSpanIn(best.s, v2.due, now, fam === 'calendar');
    if (!ds) for (const s of ss) { ds = dueSpanIn(s, v2.due, now, fam === 'calendar'); if (ds) break; }
    let due = v2.due, repaired = null;
    if (!ds && REPAIR) {
      const d = E.parseDate(best.s, now);
      const gap = d && d.iso ? Math.round((new Date(v2.due + 'T12:00:00') - new Date(d.iso + 'T12:00:00')) / 864e5) : null;
      if (gap === 1 || gap === 7) { ds = dueSpanIn(best.s, d.iso, now, fam === 'calendar'); if (ds) { due = d.iso; repaired = { from: v2.due, to: d.iso, words: d.raw }; } }
    }
    if (!ds) return { flag: 'device-cannot-read-the-labelled-date', u, v2 };
    it.due = due; it.due_span = ds;
    if (repaired) return { target: { relevant: 'yes', state: 'open', needs: [FAM_NEED[fam]], intentions: [it] }, u, v2, repaired };
  }
  return { target: { relevant: 'yes', state: 'open', needs: [FAM_NEED[fam]], intentions: [it] }, u, v2 };
}

fs.mkdirSync(OUT, { recursive: true });
const report = { repairDates: REPAIR, files: {}, kept: 0, repaired: 0, flagged: 0, byFlag: {}, byFamily: {}, byLang: { he: { kept: 0, flagged: 0 }, en: { kept: 0, flagged: 0 } } };
const flags = [];
for (const file of ins) {
  const name = path.basename(file).replace(/\.jsonl$/, '').replace(/^sft[-_]v2[-_]?/, '') || 'set';
  const rows = read(file), kept = [];
  for (const row of rows) {
    const meta = row.meta || {};
    const lang = meta.lang || (HEB.test(JSON.stringify(row.messages[1].content)) ? 'he' : 'en');
    const c = convert(row);
    const fam = c.v2 ? c.v2.family : 'none';
    report.byFamily[fam] = report.byFamily[fam] || { kept: 0, flagged: 0 };
    let flag = c.flag || null, why = null;
    if (!flag) {
      const v = U.validate(JSON.stringify(c.target), c.u.body, { today: c.u.today || undefined });
      if (!v.ok) flag = 'validator-rejects:' + v.reason;
      else if (v.drops.length) { flag = 'validator-drops:' + v.drops.map((d) => d.path.replace(/\[\d+\]/, '') + '=' + d.reason).join(','); }
      else {
        const p = U.proposal(v.understanding, { attachmentCount: c.u.attachmentCount });
        const want = FAM_STEP[fam];
        if (p.step !== want) { flag = 'device-step-differs'; why = p.step + (p.reason ? ':' + p.reason : '') + ' vs label ' + want; }
      }
    }
    if (flag) {
      report.flagged++; report.byFamily[fam].flagged++; report.byLang[lang].flagged++;
      const key = flag.split(':')[0] + (flag.startsWith('device-step-differs') ? ':' + String(why).split(' vs')[0] : flag.indexOf(':') > 0 ? ':' + flag.split(':').slice(1).join(':') : '');
      report.byFlag[key] = (report.byFlag[key] || 0) + 1;
      flags.push({ id: meta.id || null, file: name, lang, family: fam, flag, why, title: c.v2 && c.v2.title, due: c.v2 && c.v2.due });
      continue;
    }
    report.kept++; report.byFamily[fam].kept++; report.byLang[lang].kept++;
    if (c.repaired) report.repaired++;
    kept.push({ messages: [{ role: 'system', content: SYSTEM_V3 }, { role: 'user', content: row.messages.find((m) => m.role === 'user').content },
      { role: 'assistant', content: JSON.stringify(c.target) }], meta: Object.assign({}, meta, { v3: true }, c.repaired ? { repaired: c.repaired } : {}) });
  }
  fs.writeFileSync(path.join(OUT, 'sft_' + name + '.jsonl'), kept.map((r) => JSON.stringify(r)).join('\n') + '\n');
  report.files[name] = { in: rows.length, kept: kept.length };
}
fs.writeFileSync(path.join(OUT, 'flags.jsonl'), flags.map((r) => JSON.stringify(r)).join('\n') + (flags.length ? '\n' : ''));
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
module.exports = { SYSTEM_V3, convert, sentences, dueSpanIn };
