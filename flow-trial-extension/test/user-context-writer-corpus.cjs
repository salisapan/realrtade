// UserContext writer (D1 part 1): features and counts only; no mail bodies.
// Run: node test/user-context-writer-corpus.cjs
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
check('Connect seeds identity and Drive preference', p.identity.aliases.indexOf('Ada') >= 0 && p.identity.title === 'CFO' && p.workStyle.preferredTools.files === 'drive');

p = W.fromStyleSummary(p, { greeting: 'hi-name', signoff: 'best', length: 'short' }, 'en');
check('style summary becomes a note, not raw mail', /opens with hi-name/.test(p.workStyle.writingStyleNote || '') && p.workStyle.languages.indexOf('en') >= 0);

p = W.recordKnowledge(p, 'We never discount below list.', 'user');
check('knowledge is capped text only', p.knowledge.length === 1 && p.knowledge[0].note.indexOf('discount') >= 0);

p = W.applyEvent(p, { type: 'shown', partyKey: 'dana@x.com', intentFamily: 'quote' });
p = W.applyEvent(p, { type: 'approved', partyKey: 'dana@x.com', intentFamily: 'quote', fetchedBack: true });
p = W.applyEvent(p, { type: 'approved', partyKey: 'dana@x.com', intentFamily: 'quote', fetchedBack: true });
const hint = W.relevanceHint(p);
check('two fetched-back closes without dismissals read as relevant history', hint.relevance === 'relevant' && hint.reason === 'history_closed');

p = W.applyEvent(W.empty('u2'), { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
p = W.applyEvent(p, { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
p = W.applyEvent(p, { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
check('three dismissals without approval read as not_relevant', W.relevanceHint(p).relevance === 'not_relevant');

check('switch name is stable', W.SWITCH === 'USER_CONTEXT_WRITER');

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
