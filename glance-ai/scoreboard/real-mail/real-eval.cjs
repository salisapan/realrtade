// Runs the shipped engine on a private labelled mail file and prints numbers.
//   node real-eval.cjs v2            held-out v2: aggregates only, never a row's text (the file is not read by the builder of the rules)
//   node real-eval.cjs dev2 --show   dev set: also lists the rows the engine got wrong (masked text), for fixing rules
// The files live in glance-ai/scoreboard/real-mail/private/ (gitignored). Their content is never committed.
const fs = require('fs'), path = require('path');
process.env.GLANCE_SHIPPED = process.env.GLANCE_SHIPPED || 'wave2';
const { recognize, OWN, g } = require('../capabilities/union.cjs');
const F = g('FlowFollowUp');
const NOW = new Date('2026-11-17T10:00:00+02:00').getTime();
const set = process.argv[2] || 'v2', show = process.argv.includes('--show');
const dir = path.join(__dirname, 'private', set === 'v2' ? 'v2' : set);
const file = fs.readdirSync(dir).filter((f) => /messages\.jsonl$/.test(f)).map((f) => path.join(dir, f));
const rows = [].concat(...file.map((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }))).filter(Boolean);
const MAP = { draft: 'reply', task: 'task', pay: 'payment', calendar: 'calendar', file_save: 'document' };
const goldKind = (r) => (r.label && r.label.has_request ? (r.label.kind || 'none') : 'none');
function engineInbound(r, surface) {
  const own = OWN[surface];
  const colleagues = []; for (let i = 0; i < Math.max(0, (r.toN || 1) - (r.ownInTo ? 1 : 0)); i++) colleagues.push('colleague' + i + '@firm.example');
  const to = r.ownInTo === false ? colleagues : [own].concat(colleagues);
  const cc = r.ownInTo === false ? [own] : [];
  try {
    const rec = recognize({ surface, sender: { name: 'Person', email: 'person@firm.example' }, to, cc, subject: r.subject || 'RE: x', ownNames: ['סאלי', 'Sali'] }, r.body || '');
    return MAP[rec.family] || (rec.family === 'none' ? 'none' : 'other');
  } catch (e) { return 'none'; }
}
function engineSent(r) {
  try { const a = F.classifyOutgoing(r.body || '', { now: NOW, lang: /[֐-׿]/.test(r.body || '') ? 'he' : 'en' }); return a ? (a.kind === 'payment' ? 'payment' : 'reply') : 'none'; } catch (e) { return 'none'; }
}
const out = {};
function bump(group, key) { out[group] = out[group] || {}; out[group][key] = (out[group][key] || 0) + 1; }
const wrongRows = [];
for (const [name, surfaces] of [['inbox', ['gmail', 'outlook']], ['sent', ['follow']]]) {
  for (const surface of surfaces) {
    const key = name + '/' + surface;
    for (const r of rows.filter((x) => x.folder === name)) {
      const gold = goldKind(r);
      const got = name === 'sent' ? engineSent(r) : engineInbound(r, surface);
      bump(key, 'n');
      if (gold === 'none') { bump(key, 'neg'); if (got !== 'none') { bump(key, 'falseOffer'); wrongRows.push([key, r.id, 'FALSE', gold, got, r.body]); } }
      else {
        bump(key, 'pos'); bump(key, 'pos:' + gold);
        const sentLoose = name === 'sent' && got !== 'none' && gold !== 'payment';
        if (got === 'none') { bump(key, 'silent'); bump(key, 'silent:' + gold); wrongRows.push([key, r.id, 'MISS', gold, got, r.body]); }
        else if (got === gold || sentLoose) { bump(key, 'hit'); bump(key, 'hit:' + gold); }
        else { bump(key, 'wrongType'); bump(key, 'wrongType:' + gold); wrongRows.push([key, r.id, 'WRONGTYPE', gold, got, r.body]); }
      }
    }
  }
}
console.log('rows', rows.length, '| inbox', rows.filter((r) => r.folder === 'inbox').length, 'sent', rows.filter((r) => r.folder === 'sent').length);
for (const [k, v] of Object.entries(out)) {
  const pos = v.pos || 0, hit = v.hit || 0, fo = v.falseOffer || 0, wt = v.wrongType || 0;
  console.log(k.padEnd(14), 'positives', pos, '| hit', hit, ('(' + (pos ? Math.round(100 * hit / pos) : 0) + '%)'), '| silent', v.silent || 0, '| wrong type', wt, '| negatives', v.neg || 0, '| false offers', fo, '| wrong Do It', fo + wt);
  const kinds = Object.keys(v).filter((x) => x.startsWith('pos:')).map((x) => x.slice(4));
  for (const kd of kinds) console.log('   ', kd.padEnd(9), 'n', v['pos:' + kd], 'hit', v['hit:' + kd] || 0, 'silent', v['silent:' + kd] || 0, 'wrongType', v['wrongType:' + kd] || 0);
}
if (show) { console.log('\n--- rows the engine got wrong (masked; dev set only) ---'); for (const w of wrongRows) console.log(w[0], w[1], w[2], 'gold=' + w[3], 'got=' + w[4], '|', String(w[5]).replace(/\n/g, ' / ').slice(0, 260)); }
