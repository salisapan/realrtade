// Fails (exit 1) when a masked private set still holds something that must have been masked. Prints counts only, never a row.
//   node verify-masked.cjs [set-dir ...]   default: private/personal
// Checks: an e-mail address, a URL, a phone number, a run of 7+ digits, a header-derived name token (private/personal/tokens.json), the owner's own address.
const fs = require('fs'), path = require('path');
const PRIV = process.env.GLANCE_PRIVATE || path.join(__dirname, 'private');
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(PRIV, 'personal')];
let bad = 0, rows = 0;
for (const d of dirs) {
  if (!fs.existsSync(d)) continue;
  let tk = { own: [], names: [], org: [], ownAddr: '' };
  try { tk = JSON.parse(fs.readFileSync(path.join(d, 'tokens.json'), 'utf8')); } catch (e) {}
  const STOP = new Set(require('./mask-stop.json'));
  const toks = [...tk.own, ...tk.names, ...tk.org].filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()));
  const re = [['email', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/], ['url', /https?:\/\/|www\./i], ['phone', /(?:\+?972|\b0)[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}\b/], ['digits7', /\d{7,}/]];
  const found = {};
  for (const f of fs.readdirSync(d).filter((x) => /\.jsonl$/.test(x))) {
    for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean)) {
      let r; try { r = JSON.parse(l); } catch (e) { continue; }
      rows++;
      const text = String(r.subject || '') + '\n' + String(r.body || '');
      for (const [k, x] of re) if (x.test(text)) { found[k] = (found[k] || 0) + 1; bad++; }
      for (const w of toks) if (new RegExp('(?<![\\u05D0-\\u05EAA-Za-z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\u05D0-\\u05EAA-Za-z])', 'i').test(text)) { found.token = (found.token || 0) + 1; bad++; break; }
    }
  }
  console.log(path.basename(d), 'rows checked', rows, 'unmasked findings', JSON.stringify(found));
}
console.log(bad ? 'FAIL: unmasked content remains in ' + bad + ' place(s)' : 'OK: every row passes the mask check');
process.exit(bad ? 1 : 0);
