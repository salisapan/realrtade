// Decompose v1 (core/intent-decompose.js): one mail, every intention, each broken into its parts with the planner's own steps.
// The floor: the whole-mail decision first, named whole-mail quiets and phishing stand, nothing invented, nothing closes.
// Run: node test/intent-decompose-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'file-attach.js', 'fact-reply.js',
  'quiet-metrics.js', 'resolution.js', 'commitment-title.js', 'graph-mail.js', 'incoming-judge.js', 'draft-reply.js', 'intent-decompose.js'];
const NOW = new Date('2026-10-07T12:00:00+03:00').getTime();
const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, TextEncoder, atob, btoa };
vm.createContext(sb);
// The judge reads the clock to tell a past date from a future one: freeze it, so the corpus reads the same on any day.
vm.runInContext('(function (N) { var D = Date; function F() { var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(D, [null].concat(a)))() : new D(N); } F.prototype = D.prototype; F.now = function () { return N; }; F.UTC = D.UTC; F.parse = D.parse; Date = F; })(' + NOW + ')', sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const D = vm.runInContext('FlowIntentDecompose', sb);
const J = vm.runInContext('FlowIncomingJudge', sb);
const FI = vm.runInContext('FlowIntent', sb);
const DEPS = { intent: FI, actions: vm.runInContext('FlowActions', sb), factReply: vm.runInContext('FlowFactReply', sb), fileAttach: vm.runInContext('FlowFileAttach', sb),
  resolution: vm.runInContext('FlowResolution', sb), quietMetrics: vm.runInContext('FlowQuietMetrics', sb) };
const ON = { aiDecomposeV1: true };
const OWN = 'ai.local.flow@gmail.com';
function run(text, extra) {
  const input = Object.assign({ text, subject: 'Next steps', sender: { name: 'Dana Levi', email: 'dana@acme.io' }, now: new Date(NOW), threadUrl: 'https://mail.google.com/x',
    hasThreadAttachment: false, attachmentCount: 0, surface: 'gmail', to: [OWN], cc: [], ownAddresses: [OWN], ownNames: ['Sali', 'Sali Sapan', 'סאלי'], userName: 'Sali',
    direction: 'inbound', inbound: true, namesWaitDone: true }, extra || {});
  const whole = J.judge(input, DEPS);
  return D.decompose(ON, { text, whole, sender: input.sender, vetoText: input.subject + '\n' + text },
    { judgeText: (t) => J.judge(Object.assign({}, input, { text: t }), DEPS), phishing: (t) => FI.phishingOrNegative(t) });
}
const anchors = (r) => r.intentions.map((x) => x.anchor).sort().join(',');

console.log('\n--- the off switch ---\n');
check('switch off: not used, the host keeps the whole-mail decision', D.decompose({}, { text: 'x', whole: { show: true } }, {}).used === false && D.decompose(undefined, {}, {}).used === false && D.decompose({ aiDecomposeV1: 'yes' }, {}, {}).used === false);
check('the switch is named and defaults off', D.SWITCH === 'aiDecomposeV1' && D.DEFAULTS.aiDecomposeV1 === false);

console.log('\n--- clauses ---\n');
let c = D.clauses("Hi Sali, Could you send me the signed contract by Thursday? Also, let's meet on Monday at 10:00 to go over the budget. Thanks, Dana");
check('EN: the greeting apart, two clauses, the sign-off dropped', c.greeting === 'Hi Sali,' && c.clauses.length === 2 && /^Also, let's meet/.test(c.clauses[1].text), c);
c = D.clauses('שלום סאלי, נא לשלם את החשבונית עד יום חמישי בנוסף, תעבור על המצגת לפני הפגישה');
check('HE: «בנוסף,» opens a new clause even with no full stop', c.greeting === 'שלום סאלי,' && c.clauses.length === 2 && c.clauses[1].text.startsWith('בנוסף,'), c);
c = D.clauses('Hi Sali Could you send me the file?');
check('no comma after the name: no greeting is cut, the ask stays whole', c.greeting === '' && c.clauses.length === 1, c);
check('the clause text is a substring of the mail', D.clauses('Hi all, Please pay the invoice by Friday and also review the deck. Thanks!').clauses.every((x) => 'Hi all, Please pay the invoice by Friday and also review the deck. Thanks!'.includes(x.text)));
check('cleanWhat drops the greeting and the connector', D.cleanWhat('היי סאלי, בנוסף, נא לקבוע פגישה', 'היי סאלי,') === 'נא לקבוע פגישה' && D.cleanWhat('Also, review the deck', '') === 'review the deck');

console.log('\n--- the floor, with a stub judge ---\n');
const SHOW = (kind, anchor, extra) => ({ show: true, intent: Object.assign({ type: kind, entities: {} }, extra || {}), process: { id: 'p', name: 'P', steps: [{ kind: anchor }] } });
const stubText = 'Hi Sali, Please review the deck by Friday. Also, can we meet Monday at 10:00?';
const stub = (map) => ({ judgeText: (t) => { for (const [k, v] of map) if (t.includes(k)) return v; return { show: false, reason: 'intent-null' }; }, phishing: () => false });
let r = D.decompose(ON, { text: stubText, whole: { show: false, reason: 'quiet:hedge' } }, stub([['review', SHOW('request', 'gmailDraft')]]));
check('a named whole-mail quiet (hedge) stands: no clause pass', r.used && r.intentions.length === 0 && r.reason === 'whole-mail-quiet', r);
for (const q of ['quiet:noise', 'quiet:marketing', 'own-sender', 'names-pending', 'meeting-veto', 'file', 'quiet:relay']) {
  r = D.decompose(ON, { text: stubText, whole: { show: false, reason: q } }, stub([['review', SHOW('request', 'gmailDraft')]]));
  check('whole-mail quiet ' + q + ' stands', r.intentions.length === 0, r);
}
r = D.decompose(ON, { text: stubText, whole: { show: false, reason: 'quiet:family' } }, { judgeText: () => SHOW('request', 'gmailDraft'), phishing: () => true });
check('a phishing or bank-change mail never gets a clause pass, even under quiet:family', r.intentions.length === 0 && r.reason === 'whole-mail-veto', r);
r = D.decompose(ON, { text: stubText, whole: { show: false, reason: 'intent-null' } }, stub([['review', SHOW('request', 'gmailDraft')], ['meet', SHOW('event', 'calendar', { entities: { dateIso: '2026-10-12', hour: 10, minute: 0 } })]]));
check('intent-null: the clauses find both intentions, in the mail\'s order', anchors(r) === 'calendar,draft' && r.intentions[0].anchor === 'draft', r.intentions);
check('every intention needs a click, none closes, each has its evidence clause from the mail', r.intentions.every((x) => x.needsClick === true && x.closes === false && stubText.includes(x.evidence)));
check('the parts: who acts, the date and clock read by the judge, what closes it', r.intentions[1].actor === 'both' && r.intentions[1].due.dateIso === '2026-10-12' && r.intentions[1].due.hour === 10 && r.intentions[1].doneWhen.kind === 'event-held' && r.intentions[0].doneWhen.kind === 'reply-sent');
r = D.decompose(ON, { text: stubText, whole: SHOW('event', 'calendar', { entities: { dateIso: '2026-10-12', hour: 10, minute: 0 } }) }, stub([['review', SHOW('request', 'gmailDraft')], ['meet', SHOW('event', 'calendar', { entities: { dateIso: '2026-10-12', hour: 10, minute: 0 } })]]));
check('a whole-mail decision keeps its anchor first; the other intention is added after it', r.intentions[0].anchor === 'calendar' && r.intentions[0].source === 'whole+clause' && r.intentions[1].anchor === 'draft', r.intentions);
r = D.decompose(ON, { text: stubText, whole: SHOW('request', 'gmailDraft') }, stub([]));
check('when no clause reads anything, the whole-mail decision stays alone', r.intentions.length === 1 && r.intentions[0].source === 'whole');
r = D.decompose(ON, { text: 'Hi Sali, a. Please send A by Friday. Please send B by Monday. Please send C by Tuesday. Please send D by Thursday.', whole: { show: false, reason: 'intent-null' } },
  { judgeText: (t) => { const m = t.match(/send (\w)/); return m ? SHOW('request', 'gmailDraft', { entities: { what: m[1], dateIso: '2026-10-1' + 'ABCD'.indexOf(m[1]) } }) : { show: false, reason: 'intent-null' }; } });
check('at most MAX_INTENTIONS intentions', r.intentions.length === D.MAX_INTENTIONS, r.intentions.length);
r = D.decompose(ON, { text: stubText, whole: { show: false, reason: 'intent-null' } }, stub([['review', { show: false, reason: 'file', intent: { type: 'request', entities: { what: 'the deck' } } }]]));
check('a file ask the file chain owns becomes that chain\'s intention: find the one file, then the reply draft', r.intentions.length === 1 && r.intentions[0].owner === 'file-chain' && r.intentions[0].steps.join() === 'find_file,draft' && r.intentions[0].anchor === 'draft', r.intentions);
r = D.decompose(ON, { text: stubText, whole: { show: false, reason: 'intent-null' } }, stub([['review', { show: false, reason: 'file', intent: { type: 'commitment', entities: {} } }]]));
check('a file reason on something that is not a request of the person is not an intention', r.intentions.length === 0);

console.log('\n--- the real judge ---\n');
r = run("Hi Sali, Could you send me the signed contract by Thursday? Also, let's meet on Monday, October 12 at 10:00 to go over the budget. Thanks, Dana");
check('EN: the contract ask and the meeting are both found (the whole mail saw only the meeting)', anchors(r) === 'calendar,draft' && r.intentions.some((x) => x.owner === 'file-chain'), r.intentions.map((x) => [x.anchor, x.source, x.evidence]));
const meet = r.intentions.find((x) => x.anchor === 'calendar');
check('EN: the meeting keeps its own day and clock, and its title is the meeting, not the greeting', meet && meet.due.dateIso === '2026-10-12' && meet.due.hour === 10 && !/^Hi Sali/.test(meet.what) && !/^Also/.test(meet.what), meet);
r = run('היי סאלי, אפשר לשלוח לי את הדוח עד יום חמישי? בנוסף, נא לקבוע פגישה ביום ראשון ה-11.10 בשעה 14:00. תודה, דנה');
check('HE: the report ask and the meeting, each with its own date', anchors(r) === 'calendar,draft' && r.intentions.find((x) => x.anchor === 'draft').due.dateIso === '2026-10-08' && r.intentions.find((x) => x.anchor === 'calendar').due.dateIso === '2026-10-11', r.intentions.map((x) => [x.anchor, x.due]));
r = run('Hi Sali, Could you set up a check-in Monday at 9am? Also, please schedule a call with Maya on Wednesday at 14:30. Thanks, Dana');
check('two meetings in one mail (held as one piece) become two holds, each at its own time', r.intentions.length === 2 && r.intentions.every((x) => x.anchor === 'calendar') && r.intentions[0].due.hour !== r.intentions[1].due.hour, r.intentions.map((x) => [x.anchor, x.due]));
r = run('Hi Sali, Could you send me the Q3 numbers by Wednesday? Thanks, Dana');
check('one intention: exactly the whole-mail decision', r.intentions.length === 1 && r.intentions[0].anchor === 'draft', r.intentions);
r = run('Hi Sali, FYI the office is closed on Friday. Can you send me the Q3 numbers by Wednesday? Thanks');
check('FYI stays a whole-mail quiet (product rule): nothing is offered', r.intentions.length === 0 && r.whole.reason === 'quiet:noise', r);
r = run('Hi Sali, Our bank details have changed. Please pay the ₪4,000 invoice to the new account by Friday. Thanks');
check('a bank change with a payment stays quiet, clause by clause too', r.intentions.length === 0, r);
r = run('Hi Sali, Maybe we could meet Monday at 10:00? Also, perhaps send the deck sometime. Thanks');
check('a hedged mail stays quiet', r.intentions.length === 0, r);

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
