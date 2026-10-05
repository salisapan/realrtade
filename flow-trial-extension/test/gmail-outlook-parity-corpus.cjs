'use strict';
/**
 * Same engine for Gmail and Outlook: identical classify decision, label, and
 * draft body for the same email text. Only the write adapter differs
 * (gmailDraft vs outlookDraft step kind).
 * Run: node test/gmail-outlook-parity-corpus.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { FlowDraftReply } = require('../core/draft-reply.js');
const { FlowOwaParse } = require('../core/owa-parse.js');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowActions = vm.runInContext('FlowActions', sandbox);

const LIVE_TEXT =
  'Hi Sali,\n\nCould you review the attached pilot proposal and confirm by Wednesday whether we can start next week? Also, please send me the name of the person on your side who will own onboarding.\n\nThanks,\nFlow team';

const CTX = {
  senderEmail: 'ai.local.flow@gmail.com',
  senderName: 'flow',
  now: new Date('2026-10-05T12:00:00+03:00')
};

function pathFor(surface, text) {
  const intent = FlowIntent.classify(text, CTX);
  const show = FlowIntent.shouldShowChip(intent);
  const process = intent
    ? FlowActions.planFor(intent, {
        threadUrl: surface === 'gmail' ? 'https://mail.google.com/' : 'https://outlook.live.com/',
        hasThreadAttachment: false
      })
    : null;
  let steps = (process && process.steps) || [];
  if (surface === 'outlook') {
    steps = steps.map((s) => (s.kind === 'gmailDraft' ? Object.assign({}, s, { kind: 'outlookDraft' }) : s));
  }
  const draftKind = surface === 'gmail' ? 'gmailDraft' : 'outlookDraft';
  const draftStep = steps.find((s) => s.kind === draftKind);
  // Same rich body for both surfaces: pass the ask text so review/confirm/owner land.
  const body = intent
    ? FlowDraftReply.bodyFromIntent(intent, CTX.senderName, CTX.senderEmail, { text: text, subject: 'Pilot proposal' })
    : null;
  void draftStep;
  return {
    type: intent && intent.type,
    label: intent && intent.label,
    show: Boolean(show && process),
    stepKinds: steps.map((s) => s.kind),
    body: body
  };
}

const g = pathFor('gmail', LIVE_TEXT);
const o = pathFor('outlook', LIVE_TEXT);

assert.ok(g.type, 'gmail classified: ' + JSON.stringify(g));
assert.strictEqual(g.type, o.type, 'same intent type');
assert.strictEqual(g.label, o.label, 'same label');
assert.strictEqual(g.show, o.show, 'same show decision');
assert.strictEqual(g.body, o.body, 'same draft body\nG:\n' + g.body + '\nO:\n' + o.body);
assert.ok(g.stepKinds.indexOf('gmailDraft') >= 0, 'gmail draft step: ' + g.stepKinds);
assert.ok(o.stepKinds.indexOf('outlookDraft') >= 0, 'outlook draft step: ' + o.stepKinds);
assert.ok(/pilot proposal/i.test(g.body || '') && /review/i.test(g.body || ''), 'rich pilot ack: ' + g.body);
assert.ok(/onboarding owner[\s\S]*\[name\]/i.test(g.body || ''), 'owner placeholder: ' + g.body);
assert.ok((g.body || '').indexOf('Following up on:') < 0, 'not weak template: ' + g.body);
assert.ok((g.body || '').indexOf('\u2014') < 0, 'no em dash');

// OWA match helpers
const pane = { subject: 'Pilot proposal', senderEmail: 'ai.local.flow@gmail.com', itemId: 'AAA' };
const entries = [
  { messageId: 'AAA', subject: 'Pilot proposal', sender: { email: 'ai.local.flow@gmail.com' } },
  { messageId: 'BBB', subject: 'Other', sender: { email: 'x@y.com' } }
];
assert.strictEqual(FlowOwaParse.matchEntry(pane, entries).messageId, 'AAA');
assert.ok(FlowOwaParse.itemIdFromUrl('https://outlook.live.com/mail/0/id/XYZ123'));

console.log('PASS: gmail/outlook parity', { type: g.type, label: g.label, show: g.show });
console.log('gmail-outlook-parity-corpus: ok');
