'use strict';
// Tests for the own-model track: the promotion gate (promote_gate.cjs) and the grounded SFT v3 builder (build_sft_v3_grounded.cjs).
// Run: node glance-ai/oss/finetune/test-model-track.cjs [--understanding <understanding.js>]
// The SFT v3 part needs flow-trial-extension/core/understanding.js (milestone M1); without it that part is skipped and says so.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const G = require('./promote_gate.cjs');
const ROOT = path.join(__dirname, '..', '..', '..');
let failures = 0;
const check = (name, cond, detail) => { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-model-track-'));
const w = (name, rows) => { const p = path.join(tmp, name); fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); return p; };

console.log('--- promotion gate ---');
const act = (family) => ({ decision: 'act', family, action: 'x', title: 't', due: '' });
const sil = { decision: 'silence', family: 'none', action: 'none', title: '', due: '' };
const cases = w('cases.jsonl', [
  { id: 'a', lang: 'en', gold: { step: 'draft' }, prompt: { body: 'Please confirm by Friday.' } },
  { id: 'b', lang: 'en', gold: { step: 'SILENT' }, prompt: { body: 'Newsletter. Unsubscribe.' } },
  { id: 'c', lang: 'he', gold: { step: 'calendar' }, prompt: { body: 'נקבע פגישה ביום חמישי בשעה 10:00' } },
  { id: 'd', lang: 'he', gold: { step: 'SILENT' }, prompt: { body: 'תודה רבה!' } },
  { id: 'e', lang: 'en', gold: { step: 'ANY' }, prompt: { body: 'x' } }
]);
const base = w('base.jsonl', [{ id: 'a', pred: sil }, { id: 'b', pred: sil }, { id: 'c', pred: sil }, { id: 'd', pred: sil }]);
const better = w('better.jsonl', [{ id: 'a', pred: act('reply') }, { id: 'b', pred: sil }, { id: 'c', pred: act('calendar') }, { id: 'd', pred: sil }]);
const louder = w('louder.jsonl', [{ id: 'a', pred: act('reply') }, { id: 'b', pred: sil }, { id: 'c', pred: act('calendar') }, { id: 'd', pred: act('reply') }]);
const wrongKind = w('wrongkind.jsonl', [{ id: 'a', pred: act('task') }, { id: 'b', pred: sil }, { id: 'c', pred: act('calendar') }, { id: 'd', pred: sil }]);
const partial = w('partial.jsonl', [{ id: 'a', pred: act('reply') }, { id: 'c', pred: act('calendar') }]);
const r1 = G.run({ base, cand: better, cases });
check('a candidate that closes more and never acts wrongly is better, but not promoted without 200 owner labels', !r1.promote && /BETTER ON SPEC LABELS/.test(r1.verdict) && r1.cand.all.missed === 0 && r1.base.all.missed === 2, r1);
check('ANY / AMBIGUOUS gold rows are left out', r1.base.all.n === 4);
const owner = w('owner.jsonl', Array.from({ length: 200 }, (_, i) => ({ id: 'o' + i, step: 'SILENT', ownerVerified: true })));
const r2 = G.run({ base, cand: better, cases, labels: owner });
check('with 200 owner-verified labels the same candidate is promoted', r2.promote && r2.basis === 'owner-verified' && /^PROMOTE \(basis: 200 owner-verified/.test(r2.verdict), r2.verdict);
// Two-pass agreement (owner's decision 2026-10-11: he does not label by hand). Never counts as owner-verified; the verdict says so.
const agreedRows = (n, extra) => Array.from({ length: n }, (_, i) => Object.assign({ id: 'g' + i, step: 'SILENT', agreed: true, passes: 2 }, extra));
const agreed = w('agreed.jsonl', agreedRows(200));
const ra = G.run({ base, cand: better, cases, labels: agreed });
check('200 two-pass-agreement labels promote a better candidate, and the verdict names that basis', ra.promote && ra.basis === 'two-pass-agreement' && ra.ownerVerified === 0 && ra.agreed === 200 && /NOT owner-verified/.test(ra.verdict), ra);
const agree199 = w('agree199.jsonl', agreedRows(199));
check('199 are not enough', !G.run({ base, cand: better, cases, labels: agree199 }).promote);
const onePass = w('onepass.jsonl', agreedRows(200, { passes: 1 }));
check('one pass is not agreement', !G.run({ base, cand: better, cases, labels: onePass }).promote);
const notAgreed = w('notagreed.jsonl', agreedRows(200, { agreed: false }));
check('rows that are not marked agreed do not count', !G.run({ base, cand: better, cases, labels: notAgreed }).promote);
const rAL = G.run({ base, cand: louder, cases, labels: agreed });
check('agreement labels never override the safety rules: one more wrong Do It still holds', !rAL.promote && rAL.verdict === 'HOLD', rAL.reasons);
const both = G.run({ base, cand: better, cases, labels: agreed + ',' + owner });
check('several label files are read; with both kinds present the owner basis wins', both.promote && both.basis === 'owner-verified', both.basis);
const agreedAsOwner = w('forged.jsonl', agreedRows(200, { ownerVerified: true, agreed: false, passes: 0 }));
const rF = G.run({ base, cand: better, cases, labels: agreedAsOwner });
check('an owner-verified flag still counts as owner-verified (the labeling tools refuse it unless labeledBy is sali)', rF.basis === 'owner-verified');
const r3 = G.run({ base, cand: louder, cases, labels: owner });
check('one more wrong Do It holds it, even though it closes more', !r3.promote && r3.verdict === 'HOLD' && r3.reasons.some((x) => /more wrong Do Its \(all: 0 -> 1\)/.test(x)), r3.reasons);
check('the wrong Do It is reported in Hebrew too', r3.reasons.some((x) => /he: 0 -> 1/.test(x)));
const r4 = G.run({ base, cand: wrongKind, cases, labels: owner });
check('a Do It of the wrong kind holds it', !r4.promote && r4.reasons.some((x) => /more wrong actions/.test(x)), r4.reasons);
const r5 = G.run({ base, cand: partial, cases, labels: owner });
check('a candidate that skips cases the base answered is held', !r5.promote && r5.reasons.some((x) => /no candidate prediction/.test(x)), r5.reasons);
const r6 = G.run({ base, cand: base, cases, labels: owner });
check('the same model is never "promoted" over itself', !r6.promote && r6.verdict === 'HOLD');
const cli = cp.spawnSync(process.execPath, [path.join(__dirname, 'promote_gate.cjs'), '--base', base, '--cand', louder, '--cases', cases, '--strict']);
check('--strict exits 1 when the verdict is not PROMOTE', cli.status === 1, cli.status);

console.log('--- merging two blind passes (labeling/merge-passes.cjs) ---');
const { merge } = require('../../labeling/merge-passes.cjs');
const p1 = [
  { item: 1, id: 'a', lang: 'he', step: 'draft', labeledBy: 'claude' }, { item: 2, id: 'b', lang: 'en', step: 'SILENT', undatedAsk: true, labeledBy: 'claude' },
  { item: 3, id: 'c', lang: 'en', step: 'task', labeledBy: 'claude' }, { item: 4, id: 'd', lang: 'he', step: 'CONTEXT', labeledBy: 'claude' },
  { item: 5, id: 'e', lang: 'en', step: 'calendar', labeledBy: 'claude' }, { item: 6, id: 'f', lang: 'en', step: 'draft', labeledBy: 'claude' }
];
const p2 = [
  { item: 1, step: 'draft', labeledBy: 'claude-pass2' }, { item: 2, step: 'SILENT', undatedAsk: false, labeledBy: 'claude-pass2' },
  { item: 3, step: 'SILENT', labeledBy: 'claude-pass2' }, { item: 4, step: 'CONTEXT', labeledBy: 'claude-pass2' },
  { item: 5, step: 'UNSURE', labeledBy: 'claude-pass2' }
];
const m = merge(p1, p2);
check('only cases both passes gave the same step become agreement labels', m.agreed.map((x) => x.id).join() === 'a,b', m.agreed);
check('a disagreement is reported, not gold', m.disagree.length === 1 && m.disagree[0].id === 'c');
check('CONTEXT, UNSURE and a case the second pass never saw are skipped', m.skipped.context === 1 && m.skipped.unsure === 1 && m.skipped.missing === 1, m.skipped);
check('an agreement label is never owner-verified and says so', m.agreed.every((x) => x.ownerVerified === false && x.agreed === true && x.passes === 2 && /^agreement:/.test(x.labeledBy)));
check('an undated ask flagged by either pass stays flagged', m.agreed.find((x) => x.id === 'b').undatedAsk === true);
check('the same labeller twice is not two passes', merge([{ item: 1, id: 'a', lang: 'en', step: 'draft', labeledBy: 'claude' }], [{ item: 1, step: 'draft', labeledBy: 'claude' }]).agreed.length === 0);
check('a pass labelled as the owner is refused as an agreement input', merge([{ item: 1, id: 'a', lang: 'en', step: 'draft', labeledBy: 'sali' }], [{ item: 1, step: 'draft', labeledBy: 'claude-pass2' }]).agreed.length === 0);

console.log('--- grounded SFT v3 ---');
const uArg = process.argv.indexOf('--understanding');
const uPath = uArg >= 0 ? process.argv[uArg + 1] : path.join(ROOT, 'flow-trial-extension/core/understanding.js');
if (!fs.existsSync(uPath)) {
  console.log('SKIP: understanding.js not on this branch yet (milestone M1, PR #128); pass --understanding <path> to run this part');
} else {
  const user = (body, extra) => 'Direction: inbound\nMailbox: Gmail\nFrom: dana@x.com\nSubject: s\nAttachments: ' + ((extra && extra.att) || 'none') + '\nToday: Wednesday 2026-10-07\nBody:\n' + body;
  const row = (id, body, target, extra) => ({ messages: [{ role: 'system', content: 'v2' }, { role: 'user', content: user(body, extra) }, { role: 'assistant', content: JSON.stringify(target) }], meta: { id, lang: /[֐-׿]/.test(body) ? 'he' : 'en' } });
  const T = (family, title, due) => ({ decision: 'act', family, action: 'x', title, due });
  const input = w('sft.jsonl', [
    row('ok-reply', 'Hi Sali,\n\nCould you confirm the budget by Oct 20?\n\nThanks,\nDana', T('reply', 'Confirm the budget', '2026-10-20')),
    row('ok-meet', "Hi,\n\nLet's meet on October 14 at 3pm to go over the budget.\n\nDana", T('calendar', 'Meeting about the budget', '2026-10-14')),
    row('late-tomorrow', 'Hi,\n\nPlease send the signed contract tomorrow.\n\nDana', T('reply', 'Send the signed contract', '2026-10-09')),
    row('he-late-tomorrow', 'היי סאלי,\n\nתשלח לי את ההסכם החתום מחר בבקשה.\n\nדנה', T('reply', 'לשלוח את ההסכם החתום', '2026-10-09')),
    row('no-date-ask', 'Hi,\n\nPlease send the deck to the client asap.\n\nDana', T('reply', 'Send the deck', '')),
    row('silent', 'Thanks so much, have a great weekend!', { decision: 'silence', family: 'none', action: 'none', title: '', due: '' })
  ]);
  const run = (extra) => {
    const out = path.join(tmp, 'v3' + (extra.length ? '-r' : ''));
    const p = cp.spawnSync(process.execPath, [path.join(__dirname, 'build_sft_v3_grounded.cjs'), '--in', input, '--out', out, '--understanding', uPath].concat(extra), { encoding: 'utf8' });
    if (p.status !== 0) return { err: p.stderr };
    return { report: JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')), rows: fs.readFileSync(path.join(out, 'sft_sft.jsonl'), 'utf8').trim().split('\n').map(JSON.parse), flags: fs.readFileSync(path.join(out, 'flags.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) };
  };
  const plain = run([]);
  check('the builder runs', !plain.err, plain.err);
  if (!plain.err) {
    const ids = plain.rows.map((r) => r.meta.id);
    check('grounded rows are kept: a dated reply, a meeting with a time, a silence', ['ok-reply', 'ok-meet', 'silent'].every((x) => ids.indexOf(x) >= 0), ids);
    const reply = JSON.parse(plain.rows.find((r) => r.meta.id === 'ok-reply').messages[2].content);
    check('every span in a kept target is a verbatim quote of the mail', reply.intentions[0].ask_span === 'Could you confirm the budget by Oct 20?' && reply.intentions[0].due_span === 'Oct 20', reply);
    const meet = JSON.parse(plain.rows.find((r) => r.meta.id === 'ok-meet').messages[2].content);
    check("a meeting's due_span carries the time, so the device can place it", /October 14/.test(meet.intentions[0].due_span) && /3pm/.test(meet.intentions[0].due_span), meet);
    check('"tomorrow" labelled two days out is flagged, not trained in (EN and HE)', ['late-tomorrow', 'he-late-tomorrow'].every((x) => plain.flags.some((f) => f.id === x && f.flag === 'device-cannot-read-the-labelled-date')), plain.flags);
    check('an ask with no date the device can read is flagged (the device would stay silent)', plain.flags.some((f) => f.id === 'no-date-ask' && /ask-without-date/.test(f.why || '')), plain.flags);
    check('the v3 system prompt asks for quotes', /character for character/.test(plain.rows[0].messages[0].content));
  }
  const rep = run(['--repair-dates']);
  if (!rep.err) {
    const fixed = rep.rows.filter((r) => r.meta.repaired);
    check('--repair-dates keeps the off-by-one rows with the device\'s date', fixed.length === 2 && fixed.every((r) => r.meta.repaired.to === '2026-10-08' && JSON.parse(r.messages[2].content).intentions[0].due === '2026-10-08'), fixed.map((r) => r.meta));
    check('--repair-dates never repairs a row with no readable date', rep.flags.some((f) => f.id === 'no-date-ask'));
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nTOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
