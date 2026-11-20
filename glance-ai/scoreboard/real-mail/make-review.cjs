// Writes the owner's review sheet for the personal set: private/personal/review-for-owner.md (gitignored), ordered by how much a verification is worth:
//   1. the engine and Claude's label disagree (engine offers where Claude said none, is silent where Claude saw a request, or offers another kind)
//   2. Claude marked the row unsure   3. rows that carry a request   4. agreed negatives last (a quick OK each).
// Per row: masked text, Claude's proposed label (NOT verified), the engine's answer, and a line the owner fills in with OK or the right kind (draft|task|calendar|file_save|pay|none).
// apply-review.cjs then sets ownerVerified=true on exactly the rows he marked. Held-out rows are never in the sheet. Prints counts only.
process.env.GLANCE_SHIPPED = process.env.GLANCE_SHIPPED || 'wave2';
const fs = require('fs'), path = require('path');
const { recognize, OWN, g } = require('../capabilities/union.cjs');
const F = g('FlowFollowUp'), NOW = new Date('2026-11-17T10:00:00+02:00').getTime();
const D = path.join(process.env.GLANCE_PRIVATE || path.join(__dirname, 'private'), 'personal');
const MAP = { draft: 'reply', task: 'task', pay: 'payment', calendar: 'calendar', file_save: 'document' };
const ASKS_ONLY = { reply: 1, payment: 1 };
function engine(r) {
  try {
    if (r.folder === 'sent') { const cx = { now: NOW, lang: /[֐-׿]/.test(r.body || '') ? 'he' : 'en' }; const a = F.classifyOutgoing(r.body || '', cx); return a ? (a.kind === 'payment' ? 'payment' : 'reply') : 'none'; }
    const own = OWN.gmail, col = []; for (let i = 0; i < Math.max(0, (r.toN || 1) - (r.ownInTo ? 1 : 0)); i++) col.push('colleague' + i + '@firm.example');
    const rec = recognize({ surface: 'gmail', sender: { name: 'Person', email: r.fromKind === 'automated' ? 'noreply@firm.example' : r.fromKind === 'list' ? 'newsletter@firm.example' : 'person@firm.example' }, to: r.ownInTo === false ? col : [own].concat(col), cc: r.ownInTo === false ? [own] : [], subject: r.subject || 'RE: x', ownNames: ['סאלי', 'Sali'] }, String(r.body || '').replace(/\[OWNER\]/g, 'סאלי'));
    return MAP[rec.family] || (rec.family === 'none' ? 'none' : 'other');
  } catch (e) { return 'none'; }
}
const items = [];
for (const f of fs.readdirSync(D).filter((x) => /^dev-.*\.jsonl$/.test(x))) for (const l of fs.readFileSync(path.join(D, f), 'utf8').split('\n').filter(Boolean)) {
  const r = JSON.parse(l); if (r.ownerVerified === true) continue;
  const lb = r.label || {}, gold = lb.has_request ? (MAP[lb.kind] || 'task') : 'none', eng = engine(r);
  let score = 0, why = [];
  const looseOk = r.folder === 'sent' && eng !== 'none' && gold !== 'payment'; // the sent reading counts any ask as a hit
  if (eng !== 'none' && gold === 'none') { score += 5; why.push('engine offers, Claude says none'); }
  else if (eng === 'none' && gold !== 'none') { score += 5; why.push('engine silent, Claude sees a request'); }
  else if (eng !== gold && !looseOk) { score += 4; why.push('engine and Claude differ on the kind'); }
  if (lb.unsure) { score += 3; why.push('Claude unsure'); }
  if (gold !== 'none') { score += 2; why.push('carries a request'); }
  items.push({ r, lb, eng, score, why });
}
items.sort((a, b) => b.score - a.score || (a.r.id < b.r.id ? -1 : 1));
let out = '# Review sheet: personal set (private, never commit)\n\nOrdered by how much your answer is worth: the first rows are where the engine and Claude disagree, or Claude was unsure. You can stop at any point: only rows you fill in become owner-verified.\nFor each row write `OK` after `YOURS:` if PROPOSED (Claude, not verified) is right, or the right kind: draft | task | calendar | file_save | pay | none.\n\n';
for (const it of items) {
  const r = it.r, lb = it.lb;
  out += '## ' + r.id + ' (' + r.folder + ', to ' + r.toN + ') [' + (it.why.join('; ') || 'agreed negative') + ']\n' + String(r.subject || '').slice(0, 120) + '\n\n' + String(r.body || '').slice(0, 600).replace(/\n{2,}/g, '\n') + '\n\nPROPOSED: ' + (lb.has_request ? lb.kind : 'none') + (lb.addressed ? ' | addressed: ' + lb.addressed : '') + '\nENGINE: ' + it.eng + '\nYOURS: \n\n';
}
fs.writeFileSync(path.join(D, 'review-for-owner.md'), out);
const hi = items.filter((x) => x.score >= 4).length;
console.log('review rows', items.length, '| high-value (disagree or unsure) first:', hi, '->', path.relative(process.cwd(), path.join(D, 'review-for-owner.md')));
