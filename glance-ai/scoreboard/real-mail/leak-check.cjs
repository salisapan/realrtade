// Finds tracked lines that repeat the real mail text: any run of N consecutive words (default 5) shared with a private mail body. Prints file:line and the count, never the text.
//   node leak-check.cjs [N] [--since=<git rev>]   (checks files changed since the rev, default the whole tree)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..'), PRIV = path.join(__dirname, 'private');
const N = +(process.argv.find((a) => /^\d+$/.test(a)) || 5);
const since = (process.argv.find((a) => a.startsWith('--since=')) || '').slice(8);
const tok = (s) => String(s).toLowerCase().replace(/\[[a-z]+\]/g, ' ').replace(/["'״׳`.,:;!?()\-–—/\\|*_#>]/g, ' ').split(/\s+/).filter(Boolean);
const STOP = new Set(['ל', 'ה']);
const sh = new Set();
function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== '__pycache__') walk(p); } else if (/messages\.jsonl$|^v2b-.*\.jsonl$/.test(f.name)) for (const l of fs.readFileSync(p, 'utf8').split('\n').filter(Boolean)) { try { const r = JSON.parse(l); for (const field of [r.body, r.subject]) { const t = tok(field || ''); for (let i = 0; i + N <= t.length; i++) sh.add(t.slice(i, i + N).join(' ')); } } catch (e) {} } } }
walk(PRIV);
const files = (since ? cp.execSync('git diff --name-only ' + since + ' HEAD', { cwd: ROOT, encoding: 'utf8' }) : cp.execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })).split('\n').filter((f) => /\.(js|cjs|json|md|html|py|jsonl)$/.test(f) && !/(^|\/)(private|node_modules)\//.test(f) && !/CoreBundle|package-lock/.test(f));
let total = 0; const per = {};
for (const f of files) { let s; try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; } if (s.length > 3e6) continue; s.split('\n').forEach((line, i) => { const t = tok(line); for (let k = 0; k + N <= t.length; k++) if (sh.has(t.slice(k, k + N).join(' '))) { per[f] = per[f] || []; per[f].push(i + 1); total++; break; } }); }
for (const [f, ls] of Object.entries(per).sort((a, b) => b[1].length - a[1].length)) console.log(String(ls.length).padStart(4), f, ls.slice(0, 12).join(','));
console.log('lines with a shared run of', N, 'words:', total);
