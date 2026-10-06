'use strict';
// A meeting noun used only as a deadline is not a meeting to schedule.
// "before tomorrow's meeting" / "לפני הפגישה" is the due date of the request.
// A schedule close still needs an explicit proposal to meet, or a time offered
// for choice. An explicit file ask with only that weak cue is the file.
// Two strong requests (a file, and a choice of times) stay silent.
// Run: node test/deadline-meeting-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowOutlookSync: S } = require('../core/outlook-sync.js');
const { FlowIncomingJudge: J } = require('../core/incoming-judge.js');
const { FlowIdentity: I } = require('../core/identity-graph.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes } = require('../core/request-types.js');
const { FlowIntentPipeline } = require('../core/intent-pipeline.js');
const { FlowCloseChains: Chains } = require('../core/close-chains.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js', 'close-chains.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const E = (n) => vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', engine);
const FlowIntent = E('FlowIntent');
const FlowActions = E('FlowActions');
const FlowFileAttach = E('FlowFileAttach');
const FlowResolution = E('FlowResolution');

const NOW = Date.parse('2026-10-06T12:00:00Z');
const ME = 'glance.salisapan@outlook.com';
const ALIAS = 'salisapan1@gmail.com';
const FROM = { name: 'flow', email: 'ai.local.flow@gmail.com' };

function classify(text, from) {
  return FlowIntent.classify(text, {
    senderEmail: (from || FROM).email,
    senderName: (from || FROM).name,
    subject: '',
    now: new Date(NOW)
  });
}
function proc(intent) {
  return intent && intent.type ? FlowActions.planFor(intent, { threadUrl: 'https://mail.google.com/mail/u/0/#inbox/x', hasThreadAttachment: false, executionMemory: {} }) : null;
}
function gmail(text, from) {
  const who = from || FROM;
  const intent = classify(text, who);
  if (!intent || !intent.type || !FlowIntent.shouldShowChip(intent)) return { show: false, reason: 'quiet', intent };
  const gate = FlowFileAttach.gate(text);
  if (gate.kind === 'clear' && intent.type === FlowIntent.TYPES.REQUEST && FlowResolution && FlowResolution.owns(gate.ask.id)) return { show: false, reason: 'file', intent, gate };
  if (gate.kind === 'clear' && intent.type === FlowIntent.TYPES.REQUEST) return { show: 'drive', reason: 'drive-search', intent, gate };
  const process = proc(intent);
  return { show: true, intent, process, gate };
}
function graphMessage(text, from, id) {
  const who = from || FROM;
  return {
    id: id || 'm1', conversationId: 'c1', subject: 'Note', isDraft: false, hasAttachments: false,
    from: { emailAddress: { name: who.name, address: who.email } },
    toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
    receivedDateTime: new Date(NOW - 3600000).toISOString(),
    webLink: 'https://outlook.live.com/mail/0/inbox/id/m1',
    body: { contentType: 'text', content: text }
  };
}
function outlook(text, from) {
  const deps = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent, actions: FlowActions };
  const r = S.plan({ messages: [graphMessage(text, from)], me: [ME, ALIAS], watches: [], graph: I.empty(), state: {}, now: NOW, deps });
  const why = (r.diagnostics || []).map((d) => d.reason);
  return { r, entry: r.incoming[0] || null, why };
}
function judge(text, surface) {
  return J.judge({
    text, subject: '', sender: FROM, now: new Date(NOW), surface,
    threadUrl: 'https://example.invalid/t'
  }, { intent: FlowIntent, actions: FlowActions, fileAttach: FlowFileAttach });
}

const Q4 = "Could you send me the Q4 pricing sheet (glance-pricing-q4) before tomorrow's meeting?";
const DECK = 'Could you send me the deck before our call Thursday?';
const HE_FILE = 'תשלח לי את החוזה לפני הפגישה מחר';
const MEET = 'Can we meet tomorrow at 10:00?';
const HE_MEET = 'נפגש ביום חמישי ב-10:00?';
const CONFLICT = 'Could you send me the agenda, and are you free Thu 10:00 or 14:00?';
const LAUNCH = 'Can we meet this Thursday, October 8, at 10:00 for 30 minutes about the launch checklist?\nAlso, please send me the updated pricing sheet by Wednesday.';
const REAL_MEET = "Let's do a call on Friday, October 9 at 3pm. Could you confirm you can make it?";

function fileCase(name, text, objectId) {
  const intent = classify(text);
  const process = proc(intent);
  const gate = FlowFileAttach.gate(text);
  const g = gmail(text);
  const o = outlook(text);
  const owned = FlowResolution && FlowResolution.owns(objectId);
  check(name + ': not a scheduled event', intent && intent.type === 'request' && (!process || process.id !== 'schedule-confirm'), { type: intent && intent.type, proc: process && process.id, family: intent && intent.closeFamily });
  check(name + ': file gate is ' + objectId, gate.kind === 'clear' && gate.ask && gate.ask.id === objectId, gate);
  if (owned) {
    // A contract is already the resolution file path (the loop card), the same
    // close as "send the contract" with no meeting in it. It must not become
    // a schedule card, and it must not grow a second Drive chip.
    check(name + ': both surfaces keep the resolution file path', g.show === false && g.reason === 'file' && !o.entry && o.why.indexOf('file') !== -1, { gmail: g, outlook: o.why });
  } else {
    check(name + ': Gmail searches Drive before a chip', g.show === 'drive', g);
    check(name + ': Outlook stays on the file, not a schedule card', !o.entry && o.why.indexOf('file-needs-drive') !== -1, o.why);
  }
  const jg = judge(text, 'gmail');
  const jo = judge(text, 'outlook');
  const fileReason = owned ? 'file' : 'file-needs-drive';
  check(name + ': both judges refuse schedule-confirm', jg.intent && jg.intent.type !== 'event' && (owned ? (jg.reason === 'file' && jo.reason === 'file') : jo.reason === fileReason), { gmail: jg.reason || (jg.process && jg.process.id), outlook: jo.reason });
}

console.log('\n--- a meeting used as a deadline is the file, not a schedule ---\n');
fileCase('Q4 pricing sheet before tomorrow\'s meeting', Q4, 'pricing-sheet');
fileCase('deck before our call Thursday', DECK, 'deck');
fileCase('Hebrew contract before the meeting', HE_FILE, 'contract');

{
  const chain = Chains.resolve({
    text: Q4,
    origin: 'outlook',
    now: NOW,
    evidence: {
      driveScope: 'account',
      connected: { drive: true, thread: true, gmail: false, outlook: true, docs: false, sheets: false, calendar: false },
      driveFiles: [{ id: 'f-q4', name: 'glance-pricing-q4.pdf', mimeType: 'application/pdf' }],
      driveOtherFiles: [],
      threadFiles: [],
      outlookFiles: []
    }
  });
  check('Q4 with the file in Drive prepares that attach and does not send', chain.move === 'prepare' && chain.sends === false && chain.hit && chain.hit.file && chain.hit.file.name === 'glance-pricing-q4.pdf', chain);
}

console.log('\n--- an explicit meet is a calendar hold ---\n');
function meetCase(name, text) {
  const intent = classify(text);
  const process = proc(intent);
  const g = gmail(text);
  const o = outlook(text);
  check(name + ': calendar hold, not schedule-confirm', intent && intent.type === 'event' && intent.personalClose === 'calendar-hold' && intent.closeFamily === 'D' && process && process.id === 'hold', { type: intent && intent.type, personal: intent && intent.personalClose, family: intent && intent.closeFamily, proc: process && process.id });
  check(name + ': Gmail offers the hold', g.show === true && g.process && g.process.id === 'hold', g.show);
  check(name + ': Outlook does not invent a reply for a hold', !o.entry && o.why.indexOf('no-draft-close') !== -1, o.why);
}
meetCase('can we meet tomorrow at 10:00', MEET);
meetCase('Hebrew נפגש Thursday at 10:00', HE_MEET);
{
  const past = classify('נפגשנו אתמול');
  check('נפגשנו (we met) is not a new hold', !past || past.type == null || past.closeFamily !== 'D', past && { type: past.type, family: past.closeFamily });
}

console.log('\n--- two strong requests stay silent ---\n');
{
  // Choice: silence, not a file-only button. "are you free Thu 10:00 or 14:00"
  // offers two times (family H, two clocks) on top of "send me the agenda".
  // A file-only Do It would hide the schedule half. Agenda is not a file-attach
  // object, and two clocks with no single slot is the same silence.
  const intent = classify(CONFLICT);
  const g = gmail(CONFLICT);
  const o = outlook(CONFLICT);
  const gate = FlowFileAttach.gate(CONFLICT);
  check('agenda plus a choice of times: silence (not a file-only button)', intent && intent.type == null && intent.quiet === 'family' && intent.closeFamily == null, intent && { type: intent.type, quiet: intent.quiet, family: intent.closeFamily });
  check('agenda plus a choice of times: family H ambiguous clocks', E('FlowCloseFamilies').assess(CONFLICT, null, { now: new Date(NOW) }).rule === 'ambiguousClocks', E('FlowCloseFamilies').assess(CONFLICT, null, { now: new Date(NOW) }));
  check('agenda plus a choice of times: Gmail and Outlook both stay quiet', g.show === false && !o.entry, { gmail: g.show, outlook: o.why });
  check('agenda is not turned into a file attach', gate.kind !== 'clear', gate);
}

console.log('\n--- a strong meet beside a file ask stays the meeting ---\n');
{
  // Not the conflict rule. The launch-checklist mail proposes a real time AND
  // asks for a pricing sheet. Family D is that meeting. Widening "file plus
  // meet → silence" would hide it.
  const intent = classify(LAUNCH);
  const process = proc(intent);
  check('launch checklist stays the calendar hold', intent && (intent.personalClose === 'calendar-hold' || intent.closeFamily === 'D') && process && process.id === 'hold', { type: intent && intent.type, personal: intent && intent.personalClose, family: intent && intent.closeFamily, proc: process && process.id });
}

console.log('\n--- a real meeting with a confirm ask stays schedule-confirm ---\n');
{
  const intent = classify(REAL_MEET);
  const process = proc(intent);
  check('confirm you can make the call is schedule-confirm', intent && intent.type === 'event' && process && process.id === 'schedule-confirm', { type: intent && intent.type, proc: process && process.id, personal: intent && intent.personalClose });
}

console.log('\n--- mail from an alias of the same account stays silent ---\n');
{
  const deps = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent, actions: FlowActions };
  const r = S.plan({
    messages: [graphMessage(Q4, { name: 'Sali', email: ALIAS }, 'alias1')],
    me: [ME, ALIAS], watches: [], graph: I.empty(), state: {}, now: NOW, deps
  });
  check('Outlook planner: alias sender, no incoming and no offer', r.incoming.length === 0 && r.offers.length === 0, { incoming: r.incoming.length, offers: r.offers.length, diag: r.diagnostics });
  const gmailSrc = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');
  check('Gmail reading pane skips a message sent from the account address', gmailSrc.includes('candidateSender.email.toLowerCase() === ownEmail.toLowerCase()'));
}

console.log('\n--- Turn off sits away from Check now ---\n');
{
  const popup = fs.readFileSync(path.join(ROOT, 'popup', 'popup.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'popup', 'popup.css'), 'utf8');
  check('Turn off is not appended beside Check now', !/acts\.appendChild\(chk\);\s*acts\.appendChild\(off\)/.test(popup));
  check('Turn off is its own row under Check now', popup.includes("el('div', 'wait-acts wait-off-row')") && /\.wait-off-row\{margin-top:var\(--space-5\)/.test(css));
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
