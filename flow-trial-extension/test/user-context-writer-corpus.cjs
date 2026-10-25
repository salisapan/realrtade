// UserContext writer (D1 part 1): features and counts only; no mail bodies.
// Run: TZ=UTC node test/user-context-writer-corpus.cjs
'use strict';
const { FlowUserContextWriter: W } = require('../core/user-context-writer.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

let p = W.empty('u1');
check('empty profile has schema version', p.schemaVersion === W.VERSION && p.userId === 'u1');

p = W.fromConnect(p, { email: 'me@co.com', name: 'Ada', title: 'CFO', department: 'Finance', preferDrive: true });
check('fromConnect can set identity without auto-connect seeding', p.identity.aliases.indexOf('Ada') >= 0 && p.identity.title === 'CFO');

p = W.fromStyleSummary(p, { greeting: 'hi-name', signoff: 'best', length: 'short' }, 'en');
check('style summary becomes a note, not raw mail', /opens with hi-name/.test(p.workStyle.writingStyleNote || ''));

p = W.recordKnowledge(p, 'We never discount below list.', 'user');
check('knowledge is capped text only', p.knowledge.length === 1);

p = W.applyEvent(p, { type: 'shown', partyKey: 'dana@x.com', intentFamily: 'quote' });
p = W.applyEvent(p, { type: 'approved', partyKey: 'dana@x.com', intentFamily: 'quote', fetchedBack: true });
p = W.applyEvent(p, { type: 'approved', partyKey: 'dana@x.com', intentFamily: 'quote', fetchedBack: true });
const hint = W.relevanceHint(p);
check('two approvals read as relevant', hint.relevance === 'relevant');

const t1 = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
const t2 = new Date().toISOString();
const decayed = W.applyEvent(W.empty('decay'), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: t1 });
const d2 = W.applyEvent(decayed, { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: t2 });
const decayHint = W.relevanceHint(d2);
check('decay-tolerant relevance (30/30 flake)', decayHint.relevance === 'relevant', decayHint);

let a = W.empty('acct-a');
let b = W.empty('acct-b');
a = W.applyEvent(a, { type: 'approved', partyKey: 'x@y.com', intentFamily: 'quote', fetchedBack: true });
b = W.applyEvent(b, { type: 'dismissed', partyKey: 'x@y.com', intentFamily: 'quote' });
check('profiles stay per user id', a.decisionHistory[0].approvedFetchedBack === 1 && b.decisionHistory[0].dismissed === 1);

p = W.applyEvent(W.empty('u2'), { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
p = W.applyEvent(p, { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
p = W.applyEvent(p, { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
check('three dismissals read as not_relevant', W.relevanceHint(p).relevance === 'not_relevant');

check('switch name is stable', W.SWITCH === 'USER_CONTEXT_WRITER');

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
