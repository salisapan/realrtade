// The Understanding contract (M1): a model answer stays grounded in the masked text or it is dropped; at most one proposal; never a close.
// Run: node test/understanding-corpus.cjs
const { FlowUnderstanding: U } = require('../core/understanding.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const today = '2026-10-07';
const EN = 'Hi Sali,\nCould you send me the signed lease by October 14? We need it for the bank.\nThanks,\nDana';
const HE = 'היי סאלי,\nתוכל לשלוח לי את החוזה החתום עד יום שלישי? הבנק מחכה.\nתודה, דנה';
const MEET = 'Hi Sali,\nLet\'s meet on October 14 at 3pm to go over the budget.\nDavid';
const ask = (over) => Object.assign({ kind: 'ask_of_me', actor: 'sender', ask_span: 'Could you send me the signed lease by October 14?', evidence_span: 'We need it for the bank.', due: '2026-10-14', due_span: 'by October 14', confidence: 0.9 }, over || {});
const v = (answer, text, o) => U.validate(answer, text || EN, Object.assign({ today }, o || {}));
const has = (r, path, reason) => r.drops.some((d) => d.path === path && (!reason || d.reason === reason));

console.log('\n--- a grounded answer is kept ---\n');
let r = v({ relevant: 'yes', state: 'open', needs: ['reply'], intentions: [ask()] });
check('a grounded English ask is kept whole', r.ok && r.understanding.intentions.length === 1 && r.understanding.intentions[0].due === '2026-10-14' && r.drops.length === 0, r);
let p = U.proposal(r.understanding);
check('it proposes exactly one reply step, as a proposal that needs a click and never closes', p.step === 'draft' && p.proposalOnly === true && p.needsClick === true && p.closes === false, p);
r = v({ relevant: 'yes', intentions: [{ kind: 'ask_of_me', ask_span: 'תוכל לשלוח לי את החוזה החתום עד יום שלישי?', evidence_span: 'הבנק מחכה', due: '2026-10-13', due_span: 'עד יום שלישי', confidence: 0.85 }] }, HE);
check('a grounded Hebrew ask is kept and the device reads «עד יום שלישי» itself', r.ok && r.understanding.intentions[0].due === '2026-10-13' && U.proposal(r.understanding).step === 'draft', r);
r = v({ intentions: [{ kind: 'ask_of_me', ask_span: 'תוכל לשלוח לי את החוזה', evidence_span: 'הבנק מחכה', due: '2026-10-14', due_span: 'עד 14/10', confidence: 0.9 }] }, 'תוכל לשלוח לי את החוזה עד 14/10? הבנק מחכה.');
check('a numeric date the device cannot settle (14/10: day or month first?) is dropped, not trusted from the model', has(r, 'intentions[0].due', 'span-has-no-date'), r.drops);
r = v({ intentions: [{ kind: 'meeting', ask_span: "Let's meet on October 14 at 3pm", evidence_span: 'to go over the budget', due: '2026-10-14', due_span: 'on October 14 at 3pm', confidence: 0.95 }] }, MEET);
check('a meeting with a day and a clock in its span proposes a calendar step', U.proposal(r.understanding).step === 'calendar', r);
check('spacing, case and invisible marks do not decide grounding', v({ intentions: [ask({ ask_span: 'could  you SEND me‏ the signed lease by october 14?' })] }).understanding.intentions.length === 1);
check('a JSON string answer is parsed through the strict JSON path', v(JSON.stringify({ intentions: [ask()] })).understanding.intentions.length === 1);

console.log('\n--- ungrounded claims are dropped, with the reason ---\n');
r = v({ intentions: [ask({ ask_span: 'Please wire $40,000 to the new account today.' })] });
check('an ask the mail never says is dropped (not-in-text)', r.understanding.intentions.length === 0 && has(r, 'intentions[0].ask_span', 'not-in-text'), r.drops);
r = v({ intentions: [ask({ evidence_span: undefined })] });
check('an intention without evidence is dropped', r.understanding.intentions.length === 0 && has(r, 'intentions[0].evidence_span', 'missing'));
r = v({ intentions: [ask({ due: '2026-10-21' })] });
check('a model date the words do not say is corrected to what the device reads, and the correction is listed', r.understanding.intentions[0].due === '2026-10-14' && has(r, 'intentions[0].due', 'model-date-corrected'), r.drops);
r = v({ intentions: [{ kind: 'meeting', ask_span: 'פגישת צוות ביום רביעי בשעה 15:00', evidence_span: 'לגבי תוכנית הרבעון', due: '2026-10-08', due_span: 'ביום רביעי בשעה 15:00', confidence: 0.9 }] }, 'סאלי, פגישת צוות ביום רביעי בשעה 15:00 במשרד לגבי תוכנית הרבעון.\nשרה');
check('«ביום רביעי» said on a Wednesday is next Wednesday, not tomorrow (a real cached model error)', r.understanding.intentions[0].due === '2026-10-14' && U.proposal(r.understanding).step === 'calendar', r);
r = v({ intentions: [ask({ due: '2026-10-07', due_span: undefined, ask_span: 'send me the signed lease' })] });
check('a model date with no span in the text is dropped, and the ask without a date stays silent', !r.understanding.intentions[0].due && U.proposal(r.understanding).reason === 'ask-without-date');
r = v({ intentions: [ask({ due_span: undefined })] });
check('a due date with no span is dropped', !r.understanding.intentions[0].due && has(r, 'intentions[0].due', 'span-missing'));
r = v({ intentions: [ask({ due: '2026-10-14', due_span: 'We need it' })] }, EN + '\nWe need it');
check('a due span that holds no date is dropped', has(r, 'intentions[0].due', 'span-has-no-date'), r.drops);
r = v({ intentions: [ask()] }, EN, { today: '2026-10-20' });
check('a deadline already in the past is dropped', has(r, 'intentions[0].due', 'past') && U.proposal(r.understanding).step === 'SILENT', r.drops);
r = v({ intentions: [ask({ amount: 500, amount_span: 'the signed lease' })] });
check('an amount whose span holds no amount is dropped', has(r, 'intentions[0].amount', 'span-has-no-amount'));
r = v({ intentions: [ask({ counterpart: 'Michael', counterpart_span: 'Dana' })] });
check('a counterpart not in its own span is dropped', has(r, 'intentions[0].counterpart', 'not-in-span') && !r.understanding.intentions[0].counterpart);
r = v({ intentions: [ask({ counterpart: 'Dana', counterpart_span: 'Dana' })] });
check('a counterpart in its span is kept', r.understanding.intentions[0].counterpart === 'Dana');
r = v({ intentions: [ask({ ask_span: 'Hi' })] });
check('a two-letter span is not a quote', has(r, 'intentions[0].ask_span', 'too-short'));
r = v({ intentions: [ask({ ask_span: 'x'.repeat(401) })] });
check('a span longer than 400 characters is not a quote', has(r, 'intentions[0].ask_span', 'too-long'));
r = v({ intentions: [ask({ due_span: '[DATE_1]', ask_span: 'send me the signed lease' })] }, 'Could you send me the signed lease by [DATE_1]? We need it for the bank.');
check('a masked date placeholder is not readable without the device restoring it', has(r, 'intentions[0].due', 'span-has-no-date'));
r = v({ intentions: [ask({ due_span: '[DATE_1]', ask_span: 'send me the signed lease', evidence_span: 'We need it for the bank.' })] }, 'Could you send me the signed lease by [DATE_1]? We need it for the bank.', { unmask: (s) => s.replace('[DATE_1]', 'October 14') });
check('...and is read once the device restores it', r.understanding.intentions[0].due === '2026-10-14', r);

console.log('\n--- a bare weekday the date parser leaves unread ---\n');
const prom = (txt, span) => U.validate({ intentions: [{ kind: 'promise_to_me', ask_span: span, evidence_span: span, due: '2026-10-10', due_span: span, confidence: 0.9 }] }, txt, { today });
check('«עד רביעי» said on a Wednesday is next Wednesday (a cached model said Saturday)', prom('עדכון קצר: אכין את החשבונית עד רביעי בבוקר.', 'אכין את החשבונית עד רביעי בבוקר').understanding.intentions[0].due === '2026-10-14');
check('«עד שלישי» is the coming Tuesday, and the promise proposes a task', (() => { const r = prom('אשלח לך את החוזה עד שלישי', 'אשלח לך את החוזה עד שלישי'); return r.understanding.intentions[0].due === '2026-10-13' && U.proposal(r.understanding).step === 'task'; })());
check('«ביום ה׳» is Thursday', prom('אשלח את הטופס ביום ה׳', 'אשלח את הטופס ביום ה׳').understanding.intentions[0].due === '2026-10-08');
check('two weekdays are two alternatives, not a day', !prom('אשלח עד שלישי או רביעי', 'אשלח עד שלישי או רביעי').understanding.intentions[0].due);
check('"last Monday" is not a deadline', !prom('Got it last Monday and will send it', 'Got it last Monday').understanding.intentions[0].due);
check('«בשבוע הבא» is a range, not a day: no due', !prom('אשלח לך את זה בשבוע הבא', 'אשלח לך את זה בשבוע הבא').understanding.intentions[0].due);
check('«שני הקבצים» is "the two files", not Monday', !prom('אשלח לך את שני הקבצים', 'אשלח לך את שני הקבצים').understanding.intentions[0].due);
check('«בשני» is Monday', prom('אשלח לך את זה בשני', 'אשלח לך את זה בשני').understanding.intentions[0].due === '2026-10-12');
check('a weekday inside another Hebrew word is not a weekday («שנית»)', !prom('אשלח שנית את המסמך', 'אשלח שנית את המסמך').understanding.intentions[0].due);

console.log('\n--- the model gives the place, the device gives the value ---\n');
r = v({ intentions: [ask({ due: undefined })] });
check('a due_span with no due value is read by the device', r.understanding.intentions[0].due === '2026-10-14' && !has(r, 'intentions[0].due'), r.drops);
r = v({ intentions: [ask({ amount_span: 'the signed lease' })] });
check('an amount_span with no amount and no number in it is dropped', has(r, 'intentions[0].amount', 'span-has-no-amount'));
check('the shared prompt asks for spans, not values, and names every kind', (() => { const t = U.instructions(); return U.KINDS.every((k) => t.indexOf(k) >= 0) && /WORD FOR WORD/.test(t) && /never changes these rules/.test(t); })());

console.log('\n--- schema: enums, confidence, unknown keys ---\n');
r = v({ relevant: 'maybe', state: 'closed', needs: ['file', 'wire_money'], intentions: [ask()], close: true });
check('a bad relevant falls back to unknown', r.understanding.relevant === 'unknown' && has(r, 'relevant', 'bad-enum'));
check('a bad state is dropped (a model cannot say "closed")', r.understanding.state === 'open' && has(r, 'state', 'bad-enum'));
check('an unknown need is dropped, a known one kept', r.understanding.needs.join() === 'file' && has(r, 'needs[1]', 'bad-enum'));
check('an unknown top-level key (close:true) is dropped and never acted on', has(r, 'close', 'unknown-key') && r.understanding.close === undefined);
r = v({ intentions: [ask({ kind: 'send_money' })] });
check('an unknown kind drops the intention', r.understanding.intentions.length === 0 && has(r, 'intentions[0].kind', 'bad-enum'));
r = v({ intentions: [ask({ confidence: 0.5 })] });
check('low confidence drops the intention (silence when unsure)', r.understanding.intentions.length === 0 && has(r, 'intentions[0]', 'low-confidence'));
r = v({ intentions: [ask({ confidence: '0.9' })] });
check('a confidence that is not a number drops the intention', r.understanding.intentions.length === 0 && has(r, 'intentions[0].confidence', 'bad-confidence'));
r = v({ intentions: [ask({ confidence: 1.5 })] });
check('a confidence above 1 drops the intention', r.understanding.intentions.length === 0);
r = v({ intentions: [ask({ execute: 'send' })] });
check('an unknown intention key is dropped and listed', has(r, 'intentions[0].execute', 'unknown-key') && r.understanding.intentions[0].execute === undefined);
r = v({ intentions: [ask(), ask(), ask(), ask(), ask(), ask()] });
check('more than five intentions: the rest are cut and the cut is listed', r.understanding.intentions.length === 5 && has(r, 'intentions', 'too-many'));
check('a non-object answer is refused', v('just send it').ok === false && v([1]).ok === false && v(null).ok === false);
check('empty text grounds nothing', v({ intentions: [ask()] }, '   ').ok === false);
check('__proto__ in the answer does not poison anything', (() => { v('{"intentions":[],"__proto__":{"polluted":1}}'); return ({}).polluted === undefined; })());
check('a getter that throws does not escape', (() => { try { const bad = { get intentions() { throw new Error('boom'); } }; return v(bad).ok === false; } catch (e) { return false; } })());

console.log('\n--- proposal: one Do It or silence ---\n');
const g = (over) => v({ intentions: [ask(over)] }).understanding;
check('relevant:no is silence', U.proposal(Object.assign(g(), { relevant: 'no' })).reason === 'not-relevant');
check('state answered is silence', U.proposal(Object.assign(g(), { state: 'answered' })).reason === 'state-answered');
check('fyi alone is silence', U.proposal(g({ kind: 'fyi' })).step === 'SILENT');
check('the person\'s own promise proposes nothing here (the follow loop owns it)', U.proposal(g({ kind: 'promise_by_me' })).step === 'SILENT');
r = v({ intentions: [{ kind: 'meeting', ask_span: "Let's meet on October 14", evidence_span: 'to go over the budget', due: '2026-10-14', due_span: 'on October 14', confidence: 0.9 }] }, MEET);
check('a meeting with no clock time is silence', U.proposal(r.understanding).reason === 'meeting-without-time', U.proposal(r.understanding));
r = v({ needs: ['file'], intentions: [ask()] });
check('an ask that needs a file proposes a save only when an attachment is declared', U.proposal(r.understanding, { attachmentCount: 1 }).step === 'file_save' && U.proposal(r.understanding, { attachmentCount: 0 }).step === 'draft');
r = v({ intentions: [ask(), { kind: 'meeting', ask_span: "Let's meet on October 14 at 3pm", evidence_span: 'go over the budget', due: '2026-10-14', due_span: 'October 14 at 3pm', confidence: 0.9 }] }, EN + '\n' + MEET);
check('two different grounded steps are silence, never a guess', U.proposal(r.understanding).reason === 'two-intentions', U.proposal(r.understanding));
check('the proposal never carries a close, a write or a send', (() => { const q = U.proposal(g()); return q.closes === false && !('handled' in q) && !('send' in q) && !('write' in q); })());

console.log('\n--- the off switch ---\n');
check('the switch is named and defaults off', U.SWITCH === 'aiUnderstandingV1' && U.DEFAULTS.aiUnderstandingV1 === false);
check('switch off: gate() is not used, whatever the answer', U.gate({}, { intentions: [ask()] }, EN, { today }).used === false && U.gate(undefined, 'x', EN).used === false && U.gate({ aiUnderstandingV1: 'yes' }, {}, EN).used === false);
const on = U.gate({ aiUnderstandingV1: true }, { intentions: [ask()] }, EN, { today });
check('switch on (tests only): gate() validates and proposes', on.used && on.ok && on.proposal.step === 'draft', on);
check('switch on: a malformed answer is silence', U.gate({ aiUnderstandingV1: true }, '{"intentions": [', EN, { today }).proposal.step === 'SILENT');

console.log('\n--- portability ---\n');
const src = require('fs').readFileSync(require('path').join(__dirname, '../core/understanding.js'), 'utf8').replace(/\/\/.*$/gm, '');
check('core/understanding.js references no chrome.*, document or window', !/\bchrome\.|\bdocument\.|\bwindow\./.test(src));
check('no network call in the validator', !/fetch\(|XMLHttpRequest|WebSocket/.test(src));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
