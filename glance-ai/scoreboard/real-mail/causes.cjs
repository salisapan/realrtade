// Groups the engine's mistakes on the development sets by cause and prints the ten biggest. Counts only: no mail text.
//   node causes.cjs [dev2 dev3 ...]      (held-out sets are never opened here)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const PRIV = process.env.GLANCE_PRIVATE || path.join(__dirname, 'private');
const sets = process.argv.slice(2).filter((a) => !a.startsWith('-')); if (!sets.length) sets.push('dev2', 'dev3');
const tally = {};
for (const set of sets) {
  const rowsOut = path.join(require('os').tmpdir(), 'causes-' + set + '.json');
  cp.execFileSync(process.execPath, [path.join(__dirname, 'real-eval.cjs'), set, '--rows-out=' + rowsOut], { stdio: 'ignore' });
  const bad = JSON.parse(fs.readFileSync(rowsOut, 'utf8'));
  const dir = path.join(PRIV, set), meta = {};
  for (const f of fs.readdirSync(dir).filter((x) => /messages\.jsonl$/.test(x))) for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)) { try { const r = JSON.parse(l); meta[r.id] = r; } catch (e) {} }
  for (const b of bad) {
    if (!b.key.endsWith('gmail') && !b.key.endsWith('follow')) continue;
    const r = meta[b.id] || {}, body = String(r.body || ''), tags = [];
    const side = b.key.startsWith('sent') ? 'sent' : 'inbox';
    if (b.o === 'MISS') {
      if (b.gold === 'document') tags.push('gold-document (silent by design)');
      if (b.gold === 'calendar') tags.push('gold-calendar');
      if ((r.toN || 0) >= 4 && side === 'inbox') tags.push('4+ recipients (group cap)');
      if (r.ownInTo === false) tags.push('owner not in To');
      if (body.length < 60) tags.push('very short body');
      if (/\[OWNER\]|^\s*\[NAME\]/.test(body.slice(0, 40)) === false && side === 'inbox') tags.push('reader not named at head');
      if (r.addressed === 'other') tags.push('addressed to another person (label noise?)');
      if (/(?:אודה|נודה|אשמח|נשמח)/.test(body)) tags.push('polite frame present');
      if (/(?:תוכל|תוכלו|תוכלי)/.test(body)) tags.push('modal present');
      if (/(?:בבקשה|נא\s|אנא)/.test(body)) tags.push('please-word present');
      if (/\?/.test(body)) tags.push('question mark present');
    } else if (b.o === 'FALSE') tags.push('false offer: got ' + b.got);
    else tags.push('wrong type: ' + b.gold + ' read as ' + b.got);
    if (!tags.length) tags.push('other');
    for (const t of tags) { const k = side + ' ' + b.o + ' | ' + t; tally[k] = (tally[k] || 0) + 1; }
  }
}
const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('top causes (' + sets.join('+') + ')'); for (const [k, v] of top) console.log(String(v).padStart(4), k);
