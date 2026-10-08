// Invisible formatting and a phone signature on the same line as the ask.
// The listed bodies are the shadow-v2 report's quoted rows. A dirty twin
// (bidi, zero-width, nbsp, CR) must decide like the clean text.
// Run: node test/mail-format-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : ''); }
}

const ROOT = path.join(__dirname, '..');
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'source-text.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'quiet-metrics.js', 'incoming-judge.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const Judge = vm.runInContext('FlowIncomingJudge', engine);
const when = new Date('2026-10-07T12:00:00Z');

function sig(text, surface, count) {
  const r = Judge.judge({
    text: text,
    subject: 'Gate',
    sender: { name: 'flow', email: 'ai.local.flow@gmail.com' },
    attachmentCount: count,
    hasThreadAttachment: count === 1,
    surface: surface,
    // A host Date fails instanceof inside the vm, and the judge then uses the
    // wall clock. A timestamp is the same instant in UTC and Asia/Jerusalem.
    now: when.getTime()
  });
  return {
    show: r.show === true,
    reason: r.reason || null,
    type: r.intent && r.intent.type || null,
    label: r.intent && r.intent.label || null,
    kinds: r.process && r.process.steps ? r.process.steps.map((s) => s.kind) : null
  };
}

function dirtyOf(text) {
  const rlm = '\u200F';
  const zw = '\u200B';
  const nbsp = '\u00A0';
  const lines = String(text).split('\n');
  return rlm + lines.map((line, i) => (i === 0 ? zw + line.replace(/ /g, nbsp) : line)).join('\r\n');
}

console.log('\n--- prepareForJudge strips invisible formatting once ---\n');
{
  const raw = '\u200F\u200E\u202Aאולי\u200B כדאי\u00A0לשמור\u202Fאת\uFEFF המצורף\r\nבדרייב';
  const clean = Judge.prepareForJudge(raw);
  check('bidi, zero-width, nbsp and CR are gone',
    clean === 'אולי כדאי לשמור את המצורף\nבדרייב' && Judge.prepareForJudge(clean) === clean,
    clean);
}

console.log('\n--- a phone signature drops only when the line is only the signature ---\n');
{
  // Frozen from engine 0.9.36 (182efb5f) on these exact lines.
  const rows = [
    ['Sent from my iPhone. Could you confirm the transfer by Friday?', 'gmail', 0,
      { show: true, reason: null, type: 'request', label: 'Reply requested by Oct 9', kinds: ['gmailDraft', 'googleTask'] }],
    ['Sent from my iPhone. Could you confirm the transfer by Friday?', 'outlook', 1,
      { show: true, reason: null, type: 'request', label: 'Reply requested by Oct 9', kinds: ['outlookDraft', 'googleTask'] }],
    ['Sent from my iPhone — could you send the deck by Friday?', 'gmail', 0,
      { show: true, reason: null, type: 'request', label: 'Reply requested by Oct 9', kinds: ['gmailDraft', 'googleTask'] }],
    ['Sent from my iPhone — could you send the deck by Friday?', 'outlook', 1,
      { show: false, reason: 'file-chain-not-run', type: 'request', label: 'Reply requested by Oct 9', kinds: null }],
    ['נשלח מהאייפון שלי: תוכל לשלוח לי את החוזה עד יום חמישי?', 'gmail', 0,
      { show: true, reason: null, type: 'decision', label: 'Log commitment for Oct 8', kinds: ['googleTask'] }],
    ['נשלח מהאייפון שלי: תוכל לשלוח לי את החוזה עד יום חמישי?', 'outlook', 1,
      { show: true, reason: null, type: 'decision', label: 'Log commitment for Oct 8', kinds: ['outlookTask'] }]
  ];
  rows.forEach((row) => {
    const got = sig(row[0], row[1], row[2]);
    check('same decision as 0.9.36: ' + row[1] + ' ' + row[0].slice(0, 42),
      JSON.stringify(got) === JSON.stringify(row[3]), { got: got, want: row[3] });
  });
  const kept = 'Could you confirm the transfer by Friday?\n\nSent from my iPhone';
  const shown = sig(kept, 'gmail', 0);
  const shownOl = sig(kept, 'outlook', 1);
  check('a signature on its own line still leaves the ask showing',
    shown.show === true && shown.kinds && shown.kinds[0] === 'gmailDraft' &&
    shownOl.show === true && shownOl.kinds && shownOl.kinds[0] === 'outlookDraft',
    { gmail: shown, outlook: shownOl });
  const item17 = 'תשמור את הקובץ המצורף ב-One Drive עד יום ראשון\n\nנשלח מה-iPhone שלי';
  const one = sig(item17, 'outlook', 1);
  check('item 17 stays OneDrive plus the Outlook draft at one file',
    one.show === true && one.kinds && one.kinds[0] === 'onedriveFile' && one.kinds[1] === 'outlookDraft',
    one);
}

console.log('\n--- RLM on a Hebrew hedge is the same decision as the clean line ---\n');
{
  const clean = 'אולי כדאי לשמור את המצורף בדרייב';
  const marked = '\u200F' + clean;
  const a = sig(clean, 'gmail', 1);
  const b = sig(marked, 'gmail', 1);
  const c = sig(clean, 'outlook', 1);
  const d = sig(marked, 'outlook', 1);
  check('RLM plus the hedge matches the hedge without it',
    a.show === false && a.reason === 'quiet:google' && JSON.stringify(a) === JSON.stringify(b) &&
    c.show === false && JSON.stringify(c) === JSON.stringify(d),
    { clean: a, marked: b, outlook: d });
}

console.log('\n--- every listed shadow-v2 body matches its dirty twin ---\n');
{
  const listed = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'shadow-v2-listed-bodies.json'), 'utf8'));
  let formatRows = 0;
  let matched = 0;
  listed.forEach((row) => {
    const clean = Judge.prepareForJudge(row.text);
    const naturalDirty = row.text !== clean;
    if (naturalDirty) formatRows++;
    ['gmail', 'outlook'].forEach((surface) => {
      const count = surface === 'outlook' ? 1 : 0;
      const left = sig(row.text, surface, count);
      const right = sig(clean, surface, count);
      const injected = sig(dirtyOf(clean), surface, count);
      const ok = JSON.stringify(left) === JSON.stringify(right) && JSON.stringify(injected) === JSON.stringify(right);
      if (ok && surface === 'gmail' && naturalDirty) matched++;
      check(row.id + ' ' + surface + ' dirty twin matches', ok, { raw: left, clean: right, injected: injected });
    });
  });
  check('every format-bearing listed body matches its clean twin on Gmail',
    formatRows > 0 && matched === formatRows, { formatRows: formatRows, matched: matched });
  console.log('FORMAT-BEARING LISTED ROWS MATCHING CLEAN TWIN: ' + matched + '/' + formatRows);
  console.log('LISTED ROWS: ' + listed.length);
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
