// Writes the owner's review sheet for the personal set: private/personal/review-for-owner.md (gitignored). One block per row with the masked text, the proposed label and a line the owner fills in.
// The owner marks each row `OK` or writes the right kind (draft|task|calendar|file_save|pay|none); apply-review.cjs then sets ownerVerified=true on exactly those rows. Prints counts only.
const fs = require('fs'), path = require('path');
const D = path.join(process.env.GLANCE_PRIVATE || path.join(__dirname, 'private'), 'personal');
let out = '# Review sheet: personal set (private, never commit)\n\nFor each row write `OK` after `YOURS:` if the proposed label is right, or the right kind: draft | task | calendar | file_save | pay | none.\n\n', n = 0;
for (const f of ['dev-inbox', 'dev-sent']) {
  const p = path.join(D, f + '.jsonl'); if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l); const lb = r.label || {}; n++;
    out += '## ' + r.id + ' (' + r.folder + ', to ' + r.toN + ')\n' + String(r.subject || '').slice(0, 120) + '\n\n' + String(r.body || '').slice(0, 600).replace(/\n{2,}/g, '\n') + '\n\nPROPOSED: ' + (lb.has_request ? lb.kind : 'none') + (lb.addressed ? ' | addressed: ' + lb.addressed : '') + '\nYOURS: \n\n';
  }
}
fs.writeFileSync(path.join(D, 'review-for-owner.md'), out);
console.log('review rows', n, '->', path.relative(process.cwd(), path.join(D, 'review-for-owner.md')));
