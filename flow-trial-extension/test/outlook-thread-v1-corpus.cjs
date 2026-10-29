'use strict';
// Outlook v1: full-thread judgment, no latest-message-only fallback.
// Run: node test/outlook-thread-v1-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

const sb = { module: undefined, console };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'outlook-thread-v1.js'), 'utf8'), sb, { filename: 'outlook-thread-v1.js' });
const T = sb.FlowOutlookThreadV1;

const ASK = 'Could you review the attached pilot proposal and confirm by Wednesday whether we can start next week?';
const THANKS = 'Thanks, got it.';
const rows = [
  { id: 'm1', receivedDateTime: '2026-10-28T08:00:00Z', body: { contentType: 'text', content: ASK } },
  { id: 'm2', receivedDateTime: '2026-10-28T09:00:00Z', body: { contentType: 'text', content: THANKS } }
];

function judge(text) {
  const t = String(text || '');
  if (t.indexOf('confirm by Wednesday') >= 0) return { show: true };
  if (/^thanks/i.test(t.trim())) return { show: false, reason: 'intent-null' };
  return { show: false, reason: 'intent-null' };
}

const judgeRow = { textOf: (r) => r.body.content, judge };

T.setPickMode('v1');
const picked = T.pickJudgmentMessage(rows, judgeRow);
check('v1 picks the earlier ask when the latest line is thanks', picked && picked.row.id === 'm1' && picked.show === true, picked);

const quietOnly = T.pickJudgmentMessage(
  [{ id: 'q1', receivedDateTime: '2026-10-28T10:00:00Z', body: { contentType: 'text', content: 'Hi team, fyi only.' } }],
  { textOf: (r) => r.body.content, judge: () => ({ show: false, reason: 'intent-null' }) }
);
check('v1 still returns the open row when every message is quiet', quietOnly && quietOnly.row.id === 'q1' && quietOnly.show === false, quietOnly);

T.setPickMode('latest-only');
const mutantPick = T.pickJudgmentMessage(rows, judgeRow);
check('mutant latest-only would pick thanks instead of the ask', mutantPick && mutantPick.row.id === 'm2');
check('guard: v1 must not match the latest-only mutant on this thread', !(picked && mutantPick && picked.row.id === mutantPick.row.id));

T.setPickMode('v1');
const outlookSrc = fs.readFileSync(path.join(ROOT, 'src', 'content-outlook.js'), 'utf8');
check('content-outlook removed Graph latest-message-only fallback ($top=1 desc)', outlookSrc.indexOf('$top=1&$orderby=receivedDateTime desc') < 0);
check('content-outlook applies full thread read before judgment', /applyFullThreadRead/.test(outlookSrc));
check('thread read filters Graph by conversationId (G2 guard)', /conversationId eq/.test(outlookSrc) && /fetchConversationThreadRows/.test(outlookSrc));

if (failures) process.exit(1);
console.log('\nAll outlook-thread-v1 checks passed.\n');
