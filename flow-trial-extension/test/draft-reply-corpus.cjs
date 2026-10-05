'use strict';
const assert = require('assert');
const { FlowDraftReply } = require('../core/draft-reply.js');

const LIVE = {
  subject: 'Pilot proposal',
  text: 'Hi Sali,\n\nCould you review the attached pilot proposal and confirm by Wednesday whether we can start next week? Also, please send me the name of the person on your side who will own onboarding.\n\nThanks,\nFlow team',
  senderName: 'flow',
  senderEmail: 'ai.local.flow@gmail.com'
};

function testGreetingSkipsLocalPart() {
  assert.strictEqual(FlowDraftReply.greetingName('flow', 'ai.local.flow@gmail.com'), null);
  assert.strictEqual(FlowDraftReply.draftGreeting('flow', 'ai.local.flow@gmail.com'), 'Hi,');
  assert.strictEqual(FlowDraftReply.draftGreeting('Alex Rivera', 'dana@example.com'), 'Hi Alex,');
  assert.strictEqual(FlowDraftReply.draftGreeting('Flow team', 'x@y.com'), 'Hi,');
}

function testBodyFromIntentMatchesGmailShape() {
  const intent = {
    label: 'Confirm by Wednesday',
    entities: { requestWhat: 'review the pilot proposal', when: 'Wednesday' },
    signals: {}
  };
  const body = FlowDraftReply.bodyFromIntent(intent, LIVE.senderName, LIVE.senderEmail);
  assert.ok(body.startsWith('Hi,'), body);
  assert.ok(body.indexOf('Following up on: review the pilot proposal (Wednesday)') >= 0, body);
  assert.ok(body.indexOf('[Write your reply here]') >= 0, body);
  assert.ok(body.indexOf('\u2014') < 0, 'no em dash');
  assert.ok(body.indexOf('\u2013') < 0, 'no en dash');
}

function testDraftBodyTextFactReply() {
  const body = FlowDraftReply.draftBodyText({
    senderName: 'Alex',
    senderEmail: 'a.user@co.com',
    params: { replyFact: true, factLine: 'The amount is $40.' }
  });
  assert.strictEqual(body, 'Hi Alex,\n\nThe amount is $40.');
}

testGreetingSkipsLocalPart();
testBodyFromIntentMatchesGmailShape();
testDraftBodyTextFactReply();
console.log('draft-reply-corpus: ok');
