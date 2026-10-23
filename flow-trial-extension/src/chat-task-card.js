// The chat task card: an inbound ask on WhatsApp, Messenger or Instagram that is a task ("send me the report by
// Thursday") gets one Do It, the same canonical card as Gmail and Outlook. Behind the owner's switch
// glanceSwitches.CHAT_TASK_CARD (off by default); with it off this file does nothing.
//
// Detection is not here. It is the one shared judge, FlowIncomingJudge.judge with surface 'chat' (see
// docs/glance-ai/one-algorithm.md); this file takes its answer and, when it is a show with a task step, asks the
// worker which task app is connected (flow:chat-task-target), draws the existing .flow-chip-host card in a floating
// corner, and on Do It writes through the worker's existing writer (flow:execute-action: googleTask or outlookTask),
// read back by id. Handled only when the worker says fetchedBack. Undo is flow:undo-action and refuses to touch a
// task the person edited. The receipt survives a reload (the written row carries a hash of the message).
//
// Never: a send, Enter, a click on the page, a write into the composer. Group chats, a message from the person and a
// forwarded or quoted message stay out. The task's note carries the chat's address, never the message text in a URL.
// Page text stays on the device; the worker writes the task.
const FlowChatTaskCard = (() => {
  const SWITCH = 'CHAT_TASK_CARD';
  // The person's own dated promise in a chat ("אשלח לך את ההצעה עד יום חמישי") has its own switch, off by default.
  const SWITCH_OWN = 'CHAT_PROMISE_CARD';
  const CHAIN = 'chat-task';
  const OPEN_LABELS = { whatsapp: 'Open in WhatsApp', messenger: 'Open in Messenger', instagram: 'Open in Instagram' };
  const dismissed = new Set();

  function runtimeAlive() {
    try { return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage); }
    catch (e) { return false; }
  }

  function send(message) {
    return new Promise((resolve) => {
      if (!runtimeAlive()) { resolve({ ok: false, reason: 'invalidated' }); return; }
      try {
        chrome.runtime.sendMessage(message, (r) => {
          let err = null;
          try { err = chrome.runtime && chrome.runtime.lastError; } catch (e) { resolve({ ok: false, reason: 'invalidated' }); return; }
          if (err) { resolve({ ok: false, reason: /invalidated/i.test(String(err.message || '')) ? 'invalidated' : 'runtime' }); return; }
          resolve(r || { ok: false });
        });
      } catch (e) { resolve({ ok: false, reason: 'runtime' }); }
    });
  }

  async function switchOn(name) {
    try {
      if (!runtimeAlive() || !chrome.storage || !chrome.storage.local) return false;
      const bag = await chrome.storage.local.get({ glanceSwitches: {} });
      return !!(bag.glanceSwitches && bag.glanceSwitches[name || SWITCH] === true);
    } catch (e) { return false; }
  }

  function hashText(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  // The chat's own address: no query, no fragment, nothing from the message.
  function threadUrl() {
    try { return location.origin + location.pathname; } catch (e) { return ''; }
  }

  function chatKeyOf(input) {
    return CHAIN + '|' + String(input.channel || 'chat') + '|' + hashText(threadUrl()) + '|' + hashText(input.key != null ? input.key : input.text);
  }

  function taskStepOf(process) {
    return ((process && process.steps) || []).find((s) => s && (s.kind === 'googleTask' || s.kind === 'googleTasks' || s.kind === 'task')) || null;
  }

  // A proposed meeting ("Could we meet Thursday at 3pm?") is the calendar step the judge plans with one day and one
  // clock. It becomes a hold on the person's own calendar: nobody is invited, nothing is sent.
  function calendarStepOf(process) {
    const s = ((process && process.steps) || []).find((x) => x && x.kind === 'calendar');
    const p = s && s.params;
    if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.dateIso || '')) || !Number.isInteger(p.hour) || !Number.isInteger(p.minute)) return null;
    return s;
  }

  // The card's pictures live inside the extension and a chat site cannot open them (the manifest is not changed for it),
  // so every picture that points there is swapped, once, for a data: URL the worker reads from its own four files.
  const pictureCache = {};
  async function inlinePictures(root) {
    let prefix = '';
    try { prefix = chrome.runtime.getURL(''); } catch (e) { return; }
    if (!prefix || !root.querySelectorAll) return;
    for (const img of Array.from(root.querySelectorAll('img'))) {
      const src = img.getAttribute('src') || '';
      if (src.indexOf(prefix) !== 0 || img.getAttribute('data-glance-inlined')) continue;
      img.setAttribute('data-glance-inlined', '1');
      const file = src.slice(prefix.length).split('?')[0];
      if (!pictureCache[file]) {
        const r = await send({ type: 'flow:asset-data', path: file });
        if (r && r.ok && r.url) pictureCache[file] = r.url;
      }
      if (pictureCache[file]) img.setAttribute('src', pictureCache[file]);
    }
  }
  function watchPictures(node) {
    try {
      if (typeof MutationObserver === 'undefined') return;
      new MutationObserver(() => { inlinePictures(node); }).observe(node, { childList: true, subtree: true });
    } catch (e) { /* the card still works, only without its pictures */ }
  }

  function mountNode() {
    let node = document.getElementById('glance-chat-task');
    if (node) return node;
    node = document.createElement('div');
    node.id = 'glance-chat-task';
    node.setAttribute('data-glance-chain', CHAIN);
    node.style.cssText = 'position:fixed;right:20px;bottom:96px;z-index:2147483000;width:min(360px,calc(100vw - 40px));';
    (document.body || document.documentElement).appendChild(node);
    watchPictures(node);
    return node;
  }

  function uiLangOf(text) {
    return /[֐-׿]/.test(String(text || '')) ? 'he' : 'en';
  }

  // The newest written row for this message; a later Undo reopens it.
  async function findWritten(chatKey) {
    if (typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function') return null;
    const bag = await FlowStorage.get();
    const log = (bag && bag.log) || [];
    for (const e of log) {
      if (!e || e.chatKey !== chatKey) continue;
      if (e.kind === 'undone') return null;
      if (e.kind === 'written' && e.ref) return e;
    }
    return null;
  }

  function undoHandler(host, chatKey, connectorId, ref) {
    return async function () {
      const u = await send(undoMessage(connectorId, ref));
      if (u && (u.reason === 'user-edited' || u.reason === 'unconfirmed' || u.reason === 'unverified' || u.reason === 'verify-timeout')) {
        return { ok: false, reason: u.reason, written: u.written || u.error };
      }
      if (!(u && u.ok)) return { ok: false, written: (u && (u.written || u.error)) || 'Could not remove it.' };
      try {
        await FlowStorage.appendLog({ kind: 'undone', label: 'Removed.', app: 'chat', connectorId: connectorId, chatKey: chatKey });
      } catch (e) { /* the page still shows the undo */ }
      try { host.remove(); } catch (e) { /* gone already */ }
      dismissed.delete(chatKey);
      return { ok: true, written: (u && u.written) || 'Removed.', reopen: true };
    };
  }

  function showReceipt(host, row, chatKey, connectorId) {
    if (typeof FlowChipHost === 'undefined' || typeof FlowChipHost.showDraftReceipt !== 'function') return;
    FlowChipHost.showDraftReceipt(host, {
      status: row.receiptStatus || 'Handled.',
      written: row.label || 'Done.',
      url: row.url || null,
      linkLabel: (connectorId === 'googleHold' || connectorId === 'outlookCalendar') ? 'Open event' : 'Open task',
      onUndo: undoHandler(host, chatKey, connectorId, row.ref)
    });
  }

  // Google goes through the same lane the Gmail card writes through (flow:google-write, googleLaneTask): the task is read
  // back by id and its Undo refuses a task the person changed. The note holds the sender and the chat's address only.
  function googleLaneWrite(ctx, t, params) {
    const facts = (ctx.intent && ctx.intent.facts) || {};
    const iso = [params.dateIso, facts.date && facts.date.iso].find((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) || null;
    const lines = [];
    if (ctx.sender && ctx.sender.name) lines.push((t.own ? 'To: ' : 'From: ') + ctx.sender.name);
    lines.push((OPEN_LABELS[t.channel] || 'Open chat') + ': ' + threadUrl());
    return {
      type: 'flow:google-write',
      connectorId: 'googleLaneTask',
      input: { title: params.title || (ctx.intent && ctx.intent.label) || 'Task', notes: lines.join('\n'), dueIso: iso, params: { dateIso: iso } },
      tabAccount: '',
      lang: t.he ? 'he' : 'en'
    };
  }

  // A Google hold goes through the same lane the Gmail card writes through (flow:google-write, googleHold): the event is
  // read back by id and Undo refuses an event the person changed. Nobody is invited; the note names the chat only.
  // The words of the proposal, so a video call asked for in the chat gets its Meet or Teams link (each behind its own
  // switch in the worker) and a stated repeat gets its series. Only the worker reads it; it is never written anywhere.
  function callTextOf(ctx) { return String((ctx && ctx.bodyText) || '').slice(0, 1500); }

  function googleHoldWrite(ctx, t, params) {
    const note = [(ctx.sender && ctx.sender.name) ? ctx.sender.name : '', (OPEN_LABELS[t.channel] || 'Open chat') + ': ' + threadUrl()].filter(Boolean).join(' · ');
    return {
      type: 'flow:google-write',
      connectorId: 'googleHold',
      input: { title: params.title || (ctx.intent && ctx.intent.label) || 'Meeting', quote: note, dateIso: params.dateIso, hour: params.hour, minute: params.minute, params: { dateIso: params.dateIso, hour: params.hour, minute: params.minute, title: params.title || '', quote: note, callText: callTextOf(ctx) } },
      tabAccount: '',
      lang: t.he ? 'he' : 'en'
    };
  }

  function undoMessage(connectorId, ref) {
    return connectorId === 'googleHold'
      ? { type: 'flow:google-undo', connectorId: 'googleHold', ref: ref, tabAccount: '' }
      : connectorId === 'googleTask'
      ? { type: 'flow:google-undo', connectorId: 'googleLaneTask', ref: ref, tabAccount: '' }
      : { type: 'flow:undo-action', connectorId: connectorId, ref: ref, created: ref && ref.created };
  }

  async function onDoIt(host, chip, ctx) {
    const t = ctx.chatTask;
    if (typeof FlowChipHost !== 'undefined' && chip) FlowChipHost.setChipState(chip, 'flow-chip-pending', 'Closing…');
    const step = t.step;
    const params = step.params || {};
    const r = t.connectorId === 'googleHold' ? await send(googleHoldWrite(ctx, t, params)) : t.connectorId === 'googleTask' ? await send(googleLaneWrite(ctx, t, params)) : await send({
      type: 'flow:execute-action',
      payload: {
        connectorId: t.connectorId,
        threadUrl: threadUrl(),
        threadLabel: OPEN_LABELS[t.channel] || 'Open chat',
        label: params.title || (ctx.intent && ctx.intent.label) || 'Task',
        params: t.connectorId === 'outlookCalendar'
          ? { meeting: true, title: params.title || (ctx.intent && ctx.intent.label) || 'Meeting', dateIso: params.dateIso, hour: params.hour, minute: params.minute, callText: callTextOf(ctx) }
          : { dateIso: params.dateIso || null, amount: params.amount || null, what: params.what || null, fileTerm: params.fileTerm || null },
        facts: (ctx.intent && ctx.intent.facts) || null,
        entities: (ctx.intent && ctx.intent.entities) || (params.what ? { what: params.what } : null),
        senderName: (ctx.sender && ctx.sender.name) || null,
        senderEmail: null,
        subject: '',
        text: ctx.bodyText || '',
        bodyText: ctx.bodyText || ''
      }
    });
    const ref = r && r.ref;
    // Google answers with proof.fetchedBack, Microsoft To Do with fetchedBack; either must say true, nothing else is Handled.
    const proved = !!(r && (r.fetchedBack === true || (r.proof && r.proof.fetchedBack === true)));
    const ok = !!(r && r.ok && ref && (ref.taskId || ref.externalId) && proved);
    if (!ok) {
      if (typeof FlowChipHost !== 'undefined' && chip) FlowChipHost.setChipState(chip, 'flow-chip-error', t.he ? 'לא הצלחתי לסיים, נסה שוב' : "Couldn't finish, try again");
      return;
    }
    const row = {
      kind: 'written',
      label: r.written || 'Task added.',
      app: 'chat',
      connectorId: t.connectorId,
      ref: ref,
      where: r.where,
      url: r.url || null,
      proof: r.proof || null,
      fetchedBack: true,
      receiptStatus: 'Handled.',
      intent: ctx.intent,
      process: ctx.process,
      chatKey: t.chatKey,
      messageId: t.chatKey
    };
    try { await FlowStorage.appendLog(row); } catch (e) { /* the receipt still shows */ }
    showReceipt(host, row, t.chatKey, t.connectorId);
  }

  // input: { text, channel, oneToOne, group, fromMe, quoted, sender, key, now }
  // Resolves { shown, reason }.
  // Own message: the same card, for a dated promise the person typed in the chat. Never sends, never touches the box.
  async function offer(input) {
    const i = input || {};
    const own = i.fromMe === true && i.own === true;
    if ((i.fromMe && !own) || i.group || i.oneToOne === false || i.quoted) return { shown: false, reason: 'not-an-inbound-one-to-one' };
    if (typeof FlowChipHost === 'undefined' || typeof FlowStorage === 'undefined') return { shown: false, reason: 'missing' };
    if (!(await switchOn(own ? SWITCH_OWN : SWITCH))) return { shown: false, reason: 'switch-off' };
    const chatKey = chatKeyOf(i);
    if (dismissed.has(chatKey)) return { shown: false, reason: 'dismissed' };
    const mount = mountNode();
    if (mount.querySelector('.flow-chip-host') && mount.getAttribute('data-glance-key') === chatKey) return { shown: true, reason: 'already' };

    // A write already made for this message stays the card, as its receipt.
    const row = await findWritten(chatKey);
    if (row) {
      const fresh = mount.querySelector('.flow-chip-host');
      if (fresh) fresh.remove();
      const host = FlowChipHost.inject(mount, { app: i.channel || 'chat', doLabel: 'Do It', messageId: chatKey, intent: { label: row.label }, process: { id: CHAIN, name: 'Task', steps: [{ kind: row.connectorId, id: 'close' }] }, uiLang: uiLangOf(i.text) }, { onDoIt: () => {}, onDismiss: (h) => { h.remove(); } });
      if (!host) return { shown: false, reason: 'inject-failed' };
      mount.setAttribute('data-glance-key', chatKey);
      mount.setAttribute('data-glance-raw', String(i.key != null ? i.key : i.text));
      showReceipt(host, row, chatKey, row.connectorId);
      return { shown: true, reason: 'receipt' };
    }

    const judge = typeof FlowIncomingJudge !== 'undefined' ? FlowIncomingJudge : null;
    if (!judge || typeof judge.judge !== 'function') return { shown: false, reason: 'no-judge' };
    let judged = null;
    // An agreed meeting ("מעולה, נתראה ביום חמישי ב-15:00") is not a proposal the judge sees; core/meeting-confirm.js reads it.
    let confirmed = null;
    let callProposal = false;
    try { confirmed = typeof FlowMeetingConfirm !== 'undefined' ? FlowMeetingConfirm.recognize(i.text, i.now) : null; } catch (e) { confirmed = null; }
    if (confirmed && confirmed.kind === 'confirmed') {
      judged = {
        show: true,
        intent: { type: 'event', label: 'Meeting ' + confirmed.when, entities: { dateIso: confirmed.dateIso, hour: confirmed.hour, minute: confirmed.minute } },
        process: { id: 'hold', name: 'Hold It', closingLine: 'Putting this on your calendar.', closedLine: 'On your calendar.', steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: Meeting ' + confirmed.when, params: { title: '', dateIso: confirmed.dateIso, hour: confirmed.hour, minute: confirmed.minute, calendarOp: null, quote: '', requireTime: true, threadUrl: null }, dependsOn: null }] }
      };
    } else {
      try {
        judged = judge.judge({ text: i.text, subject: '', sender: i.sender || {}, surface: 'chat', now: i.now, attachmentCount: 0 });
      } catch (e) { judged = null; }
      // "Can we do a Teams call Thursday at 3pm?" is a call proposal the shared judge leaves to core/teams-meeting.js:
      // one day, one clock, no other tool named. It becomes the same hold, titled as a call; the Meet or Teams link is the
      // worker's, behind its own switch.
      if ((!judged || !judged.show) && !own && typeof FlowTeamsMeeting !== 'undefined') {
        let call = null;
        try { call = FlowTeamsMeeting.recognize(i.text, i.now); } catch (e) { call = null; }
        if (call && call.kind === 'clear') {
          judged = {
            show: true,
            intent: { type: 'event', label: 'Call', entities: { dateIso: call.dateIso, hour: call.hour, minute: call.minute } },
            process: { id: 'hold', name: 'Hold It', closingLine: 'Putting this on your calendar.', closedLine: 'On your calendar.', steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: Call', params: { title: '', dateIso: call.dateIso, hour: call.hour, minute: call.minute, calendarOp: null, quote: '', requireTime: true, threadUrl: null }, dependsOn: null }] }
          };
          callProposal = true;
        }
      }
      // "Don't forget to bring the form on Monday" has no request verb or question, so the judge leaves it quiet;
      // core/chat-reminder.js reads the reminder (one thing, one day) and the same task card offers it.
      if ((!judged || !judged.show) && !own && typeof FlowChatReminder !== 'undefined') {
        let rem = null;
        try { rem = FlowChatReminder.recognize(i.text, i.now); } catch (e) { rem = null; }
        if (rem && rem.kind === 'reminder') {
          judged = {
            show: true,
            intent: { type: 'request', label: rem.what, entities: { dateIso: rem.dateIso, what: rem.what } },
            process: { id: 'log', name: 'Log It', closingLine: 'Adding this to your tasks.', closedLine: 'In your tasks.', steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Add a task: ' + rem.what, params: { title: rem.what, dateIso: rem.dateIso, what: rem.what }, dependsOn: null }] }
          };
        }
      }
      // "Need the report by Wednesday" / «תחתום על החוזה עד יום שישי»: a deadline asked without a question or a polite verb
      // (core/chat-deadline-ask.js); the same task card offers it.
      if ((!judged || !judged.show) && !own && typeof FlowChatDeadlineAsk !== 'undefined') {
        let ask = null;
        try { ask = FlowChatDeadlineAsk.recognize(i.text, i.now); } catch (e) { ask = null; }
        if (ask && ask.kind === 'ask') {
          judged = {
            show: true,
            intent: { type: 'request', label: ask.what, entities: { dateIso: ask.dateIso, what: ask.what } },
            process: { id: 'log', name: 'Log It', closingLine: 'Adding this to your tasks.', closedLine: 'In your tasks.', steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Add a task: ' + ask.what, params: { title: ask.what, dateIso: ask.dateIso, what: ask.what }, dependsOn: null }] }
          };
        }
      }
    }
    if (!judged || !judged.show) return { shown: false, reason: (judged && judged.reason) || 'silent' };
    const taskStep = taskStepOf(judged.process);
    // Own message: only a promise with one day on it ("I'll send it Thursday") is offered; a vague "I'll think about it" is not.
    if (own) {
      const typ = judged.intent && judged.intent.type;
      const day = taskStep && taskStep.params && taskStep.params.dateIso;
      if (!(typ === 'decision' || typ === 'commitment') || !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return { shown: false, reason: 'no-dated-promise' };
    }
    const calStep = taskStep || own ? null : calendarStepOf(judged.process);
    const step = taskStep || calStep;
    if (!step) return { shown: false, reason: 'no-task-step' };

    const target = await send({ type: 'flow:chat-task-target', kind: calStep ? 'calendar' : 'task', own: own });
    if (!target || !target.connectorId) return { shown: false, reason: (target && target.reason) || 'not-connected' };
    const kind = target.connectorId === 'outlookTask' ? 'outlookTask' : (target.connectorId === 'googleHold' || target.connectorId === 'outlookCalendar') ? 'calendar' : 'googleTask';
    const he = uiLangOf(i.text) === 'he';
    let liveStep = Object.assign({}, step, { kind: kind });
    if (kind === 'calendar') {
      // A hold is titled "Meeting · Dana", not with the whole message; the chat is named in its note, never the words.
      const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
      liveStep = Object.assign({}, liveStep, { params: Object.assign({}, liveStep.params || {}, { title: ((callProposal ? (he ? 'שיחה' : 'Call') : (he ? 'פגישה' : 'Meeting')) + (who ? ' · ' + who : '')).slice(0, 120), quote: '' }) });
    }
    if (own) {
      // The task is the promise itself, in the person's words, with whom it was made to ("לשלוח · דנה").
      let base = '';
      try { base = (typeof FlowCommitmentTitle !== 'undefined' && FlowCommitmentTitle.titleFromBody(String(i.text || ''))) || ''; } catch (e) { base = ''; }
      const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
      const title = ((base || (he ? 'הבטחה' : 'Promise')) + (who ? ' · ' + who : '')).slice(0, 120);
      liveStep = Object.assign({}, liveStep, { params: Object.assign({}, liveStep.params || {}, { title: title }) });
    }
    const process = Object.assign({}, judged.process, { id: judged.process.id || CHAIN, name: own ? (he ? 'ההבטחה שלך' : 'Your promise') : judged.process.name, steps: [liveStep] });
    const ctx = {
      app: i.channel || 'chat',
      doLabel: 'Do It',
      messageId: chatKey,
      intent: judged.intent,
      process: process,
      sender: i.sender || {},
      bodyText: String(i.text || '').slice(0, 2000),
      subject: '',
      uiLang: he ? 'he' : 'en',
      glanceChain: CHAIN,
      chatTask: { connectorId: target.connectorId, channel: i.channel || 'chat', step: liveStep, chatKey: chatKey, he: he, own: own }
    };
    const old = mount.querySelector('.flow-chip-host');
    if (old) old.remove();
    const host = FlowChipHost.inject(mount, ctx, {
      onDoIt: (h, chip, c) => onDoIt(h, chip, c),
      onDismiss: (h) => { dismissed.add(chatKey); h.remove(); }
    });
    if (!host) return { shown: false, reason: 'inject-failed' };
    mount.setAttribute('data-glance-key', chatKey);
    mount.setAttribute('data-glance-raw', String(i.key != null ? i.key : i.text));
    host.setAttribute('data-glance-chain', CHAIN);
    return { shown: true, reason: 'offered' };
  }

  // The call sites hand over what draftInto answered: a place or fact draft keeps the chat to itself; anything else
  // (silence, no answer, no box) lets the card see the same message. Never throws into the page's scan.
  function afterDraft(result, input) {
    if (result && result.reason === 'invalidated') return Promise.resolve({ shown: false, reason: 'invalidated' });
    if (result && result.ok && result.judged && result.judged.draft) return Promise.resolve({ shown: false, reason: 'drafted' });
    return offer(input).catch(() => ({ shown: false, reason: 'error' }));
  }

  // The card belongs to one inbound message. When the newest message in the open chat is another one (or the person's
  // own), the card leaves; coming back to the message brings the card, or its receipt, back through offer().
  function sync(rawKey) {
    try {
      const mount = document.getElementById('glance-chat-task');
      if (!mount) return;
      if (rawKey != null && mount.getAttribute('data-glance-raw') === String(rawKey)) return;
      const host = mount.querySelector('.flow-chip-host');
      if (host) host.remove();
      mount.removeAttribute('data-glance-key');
      mount.removeAttribute('data-glance-raw');
    } catch (e) { /* the page keeps working */ }
  }

  return { SWITCH, CHAIN, offer, afterDraft, sync, taskStepOf, calendarStepOf, chatKeyOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatTaskCard };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatTaskCard = FlowChatTaskCard;
