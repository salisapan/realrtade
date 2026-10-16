// Permanent #144 regression list. 479 rows, sha256
// 9bf4b82f477ed192cc7ea39b44f5dfa419cca46e3718512a434cc8f3a50b900d.
// Each row goes through the real judge on the Gmail path and the Outlook
// path. offer and quiet are asserted. either is skipped. expectKind is the
// intent type, except task, which is a task-only close, and
// task/dated-commitment, which is that task on the dated-commitment
// track with expectDate.
// v2syn-10902 and overprobe 11, 12, 17, 54, and 55 are allowed fails.
// Each one is judged, logged with its reason, and not asserted.
// Any other miss fails the corpus.
// Run: node test/regress-144-corpus.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'regress-144-all-rounds.jsonl');
const FIXTURE_SHA = '9bf4b82f477ed192cc7ea39b44f5dfa419cca46e3718512a434cc8f3a50b900d';
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const J = vm.runInContext('FlowIncomingJudge', engine);

const OWN_GMAIL = 'ai.local.flow@gmail.com';
const OWN_OUTLOOK = 'glance.salisapan@outlook.com';
const NAMES = ['Sali', 'Sali Sapan', 'סאלי'];
// Same skip for every id here. v2syn-10902 may offer: בולה is not בוטלה.
// The five overprobe rows are known misses on 9eab907, a9e42e8, and
// ec55cb1. They stay in the fixture as expected offer and are not asserted.
const ALLOWED_FAIL = {
  'v2syn-10902': 'בולה typo may offer',
  'overprobe-11': 'old miss on 9eab907/a9e42e8/ec55cb1: postpone calls that one event off; the Thursday time is not a second event',
  'overprobe-12': 'old miss on 9eab907/a9e42e8/ec55cb1: please cancel the 10:00 standup has no weekday, so clear-it does not build a delete',
  'overprobe-17': 'old miss on 9eab907/a9e42e8/ec55cb1: the file gate stays quiet on an unclear signed-contract request',
  'overprobe-54': 'old miss on 9eab907/a9e42e8/ec55cb1: Dana wrote a quoted ask; the third-party gate is a Quote: line',
  'overprobe-55': 'old miss on 9eab907/a9e42e8/ec55cb1: forwarding from the client plus a quoted ask; the third-party gate is a Quote: line'
};
const OUTBOUND_REASON = 'outbound to someone else (CTO 2026-10-16)';
const OUTBOUND_QUIET = ['v2syn-3888', 'v2syn-3898', 'v2syn-3912', 'v2syn-3919'];
const DATED_ID = 'v2syn-8473';
const DATED_REASON = 'task/dated-commitment on 2026-10-19 (CTO 2026-10-16, same track as #148)';

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
  const ctx = row.context || null;
  const outbound = Boolean(ctx && ctx.from === 'user' && ctx.to === 'other');
  return { own, onBehalf, inSent, forwarded, attachmentCount, outbound };
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
    direction: (ctx.outbound || ctx.inSent) ? 'outbound' : 'inbound',
    inbound: !(ctx.outbound || ctx.inSent),
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

function kindOk(out, row) {
  const expectKind = row && row.expectKind;
  if (!expectKind) return true;
  const intent = out && out.intent;
  if (!intent) return false;
  if (expectKind === 'task') return taskOnly(out) || intent.noReplyDraft === true;
  if (expectKind === 'task/dated-commitment') {
    const iso = intent.entities && intent.entities.dateIso;
    return taskOnly(out)
      && intent.personalClose === 'dated-commitment'
      && iso === row.expectDate;
  }
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

function fileTrack(out) {
  if (!shown(out)) return true;
  const kinds = ((out.process && out.process.steps) || []).map((s) => s && s.kind);
  const taskAt = kinds.findIndex((k) => k === 'googleTask' || k === 'outlookTask' || k === 'googleTasks');
  const draftAt = kinds.findIndex((k) => k === 'gmailDraft' || k === 'outlookDraft');
  const label = out.intent && out.intent.label;
  return taskAt !== -1 && draftAt > taskAt && label !== 'Reply requested' && !/^Reply requested by\b/.test(String(label || ''));
}

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
if (rows.length !== 479) {
  console.log('FAIL: fixture rows ' + rows.length);
  process.exit(1);
}

const byId = {};
for (const row of rows) {
  if (byId[row.id]) {
    console.log('FAIL: duplicate id ' + row.id);
    process.exit(1);
  }
  byId[row.id] = row;
}
for (const id of OUTBOUND_QUIET) {
  const row = byId[id];
  const mark = row && row.context;
  const from = row ? parseFrom(row.from).email.toLowerCase() : '';
  const own = [OWN_GMAIL, OWN_OUTLOOK];
  const to = row ? (row.to || []).map((a) => String(a).toLowerCase()) : [];
  const addresses = own.indexOf(from) >= 0 && to.length > 0 && to.some((a) => own.indexOf(a) < 0);
  if (!row || row.expected !== 'quiet' || row.expectKind || row.reason !== OUTBOUND_REASON || !mark || mark.from !== 'user' || mark.to !== 'other' || !addresses) {
    console.log('FAIL: outbound label ' + id);
    process.exit(1);
  }
}
const dated = byId[DATED_ID];
if (!dated || dated.expected !== 'offer' || dated.expectKind !== 'task/dated-commitment' || dated.expectDate !== '2026-10-19' || dated.reason !== DATED_REASON) {
  console.log('FAIL: dated label ' + DATED_ID);
  process.exit(1);
}
for (const id of Object.keys(ALLOWED_FAIL)) {
  if (id === 'v2syn-10902') continue;
  const row = byId[id];
  if (!row || row.expected !== 'offer' || row.knownFail !== true || row.reason !== ALLOWED_FAIL[id]) {
    console.log('FAIL: known-fail label ' + id);
    process.exit(1);
  }
}
const extraKnown = rows.filter((row) => row.knownFail === true && !ALLOWED_FAIL[row.id]);
if (extraKnown.length) {
  console.log('FAIL: known-fail outside the list ' + extraKnown.map((row) => row.id).join(', '));
  process.exit(1);
}

const counts = { offerPass: 0, offerFail: 0, quietPass: 0, quietFail: 0, either: 0, allowed: 0 };
const fails = [];
for (const row of rows) {
  if (row.expected === 'either') { counts.either++; continue; }
  const ctx = contextOf(row);
  const g = judge(row, 'gmail', ctx);
  const o = judge(row, 'outlook', ctx);
  if (ALLOWED_FAIL[row.id]) {
    counts.allowed++;
    console.log('ALLOWED:', row.id, 'gmail', describe(g), 'outlook', describe(o), '(' + ALLOWED_FAIL[row.id] + ')');
    continue;
  }
  const wantOffer = row.expected === 'offer';
  let ok = false;
  let why = '';
  if (wantOffer) {
    const gOk = shown(g) || connectorQuiet('gmail', g);
    const oOk = shown(o) || connectorQuiet('outlook', o);
    const oneShows = shown(g) || shown(o);
    const kind = (!row.expectKind) || (( !shown(g) || kindOk(g, row)) && (!shown(o) || kindOk(o, row)) && oneShows);
    const label = !row.expectLabel || ((!shown(g) || (g.intent && g.intent.label === row.expectLabel)) && (!shown(o) || (o.intent && o.intent.label === row.expectLabel)));
    const track = row.expectTrack !== 'file' || (fileTrack(g) && fileTrack(o));
    ok = gOk && oOk && oneShows && kind && label && track;
    if (!ok) {
      why = 'gmail ' + describe(g) + ' outlook ' + describe(o);
      if (row.expectKind && !kind) why += ' expectKind ' + row.expectKind + (row.expectDate ? ' ' + row.expectDate : '');
      if (row.expectLabel && !label) why += ' label gmail ' + ((g.intent && g.intent.label) || '') + ' outlook ' + ((o.intent && o.intent.label) || '');
      if (row.expectTrack === 'file' && !track) why += ' track';
    }
  } else {
    ok = !shown(g) && !shown(o);
    if (ok && row.expectKind) {
      const kindSource = (g.intent && g.intent.type) ? g : o;
      if (!kindOk(kindSource, row)) {
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
