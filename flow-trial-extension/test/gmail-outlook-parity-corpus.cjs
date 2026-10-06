'use strict';
// Gmail and Outlook are one engine with two connectors. The same email, read through the Gmail adapter and through the
// Outlook adapter, must give the same decision (shown or silent, type, label), the same process, and the same reply draft,
// word for word. Only the connector differs: Gmail writes its draft with the Gmail API, Outlook with Graph createReply.
//
// Gmail adapter (what src/content-gmail.js scanReadingPane + buildActionPayload + background gmailDraftWrite do):
//   the message's own text -> FlowIntent.classify(text, { senderEmail, senderName, subject, calibration,
//   calibrationByType, attachmentCount }) -> shouldShowChip -> file gate -> FlowActions.planFor -> the gmailDraft payload
//   -> background.js gmailDraftWrite -> the MIME body Gmail stores.
// Outlook adapter (what src/outlook.js + core/outlook-sync.js plan, and the Outlook-on-the-web card / the panel send):
//   a Graph message (with quoted history, CC, aliases) -> FlowOutlookSync.plan -> incoming entry -> FlowIncomingJudge
//   draftPayload -> background.js outlookDraftWrite -> the createReply comment Graph stores; and the panel's text
//   (FlowIncomingJudge.draftText) that src/outlook.js createReplyDraft writes.
//
// The live bug of 2026-10-05 is in here too: the same "Pilot proposal" mail that Gmail chipped got no Outlook card.
//
// Run: node test/gmail-outlook-parity-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Buffer } = require('buffer');
const { webcrypto } = require('crypto');
const { FlowOutlookSync: S } = require('../core/outlook-sync.js');
const { FlowIncomingJudge: J } = require('../core/incoming-judge.js');
const { FlowIdentity: I } = require('../core/identity-graph.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes } = require('../core/request-types.js');
const { FlowIntentPipeline } = require('../core/intent-pipeline.js');
require('../core/intent-model.js').FlowIntentModel.load(require('../core/intent-model-weights.js').FlowIntentWeights);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// The engine, loaded as the content scripts load it (classic scripts in one realm).
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js']) {
  const p = path.join(ROOT, 'core', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), engine, { filename: f });
}
const E = (n) => vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', engine);
const FlowIntent = E('FlowIntent'), FlowActions = E('FlowActions'), FlowFileAttach = E('FlowFileAttach'), FlowResolution = E('FlowResolution'), FlowFactReply = E('FlowFactReply'), FlowDraftReply = E('FlowDraftReply');

// background.js with Gmail and Graph faked; both writers run for real.
function background() {
  const calls = [];
  const stored = {
    googleTasksAuth: { taskListId: 'LIST_A' },
    outlookAuth: { token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600 * 1000, rtIssuedAt: Date.now() }, account: { address: 'glance.salisapan@outlook.com', name: 'Glance' } },
    outlookSync: {}
  };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const sandbox = {
    console, URLSearchParams, URL, TextEncoder, Uint8Array, crypto: webcrypto,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const u = String(url), method = (init && init.method) || 'GET';
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = init.body; }
      calls.push({ method, url: u, body });
      if (/\/gmail\/v1\/users\/me\/threads\?/.test(u)) return json(200, { threads: [{ id: 'thread1' }] });
      if (/\/gmail\/v1\/users\/me\/drafts$/.test(u) && method === 'POST') return json(200, { id: 'draft_1' });
      if (/\/me\/messages\/[^/]+\/createReply$/.test(u) && method === 'POST') return json(201, { id: 'odraft_1', webLink: 'https://outlook.live.com/mail/drafts/odraft_1', body: { content: body && body.comment } });
      if (/\/me\/messages\/odraft_1$/.test(u) && method === 'PATCH') return json(200, { id: 'odraft_1' });
      if (/\/me\?/.test(u) || /\/me$/.test(u)) return json(200, { mail: 'glance.salisapan@outlook.com', displayName: 'Glance' });
      return json(404, {});
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'x.apps.googleusercontent.com' }, version: '0' }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (o, cb) => cb('gtok'), removeCachedAuthToken: (o, cb) => cb(), getRedirectURL: () => 'https://ext.chromiumapp.org/', launchWebAuthFlow: () => {} },
      storage: { local: { get: async (k) => { const o = JSON.parse(JSON.stringify(stored)); if (typeof k === 'string') return { [k]: o[k] }; if (Array.isArray(k)) { const r = {}; k.forEach((x) => { r[x] = o[x]; }); return r; } return o; }, set: async (p) => { Object.assign(stored, p); }, remove: async () => {} }, onChanged: { addListener() {} } },
      windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {}, query: async () => [] },
      alarms: { create: () => {}, onAlarm: { addListener() {} } },
      contextMenus: { create: () => {}, removeAll: (cb) => cb && cb(), onClicked: { addListener() {} } },
      permissions: { contains: async () => false }, scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {} }
    }
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  return { calls, fn: (n) => vm.runInContext(n, sandbox) };
}
function mimeBody(raw) {
  const mime = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return Buffer.from(mime.split('\r\n\r\n').slice(1).join('').replace(/\r\n/g, ''), 'base64').toString('utf8');
}

const NOW = Date.parse('2026-10-05T14:06:00+03:00');
const ME = 'glance.salisapan@outlook.com';

// ---- the Gmail adapter --------------------------------------------------------------------------------------------
function gmailDecide(m) {
  const text = m.text.trim();
  const factProbe = text.length >= 12 && FlowFactReply ? FlowFactReply.detect(text) : null;
  if (text.length < 20 && !factProbe) return { show: false, reason: 'too-short' };
  const intent = FlowIntent.classify(text, { senderEmail: m.from.email, senderName: m.from.name, subject: m.subject, calibration: null, calibrationByType: null, attachmentCount: 0, companyTemplate: null, now: new Date(NOW) });
  if (!intent || !intent.type || !FlowIntent.shouldShowChip(intent)) return { show: false, reason: 'quiet', intent };
  const gate = FlowFileAttach ? FlowFileAttach.gate(text) : { kind: 'ignore' };
  if (gate.kind === 'block' && intent.type === FlowIntent.TYPES.REQUEST) return { show: false, reason: 'file', intent };
  if (gate.kind === 'clear' && intent.type === FlowIntent.TYPES.REQUEST && FlowResolution && FlowResolution.owns(gate.ask.id)) return { show: false, reason: 'file', intent };
  // A clear file ask goes to Drive search on Gmail (flow:search-drive) before any chip: outside this pure comparison.
  if (gate.kind === 'clear' && intent.type === FlowIntent.TYPES.REQUEST) return { show: 'drive', reason: 'drive-search', intent };
  const process = FlowActions.planFor(intent, { threadUrl: 'https://mail.google.com/mail/u/0/#inbox/x', hasThreadAttachment: false, executionMemory: {} });
  return { show: true, intent, process };
}
// content-gmail.js buildActionPayload for a gmailDraft step with no file.
function gmailPayload(process, m) {
  const step = process.steps.find((s) => s.kind === 'gmailDraft');
  if (!step) return null;
  const { selectedAttachment, driveFileId, driveFileName, driveMimeType, ...cleanParams } = step.params;
  return { connectorId: 'gmailDraft', threadUrl: 'https://mail.google.com/x', params: cleanParams, senderEmail: m.from.email, senderName: m.from.name, subject: m.subject };
}

// ---- the Outlook adapter ------------------------------------------------------------------------------------------
function graphMessage(m, i) {
  const quoted = '\n\n________________________________\nFrom: Glance <' + ME + '>\nSent: Friday, October 2, 2026 9:12 AM\nTo: ' + m.from.email + '\nSubject: ' + m.subject.replace(/^Re:\s*/i, '') + '\n\nEarlier note from me, quoted below every reply.';
  return {
    id: 'msg' + i, conversationId: 'conv' + i, subject: m.subject, isDraft: false, hasAttachments: false, internetMessageId: '<p' + i + '@mail.gmail.com>',
    from: { emailAddress: { name: m.from.name, address: m.from.email } },
    toRecipients: [{ emailAddress: { name: 'Glance', address: ME } }],
    ccRecipients: m.cc ? [{ emailAddress: { name: 'Cc', address: m.cc } }] : [],
    receivedDateTime: new Date(NOW - 60 * 60 * 1000).toISOString(), webLink: 'https://outlook.live.com/mail/0/inbox/id/msg' + i,
    body: { contentType: 'text', content: m.text + quoted }
  };
}
function outlookDecide(m, i, extra) {
  const deps = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent, actions: FlowActions };
  const r = S.plan(Object.assign({ messages: [graphMessage(m, i)], me: [ME, 'salisapan1@gmail.com'], watches: [], graph: I.empty(), state: {}, now: NOW, deps }, extra || {}));
  return { r, entry: r.incoming[0] || null };
}

const CASES = [
  { name: 'the live "Pilot proposal" ask (review + confirm by Wednesday + onboarding owner)', subject: 'Pilot proposal',
    from: { name: 'flow', email: 'ai.local.flow@gmail.com' },
    text: 'Hi Sali,\n\nCould you review the attached pilot proposal and confirm by Wednesday whether we can start next week? Also, please send me the name of the person on your side who will own onboarding.\n\nThanks,\nFlow team' },
  { name: 'a plain reply-requested ask from a named person', subject: 'Budget numbers',
    from: { name: 'Dana Cohen', email: 'dana@acme.com' },
    text: 'Hi, could you please confirm the final headcount for the offsite by Thursday? We need to book the venue.' },
  { name: 'a meeting ask', subject: 'Quick sync',
    from: { name: 'Avi Levi', email: 'avi@partner.io' },
    text: 'Can we meet on Thursday at 3pm to go over the rollout plan? Let me know if that works for you.' },
  { name: 'an approval ask with an amount', subject: 'Vendor quote',
    from: { name: 'Noa Bar', email: 'noa@vendor.co' },
    text: 'Please approve the revised quote of $4,200 for the design work by Friday so we can start on Monday.' },
  { name: 'an ask where glance is To and someone else is CC', subject: 'Contract review', cc: 'legal@acme.com',
    from: { name: 'Dana Cohen', email: 'dana@acme.com' },
    text: 'Could you review section 4 of the contract and send me your comments by Tuesday? Thanks!' },
  { name: 'a confirm-by ask about pricing', subject: 'New pricing',
    from: { name: 'Yael Mor', email: 'yael@client.org' },
    text: 'Please confirm by Monday that the new pricing works for you, so we can update the agreement.' },
  { name: 'a get-back-to-me ask with a deadline', subject: 'PO number',
    from: { name: 'Dana Cohen', email: 'dana@acme.com' },
    text: 'Could you check with your finance team and get back to me with the PO number by Thursday?' },
  { name: 'an ask about who attends a dated kickoff (event + reply)', subject: 'Kickoff',
    from: { name: 'Avi Levi', email: 'avi@partner.io' },
    text: 'Can you let me know by Friday who will attend the kickoff from your team?' },
  { name: 'a thank-you that mentions today\'s call', subject: 'Thanks',
    from: { name: 'Dana Cohen', email: 'dana@acme.com' },
    text: 'Thanks so much for the call today, it was really helpful. Have a great weekend!' },
  { name: 'a newsletter-style FYI', subject: 'Weekly update',
    from: { name: 'Team', email: 'updates@acme.com' },
    text: 'This week we shipped the new dashboard and fixed several bugs. No action needed on your side.' }
];

(async () => {
  console.log('\n--- the same email, two adapters, one decision and one draft ---\n');
  let shownBoth = 0;
  for (let i = 0; i < CASES.length; i++) {
    const m = CASES[i];
    const g = gmailDecide(m);
    const { r, entry } = outlookDecide(m, i);
    const gShown = g.show === true;
    const oShown = Boolean(entry);
    const gDraft = gShown && g.process.steps.some((s) => s.kind === 'gmailDraft');
    if (g.show === 'drive' || (gShown && !gDraft)) {
      // The two documented connector gaps: Gmail looks for the file in Drive first (Outlook's draft cannot attach), and a
      // close with no reply in it (an event, a Task) is written by Gmail's Google writers. Outlook stays quiet, never weaker.
      const why = (r.diagnostics || []).map((d) => d.reason);
      check(m.name + ': Gmail ' + (g.show === 'drive' ? 'searches Drive first' : 'closes it with ' + g.process.steps.map((s) => s.kind).join('+')) + '; Outlook stays quiet and says why', !oShown && why.some((x) => x === 'file-needs-drive' || x === 'no-draft-close'), { gmail: g.show, outlook: oShown, why });
      continue;
    }
    check(m.name + ': same decision (Gmail ' + (gShown ? 'shows' : 'silent') + ')', gShown === oShown, { gmail: g.show, gmailReason: g.reason, outlook: oShown, diag: r.diagnostics });
    if (!gShown || !oShown) continue;
    shownBoth++;
    check(m.name + ': same type and label', g.intent.type === entry.intent.type && g.intent.label === entry.intent.label, { g: [g.intent.type, g.intent.label], o: [entry.intent.type, entry.intent.label] });
    const gKinds = g.process.steps.map((s) => s.kind).join(',');
    const oKinds = entry.process.steps.map((s) => (s.kind === 'outlookDraft' ? 'gmailDraft' : s.kind)).join(',');
    check(m.name + ': same process (only the draft connector renamed)', gKinds === oKinds && g.process.name === entry.process.name, { g: gKinds, o: entry.process.steps.map((s) => s.kind) });

    const gp = gmailPayload(g.process, m);
    if (!gp) { check(m.name + ': (no draft step on either side)', !entry.process.steps.some((s) => s.kind === 'outlookDraft')); continue; }
    const bg = background();
    const gOut = await bg.fn('gmailDraftWrite')(gp);
    const gCall = bg.calls.find((c) => c.method === 'POST' && /\/drafts$/.test(c.url));
    const gmailText = gCall ? mimeBody(gCall.body.message.raw) : null;

    // The Outlook-on-the-web card's Do It (src/content-outlook.js) -> background outlookDraftWrite.
    const sender = entry.sender || { name: entry.base.counterpart.name, email: entry.base.counterpart.email };
    const op = Object.assign(J.draftPayload(entry.process, { sender, subject: m.subject }), { connectorId: 'outlookDraft', outlookIncomingId: entry.messageId, messageId: entry.messageId, text: m.text });
    const oOut = await bg.fn('outlookDraftWrite')(op);
    const oCall = bg.calls.find((c) => c.method === 'POST' && /createReply$/.test(c.url));
    const outlookText = oCall ? oCall.body.comment : null;
    // The panel's Do It text (popup.js -> src/outlook.js createReplyDraft).
    const panelText = J.draftText(entry.process, { sender, subject: m.subject }, FlowDraftReply);

    check(m.name + ': both writers made a draft, neither sent', gOut.ok && oOut.ok && !bg.calls.some((c) => /\/send\b|sendMail/.test(c.url)), { gOut, oOut });
    check(m.name + ': the Outlook draft is word for word the Gmail draft', gmailText && outlookText === gmailText, { gmail: gmailText, outlook: outlookText });
    check(m.name + ': the panel writes the same text too', panelText === gmailText, { panel: panelText, gmail: gmailText });
    check(m.name + ': the Outlook draft replies to the message that was read', /\/me\/messages\/msg\d+\/createReply$/.test(oCall.url) && oCall.url.includes(entry.messageId), oCall.url);
  }
  check('the comparison is not empty: at least four asks were shown on both', shownBoth >= 4, shownBoth);

  console.log('\n--- the live failure modes, fixed ---\n');
  {
    const m = CASES[0];
    // The sender also has an open loop from Gmail. Before 0.9.14 the cross-channel check turned the new Outlook ask into a
    // "does this settle...?" question and returned before the ask was judged: no card.
    const gmailLoop = { id: 'g:t1', threadId: 'g:t1', channel: 'gmail', messageId: 'gm1', subject: 'Intro', counterpart: { name: 'flow', email: 'ai.local.flow@gmail.com', phone: null }, kind: 'reply', what: 'the intro deck', status: 'waiting', direction: 'theirs', stage: 'waiting', nudges: 0, createdAt: NOW - 3 * 86400000, chaseIso: '2026-10-07', lang: 'en' };
    const { entry } = outlookDecide(m, 0, { watches: [gmailLoop] });
    check('an open Gmail loop with the same person does not swallow the Outlook ask (Gmail would still chip it)', Boolean(entry), null);
  }
  {
    const m = CASES[1];
    // The person mailed glance with glance in CC only, To someone else. Before, that "sole To" was learned as one of MY
    // addresses, and every later mail from them counted as my own: silent.
    const ccOnly = (i) => ({ id: 'cc' + i, conversationId: 'cvcc' + i, subject: 'FYI ' + i, isDraft: false, from: { emailAddress: { name: 'Dana Cohen', address: 'dana@acme.com' } }, toRecipients: [{ emailAddress: { name: 'Ops', address: 'ops@acme.com' } }], ccRecipients: [{ emailAddress: { name: 'Glance', address: ME } }], receivedDateTime: new Date(NOW - (i + 2) * 3600000).toISOString(), body: { contentType: 'text', content: 'Copying you for visibility on the schedule.' } });
    const deps = { extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline, intent: FlowIntent, actions: FlowActions };
    const learned = require('../core/graph-mail.js').FlowGraphMail.learnOwnFromMessages([ccOnly(1), ccOnly(2), ccOnly(3)], [ME]);
    check('mail where I am only CC never teaches "the To person is me"', !(learned || []).includes('ops@acme.com'), learned);
    const r = S.plan({ messages: [graphMessage(m, 9), ccOnly(1), ccOnly(2)], me: [ME], watches: [], graph: I.empty(), state: {}, now: NOW, deps });
    check('and the ask from that person still gets its Do It', r.incoming.length === 1 && r.incoming[0].base.counterpart.email === 'dana@acme.com', r.diagnostics);
  }
  {
    // "Hi Dana," must survive on both (the CoS 0.9.x greeting change dropped it on Gmail too).
    const t = FlowDraftReply.draftBodyText({ params: { what: 'the final headcount' }, senderName: 'Dana Cohen', senderEmail: 'dana@acme.com', subject: 'x' }, null, null, null);
    check('the greeting keeps a real first name ("Hi Dana,")', /^Hi Dana,/.test(t), t);
  }

  console.log('\n--- the adapters still are what this test says they are ---\n');
  {
    const gmail = read('src/content-gmail.js');
    check('Gmail classifies with sender, subject, calibration and attachment count', /classifyForChip\(text, \{\s*senderEmail: sender\.email,\s*senderName: sender\.name,\s*subject: subject,\s*calibration: state\.calibration,\s*calibrationByType: state\.calibrationByType,\s*attachmentCount: attachments\.length/.test(gmail));
    check('Gmail\'s draft payload is { params (minus attach-chooser fields), senderEmail, senderName, subject }', /const \{ selectedAttachment, driveFileId, driveFileName, driveMimeType, \.\.\.cleanParams \} = action\.params;/.test(gmail) && /senderEmail: ctx\.sender\.email,\s*senderName: ctx\.sender\.name,\s*subject: ctx\.subject/.test(gmail));
    check('Gmail gates on shouldShowChip, the file gate and resolution before planFor', /if \(!FlowIntent\.shouldShowChip\(intent\)\)/.test(gmail) && /FlowFileAttach\.gate\(text\)/.test(gmail) && /FlowResolution\.owns\(fileGate\.ask\.id\)/.test(gmail));
    const judge = read('core/incoming-judge.js');
    check('the shared judge classifies with the same context keys', /senderEmail:[^\n]*\n\s*senderName:[^\n]*\n\s*subject:[^\n]*\n\s*calibration:[^\n]*\n\s*calibrationByType:[^\n]*\n\s*attachmentCount:/.test(judge));
    const bgSrc = read('src/background.js');
    check('both writers compose with draftBodyText', /body: draftBodyText\(p, attachment, attachmentSource, shareUrl\)/.test(bgSrc) && /comment = draftBodyText\(p, null, null, null\)/.test(bgSrc));
    const sync = read('core/outlook-sync.js');
    check('the Outlook planner judges with the shared judge, not its own classify', /judge\.judge\(/.test(sync) && !/FlowIntent\.classify\(|intentApi\.classify\(/.test(sync));
    const page = read('src/content-outlook.js');
    check('the Outlook page card judges with the shared judge and sends Gmail\'s payload', /FlowIncomingJudge\.judge\(/.test(page) && /FlowIncomingJudge\.draftPayload\(/.test(page));
  }

  console.log('\n--- the same Drive and thread evidence, both origins ---\n');
  {
    const C = require('../core/close-chains.js').FlowCloseChains;
    const when = Date.parse('2026-10-05T09:00:00Z');
    function same(name, text, evidence) {
      const g = C.resolve({ text, origin: 'gmail', now: when, evidence });
      const o = C.resolve({ text, origin: 'outlook', now: when, evidence });
      check(name + ': same move, reason, close and sends', g.move === o.move && g.reason === o.reason && g.close === o.close && g.sends === false && o.sends === false && g.creates === false && o.creates === false, { g: [g.move, g.reason, g.close], o: [o.move, o.reason, o.close] });
      return g;
    }
    const one = C.fileEvidence({ driveOk: true, driveFiles: [{ id: 'f1', name: 'Invoice 204.pdf', mimeType: 'application/pdf' }], threadFiles: [] });
    check('that evidence leaves Calendar, Sheets and Docs off', one.connected.calendar === false && one.connected.sheets === false && one.connected.docs === false && one.connected.gmail === false && one.connected.outlook === false && one.connected.drive === true && one.connected.thread === true, one.connected);
    const prepared = same('send me the invoice, one Drive file', 'Please send me the invoice.', one);
    check('that prepare does not close', prepared.move === 'prepare' && prepared.close === false && prepared.show === true);
    const missing = same('send me the invoice, Drive and this thread empty', 'Please send me the invoice by Thursday.', C.fileEvidence({ driveOk: true, driveFiles: [], threadFiles: [] }));
    check('nothing found is needs-you, and the holding line claims no file', missing.move === 'needs-you' && missing.holding && missing.holding.claimsFile === false && !/attach/i.test(missing.holding.text));
    const third = same('ask accounting to send the invoice, one Drive file', 'Can you ask accounting to send me the invoice?', one);
    check('a third-party ask stays silent on both', third.move === 'silence' && third.reason === 'third-party' && third.show === false);
    const he = same('שלח לי, one Drive file', 'שלח לי את החשבונית', one);
    check('the Hebrew direct ask prepares on both', he.move === 'prepare' && he.close === false);
    const unread = same('attachments flagged, names unknown', 'Please send me the invoice.', C.fileEvidence({ driveOk: true, driveFiles: [], threadFiles: null }));
    check('a thread that was not read is not "not found"', unread.move === 'silence' && unread.reason === 'unverified' && unread.show === false);
    const gmailSrc = read('src/content-gmail.js');
    const pageSrc = read('src/content-outlook.js');
    const runnerSrc = read('src/outlook.js');
    check('Gmail, the Outlook page and the Outlook runner pass the same evidence helper', /FlowCloseChains\.fileEvidence\(/.test(gmailSrc) && /FlowCloseChains\.fileEvidence\(/.test(pageSrc) && /FlowCloseChains\.fileEvidence\(/.test(runnerSrc));
    check('neither Outlook host turns Calendar or Sheets on by itself', !/calendar:\s*true/.test(pageSrc) && !/sheets:\s*true/.test(pageSrc) && !/calendar:\s*true/.test(runnerSrc) && !/sheets:\s*true/.test(runnerSrc));
    check('a file found on the Outlook page is not drafted as attached', /outlook:file-found-no-attach/.test(pageSrc) && /data-glance-chain', 'needs-you'/.test(pageSrc));
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
