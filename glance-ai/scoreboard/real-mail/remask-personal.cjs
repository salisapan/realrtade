// Applies the merged name tokens (private/personal/tokens.json) to every stored row, so a later pull's names are masked in earlier rows too. Text only gets more masked. Prints counts only.
const fs = require('fs'), path = require('path');
const D = path.join(process.env.GLANCE_PRIVATE || path.join(__dirname, 'private'), 'personal');
const tk = JSON.parse(fs.readFileSync(path.join(D, 'tokens.json'), 'utf8')), STOP = new Set(require('./mask-stop.json'));
const sets = [[tk.own, '[OWNER]'], [tk.names, '[NAME]'], [tk.org, '[ORG]']].map(([ws, tag]) => [ws.filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase())).sort((a, b) => b.length - a.length), tag]);
const mk = (w) => new RegExp('(?<![\\u05D0-\\u05EAA-Za-z])[בהוכלמש]{0,2}(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\u05D0-\\u05EAA-Za-z])', 'gi');
const res = sets.map(([ws, tag]) => [ws.map(mk), tag]);
let changed = 0;
for (const f of fs.readdirSync(D).filter((x) => /\.jsonl$/.test(x))) {
  const rows = fs.readFileSync(path.join(D, f), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  for (const r of rows) for (const k of ['subject', 'body']) { let t = String(r[k] || ''); const was = t; for (const [list, tag] of res) for (const re of list) t = t.replace(re, (x, g) => x.slice(0, x.length - g.length) + tag); if (t !== was) { r[k] = t; changed++; } }
  fs.writeFileSync(path.join(D, f), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}
console.log('fields re-masked', changed);
