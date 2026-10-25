// core/held-hold.js: a hold already written for a thread at a day and clock is found; an undone one, another thread and another clock are not.
// Run: node test/held-hold-corpus.cjs
const H = require('../core/held-hold.js');
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const at = H.holdAt({ dateIso: '2026-10-27', hour: 9, minute: 30 });
check('holdAt shape', at === '2026-10-27 09:30', at);
check('holdAt no clock', H.holdAt({ dateIso: '2026-10-27' }) === '');
check('holdAt no day', H.holdAt({ hour: 9, minute: 0 }) === '');
check('holdAt minute 0 when missing', H.holdAt({ dateIso: '2026-10-27', hour: 9 }) === '2026-10-27 09:00');
const gmail = { kind: 'written', messageId: 'm1', holdSender: 'Studio@Nofar.example', ref: { id: 'e1' }, holdAt: at, connectorId: 'googleHold' };
const outlook = { kind: 'written', messageId: 'o1', sender: { email: 'studio@nofar.example' }, ref: { eventId: 'x' }, intent: { personalClose: 'booking-notice', entities: { dateIso: '2026-10-27', hour: 9, minute: 30 } }, connectorId: 'outlookCalendar' };
check('gmail row found from the same sender', !!H.find([gmail], 'studio@nofar.example', at));
check('outlook row found by its intent', !!H.find([outlook], 'studio@nofar.example', at));
check('another sender is not found', H.find([gmail, outlook], 'other@shop.example', at) === null);
check('another clock is not found', H.find([gmail], 'studio@nofar.example', '2026-10-27 10:30') === null);
check('another day is not found', H.find([gmail], 'studio@nofar.example', '2026-10-28 09:30') === null);
check('undone (newer row first) is not found', H.find([{ kind: 'undone', messageId: 'm1' }, gmail], 'studio@nofar.example', at) === null);
check('an undo of another message does not hide it', !!H.find([{ kind: 'undone', messageId: 'zz' }, gmail], 'studio@nofar.example', at));
check('written again after undo is found', !!H.find([Object.assign({}, gmail, { messageId: 'm2' }), { kind: 'undone', messageId: 'm1' }, gmail], 'studio@nofar.example', at));
check('row without a ref (not written back) is not found', H.find([Object.assign({}, gmail, { ref: null })], 'studio@nofar.example', at) === null);
check('no sender is never found', H.find([gmail], '', at) === null);
check('no clock is never found', H.find([gmail], 'studio@nofar.example', '') === null);
check('the open mail\'s own hold is not a duplicate of itself', H.find([gmail], 'studio@nofar.example', at, ['m1']) === null && !!H.find([gmail], 'studio@nofar.example', at, ['m9']));
check('junk log is safe', H.find(null, 'studio@nofar.example', at) === null && H.find([null, undefined], 'studio@nofar.example', at) === null);
const pay = { personalClose: 'payment-ask', label: 'Pay 1200 NIS', entities: { what: 'Pay 1200 NIS', deadline: '2026-10-27' } };
const payRow = { kind: 'written', messageId: 'p1', ref: { id: 't1' }, holdSender: 'studio@nofar.example', holdAt: H.keyOf(pay) };
check('payment key', H.keyOf(pay) === 'task 2026-10-27 pay 1200 nis', H.keyOf(pay));
check('a reminder of the same bill is found', !!H.find([payRow], 'studio@nofar.example', H.keyOf({ personalClose: 'payment-ask', label: 'Pay 1200 NIS', entities: { what: 'Pay 1200 nis', deadline: '2026-10-27' } })));
check('another amount is not found', H.find([payRow], 'studio@nofar.example', H.keyOf({ personalClose: 'payment-ask', label: 'Pay 900 NIS', entities: { what: 'Pay 900 NIS', deadline: '2026-10-27' } })) === null);
check('another due day is not found', H.find([payRow], 'studio@nofar.example', H.keyOf({ personalClose: 'payment-ask', label: 'Pay 1200 NIS', entities: { what: 'Pay 1200 NIS', deadline: '2026-10-28' } })) === null);
check('outlook task row is found by its intent', !!H.find([{ kind: 'written', messageId: 'o', ref: { id: 1 }, sender: { email: 'studio@nofar.example' }, intent: pay }], 'studio@nofar.example', H.keyOf(pay)));
check('an intent the judge did not raise has no key', H.keyOf({ type: 'request', label: 'Send the report', entities: { what: 'Send the report', deadline: '2026-10-27' } }) === '' && H.keyOf(null) === '');
check('a task without a due day has no key', H.keyOf({ personalClose: 'task-ask', label: 'Bring the form', entities: { what: 'Bring the form' } }) === '');
process.exit(failures ? 1 : 0);
