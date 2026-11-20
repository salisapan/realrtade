// Reads the owner's filled review sheet and sets label + ownerVerified=true on exactly the rows he marked. Held-out rows are never in the sheet. Prints counts only.
const fs = require('fs'), path = require('path');
const D = path.join(process.env.GLANCE_PRIVATE || path.join(__dirname, 'private'), 'personal');
const sheet = fs.readFileSync(path.join(D, 'review-for-owner.md'), 'utf8');
const marks = {}; let m; const re = /## (\S+) [^\n]*\n[\s\S]*?\nPROPOSED: (\S+)[^\n]*\nENGINE:[^\n]*\nYOURS:[ \t]*(\S*)/g;
while ((m = re.exec(sheet))) { const mine = m[3]; if (!mine) continue; marks[m[1]] = /^ok$/i.test(mine) ? m[2] : mine.toLowerCase(); }
const KINDS = ['draft', 'task', 'calendar', 'file_save', 'pay', 'none']; let changed = 0, verified = 0;
for (const f of fs.readdirSync(D).filter((x) => /^dev-.*\.jsonl$/.test(x))) {
  const p = path.join(D, f);
  const rows = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  for (const r of rows) { const k = marks[r.id]; if (!k || KINDS.indexOf(k) < 0) continue; const was = r.label && r.label.has_request ? r.label.kind : 'none'; r.label = Object.assign({}, r.label, { has_request: k !== 'none', kind: k }); r.ownerVerified = true; r.labeledBy = 'owner'; verified++; if (was !== k) changed++; }
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}
console.log('owner-verified rows', verified, '| labels changed by the owner', changed);
