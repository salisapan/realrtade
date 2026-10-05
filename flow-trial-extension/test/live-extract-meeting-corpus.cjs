'use strict';
/**
 * Live Gmail extraction miss — listitem chrome vs body.
 *
 * At 29bbe2f, content-gmail.js passes div[role=listitem].innerText into
 * classify. That text includes the received-time row ("12:05"), invite
 * chips, and smart replies. Family H ambiguousClocks then sees 12:05 and
 * 10:00 as two distinct starts and stayQuiet('family').
 *
 * Production prefers div.a3s and does not strip that text. This corpus
 * models the listitem fallback: raw listitem text (pristine) vs
 * stripGmailReadingChrome(raw) when .a3s is missing.
 *
 * CLOSE_FAMILIES_JS unused; set LIVE_EXTRACT_MODE=pristine|patched
 * (default patched).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const mode = process.env.LIVE_EXTRACT_MODE === 'pristine' ? 'pristine' : 'patched';

// Same helper as content-gmail.js stripGmailReadingChrome (keep in sync).
function stripGmailReadingChrome(text) {
  let t = String(text || '');
  t = t.replace(
    /^(?:[^\n]{1,120}\n){0,4}?\d{1,2}:\d{2}(?:\s*\([^)\n]{0,40}\))?\s*\n(?:to\s+me\b[^\n]*\n)?/i,
    ''
  );
  t = t.replace(
    /(?:^|\n)(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s+[A-Za-z]+\s+\d{1,2},\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*[–—-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*\([A-Z]{2,5}\))?\s*(?=\n|$)/gi,
    '\n'
  );
  t = t.replace(
    /(?:^|\n)\d{1,2}:\d{2}\s*(?:AM|PM)\s*[–—-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*\([A-Z]{2,5}\))?\s*(?=\n|$)/gi,
    '\n'
  );
  t = t.replace(
    /(?:^|\n)(?:Yes, that works for me\.?|Yes, see you then!?|No, I can'?t make it\.?)\s*(?=\n|$)/gi,
    '\n'
  );
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'close-families.js', 'intent.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowCloseFamilies = vm.runInContext('FlowCloseFamilies', sandbox);
const FlowIntent = vm.runInContext('FlowIntent', sandbox);

const NOW = new Date('2026-10-05T09:05:00Z');
const SUBJECT = 'Meeting Thursday 10:00 about the launch checklist?';
const BODY =
  'Can we meet this Thursday, October 8, at 10:00 for 30 minutes about the launch checklist?\n' +
  'Also, please send me the updated pricing sheet by Wednesday.\n' +
  'Thanks,\nSali';

function listitem(extra) {
  return (
    'Sali Sapan <salisapan1@gmail.com>\n' +
    '12:05 (0 minutes ago)\nto me\n\n' +
    BODY +
    (extra || '')
  );
}

const cases = [
  {
    id: 'm1',
    expect: 'chip',
    note: 'header 12:05 + body (no invite chip)',
    raw: listitem(''),
  },
  {
    id: 'm2',
    expect: 'chip',
    note: 'header + invite chip Thu, Oct 8, 10:00 AM – 10:30 AM (IDT)',
    raw: listitem('\n\nThu, Oct 8, 10:00 AM – 10:30 AM (IDT)'),
  },
  {
    id: 'm3',
    expect: 'chip',
    note: 'full chrome: header + invite + smart replies',
    raw: listitem(
      '\n\nThu, Oct 8, 10:00 AM – 10:30 AM (IDT)\n' +
      'Yes, that works for me.\nYes, see you then!\nNo, I can\'t make it.'
    ),
  },
  {
    id: 'g1',
    expect: 'silent',
    note: 'real 2-time choice with or',
    raw: 'Can we meet at 3pm or 4pm?',
  },
  {
    id: 'g2',
    expect: 'silent',
    note: 'comma two-day slots',
    raw: 'Tuesday 10:00, Wednesday 14:00 — which works for you?',
  },
  {
    id: 'g3',
    expect: 'silent',
    note: 'Thursday 10:00 or 11:30',
    raw: 'Can we meet Thursday at 10:00 or 11:30?',
  },
  {
    id: 'g4',
    expect: 'silent',
    note: 'Hebrew two-slot',
    raw: 'אפשר ליישב ביום שלישי בשעה 10:00 או בשעה 14:00?',
  },
];

console.log('=== live-extract-meeting-corpus (' + mode + ') ===');

let fail = 0;
for (const c of cases) {
  const text = mode === 'patched' ? stripGmailReadingChrome(c.raw) : c.raw;
  const fam = FlowCloseFamilies.assess(text, {}, { now: NOW, senderEmail: 'salisapan1@gmail.com' });
  const intent = FlowIntent.classify(text, {
    senderEmail: 'salisapan1@gmail.com',
    senderName: 'Sali Sapan',
    subject: SUBJECT,
    now: NOW,
  });
  const isQuietFamily = !!(intent && intent.quiet === 'family') || !!(fam && fam.suppress);
  const isH = !!(fam && fam.suppress && fam.family === 'H');
  const chips =
    intent && intent.type && !intent.quiet &&
    (intent.personalClose === 'calendar-hold' || intent.closeFamily === 'D');
  let ok;
  let status;
  if (c.expect === 'chip') {
    ok = !!chips && !isQuietFamily;
    status = isQuietFamily
      ? ('QUIET(' + ((fam && fam.family) || intent.quiet) + ')')
      : (chips ? ('CHIP ' + intent.personalClose + '/' + intent.closeFamily) : ('OPEN type=' + (intent && intent.type)));
  } else {
    ok = isH;
    status = isH ? 'QUIET(H)' : (isQuietFamily ? ('QUIET(' + fam.family + ')') : ('OPEN ' + (intent && intent.type)));
  }
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) fail++;
  console.log(mark + ' [' + c.id + '] expect=' + c.expect + ' got=' + status + ' — ' + c.note);
}
console.log('failures: ' + fail + ' / ' + cases.length);
process.exit(fail ? 1 : 0);
