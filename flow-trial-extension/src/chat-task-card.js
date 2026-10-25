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

  function pad2(n) { return String(n).padStart(2, '0'); }

  // What the person asked the other side for is a loop to chase: "Waiting on Dana: payment 500 NIS" / «מחכים ל-Dana: תשלום 500 NIS».
  function waitingTitle(he, who, base) {
    const name = String(who || '').trim();
    const lead = he ? (name ? 'מחכים ל' + (/[\u0590-\u05FF]/.test(name) ? '' : '-') + name : 'מחכים') : (name ? 'Waiting on ' + name : 'Waiting');
    return (lead + ': ' + String(base || '')).slice(0, 120);
  }

  // The same hold must not be made twice: a confirmation and then a reminder for the same appointment in the same chat would add a
  // second event. A hold this card wrote for the same day and clock in this thread, and not undone since, is the answer.
  async function findHeldHold(chatKey, params) {
    if (typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function' || !params) return null;
    const bag = await FlowStorage.get();
    const log = (bag && bag.log) || [];
    const thread = String(chatKey).split('|').slice(0, 3).join('|');
    const undone = {};
    for (const e of log) {
      if (!e) continue;
      if (e.kind === 'undone' && e.chatKey) { undone[e.chatKey] = true; continue; }
      if (e.kind !== 'written' || !e.ref || undone[e.chatKey]) continue;
      if (e.connectorId !== 'googleHold' && e.connectorId !== 'outlookCalendar') continue;
      if (String(e.chatKey || '').split('|').slice(0, 3).join('|') !== thread) continue;
      const st = e.process && Array.isArray(e.process.steps) ? e.process.steps[0] : null;
      const p = st && st.params;
      if (p && p.dateIso === params.dateIso && p.hour === params.hour && p.minute === params.minute) return e;
    }
    return null;
  }

  // The same task must not be made twice either: a bill and then its reminder in the same chat would add a second Pay task. The key is
  // the due day and the title the person would see; a task this card wrote for it in this thread, and not undone since, is the answer.
  function taskKeyOf(step) {
    const p = step && step.params;
    const title = p ? String(p.title || '').toLowerCase().replace(/\s+/g, ' ').trim() : '';
    return p && /^\d{4}-\d{2}-\d{2}$/.test(String(p.dateIso || '')) && title ? 'task ' + p.dateIso + ' ' + title : '';
  }

  async function findHeldTask(chatKey, step) {
    const key = taskKeyOf(step);
    if (!key || typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function') return null;
    const bag = await FlowStorage.get();
    const log = (bag && bag.log) || [];
    const thread = String(chatKey).split('|').slice(0, 3).join('|');
    const undone = {};
    for (const e of log) {
      if (!e) continue;
      if (e.kind === 'undone' && e.chatKey) { undone[e.chatKey] = true; continue; }
      if (e.kind !== 'written' || !e.ref || undone[e.chatKey] || e.heldKey !== key) continue;
      if (String(e.chatKey || '').split('|').slice(0, 3).join('|') === thread) return e;
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
      input: { title: params.title || (ctx.intent && ctx.intent.label) || 'Meeting', quote: note, dateIso: params.dateIso, hour: params.hour, minute: params.minute, durationMinutes: params.durationMinutes, params: { dateIso: params.dateIso, hour: params.hour, minute: params.minute, durationMinutes: params.durationMinutes, title: params.title || '', quote: note, callText: callTextOf(ctx) } },
      tabAccount: '',
      lang: t.he ? 'he' : 'en'
    };
  }

  function undoMessage(connectorId, ref) {
    return connectorId === 'googleHold'
      ? { type: 'flow:google-undo', connectorId: 'googleHold', ref: ref, tabAccount: '' }
      : connectorId === 'googleTask'
      ? { type: 'flow:google-undo', connectorId: 'googleLaneTask', ref: ref, tabAccount: '' }
      : connectorId === 'googleTaskClose'
      ? { type: 'flow:google-undo', connectorId: 'googleTaskClose', ref: ref, tabAccount: '' }
      : { type: 'flow:undo-action', connectorId: connectorId, ref: ref, created: ref && ref.created };
  }

  // The open "Waiting on Dana: Payment 500 NIS" tasks Glance wrote from this chat: written, not undone, not already closed here.
  // Newest first. A close and its Undo are rows of their own, so Undo of a close puts the task back among the open ones.
  async function findOpenPaymentTasks(chatKey) {
    if (typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function') return [];
    const bag = await FlowStorage.get();
    const log = (bag && bag.log) || [];
    const thread = String(chatKey).split('|').slice(0, 3).join('|');
    const undone = {};
    const closed = {};
    const out = [];
    for (const e of log) {
      if (!e) continue;
      if (e.kind === 'undone' && e.chatKey) { undone[e.chatKey] = true; continue; }
      if (e.kind !== 'written' || !e.ref) continue;
      if (String(e.chatKey || '').split('|').slice(0, 3).join('|') !== thread) continue;
      if (e.connectorId === 'googleTaskClose' || e.connectorId === 'outlookTaskClose') { if (!undone[e.chatKey] && e.closes) closed[e.closes] = true; continue; }
      if ((e.connectorId !== 'googleTask' && e.connectorId !== 'outlookTask') || undone[e.chatKey] || closed[e.chatKey] || !e.ref.taskId) continue;
      const m = /(?:payment|תשלום) (\d+(?:\.\d+)?) ([a-z]{3})$/.exec(String(e.heldKey || ''));
      if (m) out.push({ row: e, amount: m[1], currency: m[2].toUpperCase(), connectorId: e.connectorId });
    }
    return out;
  }

  // The other side says they paid: Do It marks the waiting task done, through the same Google lane, read back that it shows completed.
  // The person's click is the deliberate part; Glance has not seen any money. A task the person changed is left as it is.
  async function closePaid(host, chip, ctx) {
    const t = ctx.chatTask;
    const open = t.close;
    if (typeof FlowChipHost !== 'undefined' && chip) FlowChipHost.setChipState(chip, 'flow-chip-pending', t.he ? 'מסמן…' : 'Marking…');
    const closeId = open.connectorId === 'outlookTask' ? 'outlookTaskClose' : 'googleTaskClose';
    const r = closeId === 'outlookTaskClose'
      ? await send({ type: 'flow:execute-action', payload: { connectorId: 'outlookTaskClose', params: { taskListId: open.ref.taskListId, taskId: open.ref.taskId, created: open.ref.created } } })
      : await send({ type: 'flow:google-write', connectorId: 'googleTaskClose', input: { taskListId: open.ref.taskListId, taskId: open.ref.taskId, contentHash: open.ref.contentHash }, tabAccount: '', lang: t.he ? 'he' : 'en' });
    const ref = r && r.ref;
    const proved = !!(r && (r.fetchedBack === true || (r.proof && r.proof.fetchedBack === true)));
    if (!(r && r.ok && ref && ref.taskId && proved)) {
      const edited = r && r.reason === 'user-edited';
      const text = edited ? (t.he ? 'שינית את המשימה, השארתי אותה' : 'You changed this task, so I left it') : (t.he ? 'לא הצלחתי לסמן, נסה שוב' : "Couldn't mark it, try again");
      if (typeof FlowChipHost !== 'undefined' && chip) FlowChipHost.setChipState(chip, 'flow-chip-error', text);
      return;
    }
    const row = {
      kind: 'written',
      label: r.written || 'Google Task done.',
      app: 'chat',
      connectorId: closeId,
      ref: ref,
      where: r.where,
      url: r.url || null,
      proof: r.proof || null,
      fetchedBack: true,
      receiptStatus: 'Handled.',
      closes: open.chatKey,
      intent: ctx.intent,
      process: ctx.process,
      chatKey: t.chatKey,
      messageId: t.chatKey
    };
    try { await FlowStorage.appendLog(row); } catch (e) { /* the receipt still shows */ }
    showReceipt(host, row, t.chatKey, closeId);
  }

  // The business cancelled a booking Glance put on the calendar from this chat: Do It removes that same event through the same undo the
  // receipt has (read back that it is gone; an event the person edited is left alone and says so). Nothing else is touched.
  async function removeHeld(host, chip, ctx) {
    const t = ctx.chatTask;
    const held = t.remove;
    if (typeof FlowChipHost !== 'undefined' && chip) FlowChipHost.setChipState(chip, 'flow-chip-pending', t.he ? 'מסיר…' : 'Removing…');
    const u = await send(undoMessage(held.connectorId, held.ref));
    if (!(u && u.ok)) {
      const edited = u && (u.reason === 'user-edited');
      const text = edited ? (t.he ? 'שינית את האירוע, השארתי אותו' : 'You changed this event, so I left it') : (t.he ? 'לא הצלחתי להסיר, נסה שוב' : "Couldn't remove it, try again");
      if (typeof FlowChipHost !== 'undefined' && chip) FlowChipHost.setChipState(chip, 'flow-chip-error', text);
      return;
    }
    try { await FlowStorage.appendLog({ kind: 'undone', label: 'Removed.', app: 'chat', connectorId: held.connectorId, chatKey: held.chatKey }); } catch (e) { /* the receipt still shows */ }
    if (typeof FlowChipHost !== 'undefined' && typeof FlowChipHost.showDraftReceipt === 'function') {
      FlowChipHost.showDraftReceipt(host, { status: 'Handled.', written: u.written || (t.he ? 'הוסר מהיומן.' : 'Removed from your calendar.') });
    }
  }

  async function onDoIt(host, chip, ctx) {
    const t = ctx.chatTask;
    if (t && t.remove) return removeHeld(host, chip, ctx);
    if (t && t.close) return closePaid(host, chip, ctx);
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
          ? { meeting: true, title: params.title || (ctx.intent && ctx.intent.label) || 'Meeting', dateIso: params.dateIso, hour: params.hour, minute: params.minute, durationMinutes: params.durationMinutes, callText: callTextOf(ctx) }
          : { dateIso: params.dateIso || null, amount: params.amount || null, what: null, fileTerm: params.fileTerm || null },
        facts: (ctx.intent && ctx.intent.facts) || null,
        entities: null,
        senderName: (ctx.sender && ctx.sender.name) || null,
        senderEmail: null,
        subject: '',
        // The words of the chat message never go into the task body: the note names the chat, as the Google task does. The
        // worker reads callText (for a Teams link or a series), nothing else from the words.
        text: '',
        bodyText: ''
      }
    });
    const ref = r && r.ref;
    // Google answers with proof.fetchedBack, Microsoft To Do with fetchedBack; either must say true, nothing else is Handled.
    const proved = !!(r && (r.fetchedBack === true || (r.proof && r.proof.fetchedBack === true)));
    const ok = !!(r && r.ok && ref && (ref.taskId || ref.externalId || ref.eventId) && proved);
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
      messageId: t.chatKey,
      heldKey: t.connectorId === 'googleHold' || t.connectorId === 'outlookCalendar' ? undefined : taskKeyOf(t.step) || undefined
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

    // The other side says they paid ("I transferred 500 NIS", «העברתי לך 500 ש"ח») while this chat has a "Waiting on ...: Payment" task
    // Glance wrote (Google Tasks): the card offers to mark that task done. One amount matches one task; no amount needs exactly one.
    if (!own && typeof FlowChatPaymentClaim !== 'undefined') {
      let claim = null;
      try { claim = FlowChatPaymentClaim.recognize(i.text); } catch (e) { claim = null; }
      if (claim && claim.kind === 'claim') {
        const open = await findOpenPaymentTasks(chatKey);
        const fits = open.filter((c) => !claim.amount || (c.amount === claim.amount && (!claim.currency || c.currency === claim.currency)));
        if (fits.length === 1 && (claim.amount || open.length === 1)) {
          const pick = fits[0];
          const heC = claim.lang === 'he';
          const st = pick.row.process && pick.row.process.steps && pick.row.process.steps[0];
          const title = String((st && st.params && st.params.title) || pick.row.label || '').slice(0, 120);
          const ctxC = {
            app: i.channel || 'chat',
            doLabel: 'Do It',
            messageId: chatKey,
            intent: { type: 'request', label: (heC ? 'שולם? ' : 'Paid? ') + title, confidence: 0.9, personalClose: 'payment-claimed', signals: { score: 90, threshold: 50 }, entities: { what: title } },
            process: { id: CHAIN, name: heC ? 'סמן כבוצע' : 'Mark done', closingLine: heC ? 'מסמן את המשימה כבוצעה.' : 'Marking the task done.', closedLine: heC ? 'המשימה סומנה כבוצעה.' : 'Task marked done.', needsDateChoice: false, dateChoices: null,
              steps: [{ id: 'task', kind: pick.connectorId === 'outlookTask' ? 'outlookTask' : 'googleTask', label: 'Task', hint: (heC ? 'לסמן כבוצע: ' : 'Mark done: ') + title, params: { title: title }, dependsOn: null }] },
            sender: i.sender || {},
            bodyText: '',
            subject: '',
            uiLang: heC ? 'he' : 'en',
            glanceChain: CHAIN,
            chatTask: { connectorId: pick.connectorId === 'outlookTask' ? 'outlookTaskClose' : 'googleTaskClose', channel: i.channel || 'chat', step: null, chatKey: chatKey, he: heC, own: false, close: { chatKey: pick.row.chatKey, ref: pick.row.ref, connectorId: pick.connectorId } }
          };
          const oldC = mount.querySelector('.flow-chip-host');
          if (oldC) oldC.remove();
          const hostC = FlowChipHost.inject(mount, ctxC, {
            onDoIt: (h, chip, c) => onDoIt(h, chip, c),
            onDismiss: (h) => { dismissed.add(chatKey); h.remove(); }
          });
          if (!hostC) return { shown: false, reason: 'inject-failed' };
          mount.setAttribute('data-glance-key', chatKey);
          mount.setAttribute('data-glance-raw', String(i.key != null ? i.key : i.text));
          hostC.setAttribute('data-glance-chain', CHAIN);
          return { shown: true, reason: 'close-offered' };
        }
      }
    }

    // A cancellation of a booking, a trip or an invitation this chat already put on the calendar offers to take that event off again.
    if (!own) {
      let gone = null;
      for (const reader of [typeof FlowChatAppointmentNotice !== 'undefined' ? FlowChatAppointmentNotice : null, typeof FlowChatTravelNotice !== 'undefined' ? FlowChatTravelNotice : null, typeof FlowChatInvitationNotice !== 'undefined' ? FlowChatInvitationNotice : null]) {
        if (!reader || typeof reader.cancelled !== 'function') continue;
        try { const g = reader.cancelled(i.text, i.now); if (g && g.kind === 'cancelled') { gone = g; break; } } catch (e) { /* the next reader */ }
      }
      if (gone) {
        const held = await findHeldHold(chatKey, gone);
        if (!held) return { shown: false, reason: 'no-hold-to-remove' };
        const heHold = gone.lang === 'he';
        const title = String(held.label || '').replace(/^Calendar\s*·\s*/i, '').slice(0, 80);
        const ctxRm = {
          app: i.channel || 'chat',
          doLabel: 'Do It',
          messageId: chatKey,
          intent: { type: 'event', label: (heHold ? 'בוטל: ' : 'Cancelled: ') + title, confidence: 0.9, personalClose: 'booking-cancelled', signals: { score: 90, threshold: 50 }, entities: { dateIso: gone.dateIso, hour: gone.hour, minute: gone.minute } },
          process: { id: CHAIN, name: heHold ? 'הסר מהיומן' : 'Remove It', closingLine: heHold ? 'מסיר מהיומן.' : 'Removing it from your calendar.', closedLine: heHold ? 'הוסר מהיומן.' : 'Removed from your calendar.', needsDateChoice: false, dateChoices: null,
            steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: (heHold ? 'להסיר מהיומן: ' : 'Remove from calendar: ') + title, params: { dateIso: gone.dateIso, hour: gone.hour, minute: gone.minute, title: title }, dependsOn: null }] },
          sender: i.sender || {},
          bodyText: '',
          subject: '',
          uiLang: heHold ? 'he' : 'en',
          glanceChain: CHAIN,
          chatTask: { connectorId: held.connectorId, channel: i.channel || 'chat', step: null, chatKey: chatKey, he: heHold, own: false, remove: { connectorId: held.connectorId, ref: held.ref, chatKey: held.chatKey } }
        };
        const oldRm = mount.querySelector('.flow-chip-host');
        if (oldRm) oldRm.remove();
        const hostRm = FlowChipHost.inject(mount, ctxRm, {
          onDoIt: (h, chip, c) => onDoIt(h, chip, c),
          onDismiss: (h) => { dismissed.add(chatKey); h.remove(); }
        });
        if (!hostRm) return { shown: false, reason: 'inject-failed' };
        mount.setAttribute('data-glance-key', chatKey);
        mount.setAttribute('data-glance-raw', String(i.key != null ? i.key : i.text));
        hostRm.setAttribute('data-glance-chain', CHAIN);
        return { shown: true, reason: 'remove-offered' };
      }
    }

    const judge = typeof FlowIncomingJudge !== 'undefined' ? FlowIncomingJudge : null;
    if (!judge || typeof judge.judge !== 'function') return { shown: false, reason: 'no-judge' };
    let judged = null;
    // An agreed meeting ("מעולה, נתראה ביום חמישי ב-15:00") is not a proposal the judge sees; core/meeting-confirm.js reads it.
    let confirmed = null;
    let callProposal = false;
    let appt = null;
    let inv = null;
    let trip = null;
    let dlv = null;
    let deliveryWindow = null;
    let ownAskTitle = '';
    try { dlv = (!own && typeof FlowChatDeliveryWindow !== 'undefined') ? FlowChatDeliveryWindow.recognize(i.text, i.now) : null; } catch (e) { dlv = null; }
    try { trip = (!own && typeof FlowChatTravelNotice !== 'undefined') ? FlowChatTravelNotice.recognize(i.text, i.now) : null; } catch (e) { trip = null; }
    let selfNote = null;
    try { selfNote = (own && typeof FlowChatSelfNote !== 'undefined') ? FlowChatSelfNote.recognize(i.text, i.now) : null; } catch (e) { selfNote = null; }
    try { inv = (!own && typeof FlowChatInvitationNotice !== 'undefined') ? FlowChatInvitationNotice.recognize(i.text, i.now) : null; } catch (e) { inv = null; }
    try { appt = (!own && typeof FlowChatAppointmentNotice !== 'undefined') ? FlowChatAppointmentNotice.recognize(i.text, i.now) : null; } catch (e) { appt = null; }
    try { confirmed = typeof FlowMeetingConfirm !== 'undefined' ? FlowMeetingConfirm.recognize(i.text, i.now) : null; } catch (e) { confirmed = null; }
    if (selfNote && selfNote.kind === 'note') {
      // "Remind me tomorrow to pay the bill" / «תזכיר לי מחר לשלם חשבון חשמל» typed by the person (core/chat-self-note.js): a task
      // titled with the thing itself, due that day. Not worded as a promise to the other person in the chat.
      judged = {
        show: true,
        intent: { type: 'commitment', label: selfNote.what, entities: { dateIso: selfNote.dateIso, what: selfNote.what } },
        process: { id: 'log', name: 'Log It', closingLine: 'Adding this to your tasks.', closedLine: 'In your tasks.', steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Add a task: ' + selfNote.what, params: { title: selfNote.what, dateIso: selfNote.dateIso, what: selfNote.what }, dependsOn: null }] }
      };
    } else if (!(appt && appt.kind === 'appointment') && !(inv && inv.kind === 'invitation') && !(trip && trip.kind === 'trip') && !(dlv && dlv.kind === 'delivery') && confirmed && confirmed.kind === 'confirmed') {
      judged = {
        show: true,
        intent: { type: 'event', label: 'Meeting ' + confirmed.when, entities: { dateIso: confirmed.dateIso, hour: confirmed.hour, minute: confirmed.minute } },
        process: { id: 'hold', name: 'Hold It', closingLine: 'Putting this on your calendar.', closedLine: 'On your calendar.', steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: Meeting ' + confirmed.when, params: { title: '', dateIso: confirmed.dateIso, hour: confirmed.hour, minute: confirmed.minute, calendarOp: null, quote: '', requireTime: true, threadUrl: null }, dependsOn: null }] }
      };
    } else if ((appt && appt.kind === 'appointment') || (inv && inv.kind === 'invitation') || (trip && trip.kind === 'trip') || (dlv && dlv.kind === 'delivery')) {
      const held = (appt && appt.kind === 'appointment') ? appt : (inv && inv.kind === 'invitation') ? inv : (trip && trip.kind === 'trip') ? trip : dlv;
      // "Your appointment is confirmed for Sunday at 10:00" / «התור שלך נקבע ליום ראשון בשעה 10:00» (core/chat-appointment-notice.js):
      // a booking someone confirmed to the person becomes a hold titled "Appointment · name". Nobody is invited.
      judged = {
        show: true,
        intent: { type: 'event', label: held === dlv ? 'Delivery' : held === trip ? 'Trip' : held === inv ? 'Invitation' : 'Appointment', entities: { dateIso: held.dateIso, hour: held.hour, minute: held.minute } },
        process: { id: 'hold', name: 'Hold It', closingLine: 'Putting this on your calendar.', closedLine: 'On your calendar.', steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: 'Add to Calendar: ' + (held === dlv ? 'Delivery' : held === trip ? 'Trip' : held === inv ? 'Invitation' : 'Appointment'), params: { title: '', dateIso: held.dateIso, hour: held.hour, minute: held.minute, calendarOp: null, quote: '', requireTime: true, threadUrl: null }, dependsOn: null }] }
      };
      callProposal = held === dlv ? 'delivery' : held === trip ? 'trip' : held === inv ? 'invitation' : 'appointment';
      if (held === dlv) deliveryWindow = dlv;
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
      // "Your order is ready for pickup until Friday" / «ההזמנה שלך מוכנה לאיסוף עד יום חמישי» (core/chat-pickup-notice.js): a task
      // to pick it up, due the last day, titled with the sender's name.
      if ((!judged || !judged.show) && !own && typeof FlowChatPickupNotice !== 'undefined') {
        let pk = null;
        try { pk = FlowChatPickupNotice.recognize(i.text, i.now); } catch (e) { pk = null; }
        if (pk && pk.kind === 'pickup') {
          const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
          const title = ((pk.lang === 'he' ? 'לאסוף הזמנה' : 'Pick up the order') + (who ? ' · ' + who : '')).slice(0, 120);
          judged = {
            show: true,
            intent: { type: 'request', label: title, entities: { dateIso: pk.dateIso, what: title } },
            process: { id: 'log', name: 'Log It', closingLine: 'Adding this to your tasks.', closedLine: 'In your tasks.', steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Add a task: ' + title, params: { title: title, dateIso: pk.dateIso, what: title }, dependsOn: null }] }
          };
        }
      }
      // "Please transfer 500 NIS to my account by Sunday" / «תעביר לי 500 שקל עד יום ראשון» (core/chat-payment-ask.js): a task
      // to pay, with the amount and the day. Glance never pays and never touches a bank.
      if ((!judged || !judged.show) && !own && typeof FlowChatPaymentAsk !== 'undefined') {
        let pay = null;
        try { pay = FlowChatPaymentAsk.recognize(i.text, i.now); } catch (e) { pay = null; }
        if (pay && pay.kind === 'ask') {
          const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
          const title = ((pay.lang === 'he' ? 'לשלם ' : 'Pay ') + pay.amount + ' ' + pay.currency + (who ? ' · ' + who : '')).slice(0, 120);
          judged = {
            show: true,
            intent: { type: 'request', label: title, entities: { dateIso: pay.dateIso, what: title } },
            process: { id: 'log', name: 'Log It', closingLine: 'Adding this to your tasks.', closedLine: 'In your tasks.', steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Add a task: ' + title, params: { title: title, dateIso: pay.dateIso, what: title }, dependsOn: null }] }
          };
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
      // What the person asked the other side for in their own message ("Please transfer 500 NIS by Sunday", "Please send me the contract by
      // Thursday", «תעביר לי 500 שקל עד יום ראשון») is a loop to chase: a task "Waiting on Dana: ..." due that day (CHAT_PROMISE_CARD).
      // Glance asks nothing of anyone and sends nothing.
      if (own) {
        const who0 = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
        const he0 = uiLangOf(i.text) === 'he';
        let pay0 = null;
        try { pay0 = typeof FlowChatPaymentAsk !== 'undefined' ? FlowChatPaymentAsk.recognize(i.text, i.now) : null; } catch (e) { pay0 = null; }
        let ask0 = null;
        if (!(pay0 && pay0.kind === 'ask')) { try { ask0 = typeof FlowChatDeadlineAsk !== 'undefined' ? FlowChatDeadlineAsk.recognize(i.text, i.now) : null; } catch (e) { ask0 = null; } }
        const hit0 = (pay0 && pay0.kind === 'ask') ? { dateIso: pay0.dateIso, base: (pay0.lang === 'he' ? 'תשלום ' : 'Payment ') + pay0.amount + ' ' + pay0.currency } : (ask0 && ask0.kind === 'ask') ? { dateIso: ask0.dateIso, base: ask0.what } : null;
        if (hit0) {
          ownAskTitle = waitingTitle(he0, who0, hit0.base);
          judged = {
            show: true,
            intent: { type: 'commitment', label: ownAskTitle, entities: { dateIso: hit0.dateIso, what: ownAskTitle } },
            process: { id: 'log', name: 'Log It', closingLine: 'Adding this to your tasks.', closedLine: 'In your tasks.', steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Add a task: ' + ownAskTitle, params: { title: ownAskTitle, dateIso: hit0.dateIso, amount: null, what: ownAskTitle, threadUrl: null }, dependsOn: null }] }
          };
        }
      }
      // "Please call me back tomorrow" / «תתקשר אליי מחר» (core/chat-callback-ask.js): a task to call the sender, due that day.
      // The call itself is the person's; Glance only keeps the promise to make it.
      if ((!judged || !judged.show) && !own && typeof FlowChatCallbackAsk !== 'undefined') {
        let cb = null;
        try { cb = FlowChatCallbackAsk.recognize(i.text, i.now); } catch (e) { cb = null; }
        if (cb && cb.kind === 'ask') {
          const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
          const title = ((cb.lang === 'he' ? 'להתקשר' : 'Call back') + (who ? ' · ' + who : '')).slice(0, 120);
          judged = {
            show: true,
            intent: { type: 'request', label: title, entities: { dateIso: cb.dateIso, what: title } },
            process: { id: 'log', name: 'Log It', closingLine: 'Adding this to your tasks.', closedLine: 'In your tasks.', steps: [{ id: 'task', kind: 'googleTask', label: 'Task', hint: 'Add a task: ' + title, params: { title: title, dateIso: cb.dateIso, what: title }, dependsOn: null }] }
          };
        }
      }
    }
    if (!judged || !judged.show) return { shown: false, reason: (judged && judged.reason) || 'silent' };
    let taskStep = taskStepOf(judged.process);
    // Something the sender promised the person ("I'll send you the contract on Sunday") is logged to follow up on, not to do:
    // the judge's "Log commitment for Oct 25" becomes "Waiting on Dana: send the contract on Sunday", due that day.
    if (!own && taskStep && taskStep.params && /^Log commitment/.test(String(taskStep.params.title || ''))) {
      let base = '';
      try { base = (typeof FlowCommitmentTitle !== 'undefined' && FlowCommitmentTitle.titleFromBody(String(i.text || ''))) || ''; } catch (e) { base = ''; }
      const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
      if (base && who) {
        const he = uiLangOf(i.text) === 'he';
        const lead = he ? 'מחכים ל' + (/[\u0590-\u05FF]/.test(who) ? '' : '-') + who : 'Waiting on ' + who;
        const retitled = Object.assign({}, taskStep, { params: Object.assign({}, taskStep.params, { title: (lead + ': ' + base).slice(0, 120) }) });
        judged = Object.assign({}, judged, { process: Object.assign({}, judged.process, { steps: judged.process.steps.map((x) => (x === taskStep ? retitled : x)) }) });
        taskStep = retitled;
      }
    }
    // Own message: only a promise with one day on it ("I'll send it Thursday") is offered; a vague "I'll think about it" is not.
    if (own) {
      const typ = judged.intent && judged.intent.type;
      const day = taskStep && taskStep.params && taskStep.params.dateIso;
      if (!(typ === 'decision' || typ === 'commitment') || !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return { shown: false, reason: 'no-dated-promise' };
    }
    const calStep = taskStep || own ? null : calendarStepOf(judged.process);
    const step = taskStep || calStep;
    if (!step) return { shown: false, reason: 'no-task-step' };

    if (calStep && (await findHeldHold(chatKey, calStep.params))) return { shown: false, reason: 'already-on-calendar' };

    const target = await send({ type: 'flow:chat-task-target', kind: calStep ? 'calendar' : 'task', own: own });
    if (!target || !target.connectorId) return { shown: false, reason: (target && target.reason) || 'not-connected' };
    const kind = target.connectorId === 'outlookTask' ? 'outlookTask' : (target.connectorId === 'googleHold' || target.connectorId === 'outlookCalendar') ? 'calendar' : 'googleTask';
    const he = uiLangOf(i.text) === 'he';
    let liveStep = Object.assign({}, step, { kind: kind });
    if (kind === 'calendar') {
      // A hold is titled "Meeting · Dana", not with the whole message; the chat is named in its note, never the words.
      const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
      liveStep = Object.assign({}, liveStep, { params: Object.assign({}, liveStep.params || {}, { title: ((callProposal === 'delivery' ? ((he ? 'משלוח' : 'Delivery') + (deliveryWindow && deliveryWindow.endHour != null ? ' ' + pad2(deliveryWindow.hour) + ':' + pad2(deliveryWindow.minute) + '–' + pad2(deliveryWindow.endHour) + ':' + pad2(deliveryWindow.endMinute) : '')) : callProposal === 'appointment' ? (he ? 'תור' : 'Appointment') : callProposal === 'invitation' ? (he ? 'הזמנה' : 'Invitation') : callProposal === 'trip' ? (he ? 'נסיעה' : 'Trip') : callProposal ? (he ? 'שיחה' : 'Call') : (he ? 'פגישה' : 'Meeting')) + (who ? ' · ' + who : '')).slice(0, 120), quote: '', durationMinutes: callProposal === 'delivery' && deliveryWindow && deliveryWindow.durationMinutes ? deliveryWindow.durationMinutes : undefined }) });
    }
    if (own && !(selfNote && selfNote.kind === 'note')) {
      // The task is the promise itself, in the person's words, with whom it was made to ("לשלוח · דנה").
      let base = '';
      try { base = (typeof FlowCommitmentTitle !== 'undefined' && FlowCommitmentTitle.titleFromBody(String(i.text || ''))) || ''; } catch (e) { base = ''; }
      const who = (i.sender && i.sender.name) ? String(i.sender.name).trim() : '';
      const title = ownAskTitle || ((base || (he ? 'הבטחה' : 'Promise')) + (who ? ' · ' + who : '')).slice(0, 120);
      liveStep = Object.assign({}, liveStep, { params: Object.assign({}, liveStep.params || {}, { title: title }) });
    }
    if (kind !== 'calendar' && (await findHeldTask(chatKey, liveStep))) return { shown: false, reason: 'already-on-task-list' };
    const process = Object.assign({}, judged.process, { id: judged.process.id || CHAIN, name: own ? (selfNote && selfNote.kind === 'note' ? (he ? 'תזכורת' : 'Reminder') : (ownAskTitle ? (he ? 'מעקב' : 'Follow-up') : (he ? 'ההבטחה שלך' : 'Your promise'))) : judged.process.name, steps: [liveStep] });
    const ctx = {
      app: i.channel || 'chat',
      doLabel: 'Do It',
      messageId: chatKey,
      intent: judged.intent,
      process: process,
      sender: (selfNote && selfNote.kind === 'note') ? {} : (i.sender || {}),
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
