'use strict';
// The kind-level frozen set v0 (glance-ai/labeling/kind-frozen/kind-frozen-v0.cjs) through the product's recognition union. Held out: never train on it and never tune
// an engine rule against a row of it. Reports per kind, the wrong-Do-It count on the contrast rows, and a 95% Wilson interval on the whole. Lab only.
// usage: node scoreboard/capabilities/kind-frozen-run.cjs [--list] [--json] [--preds <kind-head preds.jsonl>]
// --preds adds the MODEL columns (lab kind head, model/train/train-kinds.py): the head alone and the product order (the engine's offer first, the head only where the engine is silent). The head is OFF and unwired.
const { recognize } = require('./union.cjs');
const ROWS = process.argv.includes('--v1') ? require('../../labeling/kind-frozen/kind-frozen-v1.cjs') : require('../../labeling/kind-frozen/kind-frozen-v0.cjs');
const SAME = { video_link: ['calendar'], slides_create: ['doc_create'], excel_create: ['word_create', 'sheet_create'], word_create: ['doc_create'], sheet_row: ['task'], pay: ['task'] };
const ok = (w, g) => (w === 'none' ? g === 'none' : g !== 'none' && (g === w || (SAME[w] || []).indexOf(g) >= 0));
const wilson = (k, n) => { if (!n) return [0, 0]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; };
const fs = require('fs'), path = require('path');
const argv = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const WANTK = { cal_hold: 'calendar', cal_booking: 'calendar', cal_recurring: 'calendar', cal_move: 'calendar', cal_cancel: 'calendar', video_link: 'video_link', draft_reply: 'draft', task: 'task', commit_sender: 'task', commit_reader: 'task', notice_system: 'task', pay: 'pay', file_save: 'file_save', doc_create: 'doc_create', sheet_create: 'sheet_create', slides_create: 'slides_create', form_create: 'form_create', word_create: 'word_create', excel_create: 'excel_create', sheet_row: 'sheet_row', doc_append: 'doc_append' };
const PREDS = argv('preds') ? Object.fromEntries(fs.readFileSync(argv('preds'), 'utf8').trim().split('\n').map(JSON.parse).map((r) => [r.id, r])) : null;
const outM = {}, detail2 = [];
const out = {}, detail = [];
for (const [rowIdx, [kind, lang, text, want, att, ex]] of ROWS.entries()) {
  for (const surface of ['gmail', 'outlook']) {
    if (/^(slides|sheet)\./.test(kind) && surface === 'outlook' && want !== 'sheet_create') continue;
    if (/^(slides)/.test(kind) && surface === 'outlook') continue;
    if (/^(word|excel)\./.test(kind) && surface === 'gmail') continue;
    if (kind === 'sheet.row' && surface === 'outlook') continue;
    const w = surface === 'outlook' && want === 'doc_create' ? 'word_create' : surface === 'outlook' && want === 'sheet_create' ? 'excel_create' : want;
    const rec = recognize(Object.assign({ surface, hasThreadAttachment: (att || 0) === 1, attachmentCount: att || 0 }, ex || {}), text);
    const right = ok(w, rec.family);
    const k = out[kind] = out[kind] || { n: 0, right: 0, silent: 0, wrong: 0, falseOffer: 0 };
    k.n++; if (right) k.right++; else if (w === 'none') k.falseOffer++; else if (rec.family === 'none') k.silent++; else k.wrong++;
    detail.push([kind, lang, surface, w, rec.family, rec.via, rec.reason, right, text.slice(0, 80).replace(/\n/g, ' ')]);
    if (PREDS) {
      const m = PREDS[rowIdx + '|' + surface]; const hf = m && m.predKind && m.predKind !== 'none' ? WANTK[m.predKind] : 'none';
      for (const [name, fam] of [['head', hf], ['engine+head', rec.family !== 'none' ? rec.family : hf]]) {
        const okm = ok(w, fam), q = (outM[name] = outM[name] || { byKind: {}, posN: 0, posRight: 0, posSilent: 0, posWrong: 0, negN: 0, falseOffers: 0 }), kk = (q.byKind[kind] = q.byKind[kind] || { n: 0, right: 0 });
        kk.n++; if (okm) kk.right++;
        if (w === 'none') { q.negN++; if (!okm) q.falseOffers++; } else { q.posN++; if (okm) q.posRight++; else if (fam === 'none') q.posSilent++; else q.posWrong++; }
        if (!okm) (q.misses = q.misses || []).push([kind, lang, surface, w, fam, text.slice(0, 70).replace(/\n/g, ' ')]);
      }
    }
  }
}
const pos = detail.filter((d) => d[3] !== 'none'), neg = detail.filter((d) => d[3] === 'none');
const tot = { n: detail.length, right: detail.filter((d) => d[7]).length, posN: pos.length, posRight: pos.filter((d) => d[7]).length, negN: neg.length, falseOffers: neg.filter((d) => !d[7]).length };
if (process.argv.includes('--json')) { console.log(JSON.stringify({ out, detail, tot, model: outM })); process.exit(0); }
console.log('| kind | rows | right | silent | wrong family | offered where silence is right |\n|---|---|---|---|---|---|');
for (const [k, v] of Object.entries(out)) console.log(`| ${k} | ${v.n} | ${v.right} | ${v.silent} | ${v.wrong} | ${v.falseOffer} |`);
const wr = wilson(tot.posRight, tot.posN), wn = wilson(tot.negN - tot.falseOffers, tot.negN);
console.log(`\nrecall on rows with a close: ${tot.posRight}/${tot.posN} (95% ${(wr[0] * 100).toFixed(0)} to ${(wr[1] * 100).toFixed(0)}%)`);
console.log(`silence on contrast rows: ${tot.negN - tot.falseOffers}/${tot.negN} (95% ${(wn[0] * 100).toFixed(0)} to ${(wn[1] * 100).toFixed(0)}%); wrong Do It: ${tot.falseOffers}`);
if (process.argv.includes('--list')) console.log('\n' + detail.filter((d) => !d[7]).map((d) => d.slice(0, 7).join(' | ') + ' || ' + d[8]).join('\n'));
if (PREDS) {
  console.log('\n## model columns (lab kind head; labels: the hand-written kind-frozen rows, never trained on)');
  for (const [name, q] of Object.entries(outM)) {
    const a = wilson(q.posRight, q.posN), b = wilson(q.negN - q.falseOffers, q.negN);
    console.log(`\n### ${name}\nrecall on rows with a close: ${q.posRight}/${q.posN} (95% ${(a[0] * 100).toFixed(0)} to ${(a[1] * 100).toFixed(0)}%); silent ${q.posSilent}, wrong family ${q.posWrong}`);
    console.log(`silence on contrast rows: ${q.negN - q.falseOffers}/${q.negN} (95% ${(b[0] * 100).toFixed(0)} to ${(b[1] * 100).toFixed(0)}%); wrong Do It: ${q.falseOffers}`);
    console.log('| kind | rows | right |\n|---|---|---|\n' + Object.entries(q.byKind).map(([k, v]) => `| ${k} | ${v.n} | ${v.right} |`).join('\n'));
    if (process.argv.includes('--list')) console.log('\nmisses:\n' + (q.misses || []).map((d) => d.join(' | ')).join('\n'));
  }
}
