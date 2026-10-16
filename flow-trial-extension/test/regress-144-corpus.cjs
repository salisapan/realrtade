// Permanent #144 regression list. One deduped fixture. sha256 is checked
// below. Each row goes through the real judge on the Gmail path and the
// Outlook path. offer and quiet are asserted. either is skipped.
// expectKind is the intent type, except task, which is a task-only close,
// task/dated-commitment, which is that task on the dated-commitment track
// with expectDate, and quiet, which is no type.
// expectOutlook quiet means Outlook must stay hidden.
// A shown task-only plan and a shown calendar-only plan use a card
// label of that same kind. A task step title is a task label.
// expectTrack file is the attach-to-invite card.
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
const FIXTURE_SHA = '4bd0c451973071010094b1d611c7a9b5368db36529c69ec6a28696774b36ffc6';
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js', 'commitment-title.js', 'display-copy.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const J = vm.runInContext('FlowIncomingJudge', engine);
const Display = vm.runInContext('FlowDisplay', engine);

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
const ATTACH_QUIET = [];
const ATTACH_REASON = 'Attaching a file to an existing invite is quiet/file before the reply-request check (CTO 2026-10-16)';

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
    userName: row.userName || 'Sali',
    ownNames: Array.isArray(row.ownNames) ? row.ownNames : NAMES,
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
  if (expectKind === 'quiet') return !intent.type;
  if (expectKind === 'task') return taskOnly(out);
  if (expectKind === 'task/dated-commitment') {
    const iso = intent.entities && intent.entities.dateIso;
    return taskOnly(out)
      && intent.personalClose === 'dated-commitment'
      && iso === row.expectDate;
  }
  if (expectKind === 'request') {
    return intent.type === 'request' || (out.process && out.process.id === 'reply-track');
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

function draftClaimsAttached(out) {
  const body = J.draftText(out && out.process, {});
  if (!body) return '';
  if (/Attached/.test(body) || /מצורף/.test(body)) return body.replace(/\s+/g, ' ').trim();
  return '';
}

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
if (rows.length !== 659) {
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
const NEW_FILE = {
  'v2syn-3392': 'Attach CV to invite',
  'v2syn-3427': 'Attach SOW to invite'
};
const NEW_VOC = {
  'cto-1016-voc-he-own': 'offer',
  'cto-1016-voc-en-own': 'offer',
  'cto-1016-voc-he-other': 'quiet',
  'cto-1016-voc-en-other': 'quiet'
};
for (const id of Object.keys(NEW_FILE)) {
  const row = byId[id];
  if (!row || row.expected !== 'offer' || row.expectTrack !== 'file' || row.expectLabel !== NEW_FILE[id]) {
    console.log('FAIL: meeting attach label ' + id);
    process.exit(1);
  }
}
for (const id of Object.keys(NEW_VOC)) {
  const row = byId[id];
  if (!row || row.expected !== NEW_VOC[id] || row.to.indexOf('ai.local.flow@gmail.com') < 0) {
    console.log('FAIL: vocative label ' + id);
    process.exit(1);
  }
}
const AIM_QUIET = {
  'v2syn-9401': 'cc',
  'v2syn-9403': 'cc',
  'v2syn-9404': 'cc',
  'v2syn-3412': 'cc',
  'v2syn-9387': 'cc',
  'v2syn-8472': 'cc',
  'v2syn-23104': 'cc'
};
for (const id of Object.keys(AIM_QUIET)) {
  const row = byId[id];
  const own = [OWN_GMAIL, OWN_OUTLOOK];
  const from = row ? parseFrom(row.from).email.toLowerCase() : '';
  const to = row ? (row.to || []).map((a) => String(a).toLowerCase()) : [];
  const cc = row ? (row.cc || []).map((a) => String(a).toLowerCase()) : [];
  const self = AIM_QUIET[id] === 'self' && own.indexOf(from) >= 0 && to.some((a) => own.indexOf(a) >= 0);
  const ccOnly = AIM_QUIET[id] === 'cc' && to.every((a) => own.indexOf(a) < 0) && cc.some((a) => own.indexOf(a) >= 0);
  if (!row || row.expected !== 'quiet' || row.expectTrack || row.expectLabel || !(self || ccOnly)) {
    console.log('FAIL: aim label ' + id);
    process.exit(1);
  }
}
const aimed = byId['v2syn-9391'];
if (!aimed || aimed.expected !== 'offer' || aimed.expectTrack !== 'file' || aimed.expectLabel !== 'לצרף הסכם הסודיות לזימון' || aimed.to.indexOf(OWN_GMAIL) < 0) {
  console.log('FAIL: 9391 stays the file track');
  process.exit(1);
}
const typoClock = byId['v2syn-23409'];
if (!typoClock || typoClock.expected !== 'offer' || typoClock.expectKind !== 'event' || typoClock.body.indexOf('בעה 10:00') < 0) {
  console.log('FAIL: 23409 label');
  process.exit(1);
}
const dated = byId[DATED_ID];
if (!dated || dated.expected !== 'offer' || dated.expectKind !== 'task/dated-commitment' || dated.expectDate !== '2026-10-19' || dated.reason !== DATED_REASON) {
  console.log('FAIL: dated label ' + DATED_ID);
  process.exit(1);
}
for (const id of ATTACH_QUIET) {
  const row = byId[id];
  if (!row || row.expected !== 'quiet' || row.expectKind !== 'quiet' || row.reason !== ATTACH_REASON) {
    console.log('FAIL: attach quiet label ' + id);
    process.exit(1);
  }
}

function planKind(out) {
  const steps = (out && out.process && out.process.steps) || [];
  if (!steps.length) return null;
  if (steps.every((s) => s && (s.kind === 'googleTask' || s.kind === 'googleTasks' || s.kind === 'outlookTask'))) return 'task';
  if (steps.every((s) => s && s.kind === 'calendar')) return 'event';
  return null;
}

function labelKind(title) {
  const t = String(title || '').trim();
  if (/^Meeting\b/.test(t) || t === 'פגישה' || /^(Hold It|Schedule It|Schedule & Confirm|Clear It|Move It)$/.test(t)) return 'event';
  if (/^Reply requested\b/.test(t) || /^(Reply & Track|Reply with it)$/.test(t)) return 'request';
  if (t === 'Save the file?' || t === 'Follow Through') return 'file';
  if (!t) return '';
  return 'task';
}

// The card the person reads, and the title a task step writes, follow the
// plan that will run. A Meeting label on a task-only plan is the copy bug.
function labelMismatch(out, row) {
  if (!shown(out)) return '';
  const kind = planKind(out);
  if (!kind) return '';
  const face = Display.cardFace(out.process, out.intent, { bodyText: row.body }).title;
  if (labelKind(face) !== kind) return 'card ' + face + ' is ' + labelKind(face) + ' plan ' + kind;
  if (kind === 'task') {
    if (labelKind(out.intent && out.intent.label) !== 'task') return 'intent label ' + (out.intent && out.intent.label);
    const steps = (out.process && out.process.steps) || [];
    for (let i = 0; i < steps.length; i++) {
      const title = steps[i].params && steps[i].params.title;
      if (labelKind(title) !== 'task') return 'step title ' + title;
    }
  }
  return '';
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
    const oOk = row.expectOutlook === 'quiet' ? !shown(o) : (shown(o) || connectorQuiet('outlook', o));
    const oneShows = shown(g) || shown(o);
    const kind = (!row.expectKind) || (( !shown(g) || kindOk(g, row)) && (!shown(o) || kindOk(o, row)) && oneShows);
    const labelWhy = labelMismatch(g, row) || labelMismatch(o, row);
    const label = !row.expectLabel || ((!shown(g) || (g.intent && g.intent.label === row.expectLabel)) && (!shown(o) || (o.intent && o.intent.label === row.expectLabel)));
    const track = row.expectTrack !== 'file' || (fileTrack(g) && fileTrack(o));
    const draftClaim = row.expectTrack === 'file' ? (draftClaimsAttached(g) || draftClaimsAttached(o)) : '';
    ok = gOk && oOk && oneShows && kind && !labelWhy && label && track && !draftClaim;
    if (!ok) {
      why = 'gmail ' + describe(g) + ' outlook ' + describe(o);
      if (row.expectKind && !kind) why += ' expectKind ' + row.expectKind + (row.expectDate ? ' ' + row.expectDate : '');
      if (labelWhy) why += ' label ' + labelWhy;
      if (row.expectLabel && !label) why += ' label gmail ' + ((g.intent && g.intent.label) || '') + ' outlook ' + ((o.intent && o.intent.label) || '');
      if (row.expectTrack === 'file' && !track) why += ' track';
      if (draftClaim) why += ' draft ' + draftClaim;
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
    if (ok && ATTACH_QUIET.indexOf(row.id) >= 0) {
      const fileQuiet = g.reason === 'quiet:file' && o.reason === 'quiet:file' && g.intent && g.intent.quiet === 'file' && o.intent && o.intent.quiet === 'file';
      if (!fileQuiet) {
        ok = false;
        why = 'quiet/file expected — gmail ' + describe(g) + ' outlook ' + describe(o);
      }
    }
    if (!ok && !why) why = 'gmail ' + describe(g) + ' outlook ' + describe(o);
  }
  if (wantOffer) { if (ok) counts.offerPass++; else counts.offerFail++; }
  else { if (ok) counts.quietPass++; else counts.quietFail++; }
  if (!ok) fails.push(row.id + ' expected ' + row.expected + (row.expectKind ? '/' + row.expectKind : '') + ' — ' + why);
}

{
  const row = byId['v2syn-23409'];
  const ctx = contextOf(row);
  const g = judge(row, 'gmail', ctx);
  const o = judge(row, 'outlook', ctx);
  const steps = (g.process && g.process.steps) || [];
  const cal = steps.filter((s) => s && s.kind === 'calendar');
  const hour = g.intent && g.intent.entities && g.intent.entities.hour;
  const minute = g.intent && g.intent.entities && g.intent.entities.minute;
  const outlookOk = shown(o) ? (o.intent && o.intent.entities && o.intent.entities.hour === 10) : connectorQuiet('outlook', o);
  if (!shown(g) || g.intent.type !== 'event' || hour !== 10 || minute !== 0 || cal.length !== 1 || cal[0].params.hour !== 10 || !outlookOk) {
    console.log('FAIL: 23409 calendar gmail ' + describe(g) + ' outlook ' + describe(o) + ' hour ' + hour);
    process.exit(1);
  }
}
{
  const row = byId['v2syn-6673'];
  const ctx = contextOf(row);
  const g = judge(row, 'gmail', ctx);
  const o = judge(row, 'outlook', ctx);
  if (!row || row.expected !== 'quiet' || shown(g) || shown(o) || g.reason !== 'quiet:family' || o.reason !== 'quiet:family') {
    console.log('FAIL: 6673 phishing gmail ' + describe(g) + ' outlook ' + describe(o));
    process.exit(1);
  }
}
const REPLY_TRACK = ['v2syn-29','v2syn-55','v2syn-249','v2syn-333','v2syn-576','v2syn-593','v2syn-669','v2syn-2557','v2syn-3315','v2syn-3317','v2syn-11885','v2syn-11967','v2syn-12153','v2syn-12420','v2syn-12596','v2syn-12788','v2syn-12944','v2syn-13257','v2syn-13369','v2syn-13428','v2syn-13749','v2syn-13787'];
for (const id of REPLY_TRACK) {
  const row = byId[id];
  if (!row || row.expected !== 'offer' || row.expectKind !== 'request') {
    console.log('FAIL: reply label ' + id);
    process.exit(1);
  }
  const ctx = contextOf(row);
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(row, surface, ctx);
    const steps = (out.process && out.process.steps) || [];
    const draft = steps.some((s) => s && (s.kind === 'gmailDraft' || s.kind === 'outlookDraft'));
    const cal = steps.some((s) => s && s.kind === 'calendar');
    if (!shown(out) || !out.process || out.process.id !== 'reply-track' || !draft || cal) {
      console.log('FAIL: reply track ' + id + ' ' + surface + ' ' + describe(out) + ' ' + ((out.process && out.process.id) || ''));
      process.exit(1);
    }
  }
}
for (const id of ['v2syn-1797', 'v2syn-1806']) {
  const row = byId[id];
  if (!row || row.expected !== 'offer' || row.expectKind !== 'task' || row.expectLabel !== 'Schedule meeting') {
    console.log('FAIL: schedule label ' + id);
    process.exit(1);
  }
  const ctx = contextOf(row);
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(row, surface, ctx);
    const steps = (out.process && out.process.steps) || [];
    const cal = steps.some((s) => s && s.kind === 'calendar');
    if (!shown(out) || !taskOnly(out) || cal || !out.intent || out.intent.label !== 'Schedule meeting') {
      console.log('FAIL: schedule meeting ' + id + ' ' + surface + ' ' + describe(out) + ' ' + ((out.intent && out.intent.label) || ''));
      process.exit(1);
    }
  }
}
{
  const he = J.judge({
    text: 'סאלי, בוא ניפגש מחר כדי לדבר על התקציב. תודה.',
    subject: '',
    sender: { name: 'Ethan Hunt', email: 'ethan@initech.com' },
    surface: 'gmail',
    to: [OWN_GMAIL],
    cc: [],
    ownAddresses: [OWN_GMAIL, OWN_OUTLOOK],
    userName: 'Sali',
    ownNames: NAMES,
    direction: 'inbound',
    inbound: true
  });
  if (!shown(he) || !taskOnly(he) || !he.intent || he.intent.label !== 'לתאם פגישה') {
    console.log('FAIL: Hebrew schedule ' + describe(he) + ' ' + ((he.intent && he.intent.label) || ''));
    process.exit(1);
  }
}
for (const id of ['v2syn-4672', 'v2syn-4676']) {
  const row = byId[id];
  const ctx = contextOf(row);
  const g = judge(row, 'gmail', ctx);
  const o = judge(row, 'outlook', ctx);
  if (!row || row.expected !== 'quiet' || shown(g) || shown(o)) {
    console.log('FAIL: negation ' + id + ' gmail ' + describe(g) + ' outlook ' + describe(o));
    process.exit(1);
  }
}
for (const id of ['v2syn-2019', 'v2syn-2024', 'v2syn-14861', 'v2syn-13337', 'v2syn-3328', 'v2syn-12553', 'v2syn-13797']) {
  const row = byId[id];
  const ctx = contextOf(row);
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(row, surface, ctx);
    const steps = (out.process && out.process.steps) || [];
    const draft = steps.some((s) => s && (s.kind === 'gmailDraft' || s.kind === 'outlookDraft'));
    const cal = steps.some((s) => s && s.kind === 'calendar');
    const label = out.intent && out.intent.label;
    if (!shown(out) || !taskOnly(out) || draft || cal || !label || !/^Log commitment\b/.test(label) || /^Reply requested\b/.test(label)) {
      console.log('FAIL: log task ' + id + ' ' + surface + ' ' + describe(out) + ' ' + (label || ''));
      process.exit(1);
    }
  }
}
for (const id of ['v2syn-5754', 'v2syn-5755', 'v2syn-5772', 'v2syn-5774']) {
  const row = byId[id];
  const ctx = contextOf(row);
  const g = judge(row, 'gmail', ctx);
  const o = judge(row, 'outlook', ctx);
  if (!row || row.expected !== 'quiet' || shown(g) || shown(o)) {
    console.log('FAIL: cancelled chat ' + id + ' gmail ' + describe(g) + ' outlook ' + describe(o));
    process.exit(1);
  }
}
for (const id of ['v2syn-3400', 'v2syn-3401', 'v2syn-3406']) {
  const row = byId[id];
  const ctx = contextOf(row);
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(row, surface, ctx);
    const steps = (out.process && out.process.steps) || [];
    const cal = steps.some((s) => s && s.kind === 'calendar');
    if (!row || row.expected !== 'offer' || row.expectTrack !== 'file' || !shown(out) || !out.process || out.process.id !== 'attach-invite' || cal || !out.intent || out.intent.label !== row.expectLabel) {
      console.log('FAIL: chat file ' + id + ' ' + surface + ' ' + describe(out) + ' ' + ((out.intent && out.intent.label) || ''));
      process.exit(1);
    }
  }
}
{
  const row = byId['v2syn-1917'];
  const ctx = contextOf(row);
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(row, surface, ctx);
    const steps = (out.process && out.process.steps) || [];
    const cal = steps.filter((s) => s && s.kind === 'calendar');
    const hour = out.intent && out.intent.entities && out.intent.entities.hour;
    if (!shown(out) || !out.intent || out.intent.type !== 'event' || hour !== 16 || cal.length !== 1 || cal[0].params.hour !== 16) {
      console.log('FAIL: 1917 calendar ' + surface + ' ' + describe(out) + ' hour ' + hour);
      process.exit(1);
    }
  }
}
for (const id of ['v2syn-3398', 'v2syn-3411', 'v2syn-3415', 'v2syn-3434']) {
  const row = byId[id];
  const ctx = contextOf(row);
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(row, surface, ctx);
    const steps = (out.process && out.process.steps) || [];
    const draft = steps.some((s) => s && (s.kind === 'gmailDraft' || s.kind === 'outlookDraft'));
    const label = String((out.intent && out.intent.label) || '');
    if (!shown(out) || !taskOnly(out) || draft || (out.process && out.process.id) === 'attach-invite' || /^Attach /.test(label)) {
      console.log('FAIL: self attach ' + id + ' ' + surface + ' ' + describe(out) + ' ' + ((out.process && out.process.id) || '') + ' ' + label);
      process.exit(1);
    }
  }
}
const CALL_YOU = ['v2syn-1969', 'v2syn-1972', 'v2syn-1975', 'v2syn-1977', 'v2syn-1980', 'v2syn-1981', 'v2syn-1982', 'v2syn-1985', 'v2syn-1991', 'v2syn-1994', 'v2syn-2000', 'v2syn-2003', 'v2syn-2005', 'v2syn-2006', 'v2syn-2008', 'v2rtest-file-path-corpus-604'];
for (const id of CALL_YOU) {
  const row = byId[id];
  const ctx = contextOf(row);
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(row, surface, ctx);
    const label = String((out.intent && out.intent.label) || '');
    const outlookQuiet = surface === 'outlook' && connectorQuiet('outlook', out);
    if (outlookQuiet) continue;
    if (!shown(out) || !taskOnly(out) || !/^Log commitment\b/.test(label) || label === 'Call') {
      console.log('FAIL: call you ' + id + ' ' + surface + ' ' + describe(out) + ' ' + label);
      process.exit(1);
    }
  }
}
for (const id of ['v2syn-2054', 'v2syn-2057', 'v2syn-2060', 'v2syn-2086', 'v2syn-2088']) {
  const row = byId[id];
  const ctx = contextOf(row);
  const g = judge(row, 'gmail', ctx);
  const label = String((g.intent && g.intent.label) || '');
  if (!shown(g) || !g.intent || g.intent.type !== 'event' || !/^Meeting\b/.test(label) || label === 'Call') {
    console.log('FAIL: join call ' + id + ' ' + describe(g) + ' ' + label);
    process.exit(1);
  }
}
{
  const Intent = vm.runInContext('FlowIntent', engine);
  const glance = { userName: 'Glance', ownNames: ['Glance', 'Sali'] };
  const latin = { userName: 'Sali Sapan', ownNames: ['Sali Sapan'] };
  if (!Intent.nameIsReader('Sali', glance) || !Intent.nameIsReader('סאלי', glance)) {
    console.log('FAIL: Glance + given name Sali does not match Sali and סאלי');
    process.exit(1);
  }
  if (!Intent.nameIsReader('סאלי', latin) || !Intent.nameIsReader('Sali', latin)) {
    console.log('FAIL: Sali Sapan does not match סאלי');
    process.exit(1);
  }
  if (Intent.nameIsReader('Dana', glance) || Intent.nameIsReader('דנה', glance)) {
    console.log('FAIL: a different name matched Sali');
    process.exit(1);
  }
}
console.log('offer pass ' + counts.offerPass + ' fail ' + counts.offerFail);
console.log('quiet pass ' + counts.quietPass + ' fail ' + counts.quietFail);
console.log('either ' + counts.either + ' allowed ' + counts.allowed);
fails.forEach((line) => console.log('FAIL:', line));
console.log('FAILURES: ' + fails.length);
process.exit(fails.length ? 1 : 0);
