// Every surface: what a close the model found becomes on Gmail (and the Gmail add-on), Outlook, and the chats (WhatsApp, Messenger,
// Instagram, Teams). A chat has no email draft: an ask of the person is their task there, closed by their own reply in that chat.
// Run: node test/ai-surfaces-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'step-list.js', 'json-enforce.js',
  'understanding.js', 'request-types.js', 'reply-meaning.js', 'file-path.js', 'follow-up.js', 'model-plan.js', 'privacyShield.js', 'mask-ids.js', 'exec-router.js',
  'understanding-router.js', 'ai-floor.js', 'kind-check.js', 'tier0-guard.js', 'tier0-quiet.js', 'cloud-worth.js', 'ai-engine.js', 'ai-host.js'];
const sb = { module: undefined, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Promise, TextEncoder, atob, btoa };
vm.createContext(sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const E = vm.runInContext('FlowAiEngine', sb), H = vm.runInContext('FlowAiHost', sb), M = vm.runInContext('FlowModelPlan', sb);
const NOW = Date.parse('2026-10-07T09:00:00');
const ALL = { aiPrimary: true, aiPlanV1: true };
const it = (kind, span, due) => ({ kind, actor: 'sender', ask_span: span, evidence_span: span, due_span: due, confidence: 0.9 });
const read = (surface, text, answer) => E.read({ text, subject: 'x', today: '2026-10-07', direction: 'inbound', surface, lang: /[֐-׿]/.test(text) ? 'he' : 'en',
  threadId: 't-' + surface, counterpart: { name: 'Dana' }, now: NOW, tier0: { quiet: null, step: 'SILENT', possible: true } }, { tier1: async () => answer }, ALL);
const kinds = (out) => out && out.card && out.card.plan ? out.card.plan.steps.map((s) => s.kind).join('+') : null;

const ASK = 'Could you send me the signed lease by Friday?';
const ASK_HE = 'תוכלי לשלוח לי את החוזה החתום עד יום שישי?';
const MEET = 'Can we meet on Thursday at 10:00 at the office?';
const PROMISE = 'I will send you the signed lease on Friday.';

(async () => {
  console.log('\n--- an ask of the person, on every surface ---\n');
  const ask = { intentions: [it('ask_of_me', ASK, 'by Friday')] };
  const g = await read('gmail', ASK, ask);
  check('Gmail (and the Gmail add-on): Reply & Track, a Gmail draft and a task', kinds(g) === 'gmailDraft+googleTask' && g.card.plan.doneWhen.kind === 'reply-sent', kinds(g));
  const o = await read('outlook', ASK, ask);
  check('Outlook (and the Outlook add-in): an Outlook draft and an Outlook task', kinds(o) === 'outlookDraft+outlookTask', kinds(o));
  for (const s of ['whatsapp', 'messenger', 'instagram', 'teams']) {
    const c = await read(s, ASK, ask);
    check(s + ': no email draft; the person\'s task, closed by their own reply in the chat', kinds(c) === 'googleTask' && c.card.step === 'draft'
      && c.card.plan.doneWhen.kind === 'reply-sent' && c.watch && c.watch.channel === s && c.watch.direction === 'mine', { kinds: kinds(c), watch: c.watch && c.watch.channel });
  }
  const he = await read('whatsapp', ASK_HE, { intentions: [it('ask_of_me', ASK_HE, 'עד יום שישי')] });
  check('WhatsApp in Hebrew: the same, due Friday 9 October', kinds(he) === 'googleTask' && he.card.proposal.due === '2026-10-09', he.card && he.card.proposal);
  const unknown = await read('somewhere', ASK, ask);
  check('an unknown surface is planned as Gmail', kinds(unknown) === 'gmailDraft+googleTask', kinds(unknown));

  console.log('\n--- a meeting and a promise keep their steps on a chat ---\n');
  const meet = await read('whatsapp', MEET, { intentions: [it('meeting', MEET, 'on Thursday at 10:00')] });
  check('WhatsApp meeting: a calendar hold', meet.card && meet.card.step === 'calendar' && /calendar/i.test(kinds(meet)), kinds(meet));
  const prom = await read('messenger', PROMISE, { intentions: [it('promise_to_me', PROMISE, 'on Friday')] });
  check('Messenger promise to the person: a task, chased until it arrives', kinds(prom) === 'googleTask' && prom.watch && prom.watch.direction === 'theirs', { kinds: kinds(prom), w: prom.watch && prom.watch.direction });

  console.log('\n--- carried and closed on the chat ---\n');
  const c = await read('whatsapp', ASK, ask);
  check('"Got it" in the chat does not close it', H.onMessage(ALL, c.watch, { isOwn: true, text: 'Got it, thanks!' }, NOW).none === true);
  const closed = H.onMessage(ALL, c.watch, { isOwn: true, text: 'Sent it to you just now, here is the signed lease.' }, NOW);
  check('the person\'s real answer in the chat closes it', closed.close === true && closed.patch.closedAs === 'replied', closed);

  console.log('\n--- the host keeps the surface ---\n');
  for (const s of ['gmail', 'outlook', 'whatsapp', 'messenger', 'instagram', 'teams']) {
    check('mailInput keeps ' + s, H.mailInput({ text: 'x', surface: s }, { show: false }).surface === s);
  }
  check('mailInput maps anything else to gmail', H.mailInput({ text: 'x', surface: 'fax' }, { show: false }).surface === 'gmail');

  console.log('\n--- off ---\n');
  check('aiPlanV1 off: no plan on any surface', (await E.read({ text: ASK, today: '2026-10-07', direction: 'inbound', surface: 'whatsapp', tier0: { step: 'SILENT', possible: true } }, { tier1: async () => ask }, { aiPrimary: true })).card.plan === null);
  check('the plan itself refuses with the switch off', M.plan({}, { step: 'draft' }, { surface: 'whatsapp' }).used === false);

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
