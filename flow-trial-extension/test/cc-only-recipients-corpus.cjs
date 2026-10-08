// Gate 0.9.54. A parent that starts with To/אל also contains the Cc line.
// Harvesting that parent put the Cc address in pane.to, so the draft card
// offered while Graph recipients (Why not shown) stayed quiet:hedge.
// Run: node test/cc-only-recipients-corpus.cjs
// Needs jsdom (not a dependency of this repo): npm i --no-save jsdom
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIPPED: jsdom not available'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const { FlowOwaParse } = require(path.join(ROOT, 'core', 'owa-parse.js'));
const sandbox = { console };
vm.createContext(sandbox);
['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'incoming-judge.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sandbox, { filename: f });
});
const Judge = sandbox.FlowIncomingJudge;

const ME = 'glance.salisapan@outlook.com';
const FLOW = 'ai.local.flow@gmail.com';
const OFFICE_SUBJECT = 'Office move - can you confirm the date?';
const OFFICE_BODY = 'Hi,\nCan you reply and confirm whether the office move is still on for October 20?\nThanks,\nFlow';
const Q3_SUBJECT = 'Gate A 0.9.41 – quick question on the Q3 summary';
const Q3_BODY = 'Hi,\nCan you reply and confirm whether the Q3 summary will include the October numbers?\nThanks,\nFlow test';

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 800) : '');
  }
}

function paneHtml(subject, header, body) {
  return '<!doctype html><html lang="he" dir="rtl"><body><div role="main"><div id="ReadingPaneContainerId">' +
    '<div role="heading" aria-level="2">' + subject + '</div>' +
    '<div class="messageItem"><div class="hdr">' + header + '</div>' +
    '<div role="document" class="allowTextSelection"><div class="UniqueMessageBody">' + body + '</div></div>' +
    '</div></div></div></body></html>';
}

function readPane(subject, header, body) {
  const dom = new JSDOM(paneHtml(subject, header, body), { url: 'https://outlook.live.com/mail/0/inbox/' });
  return FlowOwaParse.readPane(dom.window.document, 'https://outlook.live.com/mail/0/inbox/', { own: [ME], userName: 'Sali' });
}

function judge(text, subject, to, cc) {
  const r = Judge.judge({
    text: text,
    subject: subject,
    sender: { name: 'flow', email: FLOW },
    surface: 'outlook',
    to: to || [],
    cc: cc || [],
    ownAddresses: [ME],
    userName: 'Sali',
    inbound: true,
    now: '2026-10-08T12:00:00Z'
  });
  const kinds = ((r && r.process && r.process.steps) || []).map((s) => s.kind);
  return { show: r && r.show === true, reason: r && r.reason, kinds: kinds };
}

function draftOffered(row) {
  return row && row.show === true && row.kinds.indexOf('outlookDraft') >= 0;
}

const officeHeaders = {
  'parent wraps To and Cc lines':
    '<div class="envelope"><div class="to">אל: <span title="' + FLOW + '">flow</span></div>' +
    '<div class="cc">עותק: <span title="' + ME + '">Glance</span></div></div>',
  'Cc line nested inside the To line':
    '<div class="to">אל: <span title="' + FLOW + '">flow</span>' +
    '<div class="cc">עותק: <span title="' + ME + '">Glance</span></div></div>',
  'Cc chip title inside the To block':
    '<div class="to">אל: <span title="' + FLOW + '">flow</span> <span title="עותק: ' + ME + '">עותק</span></div>',
  'sibling To and Cc lines':
    '<span>אל: ' + FLOW + '</span><span>עותק: ' + ME + '</span>'
};

Object.keys(officeHeaders).forEach((label) => {
  const pane = readPane(OFFICE_SUBJECT, officeHeaders[label], OFFICE_BODY.replace(/\n/g, '<br>'));
  const row = judge(OFFICE_BODY, OFFICE_SUBJECT, pane.to, pane.cc);
  check(label + ': Cc stays out of To',
    pane && pane.to.indexOf(FLOW) >= 0 && pane.to.indexOf(ME) < 0 && pane.cc.indexOf(ME) >= 0,
    { to: pane && pane.to, cc: pane && pane.cc });
  check(label + ': no Reply & Track draft',
    row && row.show !== true && row.reason === 'quiet:hedge' && row.kinds.indexOf('outlookDraft') < 0,
    row);
});

const graph = judge(OFFICE_BODY, OFFICE_SUBJECT, [FLOW], [ME]);
check('Graph To/Cc for the same mail is quiet:hedge',
  graph.show !== true && graph.reason === 'quiet:hedge' && graph.kinds.indexOf('outlookDraft') < 0,
  graph);
const leaked = judge(OFFICE_BODY, OFFICE_SUBJECT, [FLOW, ME], [ME]);
check('putting the Cc address in To is what offers the draft',
  draftOffered(leaked),
  leaked);

const q3 = readPane(Q3_SUBJECT, '<div class="to">אל: <span>' + ME + '</span></div>', Q3_BODY.replace(/\n/g, '<br>'));
const q3row = judge(Q3_BODY, Q3_SUBJECT, q3.to, q3.cc);
check('Q3 Hi with the reader in To still offers a draft',
  q3 && q3.to.indexOf(ME) >= 0 && (!q3.cc || q3.cc.length === 0) && draftOffered(q3row) && String(q3row.reason || '').indexOf('hedge') < 0,
  { to: q3 && q3.to, cc: q3 && q3.cc, row: q3row });

const q3label = readPane(Q3_SUBJECT,
  '<div role="heading" aria-label="אל: ' + ME + '"><span>אל:</span><span aria-label="' + ME + '">' + ME + '</span></div>',
  Q3_BODY.replace(/\n/g, '<br>'));
check('a heading whose child is אל still puts the reader in To',
  q3label && q3label.to.indexOf(ME) >= 0 && (!q3label.cc || !q3label.cc.length),
  { to: q3label && q3label.to, cc: q3label && q3label.cc });

const bidi = readPane(Q3_SUBJECT,
  '<span class="to-label">\u200E\u00A0אל\u00A0:</span><span class="to-addr">' + ME + '</span>',
  'Hi');
check('a bidi אל label with the address on the next node is still To',
  bidi && bidi.to.indexOf(ME) >= 0,
  { to: bidi && bidi.to });

const withCc = readPane(Q3_SUBJECT,
  '<div class="envelope"><div class="to">אל: <span title="' + ME + '">Sali</span></div>' +
  '<div class="cc">עותק: <span title="dana@acme.com">Dana</span></div></div>',
  Q3_BODY.replace(/\n/g, '<br>'));
const withCcRow = judge(Q3_BODY, Q3_SUBJECT, withCc.to, withCc.cc);
check('the reader in To and someone else in Cc still drafts',
  withCc && withCc.to.indexOf(ME) >= 0 && withCc.to.indexOf('dana@acme.com') < 0 &&
  withCc.cc.indexOf('dana@acme.com') >= 0 && draftOffered(withCcRow),
  { to: withCc && withCc.to, cc: withCc && withCc.cc, row: withCcRow });

const nestedUser = readPane(Q3_SUBJECT,
  '<div class="to">אל: <span title="' + ME + '">Sali</span><div class="cc">עותק: <span title="dana@acme.com">Dana</span></div></div>',
  Q3_BODY.replace(/\n/g, '<br>'));
const nestedRow = judge(Q3_BODY, Q3_SUBJECT, nestedUser.to, nestedUser.cc);
check('a Cc line nested under the reader\'s To line still drafts',
  nestedUser && nestedUser.to.indexOf(ME) >= 0 && nestedUser.to.indexOf('dana@acme.com') < 0 &&
  nestedUser.cc.indexOf('dana@acme.com') >= 0 && draftOffered(nestedRow),
  { to: nestedUser && nestedUser.to, cc: nestedUser && nestedUser.cc, row: nestedRow });

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
