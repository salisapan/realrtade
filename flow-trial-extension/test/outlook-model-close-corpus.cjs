// A loop the AI engine opened (tier 'model') closes in the Outlook sync the way its plan says (core/outlook-sync.js deps.modelClose ->
// core/ai-host.js onMessage -> core/model-plan.js closeFor). Without deps.modelClose (the switches off) every loop takes the rules, as before.
// Run: node test/outlook-model-close-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowOutlookSync: S } = require('../core/outlook-sync.js');
const { FlowIdentity: I } = require('../core/identity-graph.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes } = require('../core/request-types.js');
const { FlowIntentPipeline } = require('../core/intent-pipeline.js');
const { FlowIntentModel } = require('../core/intent-model.js');
FlowIntentModel.load(require('../core/intent-model-weights.js').FlowIntentWeights);
const sb = { module: undefined, console: { log() {}, warn() {}, error() {} }, require, setTimeout, clearTimeout, Promise, TextEncoder, atob, btoa };
vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'step-list.js', 'json-enforce.js',
  'understanding.js', 'request-types.js', 'reply-meaning.js', 'file-path.js', 'follow-up.js', 'model-plan.js', 'privacyShield.js', 'mask-ids.js', 'exec-router.js',
  'understanding-router.js', 'ai-floor.js', 'kind-check.js', 'tier0-guard.js', 'tier0-quiet.js', 'ai-engine.js', 'ai-host.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sb), FlowActions = vm.runInContext('FlowActions', sb), H = vm.runInContext('FlowAiHost', sb);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 9, 3, 12).getTime();
const ME = 'me@contoso.com';
const BASE = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent, actions: FlowActions, ownNames: ['Me', 'Sali', 'Sali Sapan'] };
const ON = { aiPrimary: true, aiPlanV1: true };
const WITH = Object.assign({}, BASE, { modelClose: (w, msg, at) => H.onMessage(ON, w, msg, at) });
let n = 0;
const iso = (d) => new Date(NOW - d * DAY).toISOString();
const msg = (conv, text, ago, own) => ({ id: 'm' + (++n), conversationId: conv, subject: 'Re: Lease', isDraft: false,
  from: { emailAddress: own ? { name: 'Me', address: ME } : { name: 'Dana Cole', address: 'dana@acme.com' } },
  toRecipients: [{ emailAddress: own ? { name: 'Dana Cole', address: 'dana@acme.com' } : { name: 'Me', address: ME } }],
  sentDateTime: iso(ago), receivedDateTime: iso(ago), bodyPreview: text, body: { content: text } });
const mine = (c, t, a) => msg(c, t, a, true), theirs = (c, t, a) => msg(c, t, a, false);
// An ask of you the model found (Reply & Track): it closes when your real answer goes out.
const owe = (conv, over) => Object.assign({ id: 'ol:' + conv, threadId: 'ol:' + conv, channel: 'outlook', messageId: 'm0', subject: 'Lease', tier: 'model',
  counterpart: { name: 'Dana Cole', email: 'dana@acme.com', phone: null }, kind: 'reply', subtype: 'owe:reply', direction: 'mine', closeWhen: 'reply-sent',
  what: 'Could you send me the signed lease by Friday?', status: 'waiting', createdAt: NOW - 3 * DAY, chaseIso: '2026-10-09' }, over || {});
// A promise to you the model found: it closes when they deliver.
const promised = (conv, over) => owe(conv, Object.assign({ subtype: 'promised', direction: 'theirs', kind: 'reply', closeWhen: 'reply-received',
  what: 'I will send you the deck on Monday.' }, over || {}));
const plan = (messages, watches, deps) => S.plan({ messages, me: ME, watches, graph: I.empty(), state: {}, now: NOW, deps: deps || WITH });
const patchOf = (r, id) => (r.patches.find((p) => p.id === id) || {}).patch || null;

console.log('\n--- an ask of you the model found ---\n');
{
  const ans = plan([theirs('a1', 'Could you send me the signed lease by Friday?', 3), mine('a1', 'Hi Dana, here is the signed lease, see you Friday.', 0)], [owe('a1')]);
  const p = patchOf(ans, 'ol:a1');
  check('your real answer closes it', p && p.status === 'resolved' && p.closedAs === 'replied' && ans.stats.closed === 1, ans.patches);
  check('...says so in one line, and remembers the message', ans.lines.includes('You replied. Loop closed.') && /^m\d+$/.test(p.messageId), { lines: ans.lines, p });
  const thanks = plan([theirs('a2', 'Could you send me the signed lease by Friday?', 3), mine('a2', 'Got it, thanks!', 0)], [owe('a2')]);
  const tp = patchOf(thanks, 'ol:a2');
  check('"Got it, thanks" leaves it open and says nothing', (!tp || !tp.status) && thanks.stats.closed === 0 && thanks.lines.length === 0, thanks);
  const later = plan([theirs('a3', 'Could you send me the signed lease by Friday?', 3), mine('a3', "I'll send it to you on Thursday.", 0)], [owe('a3')]);
  const lp = patchOf(later, 'ol:a3');
  check('"I\'ll send it Thursday" moves the day, keeps it open', lp && !lp.status && lp.stage === 'promised' && lp.chaseIso && later.stats.moved === 1, lp);
  const no = plan([theirs('a4', 'Could you send me the signed lease by Friday?', 3), mine('a4', "Sorry Dana, I can't sign the lease, we decided not to go ahead.", 0)], [owe('a4')]);
  const np = patchOf(no, 'ol:a4');
  check('a clear no closes it as declined', np && np.status === 'resolved' && np.closedAs === 'declined' && no.lines.includes('You said no. Loop closed.'), np);
}

console.log('\n--- a promise to you the model found ---\n');
{
  const kept = plan([mine('p1', 'Could you send me the deck?', 3), theirs('p1', 'Here is the deck, as promised. Let me know if anything is missing.', 0)], [promised('p1')]);
  const kp = patchOf(kept, 'ol:p1');
  check('their delivery closes it', kp && kp.status === 'resolved' && kept.stats.closed === 1, kept.patches);
  const chase = plan([theirs('p2', 'I will send you the deck on Monday.', 3), mine('p2', 'Hi Dana, just following up on this, any update?', 0)], [promised('p2', { messageId: 'old' })]);
  const cp = patchOf(chase, 'ol:p2');
  check('your chase is still recorded as a chase (the rule)', cp && cp.nudges === 1 && !cp.status, chase.patches);
  const own = plan([theirs('p3', 'I will send you the deck on Monday.', 3), mine('p3', 'Great, thank you, talk soon.', 0)], [promised('p3', { messageId: 'old' })]);
  const op = patchOf(own, 'ol:p3');
  check('your own reply does not close their promise', !op || !op.status, own.patches);
}

console.log('\n--- what does not change ---\n');
{
  const rm = [theirs('r1', 'Could you send me the signed lease by Friday?', 3), mine('r1', 'Got it, thanks!', 0)];
  const rule = plan(rm, [owe('r1', { tier: 'rule' })]);
  const ruleOff = plan(rm, [owe('r1', { tier: 'rule' })], BASE);
  check('a loop the device rules opened: the same result with the hook as without', JSON.stringify(rule.patches) === JSON.stringify(ruleOff.patches) && JSON.stringify(rule.lines) === JSON.stringify(ruleOff.lines), { rule: rule.patches, off: ruleOff.patches });
  const cases = [
    [[theirs('x1', 'Could you send me the signed lease by Friday?', 3), mine('x1', 'Got it, thanks!', 0)], [owe('x1')]],
    [[theirs('x2', 'Could you send me the signed lease by Friday?', 3), mine('x2', 'Hi Dana, here is the signed lease.', 0)], [owe('x2')]],
    [[mine('x3', 'Could you send me the deck?', 3), theirs('x3', 'Here is the deck, as promised.', 0)], [promised('x3')]],
    [[theirs('x4', 'I will send you the deck on Monday.', 3), mine('x4', 'Great, thank you, talk soon.', 0)], [promised('x4', { messageId: 'old' })]]
  ];
  const strip = (r) => JSON.stringify({ p: r.patches.map((p) => ({ id: p.id, patch: Object.assign({}, p.patch, { resolvedAt: 0 }) })), l: r.lines, s: r.stats, o: r.offers.length, a: r.asks.length });
  // Without deps.modelClose (the host passes it only while aiPrimary and aiPlanV1 are on): a model loop takes exactly the rules a device
  // loop takes, as before this change.
  const before = cases.map(([m, w]) => strip(plan(m, w, BASE)));
  const asRule = cases.map(([m, w]) => strip(plan(m, w.map((x) => Object.assign({}, x, { tier: 'rule' })), BASE)));
  check('no hook: a model loop and a device loop get the same result, message by message', before.every((b, i) => b === asRule[i]), { before, asRule });
  const withHook = cases.map(([m, w]) => strip(plan(m, w)));
  console.log('  closed by the rules alone: ' + before.filter((b) => /"closed":1/.test(b)).length + '/4; with the plan: ' + withHook.filter((b) => /"closed":1/.test(b)).length + '/4 (the rules also close their promise on your "Great, thank you, talk soon"; the plan keeps it open)');
  const thrower = plan(cases[1][0], cases[1][1], Object.assign({}, BASE, { modelClose: () => { throw new Error('boom'); } }));
  check('a hook that throws: the rules decide, never a crash', strip(thrower) === before[1], { got: strip(thrower), want: before[1] });
  const deferred = plan(cases[1][0], cases[1][1], Object.assign({}, BASE, { modelClose: () => ({ defer: true }) }));
  check('a hook that defers: the rules decide', strip(deferred) === before[1]);
}

console.log('\n--- portability ---\n');
const src = fs.readFileSync(path.join(__dirname, '../core/outlook-sync.js'), 'utf8').replace(/\/\/.*$/gm, '');
check('outlook-sync stays portable: no chrome.*, document or window', !/\bchrome\.|\bdocument\.|\bwindow\./.test(src));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
