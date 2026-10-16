// Permanent #144 regression list. 443 rows, sha256
// b07fe753c5d59b4f1e97e257f3e0783d3765658a2cc789870e570a915234bd1d.
// Each row goes through the real judge on the Gmail path and the Outlook
// path. offer and quiet are asserted. either is skipped. expectKind is the
// intent type, except task, which is a task-only close.
// v2syn-10902 is an allowed fail: בולה is not בוטלה, and the CTO accepted
// the calendar offer.
// Run: node test/regress-144-corpus.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'regress-144-all-rounds.jsonl');
const FIXTURE_SHA = 'b07fe753c5d59b4f1e97e257f3e0783d3765658a2cc789870e570a915234bd1d';
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const J = vm.runInContext('FlowIncomingJudge', engine);

const OWN_GMAIL = 'ai.local.flow@gmail.com';
const OWN_OUTLOOK = 'glance.salisapan@outlook.com';
const NAMES = ['Sali', 'Sali Sapan', 'סאלי'];
// בולה is a typo, not בוטלה. The written label is quiet. An offer is the
// exception the CTO accepted, so this id does not fail the corpus.
const ALLOWED_FAIL = 'v2syn-10902';

function parseFrom(raw) {
  const text = String(raw || '');
  const m = text.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (text.indexOf('@') !== -1) return { name: '', email: text.trim() };
  return { name: text.trim(), email: '' };
}

function contextOf(row) {
  const note = String(row.note || '');
  const own = [OWN_GMAIL, OWN_OUTLOOK];
  if (/sali@northwind\.co\.il/i.test(note) && /alias|own addresses/i.test(note)) own.push('sali@northwind.co.il');
  const behalf = note.match(/sender=(\S+@\S+)/i);
  const onBehalf = behalf ? behalf[1].replace(/[;,).].*$/, '') : null;
  const inSent = /sentitems|folder=sent/i.test(note);
  const forwarded = /forwarded message|הודעה שהועברה|FW: others/i.test(note)
    || /----------\s*Forwarded message/i.test(row.body || '')
    || /הודעה שהועברה/.test(row.body || '');
  const blob = String(row.subject || '') + '\n' + String(row.body || '');
  const attachmentCount = /attach|מצורף/i.test(blob) ? 1 : 0;
  return { own, onBehalf, inSent, forwarded, attachmentCount };
}

function judge(row, surface, ctx) {
  const from = parseFrom(row.from);
  const sender = from.email ? from : { name: from.name || 'Dana Levi', email: 'dana@acme.io' };
  return J.judge({
    text: row.body,
    subject: row.subject || '',
    sender: sender,
    surface: surface,
    attachmentCount: ctx.attachmentCount,
    to: row.to || [],
    cc: row.cc || [],
    ownAddresses: ctx.own,
    userName: 'Sali',
    ownNames: NAMES,
    direction: ctx.inSent ? 'outbound' : 'inbound',
    inbound: !ctx.inSent,
    inSent: ctx.inSent,
    forwarded: ctx.forwarded,
    onBehalfOf: ctx.onBehalf,
    threadUrl: 'https://example.invalid/t'
  });
}

function taskOnly(out) {
  const steps = (out && out.process && out.process.steps) || [];
  return steps.length > 0 && steps.every((s) => s && (s.kind === 'googleTask' || s.kind === 'googleTasks' || s.kind === 'outlookTask'));
}

function kindOk(out, expectKind) {
  if (!expectKind) return true;
  const intent = out && out.intent;
  if (!intent) return false;
  if (expectKind === 'task') return taskOnly(out) || intent.noReplyDraft === true;
  return intent.type === expectKind;
}

// Outlook stays quiet on a calendar event with no draft and no task, and
// on a file chain it has not run. Gmail stays quiet when the file was
// asked for on OneDrive. Those are the connector, not a different judgment.
function connectorQuiet(surface, out) {
  const reason = out && out.reason;
  if (surface === 'outlook' && (reason === 'no-draft-close' || reason === 'file-chain-not-run' || reason === 'fact-reply-block')) return true;
  if (surface === 'gmail' && reason === 'onedrive-target-on-gmail') return true;
  return false;
}

function shown(out) { return out && out.show === true; }

function describe(out) {
  if (shown(out)) {
    const t = out.intent && out.intent.type;
    return 'offer' + (t ? '(' + t + ')' : '');
  }
  return 'quiet:' + ((out && out.reason) || 'none');
}

const bytes = fs.readFileSync(FIXTURE);
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
if (sha !== FIXTURE_SHA) {
  console.log('FAIL: fixture sha256 ' + sha);
  process.exit(1);
}
const rows = bytes.toString('utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
if (rows.length !== 443) {
  console.log('FAIL: fixture rows ' + rows.length);
  process.exit(1);
}

const counts = { offerPass: 0, offerFail: 0, quietPass: 0, quietFail: 0, either: 0, allowed: 0 };
const fails = [];
for (const row of rows) {
  if (row.expected === 'either') { counts.either++; continue; }
  const ctx = contextOf(row);
  const g = judge(row, 'gmail', ctx);
  const o = judge(row, 'outlook', ctx);
  if (row.id === ALLOWED_FAIL) {
    counts.allowed++;
    console.log('ALLOWED:', row.id, 'gmail', describe(g), 'outlook', describe(o), '(בולה typo may offer)');
    continue;
  }
  const wantOffer = row.expected === 'offer';
  let ok = false;
  let why = '';
  if (wantOffer) {
    const gOk = shown(g) || connectorQuiet('gmail', g);
    const oOk = shown(o) || connectorQuiet('outlook', o);
    const oneShows = shown(g) || shown(o);
    const kindSource = shown(g) ? g : o;
    const kind = kindOk(kindSource, row.expectKind);
    ok = gOk && oOk && oneShows && kind;
    if (!ok) {
      why = 'gmail ' + describe(g) + ' outlook ' + describe(o);
      if (row.expectKind && !kind) why += ' expectKind ' + row.expectKind;
    }
  } else {
    ok = !shown(g) && !shown(o);
    if (ok && row.expectKind) {
      const kindSource = (g.intent && g.intent.type) ? g : o;
      if (!kindOk(kindSource, row.expectKind)) {
        ok = false;
        why = 'quiet but kind ' + ((kindSource.intent && kindSource.intent.type) || 'none') + ' expectKind ' + row.expectKind;
      }
    }
    if (!ok && !why) why = 'gmail ' + describe(g) + ' outlook ' + describe(o);
  }
  if (wantOffer) { if (ok) counts.offerPass++; else counts.offerFail++; }
  else { if (ok) counts.quietPass++; else counts.quietFail++; }
  if (!ok) fails.push(row.id + ' expected ' + row.expected + (row.expectKind ? '/' + row.expectKind : '') + ' — ' + why);
}

console.log('offer pass ' + counts.offerPass + ' fail ' + counts.offerFail);
console.log('quiet pass ' + counts.quietPass + ' fail ' + counts.quietFail);
console.log('either ' + counts.either + ' allowed ' + counts.allowed);
fails.forEach((line) => console.log('FAIL:', line));
console.log('FAILURES: ' + fails.length);
process.exit(fails.length ? 1 : 0);
