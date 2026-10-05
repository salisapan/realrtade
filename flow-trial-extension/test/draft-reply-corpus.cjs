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

function testRichPilotBodyFromIntent() {
  const intent = {
    type: 'request',
    label: 'Confirm by Wednesday',
    entities: { requestWhat: 'review the pilot proposal', when: 'Wednesday', what: 'confirm by Wednesday' },
    facts: { date: { raw: 'Wednesday', iso: '2026-10-07' } },
    signals: {}
  };
  const body = FlowDraftReply.bodyFromIntent(intent, LIVE.senderName, LIVE.senderEmail, {
    text: LIVE.text,
    subject: LIVE.subject
  });
  assert.ok(body.startsWith('Hi,'), body);
  assert.ok(/pilot proposal/i.test(body) && /review/i.test(body), body);
  assert.ok(/Wednesday|confirm/i.test(body), body);
  assert.ok(/onboarding owner[\s\S]*\[name\]/i.test(body), body);
  assert.ok(body.indexOf('Following up on:') < 0, 'rich path, not weak template: ' + body);
  assert.ok(body.indexOf('[Write your reply here]') < 0, 'no generic placeholder when asks covered: ' + body);
  assert.ok(body.indexOf('\u2014') < 0, 'no em dash');
  assert.ok(body.indexOf('\u2013') < 0, 'no en dash');
}

function testRichFromWhatWhenAlone() {
  // Plan params without full ask text still get a richer ack than the weak template.
  const body = FlowDraftReply.draftBodyText({
    senderName: LIVE.senderName,
    senderEmail: LIVE.senderEmail,
    params: { what: 'review the pilot proposal', when: 'Wednesday', askText: LIVE.text }
  });
  assert.ok(/Thanks for sending the pilot proposal/i.test(body), body);
  assert.ok(/onboarding owner[\s\S]*\[name\]/i.test(body), body);
}

function testDraftBodyTextFactReply() {
  const body = FlowDraftReply.draftBodyText({
    senderName: 'Alex',
    senderEmail: 'a.user@co.com',
    params: { replyFact: true, factLine: 'The amount is $40.' }
  });
  assert.strictEqual(body, 'Hi Alex,\n\nThe amount is $40.');
}

function testWeakFallbackWhenNoSignals() {
  const body = FlowDraftReply.draftBodyText({
    senderName: 'Alex',
    senderEmail: 'a.user@co.com',
    params: {}
  });
  assert.ok(body.indexOf('Following up on your message below.') >= 0, body);
  assert.ok(body.indexOf('[Write your reply here]') >= 0, body);
}

testGreetingSkipsLocalPart();
testRichPilotBodyFromIntent();
testRichFromWhatWhenAlone();
testDraftBodyTextFactReply();
testWeakFallbackWhenNoSignals();
console.log('draft-reply-corpus: ok');
