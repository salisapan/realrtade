'use strict';
// Slot accuracy (2026-11-15): of the Do Its the product's recognition union offers, how many write the RIGHT day, clock, amount and title? Gold: glance-ai/labeling/slot-gold/
// slot-gold-v0.cjs (hand-written, held out). A right family with a wrong slot is the worst error a closer can make: ProofOfClose proves something was written, not that it
// was the right thing. Reports per slot, per kind, and lists every offered row with a wrong slot. Lab only. usage: node scoreboard/capabilities/slot-run.cjs [--list] [--json]
const { recognize, g } = require('./union.cjs');
const ROWS = process.argv.includes('--dev') ? require('./slot-dev-v0.cjs') : require('../../labeling/slot-gold/slot-gold-v0.cjs');
const wilson = (k, n) => { if (!n) return [0, 0]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; };
function slotsOf(res, text) {
  if (!res || !res.show) return null;
  const steps = (res.process && res.process.steps) || [], e = (res.intent && res.intent.entities) || {};
  const cal = steps.find((s) => /calendar|event/i.test(s.kind)), task = steps.find((s) => /task/i.test(s.kind));
  const pc = (cal && cal.params) || {}, pt = (task && task.params) || {};
  let title = String(pt.title || pc.title || (res.intent && res.intent.label) || '');
  // The task writer (src/background.js) retitles a generic «Log commitment for <day>» from the mail's own promise sentence; the same call is made here so the title checked is the one written.
  const CT = g && g('FlowCommitmentTitle');
  if (/^Log commitment\b/i.test(title) && CT && typeof CT.titleFromBody === 'function') { try { title = CT.titleFromBody(text) || title; } catch (e) { /* keep the card label */ } }
  if (/^Reply requested\b/i.test(title) && CT && typeof CT.askTitleFromBody === 'function') { try { title = CT.askTitleFromBody(text) || title; } catch (e) { /* keep the card label */ } }
  const am = e.amount && typeof e.amount === 'object' ? e.amount : null;
  const amText = (title + ' ' + (res.intent && res.intent.label || '')).replace(/,/g, '');
  const money = amText.match(/[$₪]\s?(\d[\d]{0,8})(?:\.\d+)?|(\d[\d]{0,8})(?:\.\d+)?\s?(?:nis|usd|ils|שקל|ש"ח|שקלים)/i);
  const num = am && am.value != null ? Number(am.value) : (typeof e.amount === 'number' ? e.amount : money ? Number(money[1] || money[2]) : null);
  const cur = (am && am.currency) || (/₪|nis|שקל|ש"ח|ils/i.test(amText) ? 'NIS' : /\$|usd|dollar/i.test(amText) ? 'USD' : null);
  return { date: pc.dateIso || pt.dateIso || e.dateIso || null, hour: cal ? (Number.isInteger(pc.hour) ? pc.hour : null) : (Number.isInteger(e.hour) ? e.hour : null), minute: cal ? (Number.isInteger(pc.minute) ? pc.minute : 0) : (Number.isInteger(e.minute) ? e.minute : null),
    amount: num, currency: cur, title, from: cal && pc.fromDateIso ? { date: pc.fromDateIso, hour: pc.fromHour, minute: pc.fromMinute } : null, family: res.process && res.process.id };
}
const stats = { date: [0, 0], clock: [0, 0], amount: [0, 0], currency: [0, 0], title: [0, 0], from: [0, 0] };
const per = {}, wrong = [], silent = [];
for (const [kind, lang, text, gold] of ROWS) {
  const rec = recognize({ surface: 'gmail' }, text), got = slotsOf(rec.result, text);
  const k = per[kind] = per[kind] || { n: 0, offered: 0, allRight: 0 };
  k.n++;
  if (!got) { silent.push([kind, lang, text.slice(0, 70), rec.reason]); continue; }
  k.offered++;
  const bad = [];
  const chk = (name, want, have, eq) => { stats[name][1]++; if (eq(want, have)) stats[name][0]++; else bad.push(name + ' want ' + JSON.stringify(want) + ' got ' + JSON.stringify(have)); };
  if ('date' in gold) chk('date', gold.date, got.date, (a, b) => a === b);
  if ('hour' in gold) chk('clock', gold.hour + ':' + String(gold.minute || 0).padStart(2, '0'), got.hour == null ? null : got.hour + ':' + String(got.minute || 0).padStart(2, '0'), (a, b) => a === b);
  if ('amount' in gold) chk('amount', gold.amount, got.amount, (a, b) => a === b);
  if ('currency' in gold) chk('currency', gold.currency, got.currency, (a, b) => a === b);
  if (gold.has) chk('title', gold.has, got.title.toLowerCase(), (a, b) => a.every((s) => b.indexOf(s) >= 0));
  if (gold.from) chk('from', gold.from.date + ' ' + gold.from.hour + ':' + String(gold.from.minute || 0).padStart(2, '0'), got.from ? got.from.date + ' ' + got.from.hour + ':' + String(got.from.minute || 0).padStart(2, '0') : null, (a, b) => a === b);
  if (!bad.length) k.allRight++; else wrong.push([kind, lang, text.slice(0, 70), bad.join('; '), got.family]);
}
const tot = Object.values(per).reduce((a, v) => { a.n += v.n; a.offered += v.offered; a.allRight += v.allRight; return a; }, { n: 0, offered: 0, allRight: 0 });
if (process.argv.includes('--json')) { console.log(JSON.stringify({ per, stats, tot, wrong, silent })); process.exit(0); }
console.log('| kind | rows | offered | every checked slot right |\n|---|---|---|---|');
for (const [k, v] of Object.entries(per)) console.log(`| ${k} | ${v.n} | ${v.offered} | ${v.allRight} |`);
console.log(`| **all** | ${tot.n} | ${tot.offered} | ${tot.allRight} |`);
console.log('\nslot accuracy among offered rows (95% Wilson):');
for (const [k, [r, n]] of Object.entries(stats)) if (n) { const w = wilson(r, n); console.log(' ', k.padEnd(9), `${r}/${n}`, `(${(w[0] * 100).toFixed(0)} to ${(w[1] * 100).toFixed(0)}%)`); }
console.log(`\nwrong slot on an offered Do It: ${wrong.length} of ${tot.offered}; silent: ${silent.length} of ${tot.n}`);
if (process.argv.includes('--list')) { console.log('\nWRONG SLOT'); for (const w of wrong) console.log(w.join(' | ')); console.log('\nSILENT'); for (const s of silent) console.log(s.join(' | ')); }
