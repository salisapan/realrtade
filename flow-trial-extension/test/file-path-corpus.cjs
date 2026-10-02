// File-backed execution for open loops (docs/file-backed-closure-plan.md): which
// intentions need a file, whether a message REALLY carries one, what that does to a
// loop, and which ONE file may go into a draft. Precision first: a wrong file is worse
// than no file, and the word "attached" is not an attachment.
// Run: node test/file-path-corpus.cjs
const fs = require('fs'), path = require('path');
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowFilePath: FP } = require('../core/file-path.js');
const { FlowFileAttach: FA } = require('../core/file-attach.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowIntentPipeline: P } = require('../core/intent-pipeline.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date('2026-10-05T12:00:00').getTime();
const out = (t) => F.classifyOutgoing(t, { now: NOW, extract: FlowExtract, pipeline: P });
const com = (t) => F.classifyCommitment(t, { now: NOW, extract: FlowExtract, pipeline: P });

console.log('\n--- an ask is file-backed only when one clear file object finishes it ---');
[
  ['Please send me the signed contract by Friday.', 'contract'],
  ['Could you send the receipt for the hotel?', 'receipt'],
  ['I need the invoice file before the end of the month.', 'invoice'],
  ['Please attach the proposal so I can forward it.', 'proposal'],
  ['תוכל לשלוח לי את החוזה החתום עד יום חמישי?', 'contract'],
  ['אפשר לקבל את הקבלה על התשלום?', 'receipt']
].forEach(([t, obj]) => { const r = out(t); check('file-backed (' + obj + '): ' + t.slice(0, 55), r && r.file && r.file.object === obj, r && r.file); });
[
  'Please confirm the final figure by Monday so I can book the vendor.',
  'Could you let me know by Friday whether the board approved the plan?',
  'Please send me the invoices and the contracts by Friday.',
  'Please send the contract or the invoice, whichever you have.',
  "No need to send the contract, I already have it. Can you confirm the date by Monday?",
  'Attached is invoice #3049 for $4,200, due next Monday. Please pay by then.'
].forEach((t) => { const r = out(t); check('NOT file-backed: ' + t.slice(0, 55), !r || !r.file, r && r.file); });
check('a file-backed ask stays a normal loop (same kind, same chase day)', (() => { const r = out('Please send me the signed contract by Friday.'); return r.kind === 'reply' && r.chaseIso === '2026-10-09'; })());

console.log('\n--- a promise is file-backed when it is a send-promise naming one file ---');
[['I will send you the signed contract by Friday.', 'contract'], ["I'll send over the proposal on Monday.", 'proposal'], ['אשלח לך את החוזה מחר', 'contract']].forEach(([t, o]) => {
  const r = com(t); check('file-backed promise (' + o + '): ' + t, r && r.direction === 'mine' && r.file && r.file.object === o, r);
});
['I will call you on Friday.', 'I will review the contract on Monday.', 'I will send the invoices tomorrow.', 'I will confirm by Friday.'].forEach((t) => {
  const r = com(t); check('promise NOT file-backed: ' + t, !r || !r.file, r && r.file);
});
check('the watch remembers its file object', (() => { const a = out('Please send me the signed contract by Friday.'); const w = F.buildWatch({ threadId: 't', messageId: 'm', subject: 's', counterpart: { email: 'd@x.com' }, ask: a, now: NOW }); return FP.isFileBacked(w) && w.file.object === 'contract'; })());

console.log('\n--- does a message REALLY carry a file? ---');
const ev = (text, atts) => FP.evidence({ text, attachments: atts });
check('a real attachment is evidence', ev('Here you go', [{ filename: 'contract-signed.pdf' }]).attached === true);
check('the word "attached" with nothing attached is a claim, not a file', (() => { const e = ev('Signed copy attached.', []); return e.known && !e.attached && e.claims; })());
check('Hebrew claim with nothing attached', (() => { const e = ev('מצורף החוזה החתום', []); return !e.attached && e.claims; })());
check('when the page cannot tell, the evidence is "unknown"', ev('Signed copy attached.', null).known === false);

console.log('\n--- what a file does to a reply on a file-backed ask ---');
{
  const w = F.buildWatch({ threadId: 't', messageId: 'm', subject: 'Contract', counterpart: { email: 'd@x.com', name: 'Dana' }, ask: out('Please send me the signed contract by Friday.'), now: NOW });
  const reply = (t, atts) => F.classifyReply(t, w, { now: NOW, extract: FlowExtract, evidence: atts === undefined ? null : ev(t, atts) });
  const pdf = [{ filename: 'IMG_2231.pdf' }];
  check('a real file closes it, whatever the wording', ['Here you go', 'FYI', 'Done', 'Thanks!'].every((t) => { const r = reply(t, pdf); return r.outcome === 'closed' && r.delivered === 'file'; }));
  check('even with a bare file and no text', reply('', pdf).outcome === 'closed');
  check('"attached" with NO file keeps it open and says so', (() => { const r = reply('Signed copy attached.', []); return r.outcome === 'ack' && r.claimedOnly === true; })(), reply('Signed copy attached.', []));
  check('a no with a file stays a no', reply('We decided not to proceed. Attaching the draft for the record.', pdf).outcome === 'declined');
  check('a question with a file stays yours', reply('Which version do you want, the long one or the short one?', pdf).outcome === 'yours');
  check('an out-of-office with a file is still an auto-reply', reply('Out of office until Monday, auto reply.', pdf).outcome === 'auto');
  check('no file, no claim: the old behaviour', reply('Thanks, got it', []).outcome === 'ack' && reply('Will do', []).outcome === F.classifyReply('Will do', w, { now: NOW, extract: FlowExtract }).outcome);
  check('page cannot tell (no evidence): exactly the old behaviour', reply('Signed copy attached.', undefined).outcome === F.classifyReply('Signed copy attached.', w, { now: NOW, extract: FlowExtract }).outcome);
  const a = F.applyReply(w, reply('Here you go', pdf), NOW);
  check('it closes the loop as delivered and keeps the file name', a.close === true && a.patch.closedAs === 'delivered' && a.patch.deliveredFiles[0] === 'IMG_2231.pdf', a);
  const c = F.applyReply(w, reply('Signed copy attached.', []), NOW);
  check('a claim with no file closes nothing and is flagged', !c.close && c.claimedOnly === true, c);
  const plain = F.buildWatch({ threadId: 't2', messageId: 'm', subject: 's', counterpart: { email: 'd@x.com' }, ask: out('Please confirm the final figure by Monday so I can book the vendor.'), now: NOW });
  check('a loop that is NOT file-backed ignores attachments entirely', F.classifyReply('Here you go', plain, { now: NOW, extract: FlowExtract, evidence: ev('Here you go', pdf) }).delivered === undefined);
}

console.log('\n--- did my message deliver the file I promised? ---');
{
  const w = F.buildWatch({ threadId: 't', messageId: 'm', subject: 'Contract', counterpart: { email: 'd@x.com' }, ask: com('I will send you the signed contract by Friday.'), now: NOW });
  const d = (t, atts) => F.deliversFor(w, t, ev(t, atts));
  check('"attached" with nothing attached never closes a file promise', d('Hi Dana, the contract is attached.', []) === false);
  check('a real file that says so closes it', d('Hi Dana, the contract is attached.', [{ filename: 'contract-final.pdf' }]) === true);
  check('a real file named for the thing closes it even with little text', d('Here you go', [{ filename: 'Contract_signed.pdf' }]) === true);
  check('a real file named for something else, with no delivering words, does not', d('Here you go', [{ filename: 'IMG_0001.png' }]) === false);
  check('page cannot tell: the text rule as before', F.deliversFor(w, 'Attached the contract.', null) === true);
  const plain = F.buildWatch({ threadId: 't3', messageId: 'm', subject: 's', counterpart: { email: 'd@x.com' }, ask: com('I will send you the numbers on Friday.'), now: NOW });
  check('a promise that is not file-backed keeps the text rule', F.deliversFor(plain, 'Here are the numbers, attached.', ev('x', [])) === true);
}

console.log('\n--- which ONE file may go into a draft ---');
{
  const need = FP.askNeed('Can you send me the receipt?');
  const f = (id, name) => ({ id, name, mimeType: 'application/pdf' });
  check('exactly one named match is the file', (FP.pickDrive(need, [f('1', 'Receipt - Oct.pdf'), f('2', 'Budget.xlsx')], {}, 'Can you send me the receipt?') || {}).id === '1');
  check('two receipts is a conflict: no file', FP.pickDrive(need, [f('1', 'Receipt - Oct.pdf'), f('2', 'Receipt - Sep.pdf')], {}, 'Can you send me the receipt?') === null);
  check('nothing named like it: no file', FP.pickDrive(need, [f('2', 'Budget.xlsx')], {}, 'Can you send me the receipt?') === null);
  check('a company template is never attached as if it were the file', FP.pickDrive(need, [f('9', 'Receipt template')], {}, 'x') === null);
  check('a folder or a form is never the file', FP.pickDrive(need, [{ id: '5', name: 'Receipts', mimeType: 'application/vnd.google-apps.folder' }], {}, 'x') === null);
  check('a failed search is no file', FP.pickDrive(need, null, {}, 'x') === null);
  check('the same ask names the date: a distinctive word breaks a tie', (FP.pickDrive(FP.askNeed('Can you send me the October receipt?'), [f('1', 'Receipt - October.pdf'), f('2', 'Receipt - September.pdf')], {}, 'Can you send me the October receipt?') || {}).id === '1');
  check('a resend takes the single attachment of my own message', (FP.resendCandidate([{ filename: 'contract.pdf' }]) || {}).filename === 'contract.pdf');
  check('two attachments is ambiguous: no file', FP.resendCandidate([{ filename: 'a.pdf' }, { filename: 'b.pdf' }]) === null);
  check('no attachment, no file', FP.resendCandidate([]) === null && FP.resendCandidate(null) === null);
}

console.log('\n--- drafts: the file is named only when it is really attached; preparing never closes ---');
{
  const base = { kind: 'reply', status: 'waiting', direction: 'theirs', lang: 'en', createdAt: NOW, subject: 'Contract', counterpart: { name: 'Dana Cole', email: 'd@x.com' }, stage: 'yours', yoursReason: 'blocked' };
  check('resend with the file names it', /Attached: contract\.pdf/.test(F.replyDraft(base, { fileName: 'contract.pdf' })) && !/\[Attach the file/.test(F.replyDraft(base, { fileName: 'contract.pdf' })));
  check('resend without a file keeps the visible placeholder', /\[Attach the file here, then send\]/.test(F.replyDraft(base, {})) && !/Attached:/.test(F.replyDraft(base, {})));
  const q = Object.assign({}, base, { yoursReason: 'question', yoursLine: 'Can you send me the receipt?' });
  check('a requested file is named in the answer', /Attached: Receipt - Oct\.pdf/.test(F.replyDraft(q, { fileName: 'Receipt - Oct.pdf' })));
  check('Hebrew too', /מצורף: חוזה\.pdf/.test(F.replyDraft(Object.assign({}, base, { lang: 'he' }), { fileName: 'חוזה.pdf' })));
  check('a file name cannot inject a line or a quote into the draft', !/\n.*\n.*"x/.test(F.replyDraft(base, { fileName: 'a"\nBcc: x@y.com' })) && !/\nBcc:/.test(F.replyDraft(base, { fileName: 'a"\nBcc: x@y.com' })));
  const mine = F.buildWatch({ threadId: 't', messageId: 'm', subject: 'Contract', counterpart: { email: 'd@x.com', name: 'Dana Cole' }, ask: com('I will send you the signed contract by Friday.'), now: NOW });
  check('keeping a file promise: "as promised, attached"', /^Hi Dana,\n\nAs promised, attached: contract\.pdf/.test(F.promiseDraft(mine, { fileName: 'contract.pdf' })));
  check('no file, no promise draft', F.promiseDraft(mine, {}) === null);
  const p = FP.preparedPatch(NOW, 'contract.pdf');
  check('preparing records the draft and does NOT touch status or stage', p.preparedAt === NOW && p.preparedFile === 'contract.pdf' && !('status' in p) && !('stage' in p));
  check('answering hands the ball back and clears the prepared draft', (() => { const h = F.handBackPatch(Object.assign({}, base, p), NOW); return h.preparedAt === null && h.preparedFile === null; })());
}

console.log('\n--- no external reach, no send path ---');
const src = ['file-path.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8')).join('\n');
check('file-path.js never reaches outside the device or sends anything', !/\bfetch\s*\(|XMLHttpRequest|chrome\.(?:runtime|storage)|sendMessage\s*\(|messages\/send|drafts\/send|\bdocument\.\w|\bwindow\.\w/.test(src));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
