#!/usr/bin/env node
// Card building, intent mapping, Proof mismatch, and Undo.
// Run: node glance-gmail-addon/test/v1.test.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const addon = path.join(__dirname, '..');
const repo = path.join(addon, '..');
const i18n = require('../src/i18n.js');
const intent = require('../src/intent.js');
const proof = require('../src/proof.js');
const execute = require('../src/execute.js');
const cards = require('../src/cards.js');
const prefetch = require('../src/prefetch.js');
const remote = require('../src/remote.js');

const NOW = new Date('2026-10-15T12:00:00Z');
const TZ = 'UTC';
let failures = 0;

function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

function plain(value) {
  return String(value || '').replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
}

function widgetText(model) {
  return (model.widgets || []).filter((w) => w.type === 'text').map((w) => plain(w.text));
}

function loadEngine() {
  const files = [
    'domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js',
    'fact-reply.js', 'file-attach.js', 'name-match.js', 'intent.js', 'actions.js', 'resolution.js', 'incoming-judge.js'
  ];
  const sandbox = { console, module: undefined };
  vm.createContext(sandbox);
  for (const name of files) {
    vm.runInContext(fs.readFileSync(path.join(repo, 'flow-trial-extension', 'core', name), 'utf8'), sandbox, { filename: name });
  }
  const judgeShared = vm.runInContext('FlowIncomingJudge.judge', sandbox);
  // The same call Code.js engineHit_ makes: the one decision every Glance surface shares.
  const readerEmail = 'owner@ai.local.flow@gmail.com';
  const readerDisplay = 'Owner User';
  const readerNames = ['Owner User', 'Owner'];
  return {
    engine: function engine(text, readerOverride) {
      const reader = readerOverride || { userName: readerDisplay, ownNames: readerNames };
      const judged = judgeShared({
        text, subject: '', sender: { email: 'dana@meridian.com', name: null }, to: [readerEmail], ownAddresses: [readerEmail], userName: reader.userName, ownNames: reader.ownNames, now: NOW, surface: 'gmail', attachmentCount: 0, inbound: true
      }, {});
      if (!judged || !judged.show) {
        return { intent: judged ? judged.intent : null, plan: null, reason: judged ? judged.reason : null };
      }
      return { intent: judged.intent, plan: judged.process };
    },
    judgeIncoming: function judgeIncoming(extra) {
      const base = {
        text: '',
        subject: '',
        sender: { email: 'dana@meridian.com', name: 'Dana' },
        to: [readerEmail],
        ownAddresses: [readerEmail],
        userName: readerDisplay,
        ownNames: readerNames,
        readerEmail: readerEmail,
        now: NOW,
        surface: 'gmail',
        attachmentCount: 0,
        inbound: true
      };
      return judgeShared(Object.assign(base, extra || {}), {});
    }
  };
}

const judgeBundle = loadEngine();
const engine = judgeBundle.engine;
const judgeIncoming = judgeBundle.judgeIncoming;

const READER_EMAIL = 'owner@ai.local.flow@gmail.com';
const READER_DISPLAY = 'Owner User';
const READER_NAMES = ['Owner User', 'Owner'];
const DEFAULT_TO_RECIPIENTS = [
  { name: READER_DISPLAY, email: READER_EMAIL, localPart: 'owner' },
  { name: 'Dana Levi', email: 'dana@meridian.com', localPart: 'dana' }
];

function judge(text, extra) {
  const opts = extra || {};
  const eng = opts.reader ? function (t) { return engine(t, opts.reader); } : engine;
  const rest = Object.assign({}, opts);
  delete rest.reader;
  if (opts.reader) {
    rest.userName = opts.reader.userName;
    rest.ownNames = opts.reader.ownNames;
    rest.namesWaitDone = true;
  }
  return intent.resolveTask(text, Object.assign({
    now: NOW,
    timeZone: TZ,
    engine: eng,
    userName: READER_DISPLAY,
    ownNames: READER_NAMES,
    readerEmail: READER_EMAIL,
    toRecipients: DEFAULT_TO_RECIPIENTS,
    ccRecipients: []
  }, rest));
}

console.log('\n--- intent ---');
{
  const remembered = judge('Please remember to send the signed contract by Friday.');
  check('please remember is a task', remembered.speak === true && remembered.source === 'local', remembered);
  check('please remember title drops the day', remembered.title === 'send the signed contract', remembered.title);
  check('Friday from 2026-10-15 is 2026-10-16', remembered.due === '2026-10-16', remembered.due);
}
{
  const marked = judge('\u202B\u200FPlease remember to call the client.\u202C');
  check('bidi marks still remember', marked.speak === true && marked.source === 'local' && marked.title === 'call the client', marked);
}
{
  const forgot = judge("Don't forget to file the taxes by 2026-11-01.");
  check("don't forget is a task", forgot.speak === true && forgot.source === 'local' && forgot.title === 'file the taxes', forgot);
  check("don't forget keeps the iso due", forgot.due === '2026-11-01', forgot.due);
}
{
  const he = judge('תזכיר לי לשלוח את החשבונית');
  check('תזכיר לי is a task', he.speak === true && he.source === 'local' && he.title === 'לשלוח את החשבונית', he);
  check('תזכיר לי has no invented due', he.due === null, he.due);
}
{
  const tomorrow = judge('תזכיר לי מחר לשלוח את החוזה');
  check('מחר is the next day', tomorrow.speak && tomorrow.due === '2026-10-16' && tomorrow.title === 'לשלוח את החוזה', tomorrow);
}
{
  const hi = judge('Hi Dana, please remember to call the client.');
  check('a greeting to someone else stays quiet for the reader', hi.speak === false, hi);
}
{
  const ccDanaThirdParty = judge('Dana, could you review the proposal by Friday?', {
    userName: 'Sali Sapan',
    ownNames: ['Sali', 'Sali Sapan'],
    readerEmail: READER_EMAIL,
    toRecipients: [{ name: 'Sali Sapan', email: READER_EMAIL, localPart: 'owner' }],
    ccRecipients: [{ name: 'Dana Levi', email: 'dana@initech.com', localPart: 'dana' }]
  });
  check('Dana vocative with Dana on Cc stays quiet for the reader (addon intent)', ccDanaThirdParty.speak === false, ccDanaThirdParty);
}
{
  const heDanaMeeting = judgeIncoming({
    text: 'דנה, נוכל להיפגש ביום חמישי בשעה 15:00?',
    userName: 'Sali Sapan',
    ownNames: ['Sali', 'Sali Sapan'],
    readerEmail: READER_EMAIL,
    toRecipients: [{ name: 'Sali Sapan', email: READER_EMAIL, localPart: 'owner' }],
    ccRecipients: [{ name: 'Dana Levi', email: 'dana@initech.com', localPart: 'dana' }],
    namesWaitDone: true
  });
  check('Hebrew Dana on Cc stays quiet for sole To reader (FlowNameMatch product path)', heDanaMeeting && heDanaMeeting.show === false, heDanaMeeting);
}
{
  const buriedNda = judge('Hi Dana, great meeting today. Please remember to send me the signed NDA by Friday.', { reader: { userName: 'Dana', ownNames: ['Dana', 'Dana Levi'] } });
  check('a buried remember-to after a greeting still closes when the reader is greeted', buriedNda.speak === true && buriedNda.title && buriedNda.title.indexOf('NDA') !== -1, buriedNda);
  const buriedPay = judge('Thanks for the update. Please remember to transfer the payment by Sunday.');
  check('a buried remember-to with a deadline still closes', buriedPay.speak === true && buriedPay.title && buriedPay.title.indexOf('payment') !== -1, buriedPay);
  const buriedHeSend = judge('שלום,\n\nתודה על העדכון.\nאל תשכח לשלוח את החוזה החתום עד יום שישי.');
  check('Hebrew buried remember-to still closes', buriedHeSend.speak === true && buriedHeSend.title && buriedHeSend.title.length > 2, buriedHeSend);
  const buriedHePay = judge('היי,\n\nתזכור להעביר את התשלום עד יום ראשון.');
  check('Hebrew buried transfer remember still closes', buriedHePay.speak === true && buriedHePay.title && buriedHePay.title.length > 2, buriedHePay);
}
check('a remember-to relay to someone else stays quiet', judge('Thanks for the update. Please remember to remind Sarah to send the NDA.').speak === false);
check('a buried remember relay row stays quiet', judge('Please remember to remind Sarah to call the client').speak === false);
check('a buried remember relay with a day stays quiet', judge('Please remember to remind Sarah to call the client tomorrow').speak === false);
check('relay Sarah never becomes Handle this note', (function () {
  const d = judge('Please remember to remind Sarah to call the client');
  return d.speak === false || (d.title && d.title.toLowerCase().indexOf('handle this note') === -1);
})());
check('a remember-to relay in Hebrew stays quiet', judge('תודה על העדכון. תזכור להזכיר ליוסי לשלוח את החוזה.').speak === false);
check("don't forget to tell a third party stays quiet", judge("Don't forget to tell Noa that the meeting moved").speak === false);
{
  const remindYou = judge('Please remind you that the contract is due Friday.');
  check('remind you is not relay quiet', remindYou.speak === true && remindYou.title && remindYou.title.toLowerCase().indexOf('handle this note') === -1, remindYou);
  const askYou = judge('Could you ask you to send the invoice?');
  check('ask you is not relay quiet', askYou.speak === false || askYou.title !== 'Handle this note', askYou);
}
check('small talk stays quiet', judge('Hope you are well. Just wanted to say hello and see how things are going this week.').speak === false);
check('empty stays quiet', judge('').speak === false);
check('a send ask is not rewritten into a task', judge('Could you please send the signed contract?').speak === false);

{
  const FILE_BODY = 'Attached is the signed copy';
  const repo = path.join(__dirname, '..', '..');
  const files = [
    'domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js',
    'fact-reply.js', 'file-attach.js', 'name-match.js', 'intent.js', 'actions.js', 'resolution.js', 'incoming-judge.js'
  ];
  const sandbox = { console, module: undefined };
  vm.createContext(sandbox);
  for (const name of files) {
    vm.runInContext(fs.readFileSync(path.join(repo, 'flow-trial-extension', 'core', name), 'utf8'), sandbox, { filename: name });
  }
  const judgeFile = vm.runInContext('FlowIncomingJudge.judge', sandbox);
  function filePlan(attachmentCount) {
    const judged = judgeFile({
      text: FILE_BODY,
      subject: '',
      sender: { email: 'dana@meridian.com', name: 'Dana Levi' },
      to: ['owner@ai.local.flow@gmail.com'],
      ownAddresses: ['owner@ai.local.flow@gmail.com'],
      userName: 'Owner',
      ownNames: ['Owner User', 'Owner'],
      now: NOW,
      surface: 'gmail',
      attachmentCount: attachmentCount,
      inbound: true
    }, {});
    return judged && judged.show && judged.process ? judged.process : null;
  }
  const fileOne = filePlan(1);
  const fileZero = filePlan(0);
  check('one attachment on a signed-copy delivery is file-it', fileOne && fileOne.id === 'file-it', fileOne);
  check('the same line with no attachment is not file-it', !fileZero || fileZero.id !== 'file-it', fileZero);
}

{
  const forced = intent.resolveTask('Please remember to call the client tomorrow.', {
    now: NOW,
    timeZone: TZ,
    engine: function () {
      return { plan: { steps: [{ kind: 'calendar', params: { title: 'Meeting' } }] } };
    }
  });
  check('an explicit ask stays a task when the classifier wants a meeting', forced.source === 'local' && forced.title === 'call the client', forced);
}

{
  const approved = judge('Approved — go ahead on the contract.');
  check('the repo classifier plans one task for a decision', approved.speak === true && approved.source === 'engine' && approved.title.length > 0, approved);
}

{
  const mixed = intent.mapEngine({
    plan: { steps: [{ kind: 'gmailDraft', params: {} }, { kind: 'googleTask', params: { title: 'Reply' } }] }
  }, NOW, TZ);
  check('a draft plus a task offers the task only: this card writes no draft, the detection is the shared one', mixed && mixed.speak === true && mixed.kind === 'task' && mixed.title === 'Reply', mixed);
  const two = intent.mapEngine({
    plan: { steps: [{ kind: 'googleTask', params: { title: 'One' } }, { kind: 'googleTask', params: { title: 'Two' } }] }
  }, NOW, TZ);
  check('two tasks are not collapsed into one card', two === null, two);
  check('a calendar step that is not a hold is not rewritten into a task', intent.mapEngine({
    plan: { steps: [{ kind: 'calendar', params: { title: 'Meeting', dateIso: '2026-10-22', hour: 15, minute: 0 } }] }
  }, NOW, TZ) === null);
}
{
  const held = judge('Could we meet Thursday at 3pm?');
  check('a timed meeting ask is a calendar hold', held.speak === true && held.kind === 'hold' && held.hour === 15 && held.minute === 0 && held.dateIso === '2026-10-22', held);
  check('an English meeting keeps the classifier title', held.title === 'Could we meet Thursday at 3pm?', held.title);
}
{
  const meeting = judge('פגישה ביום חמישי 22/10');
  check('a Hebrew meeting statement without a clock stays quiet', meeting.speak === false, meeting);
  const timedHe = judge('פגישה ביום חמישי 22/10 בשעה 14:00');
  check('a Hebrew meeting with a clock is a hold', timedHe.speak === true && timedHe.kind === 'hold' && timedHe.title === 'פגישה 22/10 14:00' && timedHe.hour === 14 && timedHe.minute === 0, timedHe);
}

{
  check('classifier commitment maps to a task', intent.mapClassifierResult({
    result: { type: 'commitment', what: 'Send the report', dateIso: '2026-11-02' }
  }, NOW, TZ).title === 'Send the report');
  check('classifier request is not a task', intent.mapClassifierResult({ result: { type: 'request', what: 'Send the file' } }, NOW, TZ) === null);
  check('classifier event is not a task', intent.mapClassifierResult({ result: { type: 'event', what: 'Call Friday' } }, NOW, TZ) === null);
  check('classifier null stays quiet', intent.mapClassifierResult({ result: { type: null } }, NOW, TZ) === null);
}

console.log('\n--- cards ---');
{
  const card = cards.proposal({ title: 'send the contract', due: '2026-10-16' }, 'abc123', 'en');
  const buttons = cards.buttons(card);
  check('proposal has one Do it button', buttons.length === 1 && buttons[0].text === 'Do it' && buttons[0].action === 'onDoIt' && buttons[0].style === 'filled', buttons);
  check('proposal shows title and due', widgetText(card).indexOf('send the contract') !== -1 && widgetText(card).some((line) => line.indexOf('2026-10-16') !== -1), widgetText(card));
  check('english card is not rtl', card.rtl === false && card.lang === 'en');
}
{
  const card = cards.proposal({ title: 'לשלוח את החשבונית', due: '2026-10-16' }, 'abc123', 'he');
  const buttons = cards.buttons(card);
  check('hebrew locale uses the hebrew button', plain(buttons[0].text) === 'בצע', buttons[0].text);
  check('hebrew card is rtl and marks the line', card.rtl === true && buttons[0].text.charCodeAt(0) === 0x202B, buttons[0].text);
  check('hebrew due keeps the date', widgetText(card).some((line) => line.indexOf('יעד') !== -1 && line.indexOf('2026-10-16') !== -1));
}
check('locale he and iw are hebrew', i18n.locale('he-IL') === 'he' && i18n.locale('iw') === 'he');
check('other locales stay english', i18n.locale('en-US') === 'en' && i18n.locale('fr') === 'en' && i18n.locale('') === 'en');
{
  const quiet = cards.quiet('en');
  check('silence has no button', cards.buttons(quiet).length === 0 && plain(quiet.widgets[0].text) === 'Nothing to close in this email.');
  const miss = cards.unconfirmed('en');
  check("mismatch card is Couldn't confirm", cards.buttons(miss).length === 0 && plain(miss.widgets[0].text) === "Couldn't confirm");
  check('mismatch card does not claim the task', JSON.stringify(miss).indexOf('In Google Tasks') === -1 && JSON.stringify(miss).indexOf('Undone') === -1);
  const refuse = cards.edited('en');
  check('edited card is the one refuse line', refuse.widgets.length === 1 && plain(refuse.widgets[0].text) === "The task was edited, so I won't undo it" && cards.buttons(refuse).length === 0);
  const heRefuse = cards.edited('he');
  check('hebrew refuse line', plain(heRefuse.widgets[0].text) === 'המשימה נערכה, אז לא אבטל אותה');
}
{
  const proved = cards.proof({ id: 'task-1', title: 'send the contract', due: '2026-10-16' }, 'en', { messageId: 'abc', undo: true });
  const lines = widgetText(proved);
  check('proof shows id, title, and due', lines.some((l) => l.indexOf('task-1') !== -1) && lines.indexOf('send the contract') !== -1 && lines.some((l) => l.indexOf('2026-10-16') !== -1) && lines.indexOf('In Google Tasks.') !== -1, lines);
  check('proof offers undo', cards.buttons(proved).length === 1 && cards.buttons(proved)[0].action === 'onUndo' && cards.buttons(proved)[0].text === 'Undo');
}
{
  const home = cards.homepage(null, 'en');
  check('homepage without a cache has no Do it', cards.buttons(home).length === 0 && plain(home.widgets[0].text) === 'Open a message.');
  const next = cards.homepage({ title: 'file the taxes', due: '2026-11-01' }, 'en');
  check('homepage shows the cached next action', widgetText(next).indexOf('file the taxes') !== -1 && cards.buttons(next).length === 1 && cards.buttons(next)[0].params.source === 'prefetch');
  check('homepage shows the build sha when set', widgetText(cards.homepage(null, 'en', 'deadbeef')).some((line) => line.indexOf('deadbeef') !== -1));
  const spotted = cards.spottedUnsupported({ reason: 'dropped', droppedPlanId: 'sheet' }, 'msg-sheet', 'en');
  check('spotted unsupported names the plan', plain(widgetText(spotted)[0]).indexOf('Spotted, not supported yet: sheet') !== -1);
  check('spotted unsupported offers Remind me', cards.buttons(spotted).length === 1 && cards.buttons(spotted)[0].action === 'onRemindMe');
  const sheetDrop = intent.resolveTask('Please put the October sales numbers in a sheet', {
    now: NOW,
    timeZone: TZ,
    engine: function () {
      return {
        intent: { type: 'request', signals: { workAsk: true } },
        plan: { id: 'reply-track', steps: [{ kind: 'gmailDraft', params: {} }, { kind: 'googleTask', params: { title: 'Reply requested' } }] }
      };
    }
  });
  check('October sales in a sheet is spotted sheet, not a task', sheetDrop.speak === false && sheetDrop.reason === 'dropped' && sheetDrop.droppedPlanId === 'sheet', sheetDrop);
  const pricingSheet = intent.resolveTask('Please update the pricing sheet with the new rates.', {
    now: NOW,
    timeZone: TZ,
    engine: function () {
      return { intent: { type: null, quiet: 'relay' }, plan: null, reason: 'quiet:relay' };
    }
  });
  check('pricing sheet update is spotted even when engine is quiet relay', pricingSheet.speak === false && pricingSheet.reason === 'dropped' && pricingSheet.droppedPlanId === 'sheet', pricingSheet);
}

console.log('\n--- proof and undo ---');
function api(current, inserted) {
  const calls = [];
  return {
    calls: calls,
    insert: function (listId, resource) {
      calls.push('insert');
      return inserted || { id: 'task-1', title: resource.title, due: resource.due || null, etag: 'e1', updated: 'u1' };
    },
    get: function () {
      calls.push('get');
      return current();
    },
    remove: function () { calls.push('remove'); },
    patch: function () { calls.push('patch'); throw new Error('patch must not run'); }
  };
}

{
  const created = { id: 'task-1', title: 'send the contract', due: '2026-10-16T00:00:00.000Z', etag: 'e1', updated: 'u1' };
  const client = api(() => created);
  const result = execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-16' }, client);
  check('a matching read-back confirms', result.confirmed === true && result.view.id === 'task-1' && result.view.title === 'send the contract' && result.view.due === '2026-10-16', result);
  check('create reads back and does not patch', client.calls.join(',') === 'insert,get', client.calls);
  const again = api(() => Object.assign({}, created));
  const undo = execute.performUndo(result.snapshot, again);
  check('unchanged task is deleted', undo.action === 'deleted' && again.calls.join(',') === 'get,remove', { undo: undo, calls: again.calls });
}
{
  const inserted = { id: 'task-1', title: 'send the contract', due: '2026-10-16T00:00:00.000Z', etag: 'e1', updated: 'u1' };
  const client = api(() => Object.assign({}, inserted, { title: 'send the invoice' }), inserted);
  const result = execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-16' }, client);
  check('title mismatch does not confirm', result.confirmed === false && result.reason === 'mismatch', result);
  check('mismatch does not delete', client.calls.indexOf('remove') === -1 && client.calls.indexOf('patch') === -1, client.calls);
}
{
  const inserted = { id: 'task-1', title: 'send the contract', due: '2026-10-16T00:00:00.000Z' };
  const client = api(() => Object.assign({}, inserted, { id: 'other' }), inserted);
  check('id mismatch does not confirm', execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-16' }, client).confirmed === false);
  const dueClient = api(() => Object.assign({}, inserted, { due: '2026-12-01T00:00:00.000Z' }), inserted);
  check('due mismatch does not confirm', execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-16' }, dueClient).confirmed === false);
  const thrown = api(() => { throw new Error('404'); }, inserted);
  check('a failed read does not confirm', execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-16' }, thrown).confirmed === false);
}
{
  const snapshot = { listId: 'list', id: 'task-1', title: 'send the contract', due: '2026-10-16', etag: 'e1', updated: 'u1' };
  const edited = api(() => ({ id: 'task-1', title: 'I changed this', due: '2026-10-16T00:00:00.000Z', etag: 'e1', updated: 'u1' }));
  const refused = execute.performUndo(snapshot, edited);
  check('an edited title is refused and not deleted', refused.action === 'refuse' && edited.calls.join(',') === 'get', edited.calls);
  const etag = api(() => ({ id: 'task-1', title: 'send the contract', due: '2026-10-16T00:00:00.000Z', etag: 'e2', updated: 'u1' }));
  check('a changed etag is refused', execute.performUndo(snapshot, etag).action === 'refuse' && etag.calls.indexOf('remove') === -1);
  const updated = api(() => ({ id: 'task-1', title: 'send the contract', due: '2026-10-16T00:00:00.000Z', etag: 'e1', updated: 'u2' }));
  check('a changed updated timestamp is refused', execute.performUndo(snapshot, updated).action === 'refuse' && updated.calls.indexOf('remove') === -1);
  const due = api(() => ({ id: 'task-1', title: 'send the contract', due: '2026-12-01T00:00:00.000Z', etag: 'e1', updated: 'u1' }));
  check('a changed due date is refused', execute.performUndo(snapshot, due).action === 'refuse' && due.calls.indexOf('remove') === -1);
}

console.log('\n--- calendar proof ---');
{
  const timed = execute.eventBody({ title: 'Meet', dateIso: '2026-10-22', hour: 15, minute: 0, timeZone: 'Asia/Jerusalem', description: 'Logged by Glance' });
  check('a hold is 30 minutes and has no guests', timed.start.dateTime === '2026-10-22T15:00:00' && timed.end.dateTime === '2026-10-22T15:30:00' && timed.start.timeZone === 'Asia/Jerusalem' && !timed.attendees, timed);
  const allDay = execute.eventBody({ title: 'Meeting Oct 22', dateIso: '2026-10-22', hour: null, minute: null });
  check('a dateless clock is an all-day event', allDay.start.date === '2026-10-22' && allDay.end.date === '2026-10-23' && !allDay.start.dateTime, allDay);
  const late = execute.eventBody({ title: 'Late', dateIso: '2026-10-22', hour: 23, minute: 45, timeZone: 'Etc/UTC' });
  check('thirty minutes can cross midnight', late.end.dateTime === '2026-10-23T00:15:00', late.end);
  const local = execute.eventBody({ title: 'Meet', dateIso: '2026-10-22', hour: 14, minute: 0, timeZone: 'Asia/Jerusalem' });
  const cardZone = { id: 'Asia/Jerusalem', offset: 10800000 };
  const fromObject = execute.eventBody({ title: 'Meet', dateIso: '2026-10-22', hour: 14, minute: 0, timeZone: cardZone });
  const fallback = execute.eventBody({ title: 'Meet', dateIso: '2026-10-22', hour: 14, minute: 0 });
  function hasZoneOrDate(body) {
    if (!body) return false;
    if (body.start.date && body.end.date && !body.start.dateTime) return true;
    const start = body.start && body.start.dateTime;
    const end = body.end && body.end.dateTime;
    return typeof body.start.timeZone === 'string' && body.start.timeZone === body.end.timeZone &&
      typeof start === 'string' && start.indexOf('Z') === -1 && !/[+-]\d{2}:\d{2}$/.test(start) &&
      typeof end === 'string' && end.indexOf('Z') === -1;
  }
  check('an insert payload has a timeZone or a date', hasZoneOrDate(timed) && hasZoneOrDate(allDay) && hasZoneOrDate(local) && hasZoneOrDate(fromObject) && hasZoneOrDate(fallback), { local: local, fromObject: fromObject, fallback: fallback });
  check('14:00 stays 14:00 local', local.start.dateTime === '2026-10-22T14:00:00' && local.end.dateTime === '2026-10-22T14:30:00' && local.start.timeZone === 'Asia/Jerusalem', local);
  check('14:00 on 22/10 in Asia/Jerusalem is 11:00Z', execute.instantUtc('2026-10-22', 14, 0, 'Asia/Jerusalem') === '2026-10-22T11:00:00Z');
  check('14:00 on 22/10 in America/New_York is 18:00Z', execute.instantUtc('2026-10-22', 14, 0, 'America/New_York') === '2026-10-22T18:00:00Z');
  check('a timeZone object becomes its id and a 14:00 hold is 11:00Z',
    fromObject.start.timeZone === 'Asia/Jerusalem' && typeof fromObject.start.timeZone === 'string' &&
    fromObject.start.dateTime === '2026-10-22T14:00:00' && fromObject.end.timeZone === 'Asia/Jerusalem' &&
    execute.instantUtc('2026-10-22', 14, 0, fromObject.start.timeZone) === '2026-10-22T11:00:00Z',
    fromObject);
  check('a missing zone falls back to Asia/Jerusalem', fallback.start.timeZone === 'Asia/Jerusalem');
  check('a task due is RFC3339 in that zone',
    execute.dueRfc3339('2026-10-22', 'Asia/Jerusalem') === '2026-10-22T00:00:00+03:00' &&
    execute.dueRfc3339('2026-10-22', 'America/New_York') === '2026-10-22T00:00:00-04:00');
}
function memoryCalendar() {
  const calls = [];
  const events = {};
  let n = 1;
  return {
    calls: calls,
    events: events,
    insert: function (calendarId, resource) {
      calls.push('insert');
      const ev = JSON.parse(JSON.stringify(resource));
      ev.id = 'ev-' + (n++);
      events[ev.id] = ev;
      return JSON.parse(JSON.stringify(ev));
    },
    get: function (calendarId, id) {
      calls.push('get');
      if (!events[id]) throw new Error('missing');
      return JSON.parse(JSON.stringify(events[id]));
    },
    remove: function (calendarId, id) {
      calls.push('remove');
      delete events[id];
    }
  };
}
{
  const cal = memoryCalendar();
  const created = execute.performCreateEvent({
    calendarId: 'primary', title: 'Meeting Oct 22', dateIso: '2026-10-22', hour: null, minute: null, description: 'Logged by Glance'
  }, cal);
  check('an all-day read-back confirms', created.confirmed === true && created.view.when === '2026-10-22' && created.snapshot.contentHash, created);
  check('create reads the event back', cal.calls.join(',') === 'insert,get', cal.calls);
  const undo = execute.performUndoEvent(created.snapshot, cal);
  check('an unchanged event is deleted', undo.action === 'deleted' && !cal.events[created.view.id], undo);
}
{
  check('no event snapshot refuses and does not read', execute.performUndoEvent(null, memoryCalendar()).action === 'refuse');
  const bare = memoryCalendar();
  check('a snapshot without a content hash refuses', execute.performUndoEvent({ id: 'ev-1', calendarId: 'primary' }, bare).action === 'refuse' && bare.calls.length === 0, bare.calls);
}
{
  const cal = memoryCalendar();
  const created = execute.performCreateEvent({
    calendarId: 'primary', title: 'Meet', dateIso: '2026-10-22', hour: 15, minute: 0, timeZone: 'Etc/UTC', description: 'Logged by Glance'
  }, cal);
  cal.events[created.view.id].etag = 'changed-by-google';
  const etagOnly = execute.performUndoEvent(created.snapshot, cal);
  check('an etag-only change still matches the content hash', etagOnly.action === 'deleted', etagOnly);
}
{
  const cal = memoryCalendar();
  const created = execute.performCreateEvent({
    calendarId: 'primary', title: 'Meet', dateIso: '2026-10-22', hour: 15, minute: 0, timeZone: 'Etc/UTC'
  }, cal);
  cal.events[created.view.id].summary = 'I moved it';
  const refused = execute.performUndoEvent(created.snapshot, cal);
  check('an edited event is refused and kept', refused.action === 'refuse' && refused.which === 'event' && cal.events[created.view.id].summary === 'I moved it', refused);
  const guest = memoryCalendar();
  const held = execute.performCreateEvent({
    calendarId: 'primary', title: 'Meet', dateIso: '2026-10-22', hour: 15, minute: 0, timeZone: 'Etc/UTC'
  }, guest);
  guest.events[held.view.id].attendees = [{ email: 'ada@meridian.com' }];
  check('a guest added later is an edit', execute.performUndoEvent(held.snapshot, guest).action === 'refuse' && guest.events[held.view.id]);
}
{
  const cal = memoryCalendar();
  cal.get = function () { return { id: 'ev-x', summary: 'Other', start: { date: '2026-10-22' }, end: { date: '2026-10-23' } }; };
  const missed = execute.performCreateEvent({
    calendarId: 'primary', title: 'Meeting Oct 22', dateIso: '2026-10-22', hour: null, minute: null
  }, cal);
  check('a read-back that disagrees does not confirm', missed.confirmed === false && missed.reason === 'mismatch', missed);
}
{
  function zonedReadBack(zone, startZ, endZ) {
    const cal = memoryCalendar();
    const realGet = cal.get;
    cal.get = function (calendarId, id) {
      const ev = realGet(calendarId, id);
      ev.start = { dateTime: startZ, timeZone: zone };
      ev.end = { dateTime: endZ, timeZone: zone };
      return ev;
    };
    return execute.performCreateEvent({
      calendarId: 'primary', title: 'Meet', dateIso: '2026-10-22', hour: 14, minute: 0, timeZone: zone
    }, cal);
  }
  const jerusalem = zonedReadBack('Asia/Jerusalem', '2026-10-22T11:00:00Z', '2026-10-22T11:30:00Z');
  check('a Jerusalem read-back matches 14:00 in that zone', jerusalem.confirmed === true && jerusalem.view.when === '2026-10-22 14:00', jerusalem);
  const newYork = zonedReadBack('America/New_York', '2026-10-22T18:00:00Z', '2026-10-22T18:30:00Z');
  check('a New York read-back matches 14:00 in that zone', newYork.confirmed === true && newYork.view.when === '2026-10-22 14:00', newYork);
  const offsetForm = zonedReadBack('Asia/Jerusalem', '2026-10-22T14:00:00+03:00', '2026-10-22T14:30:00+03:00');
  check('an offset read-back is the same Jerusalem instant', offsetForm.confirmed === true && offsetForm.view.when === '2026-10-22 14:00', offsetForm);
  const otherHour = zonedReadBack('Asia/Jerusalem', '2026-10-22T12:00:00Z', '2026-10-22T12:30:00Z');
  check('a different instant in the same zone does not confirm', otherHour.confirmed === false && otherHour.reason === 'mismatch', otherHour);
  const localEvent = {
    summary: 'Meet',
    start: { dateTime: '2026-10-22T14:00:00', timeZone: 'Asia/Jerusalem' },
    end: { dateTime: '2026-10-22T14:30:00', timeZone: 'Asia/Jerusalem' }
  };
  const zuluEvent = {
    summary: 'Meet',
    start: { dateTime: '2026-10-22T11:00:00Z', timeZone: 'Asia/Jerusalem' },
    end: { dateTime: '2026-10-22T11:30:00Z', timeZone: 'Asia/Jerusalem' }
  };
  const movedEvent = {
    summary: 'Meet',
    start: { dateTime: '2026-10-22T15:00:00', timeZone: 'Asia/Jerusalem' },
    end: { dateTime: '2026-10-22T15:30:00', timeZone: 'Asia/Jerusalem' }
  };
  check('the same instant hashes equal in that zone', proof.contentHash(localEvent) === proof.contentHash(zuluEvent) && proof.contentHash(localEvent) !== proof.contentHash(movedEvent));
}
{
  const calls = [];
  const client = {
    calls: calls,
    insert: function (listId, resource) {
      calls.push(resource.due);
      return { id: 'task-z', title: resource.title, due: resource.due, etag: 'e1', updated: 'u1' };
    },
    get: function () {
      return { id: 'task-z', title: 'send the contract', due: '2026-10-21T21:00:00.000Z', etag: 'e1', updated: 'u1' };
    },
    remove: function () { calls.push('remove'); }
  };
  const result = execute.performCreate({ listId: 'list', title: 'send the contract', due: '2026-10-22', timeZone: 'Asia/Jerusalem' }, client);
  check('a task due is written in the user zone', calls[0] === '2026-10-22T00:00:00+03:00', calls[0]);
  check('a task read-back in that zone keeps 22/10', result.confirmed === true && result.view.due === '2026-10-22' && result.snapshot.timeZone === 'Asia/Jerusalem', result);
  const again = {
    calls: [],
    get: function () {
      this.calls.push('get');
      return { id: 'task-z', title: 'send the contract', due: '2026-10-21T21:00:00.000Z', etag: 'e1', updated: 'u1' };
    },
    remove: function () { this.calls.push('remove'); }
  };
  check('undo compares the task due in that zone', execute.performUndo(result.snapshot, again).action === 'deleted' && again.calls.join(',') === 'get,remove', again.calls);
}

console.log('\n--- prefetch and classifier stubs ---');
{
  let called = false;
  const empty = prefetch.fetchNext({ url: '', fetch: function () { called = true; } });
  check('unset prefetch url makes no call', empty.called === false && empty.next === null && called === false);
  const bad = prefetch.fetchNext({ url: 'http://169.254.169.254/latest', fetch: function () { called = true; } });
  check('prefetch refuses a non-https and metadata host', bad.called === false && called === false, bad);
  const ok = prefetch.fetchNext({
    url: 'https://prefetch.example.com/next',
    fetch: function (url, options) {
      check('prefetch sends no authorization', !options.headers.Authorization && !options.headers.authorization);
      return { status: 200, body: JSON.stringify({ next: { title: 'file the taxes', due: '2026-11-01', notes: 'ignore' } }) };
    }
  });
  check('prefetch keeps title and due only', ok.called === true && ok.next.title === 'file the taxes' && ok.next.due === '2026-11-01' && !ok.next.notes, ok);
  const down = prefetch.fetchNext({ url: 'https://prefetch.example.com/next', fetch: function () { return { status: 500, body: '' }; } });
  check('prefetch error stays empty', down.called === true && down.next === null);
}
{
  const call = remote.buildCall('https://classifier.example.com/glance-assist', 'Please remember to call', 'en');
  check('classifier call has no bearer token', call && !call.headers.Authorization && call.payload.indexOf('"action":"classify"') !== -1, call && call.headers);
  check('classifier rejects http', remote.buildCall('http://classifier.example.com/', 'x', 'en') === null);
  let used = false;
  const off = remote.fetchClassification({ url: '', text: 'hello', fetch: function () { used = true; } });
  check('unset classifier url makes no call', off.called === false && used === false);
}

console.log('\n--- bundle ---');
{
  const bundlePath = path.join(addon, 'CoreBundle.js');
  check('bundle exists', fs.existsSync(bundlePath));
  const sandbox = { console, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), sandbox, { filename: 'CoreBundle.js' });
  const bundled = sandbox.Glance.intent.resolveTask('Please remember to send the contract by Friday.', { now: NOW, timeZone: TZ });
  check('bundle local ask matches the module', bundled.speak === true && bundled.title === 'send the contract' && bundled.due === '2026-10-16', bundled);
  const classified = sandbox.Glance.classify('Approved — go ahead on the contract.', { now: NOW, calibration: null, calibrationByType: null });
  check('bundle still calls the repo classifier', classified && classified.type === 'decision', classified && classified.type);
}

// A manifest flag that makes Google demand a scope. The declared
// oauthScopes must be exactly that set: missing fails the card at open,
// and an extra scope is a wider grant than this host uses.
function scopeUrl(id) {
  return 'https://www.googleapis.com/auth/' + id;
}

function scopesRequiredByManifest(manifest, hostSource) {
  const required = [];
  function add(id) {
    const url = scopeUrl(id);
    if (required.indexOf(url) === -1) required.push(url);
  }
  const common = (manifest.addOns && manifest.addOns.common) || {};
  const gmail = (manifest.addOns && manifest.addOns.gmail) || {};
  const services = (manifest.dependencies && manifest.dependencies.enabledAdvancedServices) || [];

  if (common.useLocaleFromApp === true) add('script.locale');
  if (common.homepageTrigger || gmail.homepageTrigger || (gmail.contextualTriggers && gmail.contextualTriggers.length) || gmail.composeTrigger) {
    add('gmail.addons.execute');
  }
  if (gmail.contextualTriggers && gmail.contextualTriggers.length) {
    if (gmail.currentMessageAccess === 'metadata') add('gmail.addons.current.message.metadata');
    else add('gmail.addons.current.message.readonly');
  }
  if (gmail.composeTrigger) add('gmail.addons.current.action.compose');
  services.forEach((service) => {
    if (service.serviceId === 'tasks' || service.userSymbol === 'Tasks') add('tasks');
    if (service.serviceId === 'calendar' || service.userSymbol === 'Calendar') add('calendar.events');
  });
  if (hostSource && /UrlFetchApp/.test(hostSource)) add('script.external_request');
  if (hostSource && /Session\.getActiveUser/.test(hostSource)) add('userinfo.email');
  return required.sort();
}

console.log('\n--- host boundaries ---');
{
  const manifest = JSON.parse(fs.readFileSync(path.join(addon, 'appsscript.json'), 'utf8'));
  const host = fs.readFileSync(path.join(addon, 'Code.js'), 'utf8');
  const scopes = manifest.oauthScopes.slice().sort();
  const expected = scopesRequiredByManifest(manifest, host);
  check('every manifest flag has its scope, and there are no extras', JSON.stringify(scopes) === JSON.stringify(expected), { scopes: scopes, expected: expected });
  check('useLocaleFromApp requires script.locale', expected.indexOf(scopeUrl('script.locale')) !== -1 && scopes.indexOf(scopeUrl('script.locale')) !== -1);
  check('message open reads the body, not metadata', scopes.indexOf(scopeUrl('gmail.addons.current.message.readonly')) !== -1 && scopes.indexOf(scopeUrl('gmail.addons.current.message.metadata')) === -1);
  check('there is no compose scope', !manifest.addOns.gmail.composeTrigger && scopes.indexOf(scopeUrl('gmail.addons.current.action.compose')) === -1);

  const withCompose = JSON.parse(JSON.stringify(manifest));
  withCompose.addOns.gmail.composeTrigger = { draftAccess: 'NONE' };
  withCompose.oauthScopes = scopes.slice();
  const composeNeed = scopesRequiredByManifest(withCompose, host);
  check('a compose trigger would require the compose scope', composeNeed.indexOf(scopeUrl('gmail.addons.current.action.compose')) !== -1);

  const metadataOnly = JSON.parse(JSON.stringify(manifest));
  metadataOnly.addOns.gmail.currentMessageAccess = 'metadata';
  const metadataNeed = scopesRequiredByManifest(metadataOnly, host);
  check('metadata access would require the metadata scope and not the body scope', metadataNeed.indexOf(scopeUrl('gmail.addons.current.message.metadata')) !== -1 && metadataNeed.indexOf(scopeUrl('gmail.addons.current.message.readonly')) === -1);

  const localeOff = JSON.parse(JSON.stringify(manifest));
  localeOff.addOns.common.useLocaleFromApp = false;
  check('locale off drops script.locale', scopesRequiredByManifest(localeOff, host).indexOf(scopeUrl('script.locale')) === -1);
  check('calendar service asks only for calendar.events',
    manifest.dependencies.enabledAdvancedServices.some((service) => service.serviceId === 'calendar' && service.userSymbol === 'Calendar' && service.version === 'v3') &&
    scopes.indexOf(scopeUrl('calendar.events')) !== -1 &&
    scopes.indexOf(scopeUrl('calendar')) === -1);
  check('host does not patch an event', !/Calendar\.Events\.patch|Calendar\.Events\.update/.test(host));
  check('contextual trigger is message open', manifest.addOns.gmail.contextualTriggers[0].onTriggerFunction === 'onGmailMessageOpen');
  check('locale comes from the app', manifest.addOns.common.useLocaleFromApp === true);
  check('the script time zone is only the Asia/Jerusalem fallback', manifest.timeZone === 'Asia/Jerusalem');
  check('host never sends mail', !/gmail\.send|sendEmail|Drafts\.send|MailApp|createDraft|\.send\(/.test(host));
  check('host does not patch a task', !/Tasks\.Tasks\.patch|Tasks\.Tasks\.update/.test(host));
  check('host reads the task back through performCreate', host.indexOf('performCreate') !== -1 && host.indexOf('performUndo') !== -1);
  check('host reads an event back through performCreateEvent', host.indexOf('performCreateEvent') !== -1 && host.indexOf('performUndoEvent') !== -1);
}

console.log('\n--- message path parity ---');
{
  const state = { props: {}, messages: {}, events: {}, tasks: {}, eventSeq: 1, taskSeq: 1, fetches: 0, tokenCalls: 0, scopeChecks: [], granted: [] };
  const ALL_SCOPES = [
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.addons.execute',
    'https://www.googleapis.com/auth/script.locale'
  ];
  function reset() {
    state.props = {};
    state.messages = {};
    state.events = {};
    state.tasks = {};
    state.eventSeq = 1;
    state.taskSeq = 1;
    state.fetches = 0;
    state.tokenCalls = 0;
    state.tokenThrow = false;
    state.scopeChecks = [];
    state.granted = ALL_SCOPES.slice();
    state.authThrows = [];
  }
  function widget(kind) {
    const node = { type: kind, text: '', action: '', params: {}, style: '' };
    node.setText = function (value) { node.text = value; return node; };
    node.setOnClickAction = function (action) { node.action = action.functionName; node.params = action.params; return node; };
    node.setAuthorizationAction = function (action) { node.action = 'authorize'; node.authUrl = action.url; return node; };
    node.setTextButtonStyle = function (value) { node.style = value; return node; };
    return node;
  }
  const sandbox = {
    console: console,
    module: undefined,
    GmailApp: {
      setCurrentMessageAccessToken: function (token) {
        state.tokenCalls += 1;
        state.lastToken = token;
        if (state.tokenThrow) throw new Error('token refused');
      },
      getMessageById: function (id) { return state.messages[id] || null; }
    },
    PropertiesService: {
      getUserProperties: function () {
        return {
          getProperty: function (key) { return Object.prototype.hasOwnProperty.call(state.props, key) ? state.props[key] : null; },
          setProperty: function (key, value) { state.props[key] = value; },
          deleteProperty: function (key) { delete state.props[key]; }
        };
      },
      getScriptProperties: function () {
        return { getProperty: function () { return null; } };
      }
    },
    UrlFetchApp: { fetch: function () { state.fetches += 1; throw new Error('prefetch must not run'); } },
    Tasks: {
      Tasklists: {
        list: function () { return { items: [{ id: 'list1', title: 'Glance' }] }; },
        get: function (id) { return { id: id, title: 'Glance' }; },
        insert: function () { return { id: 'list1', title: 'Glance' }; }
      },
      Tasks: {
        insert: function (resource) {
          const task = {
            id: 'task-' + state.taskSeq++,
            title: resource.title,
            due: resource.due || null,
            notes: resource.notes || '',
            etag: 'e1',
            updated: 'u1'
          };
          state.tasks[task.id] = task;
          return JSON.parse(JSON.stringify(task));
        },
        get: function (listId, id) {
          if (!state.tasks[id]) throw new Error('missing');
          return JSON.parse(JSON.stringify(state.tasks[id]));
        },
        remove: function (listId, id) { delete state.tasks[id]; }
      }
    },
    Calendar: {
      Events: {
        insert: function (resource, calendarId) {
          const ev = JSON.parse(JSON.stringify(resource));
          ev.id = 'ev-' + state.eventSeq++;
          ev.calendarId = calendarId;
          state.events[ev.id] = ev;
          return JSON.parse(JSON.stringify(ev));
        },
        get: function (calendarId, id) {
          if (!state.events[id]) throw new Error('missing');
          return JSON.parse(JSON.stringify(state.events[id]));
        },
        remove: function (calendarId, id) { delete state.events[id]; }
      }
    },
    ScriptApp: {
      AuthMode: { FULL: 'FULL' },
      getAuthorizationUrl: function () { return 'https://accounts.google.com/o/oauth2/auth?glance=1'; },
      requireScopes: function (mode, scopes) {
        state.scopeChecks.push({ mode: mode, scopes: scopes.slice() });
        const missing = scopes.filter(function (scope) { return state.granted.indexOf(scope) === -1; });
        if (missing.length) {
          throw new Error('The script does not have sufficient permissions to continue the execution. Missing permissions: (calendar.events && tasks)');
        }
      }
    },
    CardService: {
      LoadIndicator: { SPINNER: 'spinner' },
      TextButtonStyle: { FILLED: 'filled' },
      newTextParagraph: function () { return widget('text'); },
      newTextButton: function () { return widget('button'); },
      newAuthorizationAction: function () {
        const action = { url: '' };
        action.setAuthorizationUrl = function (url) { action.url = url; return action; };
        return action;
      },
      newAuthorizationException: function () {
        const ex = { url: '', callback: '' };
        ex.setAuthorizationUrl = function (url) { ex.url = url; return ex; };
        ex.setCustomUiCallback = function (name) { ex.callback = name; return ex; };
        ex.throwException = function () {
          state.authThrows.push({ url: ex.url, callback: ex.callback });
          const err = new Error('authorization required');
          err.name = 'AuthorizationException';
          err.authUrl = ex.url;
          err.callback = ex.callback;
          throw err;
        };
        return ex;
      },
      newCardSection: function () {
        const section = { widgets: [] };
        section.addWidget = function (item) { section.widgets.push(item); return section; };
        return section;
      },
      newCardHeader: function () {
        const header = { title: '' };
        header.setTitle = function (value) { header.title = value; return header; };
        return header;
      },
      newCardBuilder: function () {
        const builder = { header: null, sections: [] };
        builder.setHeader = function (header) { builder.header = header; return builder; };
        builder.addSection = function (section) { builder.sections.push(section); return builder; };
        builder.build = function () { return builder; };
        return builder;
      },
      newAction: function () {
        const action = { functionName: '', params: {} };
        action.setFunctionName = function (name) { action.functionName = name; return action; };
        action.setLoadIndicator = function () { return action; };
        action.setParameters = function (params) { action.params = params; return action; };
        return action;
      },
      newNavigation: function () {
        const nav = { card: null };
        nav.updateCard = function (card) { nav.card = card; return nav; };
        return nav;
      },
      newActionResponseBuilder: function () {
        const response = { card: null };
        response.setNavigation = function (nav) { response.card = nav.card; return response; };
        response.build = function () { return { card: response.card }; };
        return response;
      }
    }
  };
  sandbox.Session = {
    getActiveUser: function () {
      return { getEmail: function () { return 'owner@ai.local.flow@gmail.com'; } };
    },
    getScriptTimeZone: function () { return 'Etc/UTC'; }
  };
  sandbox.GLANCE_BUILD_SHA = 'testsha';
  const RealDate = Date;
  function MockDate() {
    const args = Array.prototype.slice.call(arguments);
    if (!args.length) return new RealDate(NOW.getTime());
    if (args.length === 1) return new RealDate(args[0]);
    return new (RealDate.bind.apply(RealDate, [null].concat(args)));
  }
  MockDate.now = function () { return NOW.getTime(); };
  MockDate.parse = RealDate.parse;
  MockDate.UTC = RealDate.UTC;
  MockDate.prototype = RealDate.prototype;
  vm.createContext(sandbox);
  sandbox.Date = MockDate;
  vm.runInContext(fs.readFileSync(path.join(addon, 'BuildSha.js'), 'utf8'), sandbox, { filename: 'BuildSha.js' });
  vm.runInContext(fs.readFileSync(path.join(addon, 'CoreBundle.js'), 'utf8'), sandbox, { filename: 'CoreBundle.js' });
  vm.runInContext(fs.readFileSync(path.join(addon, 'Code.js'), 'utf8'), sandbox, { filename: 'Code.js' });
  const openMessage = vm.runInContext('onGmailMessageOpen', sandbox);
  const doIt = vm.runInContext('onDoIt', sandbox);
  const undo = vm.runInContext('onUndo', sandbox);
  const contentTitle = vm.runInContext('Glance.intent.contentTitle', sandbox);
  const prepareText = vm.runInContext('Glance.intent.prepareText', sandbox);
  const classify = vm.runInContext('FlowIntent.classify', sandbox);
  const planFor = vm.runInContext('FlowActions.planFor', sandbox);
  const shouldShow = vm.runInContext('FlowIntent.shouldShowChip', sandbox);
  const judgeShared = vm.runInContext('FlowIncomingJudge.judge', sandbox);
  const resolveTaskMod = vm.runInContext('Glance.intent.resolveTask', sandbox);

  function linesOf(card) {
    return card.sections[0].widgets.filter((item) => item.type === 'text').map((item) => plain(item.text));
  }
  function buttonsOf(card) {
    return card.sections[0].widgets.filter((item) => item.type === 'button');
  }
  function gmailMessage(fields) {
    const calls = [];
    return {
      calls: calls,
      getSubject: function () { calls.push('getSubject'); return fields.subject; },
      getPlainBody: function () {
        calls.push('getPlainBody');
        if (fields.plainThrows) {
          const err = new Error('plain body failed');
          err.name = 'PlainBodyError';
          throw err;
        }
        return fields.plain;
      },
      getBody: function () { calls.push('getBody'); return fields.html; },
      getFrom: function () { calls.push('getFrom'); return fields.from; },
      getTo: function () { calls.push('getTo'); return fields.to == null ? '' : fields.to; },
      getDate: function () { calls.push('getDate'); return fields.date; },
      getAttachments: function () {
        calls.push('getAttachments');
        const n = fields.attachmentCount == null ? 0 : fields.attachmentCount;
        const out = [];
        for (let i = 0; i < n; i++) out.push({ getName: function () { return 'signed-copy.pdf'; } });
        return out;
      }
    };
  }
  function extensionOffer(text, fromEmail, fromName, threadUrl) {
    const intent = classify(text, {
      now: new Date(),
      senderEmail: fromEmail || null,
      senderName: fromName || null,
      calibration: null,
      calibrationByType: null
    });
    if (!shouldShow(intent)) return null;
    const plan = planFor(intent, { threadUrl: threadUrl || null, hasThreadAttachment: false, executionMemory: null });
    if (!plan || !plan.steps) return null;
    const kinds = plan.steps.map((step) => step.kind);
    if (plan.id === 'hold' && kinds.length === 1 && kinds[0] === 'calendar') return plan;
    if (plan.id === 'schedule' && kinds.length === 2 && kinds.indexOf('calendar') !== -1 && kinds.indexOf('googleTask') !== -1) return plan;
    if (kinds.length === 1 && kinds[0] === 'googleTask') return plan;
    return null;
  }
  function parsedFrom(raw) {
    const text = String(raw || '');
    const match = text.match(/^(.*)<([^>]+)>\s*$/);
    if (!match) return { name: '', email: text.trim() };
    return { name: match[1].replace(/"/g, '').trim(), email: match[2].trim() };
  }
  function recipientRows(raw) {
    const out = [];
    String(raw || '').split(/\s*(?:,|;)\s*/).forEach(function (part) {
      if (!part) return;
      const p = parsedFrom(part.trim());
      if (!p.email) return;
      const local = p.email.split('@')[0].toLowerCase();
      out.push({ name: p.name || '', email: p.email.toLowerCase(), localPart: local });
    });
    return out;
  }
  function readerNamesForEmail(email) {
    const local = String(email || '').split('@')[0] || '';
    const display = local.replace(/[._-]+/g, ' ').replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
    const names = [];
    if (display) names.push(display);
    if (local) names.push(local);
    const first = display.split(/\s+/)[0];
    if (first && names.indexOf(first) === -1) names.push(first);
    return names.length ? names : ['Owner User', 'Owner'];
  }
  function judgedPlan(fields) {
    const from = parsedFrom(fields.from);
    const fromEmail = from.email || null;
    const fromName = from.name || null;
    const readerEmail = String(fields.readerEmail || READER_EMAIL).toLowerCase();
    const ownNames = readerNamesForEmail(readerEmail);
    const reader = {
      to: [readerEmail],
      ownAddresses: [readerEmail],
      userName: ownNames[0],
      ownNames: ownNames
    };
    const toRaw = fields.to == null ? readerEmail : fields.to;
    const toList = String(toRaw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    const ownAddresses = reader.ownAddresses.slice();
    toList.forEach(function (addr) {
      const lower = String(addr).toLowerCase();
      if (ownAddresses.indexOf(lower) < 0) ownAddresses.push(lower);
    });
    if (fromEmail && toList.length && toList.every(function (addr) { return String(addr).toLowerCase() === fromEmail.toLowerCase(); })) {
      if (ownAddresses.indexOf(fromEmail.toLowerCase()) < 0) ownAddresses.push(fromEmail.toLowerCase());
    }
    function planForText(text, subject) {
      if (!text) return null;
      const judged = judgeShared({
        text: text,
        subject: subject || '',
        sender: { email: fromEmail, name: fromName },
        to: toList.map(function (a) { return a.toLowerCase(); }),
        ownAddresses: ownAddresses,
        userName: reader.userName,
        ownNames: reader.ownNames,
        now: NOW,
        surface: 'gmail',
        attachmentCount: fields.attachmentCount == null ? 0 : fields.attachmentCount,
        inbound: true
      }, {});
      if (!judged || !judged.show || !judged.process) return null;
      return judged.process;
    }
    return planForText(String(fields.plain || ''), fields.subject || '') || planForText(String(fields.subject || ''), fields.subject || '');
  }
  function shownTitle(sourceText, plan) {
    if (!plan) return '';
    const calendarStep = plan.steps.filter((step) => step.kind === 'calendar')[0];
    const taskStep = plan.steps.filter((step) => step.kind === 'googleTask')[0];
    const shaped = contentTitle(prepareText(sourceText || ''), {
      kind: plan.id,
      title: (calendarStep && calendarStep.params.title) || (taskStep && taskStep.params.title) || '',
      dateIso: calendarStep && calendarStep.params.dateIso,
      hour: calendarStep && Number.isInteger(calendarStep.params.hour) ? calendarStep.params.hour : null,
      minute: calendarStep && Number.isInteger(calendarStep.params.minute) ? calendarStep.params.minute : null,
      taskTitle: taskStep && taskStep.params.title
    });
    return shaped && shaped.title ? shaped.title : '';
  }
  function assertOffer(name, card, plan, lang, sourceText) {
    const lines = linesOf(card);
    const buttons = buttonsOf(card);
    const joined = lines.join('\n');
    if (!plan) {
      const quiet = lang === 'he' ? 'אין מה לסגור בהודעה הזו.' : 'Nothing to close in this email.';
      check(name + ' stays quiet', joined.indexOf(quiet) !== -1 && buttons.length === 0, lines);
      return;
    }
    const label = lang === 'he' ? 'בצע' : 'Do it';
    check(name + ' offers one Do it', buttons.length === 1 && plain(buttons[0].text) === label && buttons[0].action === 'onDoIt', buttons.map((item) => item.text));
    const calendarStep = plan.steps.filter((step) => step.kind === 'calendar')[0];
    const taskStep = plan.steps.filter((step) => step.kind === 'googleTask')[0];
    const title = shownTitle(sourceText, plan);
    if (plan.id === 'hold') {
      const mark = lang === 'he' ? 'החזקה ביומן' : 'Calendar hold';
      const clock = String(calendarStep.params.hour).padStart(2, '0') + ':' + String(calendarStep.params.minute).padStart(2, '0');
      check(name + ' matches the hold', joined.indexOf(mark) !== -1 && joined.indexOf(title) !== -1 && joined.indexOf(calendarStep.params.dateIso) !== -1 && joined.indexOf(clock) !== -1, lines);
    } else if (plan.id === 'schedule') {
      const mark = lang === 'he' ? 'יומן ותזכורת.' : 'Calendar and a reminder.';
      check(name + ' matches the schedule',
        joined.indexOf('Nothing to close.') === -1 && joined.indexOf('אין מה לסגור.') === -1 &&
        joined.indexOf('Calendar hold') === -1 && joined.indexOf('החזקה ביומן') === -1 &&
        joined.indexOf(mark) !== -1 && joined.indexOf(title) !== -1 && joined.indexOf(calendarStep.params.dateIso) !== -1,
        lines);
      if (title !== calendarStep.params.title) {
        check(name + ' does not use the English meeting label', joined.indexOf(calendarStep.params.title) === -1, lines);
      }
      if (Number.isInteger(calendarStep.params.hour)) {
        const clock = String(calendarStep.params.hour).padStart(2, '0') + ':' + String(calendarStep.params.minute).padStart(2, '0');
        check(name + ' shows the stated clock', joined.indexOf(clock) !== -1, lines);
      }
    } else {
      check(name + ' matches the task', joined.indexOf(taskStep.params.title) !== -1 && joined.indexOf('Calendar hold') === -1 && joined.indexOf('Calendar and a reminder.') === -1, lines);
    }
  }
  function openOf(fields) {
    reset();
    const message = gmailMessage(fields);
    state.messages[fields.id] = message;
    const event = {
      gmail: { messageId: fields.id, accessToken: 'token', threadId: fields.threadId },
      commonEventObject: { userLocale: fields.locale || 'en', timeZone: 'Etc/UTC' }
    };
    const cards = openMessage(event);
    check(fields.id + ' reads the plain body, not the html', message.calls.indexOf('getPlainBody') !== -1 && message.calls.indexOf('getSubject') !== -1 && message.calls.indexOf('getFrom') !== -1 && message.calls.indexOf('getTo') !== -1 && message.calls.indexOf('getBody') === -1, message.calls);
    if (fields.attachmentCount > 0) {
      check(fields.id + ' reads attachment count from the message', message.calls.indexOf('getAttachments') !== -1, message.calls);
    }
    check(fields.id + ' sets the message access token', state.tokenCalls === 1 && state.lastToken === 'token', state.tokenCalls);
    check(fields.id + ' does not call prefetch', state.fetches === 0);
    const sourceText = extensionOffer(String(fields.plain || ''), null, null, null) ? fields.plain : (fields.subject || '');
    assertOffer(fields.id, cards[0], judgedPlan(fields), fields.locale === 'he' || fields.locale === 'he-IL' ? 'he' : 'en', sourceText);
    return { event: event, plan: judgedPlan(fields) };
  }
  const quietHtml = '<div>Hope you are well. Just wanted to say hello and see how things are going this week with the whole team.</div>';
  const hebrew = {
    id: 'heb1',
    threadId: 'thread1',
    subject: 'פגישה ביום חמישי 22/10',
    plain: 'שלום,\n\nפגישה ביום חמישי 22/10\n\nתודה,\nדנה',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T08:00:00Z')
  };
  const fileInbound = {
    id: 'filecopy1',
    threadId: 'threadfile',
    subject: 'Signed copy',
    plain: 'Attached is the signed copy',
    from: 'Dana Levi <dana@meridian.com>',
    to: 'Sali Sapan <owner@ai.local.flow@gmail.com>',
    attachmentCount: 1
  };
  reset();
  const fileMessage = gmailMessage(fileInbound);
  state.messages[fileInbound.id] = fileMessage;
  openMessage({
    gmail: { messageId: fileInbound.id, accessToken: 'token', threadId: fileInbound.threadId },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' }
  });
  const filePlan = judgedPlan(fileInbound);
  check('add-on passes attachment count into the shared judge', fileMessage.calls.indexOf('getAttachments') !== -1, fileMessage.calls);
  check('add-on judge plans file-it when the message has one attachment', filePlan && filePlan.id === 'file-it', filePlan);
  const fileNoAttach = judgedPlan(Object.assign({}, fileInbound, { attachmentCount: 0 }));
  check('add-on judge does not plan file-it without an attachment', !fileNoAttach || fileNoAttach.id !== 'file-it', fileNoAttach);
  const fileTwo = judgedPlan(Object.assign({}, fileInbound, { attachmentCount: 2 }));
  check('add-on judge does not plan file-it with two attachments', !fileTwo || fileTwo.id !== 'file-it', fileTwo);
  check('getAttachments mock returns one file per count', gmailMessage({ attachmentCount: 2 }).getAttachments().length === 2);

  const opened = openOf(hebrew);
  check('heb1 does not invent a midnight clock', linesOf(openMessage({
    gmail: { messageId: 'heb1', accessToken: 'token', threadId: 'thread1' },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' }
  })[0]).join('\n').indexOf('00:00') === -1);
  openOf({
    id: 'heb2',
    threadId: 'thread2',
    subject: 'פגישה ביום חמישי 22/10',
    plain: '',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T08:00:00Z')
  });
  openOf(Object.assign({}, hebrew, { id: 'heb3', threadId: 'thread3', locale: 'he-IL' }));
  openOf({
    id: 'hold1',
    threadId: 'thread4',
    subject: 'Thursday',
    plain: 'Could we meet Thursday at 3pm?',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T09:00:00Z')
  });
  openOf({
    id: 'sched1',
    threadId: 'thread5',
    subject: 'Review',
    plain: 'The review meeting is on Thursday at 15:00.',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T09:30:00Z')
  });
  openOf({
    id: 'task1',
    threadId: 'thread6',
    subject: 'Contract',
    plain: 'Approved — go ahead on the contract.',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T10:00:00Z')
  });
  openOf({
    id: 'quiet1',
    threadId: 'thread7',
    subject: 'Hello',
    plain: 'Hope you are well. Just wanted to say hello and see how things are going this week.',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T10:30:00Z')
  });

  check('untimed heb1 open stays quiet', judgedPlan(hebrew) === null);
  reset();
  const hebHold = {
    id: 'hebclock',
    threadId: 'threadclock',
    subject: 'פגישה',
    plain: 'פגישה ביום חמישי 22/10 בשעה 14:00',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    to: 'owner@ai.local.flow@gmail.com',
    date: new Date('2026-10-15T08:00:00Z')
  };
  state.messages.hebclock = gmailMessage(hebHold);
  const click = {
    gmail: { messageId: 'hebclock', accessToken: 'token', threadId: 'threadclock' },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' },
    parameters: { messageId: 'hebclock', source: 'message' }
  };
  const proof = doIt(click).card;
  const proofLines = linesOf(proof).join('\n');
  const eventIds = Object.keys(state.events);
  const taskIds = Object.keys(state.tasks);
  check('Do it writes one timed hold event', eventIds.length === 1 && taskIds.length === 0, { events: eventIds, tasks: taskIds });
  const written = state.events[eventIds[0]];
  const originalSummary = written.summary;
  check('the hold uses the plan date and clock', written.start.dateTime && written.start.dateTime.indexOf('2026-10-22T14:00') !== -1, written);
  check('the Hebrew mail is written with a Hebrew title', written.summary === 'פגישה 22/10 14:00', { event: written.summary });
  check('the proof shows the calendar hold that was read back',
    proofLines.indexOf('On your calendar.') !== -1 && proofLines.indexOf(eventIds[0]) !== -1 &&
    buttonsOf(proof).length === 1 && buttonsOf(proof)[0].action === 'onUndo', proofLines);
  state.events[eventIds[0]].summary = 'Changed in Calendar';
  const refused = undo(click).card;
  check('an edited event refuses undo',
    plain(linesOf(refused)[0]) === "The event was edited, so I won't undo it" &&
    state.events[eventIds[0]], linesOf(refused));
  state.events[eventIds[0]].summary = originalSummary;
  const undone = undo(click).card;
  check('undo deletes the hold when the content hash still matches', plain(linesOf(undone)[0]) === 'Undone.' && !state.events[eventIds[0]], linesOf(undone));

  reset();
  const SALI_EMAIL = 'salisapan1@gmail.com';
  const saliSession = {
    getActiveUser: function () { return { getEmail: function () { return SALI_EMAIL; } }; },
    getEffectiveUser: function () { return { getEmail: function () { return SALI_EMAIL; } }; },
    getScriptTimeZone: function () { return 'Etc/UTC'; }
  };
  const priorSession = sandbox.Session;
  sandbox.Session = saliSession;
  function openBareGreet(fields) {
    reset();
    state.messages[fields.id] = gmailMessage(fields);
    return openMessage({
      gmail: { messageId: fields.id, accessToken: 'token', threadId: fields.threadId },
      commonEventObject: { userLocale: fields.locale || 'en', timeZone: 'Etc/UTC' }
    })[0];
  }
  function expectDoIt(card, he) {
    const btns = buttonsOf(card);
    return btns.length === 1 && plain(btns[0].text) === (he ? 'בצע' : 'Do it');
  }
  const greetAsks = [
    { id: 'gEnDoc', threadId: 't1', plain: 'Hi Sali, could you send the signed document by Friday?', locale: 'en' },
    { id: 'gEnInv', threadId: 't2', plain: 'Hi Sali, could you send the invoice for October?', locale: 'en' },
    { id: 'gEnMeet', threadId: 't3', plain: 'Hi Sali, could we meet Thursday at 3pm?', locale: 'en' },
    { id: 'gEnRem', threadId: 't4', plain: 'Hi Sali, please remember to call the client.', locale: 'en' },
    { id: 'gHeDoc', threadId: 't5', plain: 'היי סאלי, תוכל לשלוח את המסמך החתום?', locale: 'he-IL' },
    { id: 'gHeInv', threadId: 't6', plain: 'היי סאלי, תוכל לשלוח את החשבונית?', locale: 'he-IL' },
    { id: 'gHeMeet', threadId: 't7', plain: 'היי סאלי, נוכל להיפגש ביום חמישי בשעה 15:00?', locale: 'he-IL' },
    { id: 'gHeRem', threadId: 't8', plain: 'היי סאלי, תזכיר לי לשלוח את החוזה מחר.', locale: 'he-IL' }
  ];
  greetAsks.forEach(function (fields) {
    const base = {
      subject: 'Follow up',
      html: quietHtml,
      from: 'Dana Levi <dana@meridian.com>',
      to: SALI_EMAIL,
      date: new Date('2026-10-15T11:00:00Z')
    };
    const card = openBareGreet(Object.assign(base, fields));
    check(fields.id + ' bare To greeting shows Do it', expectDoIt(card, fields.locale === 'he-IL'), linesOf(card));
  });
  const quietNoa = openBareGreet({
    id: 'gQuietNoa',
    threadId: 'tNoa',
    subject: 'Hi',
    plain: 'Hi Noa, please remember to call the client.',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    to: SALI_EMAIL + ', Noa Cohen <noa@meridian.com>',
    date: new Date('2026-10-15T11:10:00Z')
  });
  check('Hi Noa when Noa is on To stays quiet', buttonsOf(quietNoa).length === 0, linesOf(quietNoa));
  const quietNoaHe = openBareGreet({
    id: 'gQuietNoaHe',
    threadId: 'tNoaHe',
    subject: 'היי',
    plain: 'היי נועה, תזכיר לי להתקשר ללקוח.',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    to: SALI_EMAIL + ', Noa Cohen <noa@meridian.com>',
    date: new Date('2026-10-15T11:11:00Z')
  });
  check('היי נועה when Noa is on To stays quiet', buttonsOf(quietNoaHe).length === 0, linesOf(quietNoaHe));
  const showLior = openBareGreet({
    id: 'gShowLior',
    threadId: 'tLior',
    subject: 'Hi',
    plain: 'Hi Lior, please remember to call the client.',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    to: SALI_EMAIL,
    date: new Date('2026-10-15T11:12:00Z')
  });
  check('Hi Lior when Lior is not a recipient still shows Do it', expectDoIt(showLior, false), linesOf(showLior));
  sandbox.Session = priorSession;

  reset();
  state.messages.hold1 = gmailMessage({
    id: 'hold1',
    threadId: 'thread4',
    subject: 'Thursday',
    plain: 'Could we meet Thursday at 3pm?',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T09:00:00Z')
  });
  const holdFields = {
    id: 'hold1',
    threadId: 'thread4',
    subject: 'Thursday',
    plain: 'Could we meet Thursday at 3pm?',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T09:00:00Z')
  };
  const holdPlan = judgedPlan(holdFields);
  const held = doIt({
    gmail: { messageId: 'hold1', accessToken: 'token', threadId: 'thread4' },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' },
    parameters: { messageId: 'hold1', source: 'message' }
  }).card;
  const holdIds = Object.keys(state.events);
  const holdClock = String(holdPlan.steps[0].params.hour).padStart(2, '0') + ':' + String(holdPlan.steps[0].params.minute).padStart(2, '0');
  const holdStart = holdPlan.steps[0].params.dateIso + 'T' + holdClock + ':00';
  check('a hold writes one timed event and no task', holdIds.length === 1 && Object.keys(state.tasks).length === 0 && state.events[holdIds[0]].start.dateTime === holdStart && state.events[holdIds[0]].end.dateTime.indexOf('T') === 10, state.events[holdIds[0]]);
  check('the hold proof names the event', linesOf(held).join('\n').indexOf('On your calendar.') !== -1 && linesOf(held).join('\n').indexOf(holdIds[0]) !== -1);
  delete state.props['glanceUndo_hold1'];
  const noSnap = undo({
    gmail: { messageId: 'hold1', accessToken: 'token', threadId: 'thread4' },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' },
    parameters: { messageId: 'hold1', source: 'message' }
  }).card;
  check('undo with no snapshot does not delete the event', state.events[holdIds[0]] && plain(linesOf(noSnap)[0]) === "Couldn't confirm", linesOf(noSnap));

  function withConsole(fn) {
    const logs = [];
    const errors = [];
    const warns = [];
    const log = console.log;
    const error = console.error;
    const warn = console.warn;
    console.log = function () {
      logs.push(Array.prototype.map.call(arguments, String).join(' '));
    };
    console.error = function () {
      errors.push(Array.prototype.map.call(arguments, String).join(' '));
    };
    console.warn = function () {
      warns.push(Array.prototype.map.call(arguments, String).join(' '));
    };
    try {
      return { value: fn(), logs: logs, errors: errors, warns: warns };
    } finally {
      console.log = log;
      console.error = error;
      console.warn = warn;
    }
  }
  function openEvent(fields) {
    return {
      gmail: { messageId: fields.id, accessToken: fields.token == null ? 'token' : fields.token, threadId: fields.threadId },
      commonEventObject: { userLocale: fields.locale || 'en', timeZone: 'Etc/UTC' }
    };
  }
  function loggedOpen(fields) {
    reset();
    if (fields.message) state.messages[fields.id] = fields.message;
    else state.messages[fields.id] = gmailMessage(fields);
    return withConsole(function () { return openMessage(openEvent(fields)); });
  }
  function logRecord(captured) {
    const parsed = [];
    captured.logs.forEach(function (line) {
      try { parsed.push(JSON.parse(line)); } catch (err) { /* check() lines are not JSON */ }
    });
    return parsed.filter(function (row) { return row && Object.prototype.hasOwnProperty.call(row, 'messageId'); })[0] || null;
  }

  const selfTask = openOf({
    id: 'self1',
    threadId: 'threadself',
    subject: 'Contract',
    plain: 'Approved — go ahead on the contract.',
    html: quietHtml,
    from: 'Glance <owner@ai.local.flow>',
    to: 'owner@ai.local.flow',
    date: new Date('2026-10-15T11:00:00Z')
  });
  check('a self-sent mail is still offered', selfTask.plan && selfTask.plan.steps && selfTask.plan.steps[0].kind === 'googleTask', selfTask.plan);

  const quotedPlain = '\u202B\u200Fפגישה ביום חמישי 22/10\u202C\n\nOn Thu, Oct 1, 2026 at 9:00 AM Dana Levi <dana@meridian.com> wrote:\nplease send the signed contract';
  const quoted = openOf({
    id: 'rtl1',
    threadId: 'threadrtl',
    subject: 'פגישה',
    plain: quotedPlain,
    html: '<div>quoted html that must not be read</div>',
    from: 'Dana Levi <dana@meridian.com>',
    to: 'owner@ai.local.flow',
    date: new Date('2026-10-15T08:00:00Z')
  });
  check('rtl marks and a quoted reply drop an untimed meeting statement', !quoted.plan, quoted.plan && quoted.plan.id);

  const realId = 'msg-f:1762895788594548046';
  const realThread = 'thread-f:1762895788594548046';
  const realPlain = 'פגישה ביום חמישי 22/10';
  const real = {
    id: realId,
    threadId: realThread,
    subject: realPlain,
    plain: realPlain,
    html: '<div>homepage stays unrelated</div>',
    from: 'Glance <owner@ai.local.flow>',
    to: 'owner@ai.local.flow',
    date: new Date('2026-10-15T08:00:00Z')
  };
  const realOpened = openOf(real);
  check('the real message id is a schedule', realOpened.plan && realOpened.plan.id === 'schedule', realOpened.plan && realOpened.plan.id);
  const realLog = withConsole(function () {
    return openMessage(openEvent(real));
  });
  const realRow = logRecord(realLog);
  check('the open log names the token, the sender, and the schedule',
    !!realRow && realRow.messageId === realId && realRow.tokenCalled === true && realRow.tokenOk === true &&
    realRow.subject === realPlain && realRow.plainBodyLength === realPlain.length &&
    realRow.from === 'owner@ai.local.flow' && realRow.isSelf === true &&
    realRow.speak === true && realRow.reason === 'schedule' && realRow.planId === 'schedule' &&
    realRow.calendarService === true && !Object.prototype.hasOwnProperty.call(realRow, 'body'),
    realRow);
  const realClick = doIt({
    gmail: { messageId: realId, accessToken: 'token', threadId: realThread },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' },
    parameters: { messageId: realId, source: 'message' }
  }).card;
  check('a msg-f id stores undo without a colon in the key',
    Object.prototype.hasOwnProperty.call(state.props, 'glanceUndo_msg-f_1762895788594548046') &&
    !Object.prototype.hasOwnProperty.call(state.props, 'glanceUndo_' + realId) &&
    buttonsOf(realClick)[0].params.messageId === realId,
    Object.keys(state.props));

  const thrown = loggedOpen({
    id: 'errbody',
    threadId: 'threaderr',
    subject: 'Secret subject',
    plain: 'please remember to send the contract',
    plainThrows: true,
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    to: 'owner@ai.local.flow'
  });
  const thrownLines = linesOf(thrown.value[0]).map(plain).join('\n');
  check('a plain-body error is the read card, not quiet',
    thrownLines.indexOf("Couldn't read this message.") !== -1 &&
    thrownLines.indexOf('diag: body') !== -1 &&
    thrownLines.indexOf('Nothing to close.') === -1,
    thrownLines);
  check('a plain-body error logs name, message, and stack',
    thrown.errors.some(function (line) {
      return line.indexOf('PlainBodyError') !== -1 && line.indexOf('plain body failed') !== -1 && line.indexOf('PlainBodyError') < line.indexOf('\n');
    }),
    thrown.errors);

  const badId = loggedOpen({
    id: 'not valid',
    threadId: 'threadbad',
    subject: 'Nope',
    plain: 'Please remember to call the client.',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    to: 'owner@ai.local.flow',
    message: null
  });
  const badLines = linesOf(badId.value[0]).map(plain).join('\n');
  check('a message id with a space is diag bad-id and does not set the token',
    badLines.indexOf('diag: bad-id') !== -1 &&
    badLines.indexOf('Nothing to close.') === -1 &&
    state.tokenCalls === 0,
    { lines: badLines, tokenCalls: state.tokenCalls });

  const savedCalendar = sandbox.Calendar;
  delete sandbox.Calendar;
  const missingCalendar = loggedOpen({
    id: 'nocal',
    threadId: 'threadnocal',
    subject: 'Thursday',
    plain: 'Could we meet Thursday at 3pm?',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    to: 'owner@ai.local.flow'
  });
  sandbox.Calendar = savedCalendar;
  const missingLines = linesOf(missingCalendar.value[0]).map(plain).join('\n');
  const missingRow = logRecord(missingCalendar);
  const timedMail = openOf({
    id: 'hebclock',
    threadId: 'threadclock',
    subject: 'פגישה',
    plain: 'פגישה ביום חמישי 22/10 בשעה 14:00',
    html: quietHtml,
    from: 'Glance <owner@ai.local.flow>',
    to: 'owner@ai.local.flow',
    date: new Date('2026-10-15T08:00:00Z')
  });
  check('the card offers פגישה 22/10 14:00', timedMail.plan && linesOf(openMessage({
    gmail: { messageId: 'hebclock', accessToken: 'token', threadId: 'threadclock' },
    commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' }
  })[0]).join('\n').indexOf('פגישה 22/10 14:00') !== -1);

  const scopeMiss = 'The script does not have sufficient permissions to continue the execution. Missing permissions: (calendar.events && tasks)';
  const authFailure = vm.runInContext('authFailure_', sandbox);
  check('the live requireScopes message counts as a missing scope', authFailure({ name: 'Error', message: scopeMiss }) === true);
  reset();
  state.granted = state.granted.filter(function (scope) { return scope.indexOf('calendar.events') === -1; });
  state.messages.hebclock = gmailMessage({
    id: 'hebclock',
    threadId: 'threadclock',
    subject: 'פגישה',
    plain: 'פגישה ביום חמישי 22/10 בשעה 14:00',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    to: 'owner@ai.local.flow@gmail.com',
    date: new Date('2026-10-15T08:00:00Z')
  });
  let authErr = null;
  let returned = 'unset';
  const denied = withConsole(function () {
    try {
      returned = doIt({
        gmail: { messageId: 'hebclock', accessToken: 'token', threadId: 'threadclock' },
        commonEventObject: { userLocale: 'en', timeZone: 'Etc/UTC' },
        parameters: { messageId: 'hebclock', source: 'message' }
      });
      return returned;
    } catch (err) {
      authErr = err;
      returned = null;
      return null;
    }
  });
  const returnedText = returned && returned.card ? linesOf(returned.card).map(plain).join('\n') : '';
  check('a missing scope propagates and writes nothing',
    authErr && authErr.message === scopeMiss &&
    returned === null &&
    returnedText.indexOf("Couldn't confirm") === -1 &&
    Object.keys(state.events).length === 0 && Object.keys(state.tasks).length === 0 &&
    state.scopeChecks.length === 1 &&
    denied.warns.some(function (line) { return line.indexOf('requireScopes') !== -1 && line.indexOf('calendar.events') !== -1; }),
    { err: authErr && authErr.message, returned: returnedText, events: Object.keys(state.events), tasks: Object.keys(state.tasks), warns: denied.warns });

  const zoneOf = vm.runInContext('timeZoneOf_', sandbox);
  const cardObject = { id: 'Asia/Jerusalem', offset: 10800000 };
  check('the card time zone object is normalized before userTimezone.id',
    zoneOf({
      userTimezone: { id: 'America/New_York' },
      commonEventObject: { timeZone: cardObject }
    }) === 'Asia/Jerusalem' && typeof zoneOf({ commonEventObject: { timeZone: cardObject } }) === 'string');
  check('userTimezone.id is next when the card zone is missing',
    zoneOf({ userTimezone: { id: 'America/New_York' } }) === 'America/New_York');
  check('a card time zone object becomes its id',
    zoneOf({ commonEventObject: { timeZone: cardObject } }) === 'Asia/Jerusalem');
  check('a card time zone string is kept', zoneOf({ commonEventObject: { timeZone: 'Etc/UTC' } }) === 'Etc/UTC');
  sandbox.CalendarApp = {
    getDefaultCalendar: function () { throw new Error('full calendar scope'); }
  };
  check('a calendar permission failure is not the user zone',
    zoneOf({ userTimezone: { id: 'America/New_York' } }) === 'America/New_York');
  let calendarCalls = 0;
  sandbox.CalendarApp = {
    getDefaultCalendar: function () {
      calendarCalls += 1;
      return { getTimeZone: function () { return 'America/Los_Angeles'; } };
    }
  };
  check('the default calendar is next', zoneOf({}) === 'America/Los_Angeles' && calendarCalls === 1, calendarCalls);
  sandbox.CalendarApp = {
    getDefaultCalendar: function () { throw new Error('full calendar scope'); }
  };
  sandbox.Session = { getScriptTimeZone: function () { return 'Europe/London'; } };
  const skipped = withConsole(function () { return zoneOf({}); });
  check('a calendar failure falls through to the script zone',
    skipped.value === 'Europe/London' && skipped.warns.some(function (line) { return line.indexOf('calendar zone skipped') !== -1; }),
    skipped);
  sandbox.Session = { getScriptTimeZone: function () { return ''; } };
  check('the last zone is Asia/Jerusalem', zoneOf({}) === 'Asia/Jerusalem');
  delete sandbox.CalendarApp;
  delete sandbox.Session;

  reset();
  state.messages.hebclock = gmailMessage({
    id: 'hebclock',
    threadId: 'threadclock',
    subject: 'פגישה',
    plain: 'פגישה ביום חמישי 22/10 בשעה 14:00',
    html: quietHtml,
    from: 'Glance <owner@ai.local.flow>',
    to: 'owner@ai.local.flow',
    date: new Date('2026-10-15T08:00:00Z')
  });
  const zonedDo = doIt({
    gmail: { messageId: 'hebclock', accessToken: 'token', threadId: 'threadclock' },
    userTimezone: { id: 'America/New_York' },
    commonEventObject: { userLocale: 'en', timeZone: { id: 'Asia/Jerusalem', offset: 10800000 } },
    parameters: { messageId: 'hebclock', source: 'message' }
  }).card;
  const zonedIds = Object.keys(state.events);
  const zonedEvent = state.events[zonedIds[0]];
  const zonedTask = state.tasks[Object.keys(state.tasks)[0]];
  check('Do it writes 14:00 from the card time zone object',
    zonedIds.length === 1 &&
    zonedEvent.start.dateTime === '2026-10-22T14:00:00' &&
    zonedEvent.end.dateTime === '2026-10-22T14:30:00' &&
    zonedEvent.start.timeZone === 'Asia/Jerusalem' &&
    typeof zonedEvent.start.timeZone === 'string' &&
    zonedEvent.end.timeZone === 'Asia/Jerusalem' &&
    execute.instantUtc('2026-10-22', 14, 0, zonedEvent.start.timeZone) === '2026-10-22T11:00:00Z' &&
    zonedTask.due === '2026-10-22T00:00:00+03:00' &&
    linesOf(zonedDo).join('\n').indexOf('2026-10-22 14:00') !== -1,
    { event: zonedEvent, due: zonedTask && zonedTask.due, lines: linesOf(zonedDo) });

  reset();
  state.messages.hold14 = gmailMessage({
    id: 'hold14',
    threadId: 'threadhold14',
    subject: 'Thursday',
    plain: 'Could we meet Thursday at 2pm?',
    html: quietHtml,
    from: 'Dana Levi <dana@meridian.com>',
    date: new Date('2026-10-15T09:00:00Z')
  });
  const hold14 = doIt({
    gmail: { messageId: 'hold14', accessToken: 'token', threadId: 'threadhold14' },
    commonEventObject: { userLocale: 'en', timeZone: { id: 'Asia/Jerusalem', offset: 10800000 } },
    parameters: { messageId: 'hold14', source: 'message' }
  }).card;
  const hold14Ids = Object.keys(state.events);
  const hold14Event = state.events[hold14Ids[0]];
  check('a 14:00 hold with a timeZone object lands at 11:00Z',
    hold14Ids.length === 1 && Object.keys(state.tasks).length === 0 &&
    hold14Event.start.timeZone === 'Asia/Jerusalem' && typeof hold14Event.start.timeZone === 'string' &&
    hold14Event.start.dateTime === '2026-10-22T14:00:00' &&
    execute.instantUtc('2026-10-22', 14, 0, hold14Event.start.timeZone) === '2026-10-22T11:00:00Z' &&
    linesOf(hold14).join('\n').indexOf('2026-10-22 14:00') !== -1,
    hold14Event);

  check('a missing Calendar service is logged and the card still offers',
    missingCalendar.errors.some(function (line) { return line.indexOf('Calendar advanced service is missing') !== -1; }) &&
    missingLines.indexOf('Calendar hold') !== -1 &&
    missingLines.indexOf('Nothing to close.') === -1 &&
    missingRow && missingRow.calendarService === false,
    { errors: missingCalendar.errors, lines: missingLines, row: missingRow });
}

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll checks passed');
