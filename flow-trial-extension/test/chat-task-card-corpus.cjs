'use strict';
// The chat task card (owner priority 2026-10-21, docs/glance-ai/chat-task-card-spec.md): an inbound task ask in a one-to-one
// WhatsApp / Messenger / Instagram chat gets the canonical Do It card, behind glanceSwitches.CHAT_TASK_CARD (off). Detection is the
// one shared judge; this file's FlowChatTaskCard only decides when to draw, writes through flow:execute-action and keeps Handled
// for a read-back by id. The lines are invented. Run: node test/chat-task-card-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'incoming-judge.js', 'commitment-title.js', 'day-words.js', 'meeting-confirm.js', 'teams-meeting.js', 'chat-reminder.js', 'chat-deadline-ask.js', 'chat-callback-ask.js', 'chat-payment-ask.js', 'chat-appointment-notice.js', 'chat-pickup-notice.js', 'chat-travel-notice.js', 'chat-delivery-window.js', 'chat-payment-claim.js', 'chat-invitation-notice.js', 'chat-self-note.js'];
const NOW = new Date('2026-10-20T10:00:00+03:00').getTime();

function world(opts) {
  const o = Object.assign({ switchOn: true, switchOwn: false, target: { ok: true, connectorId: 'googleTask' }, exec: null, undo: null, log: [] }, opts || {});
  const calls = [];
  const injected = [];
  const receipts = [];
  const logRows = o.log.slice();
  const nodes = {};
  const mkNode = (id) => {
    const n = {
      id, attrs: {}, children: [], style: {},
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; },
      appendChild(c) { this.children.push(c); c.parent = this; return c; },
      querySelector(sel) { return sel === '.flow-chip-host' ? (this.children.find((c) => c.isHost) || null) : null; }
    };
    return n;
  };
  const sandbox = {
    console,
    module: undefined,
    location: { origin: 'https://www.messenger.com', pathname: '/t/12345' },
    document: {
      body: { appendChild(n) { nodes[n.id] = n; return n; } },
      documentElement: { appendChild(n) { nodes[n.id] = n; return n; } },
      getElementById(id) { return nodes[id] || null; },
      createElement(tag) { return mkNode(tag); }
    },
    chrome: {
      runtime: {
        id: 'x',
        lastError: null,
        sendMessage(msg, cb) {
          calls.push(msg);
          let r = { ok: false };
          if (msg.type === 'flow:chat-task-target') r = o.target;
          else if ((msg.type === 'flow:execute-action' || msg.type === 'flow:google-write') && typeof o.exec === 'function') r = o.exec(msg);
          else if (msg.type === 'flow:execute-action' || msg.type === 'flow:google-write') r = o.exec || { ok: true, ref: { taskId: 'T1', externalId: 'T1' }, written: 'Task added.', url: 'https://tasks.example/T1', proof: { system: 'googleTasks', externalId: 'T1', fetchedBack: true } };
          else if (msg.type === 'flow:undo-action' || msg.type === 'flow:google-undo') r = o.undo || { ok: true, written: 'Task removed.' };
          Promise.resolve().then(() => cb(r));
        }
      },
      storage: { local: { async get() { return { glanceSwitches: Object.assign({}, o.switchOn ? { CHAT_TASK_CARD: true } : {}, o.switchOwn ? { CHAT_PROMISE_CARD: true } : {}) }; } } }
    },
    FlowStorage: {
      async get() { return { log: logRows.slice().reverse() }; },
      async appendLog(row) { logRows.push(row); }
    },
    FlowChipHost: {
      inject(mount, ctx, handlers) {
        const host = mkNode('host');
        host.isHost = true;
        host.remove = function () { const i = mount.children.indexOf(host); if (i >= 0) mount.children.splice(i, 1); };
        mount.appendChild(host);
        injected.push({ ctx, handlers, host });
        return host;
      },
      setChipState(chip, cls, text) { receipts.push({ state: cls, text }); },
      showDraftReceipt(host, r) { receipts.push({ receipt: r, host }); }
    }
  };
  vm.createContext(sandbox);
  for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sandbox, { filename: f });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'chat-task-card.js'), 'utf8'), sandbox, { filename: 'chat-task-card.js' });
  const Card = vm.runInContext('globalThis.FlowChatTaskCard', sandbox);
  return { Card, calls, injected, receipts, logRows, sandbox };
}

const ASKS = [
  ['Could you book the hall for next Monday?', 'en'],
  ['Can you review the draft by Wednesday?', 'en'],
  ['you promised to send the contract by Friday', 'en'],
  ['תעדכן אותי מחר בבוקר לגבי התשלום', 'he']
];
const QUIET = ['lol ok', 'Thanks, got it!', 'FYI the payment went out', 'hi', 'Unsubscribe from this newsletter to stop receiving these emails.'];

(async () => {
  const input = (text, extra) => Object.assign({ text, channel: 'messenger', oneToOne: true, group: false, fromMe: false, quoted: false, sender: { name: 'Dana' }, key: 'm1\n' + text, now: NOW }, extra || {});

  // 1. Switch off: nothing is drawn, nothing is asked of the worker.
  {
    const w = world({ switchOn: false });
    const r = await w.Card.offer(input(ASKS[0][0]));
    check('switch off: no card', !r.shown && r.reason === 'switch-off' && w.injected.length === 0);
    check('switch off: no worker call', w.calls.length === 0, w.calls);
  }

  // 2. Switch on: a task ask shows the canonical card with one live task step.
  for (const [text, lang] of ASKS) {
    const w = world();
    const r = await w.Card.offer(input(text));
    check('shows for: ' + text, r.shown && w.injected.length === 1, r);
    const ctx = w.injected[0] && w.injected[0].ctx;
    check('one live task step: ' + text, ctx && ctx.process.steps.length === 1 && ctx.process.steps[0].kind === 'googleTask', ctx && ctx.process);
    check('card language follows the message: ' + text, ctx && ctx.uiLang === lang, ctx && ctx.uiLang);
  }

  // 3. Quiet lines stay quiet, and a task ask in a group, from the person, or quoted is never offered.
  for (const text of QUIET) {
    const w = world();
    const r = await w.Card.offer(input(text));
    check('quiet: ' + text, !r.shown && w.injected.length === 0, r);
  }
  for (const [label, extra] of [['group', { group: true }], ['not one-to-one', { oneToOne: false }], ['from me', { fromMe: true }], ['forwarded or quoted', { quoted: true }]]) {
    const w = world();
    const r = await w.Card.offer(input(ASKS[0][0], extra));
    check('stays out: ' + label, !r.shown && w.injected.length === 0 && w.calls.length === 0, r);
  }

  // 4. No task app connected: no card (a Do It that cannot write is not offered).
  {
    const w = world({ target: { ok: false, reason: 'not-connected' } });
    const r = await w.Card.offer(input(ASKS[0][0]));
    check('not connected: no card', !r.shown && w.injected.length === 0, r);
  }
  {
    const w = world({ target: { ok: true, connectorId: 'outlookTask' } });
    await w.Card.offer(input(ASKS[0][0]));
    check('Microsoft only: the step is Microsoft To Do', w.injected[0] && w.injected[0].ctx.process.steps[0].kind === 'outlookTask');
  }

  // 5. Do It: the payload names the chat, never carries the message in the address; Handled only on a read-back by id.
  {
    const w = world();
    await w.Card.offer(input(ASKS[1][0], { channel: 'whatsapp' }));
    const it = w.injected[0];
    await it.handlers.onDoIt(it.host, {}, it.ctx);
    await new Promise((r) => setTimeout(r, 5));
    const exec = w.calls.find((c) => c.type === 'flow:google-write');
    check('Google: Do It writes through the same lane as the Gmail card (googleLaneTask)', !!exec && exec.connectorId === 'googleLaneTask', exec);
    check('the task note names the sender and the chat, never the message', !!exec && /Open in WhatsApp: https:\/\/www\.messenger\.com\/t\/12345$/m.test(exec.input.notes) && exec.input.notes.indexOf('review the draft') < 0 && exec.input.notes.indexOf('Wednesday') < 0, exec && exec.input);
    check('Handled with a written row carrying the proof', w.logRows.length === 1 && w.logRows[0].kind === 'written' && w.logRows[0].fetchedBack === true && w.logRows[0].ref.taskId === 'T1', w.logRows);
    check('the receipt offers Undo', w.receipts.some((x) => x.receipt && typeof x.receipt.onUndo === 'function'));
    // the receipt survives a reload (a new page world with the same log)
    const again = world({ log: w.logRows });
    const r2 = await again.Card.offer(input(ASKS[1][0], { channel: 'whatsapp' }));
    check('receipt remounts after a reload, no new offer', r2.shown && r2.reason === 'receipt' && again.receipts.some((x) => x.receipt));
    // Undo removes and reopens
    const undo = w.receipts.find((x) => x.receipt).receipt.onUndo;
    const u = await undo();
    check('Undo removes the task and reopens the card', u.ok === true && w.logRows[w.logRows.length - 1].kind === 'undone' && w.calls.some((c) => c.type === 'flow:google-undo' && c.connectorId === 'googleLaneTask'));
    const after = world({ log: w.logRows });
    const r3 = await after.Card.offer(input(ASKS[1][0], { channel: 'whatsapp' }));
    check('after Undo the ask is offered again', r3.shown && r3.reason === 'offered', r3);
  }
  {
    const w = world({ exec: { ok: true, ref: { taskId: 'T2' }, proof: { fetchedBack: false } } });
    await w.Card.offer(input(ASKS[0][0]));
    const it = w.injected[0];
    await it.handlers.onDoIt(it.host, {}, it.ctx);
    check('no read-back: never Handled', w.logRows.length === 0 && !w.receipts.some((x) => x.receipt), w.logRows);
  }
  {
    const w = world({ exec: { ok: false, reason: 'not-connected' } });
    await w.Card.offer(input(ASKS[0][0]));
    const it = w.injected[0];
    await it.handlers.onDoIt(it.host, {}, it.ctx);
    check('a failed write is not Handled', w.logRows.length === 0);
  }
  {
    const w = world({ undo: { ok: false, reason: 'user-edited', written: 'You edited this. Undo left it alone.' } });
    await w.Card.offer(input(ASKS[0][0]));
    const it = w.injected[0];
    await it.handlers.onDoIt(it.host, {}, it.ctx);
    const u = await w.receipts.find((x) => x.receipt).receipt.onUndo();
    check('Undo leaves an edited task alone', u.ok === false && u.reason === 'user-edited' && !w.logRows.some((r) => r.kind === 'undone'));
  }

  // 5b. Microsoft To Do goes through the Outlook writer, with its own read-back and its own Undo guard.
  {
    const w = world({ target: { ok: true, connectorId: 'outlookTask' }, exec: { ok: true, ref: { taskId: 'O1', externalId: 'O1' }, fetchedBack: true, written: 'Task added.' } });
    await w.Card.offer(input(ASKS[1][0], { channel: 'instagram' }));
    const it = w.injected[0];
    await it.handlers.onDoIt(it.host, {}, it.ctx);
    const exec = w.calls.find((c) => c.type === 'flow:execute-action');
    check('Microsoft: Do It writes through flow:execute-action outlookTask', !!exec && exec.payload.connectorId === 'outlookTask' && exec.payload.threadLabel === 'Open in Instagram' && w.logRows.length === 1, exec);
    check('Microsoft: the words of the chat message never travel into the task body (no text, no entities, no what)', !!exec && exec.payload.text === '' && exec.payload.bodyText === '' && exec.payload.entities === null && exec.payload.params.what === null && JSON.stringify(exec.payload).indexOf(ASKS[1][0]) < 0, exec && exec.payload);
    await w.receipts.find((x) => x.receipt).receipt.onUndo();
    check('Microsoft: Undo goes through flow:undo-action', w.calls.some((c) => c.type === 'flow:undo-action' && c.connectorId === 'outlookTask'));
  }

  // 5c. A proposed meeting is a hold on the person's own calendar, never an invitation.
  {
    const MEET = 'Could we meet Thursday at 3pm to go over the pilot?';
    const w = world({ target: { ok: true, connectorId: 'googleHold' } });
    const r = await w.Card.offer(input(MEET, { channel: 'messenger' }));
    check('a proposed meeting shows the card with one calendar step', r.shown && w.injected[0] && w.injected[0].ctx.process.steps.length === 1 && w.injected[0].ctx.process.steps[0].kind === 'calendar', r);
    const asked = w.calls.find((c) => c.type === 'flow:chat-task-target');
    check('the worker is asked for a calendar target', asked && asked.kind === 'calendar', asked);
    const it = w.injected[0];
    await it.handlers.onDoIt(it.host, {}, it.ctx);
    const exec = w.calls.find((c) => c.type === 'flow:google-write');
    check('Google: the hold goes through the Gmail card lane (googleHold) with day and clock', !!exec && exec.connectorId === 'googleHold' && exec.input.hour === 15 && exec.input.minute === 0 && /^\d{4}-\d{2}-\d{2}$/.test(exec.input.dateIso), exec && exec.input);
    check('the hold note names the chat, not the message', exec && /Open in Messenger: https:\/\/www\.messenger\.com\/t\/12345/.test(exec.input.quote) && exec.input.quote.indexOf('pilot') < 0 && !('attendees' in exec.input), exec && exec.input);
    check('the hold is Handled only with the read-back', w.logRows.length === 1 && w.logRows[0].fetchedBack === true);
    await w.receipts.find((x) => x.receipt).receipt.onUndo();
    check('Undo of a hold goes through flow:google-undo googleHold', w.calls.some((c) => c.type === 'flow:google-undo' && c.connectorId === 'googleHold'));
    const m = world({ target: { ok: true, connectorId: 'outlookCalendar' }, exec: { ok: true, ref: { eventId: 'E1', externalId: 'E1' }, fetchedBack: true, written: 'Calendar · hold' } });
    await m.Card.offer(input(MEET, { channel: 'whatsapp' }));
    const mi = m.injected[0];
    await mi.handlers.onDoIt(mi.host, {}, mi.ctx);
    const mx = m.calls.find((c) => c.type === 'flow:execute-action');
    check('Microsoft: the hold is an Outlook meeting write with no invitee field', !!mx && mx.payload.connectorId === 'outlookCalendar' && mx.payload.params.meeting === true && mx.payload.params.hour === 15 && mx.payload.threadUrl === 'https://www.messenger.com/t/12345', mx && mx.payload);
    const none = world({ target: { ok: false, reason: 'not-connected' } });
    check('no calendar connected: no card', !(await none.Card.offer(input(MEET))).shown);
  }

  // 5g. A call asked for in the chat travels to the worker as words, so Meet (Google) or Teams (Outlook) can add the link
  // behind their own switches; the card itself adds nothing and invites nobody.
  {
    for (const text of ['Can we do a Teams call Thursday at 3pm?', 'אפשר שיחת וידאו ביום חמישי ב-15:00?']) {
      const g = world({ target: { ok: true, connectorId: 'googleHold' } });
      await g.Card.offer(input(text, { channel: 'whatsapp' }));
      if (!g.injected[0]) { check('call proposal offers the hold: ' + text, false, 'reason'); continue; }
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('Google hold carries the call words for Meet: ' + text, !!ge && ge.input.params.callText === text && !('attendees' in ge.input), ge && ge.input);
      const o = world({ target: { ok: true, connectorId: 'outlookCalendar' }, exec: { ok: true, ref: { eventId: 'E2', externalId: 'E2' }, fetchedBack: true, written: 'Calendar · hold · Teams' } });
      await o.Card.offer(input(text, { channel: 'whatsapp' }));
      await o.injected[0].handlers.onDoIt(o.injected[0].host, {}, o.injected[0].ctx);
      const ox = o.calls.find((c) => c.type === 'flow:execute-action');
      check('Outlook hold carries the call words for Teams: ' + text, !!ox && ox.payload.params.meeting === true && ox.payload.params.callText === text, ox && ox.payload.params);
    }
    const t1 = world({ target: { ok: true, connectorId: 'googleHold' } });
    await t1.Card.offer(input('Can we do a Teams call Thursday at 3pm?', { channel: 'whatsapp' }));
    check('a call proposal is titled as a call, not with the message', /^Call(?: · .+)?$/.test(t1.injected[0].ctx.process.steps[0].params.title), t1.injected[0].ctx.process.steps[0].params);
    for (const quiet of ['Can we do a Zoom call Thursday at 3pm?', 'Maybe a video call sometime Thursday at 3pm?', 'No need for a Teams call Thursday at 3pm', 'Can we do a video call Thursday at 3pm or Friday at 4pm?', 'אפשר שיחת וידאו מתישהו ביום חמישי ב-15:00?']) {
      const q = world({ target: { ok: true, connectorId: 'googleHold' } });
      const qr = await q.Card.offer(input(quiet, { channel: 'whatsapp' }));
      check('no call hold for: ' + quiet, !qr.shown && q.injected.length === 0, qr);
    }
  }

  // 5h. A reminder someone asks of the person ("Don't forget to bring the form on Monday") is a task the shared judge leaves quiet.
  {
    for (const [text, titleRe] of [["Don't forget to bring the signed form on Monday", /signed form/], ['אל תשכח להביא את הטופס החתום ביום שני', /הטופס/]]) {
      const g = world({ target: { ok: true, connectorId: 'googleTask' } });
      const r = await g.Card.offer(input(text, { channel: 'whatsapp' }));
      check('reminder offers one task step: ' + text, r.shown && g.injected[0].ctx.process.steps.length === 1 && g.injected[0].ctx.process.steps[0].kind === 'googleTask', r);
      if (!g.injected[0]) continue;
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('the task is the thing, due that day, noting the chat only: ' + text, !!ge && ge.connectorId === 'googleLaneTask' && titleRe.test(ge.input.title) && /^\d{4}-\d{2}-\d{2}$/.test(ge.input.dueIso) && /Open in WhatsApp/.test(ge.input.notes), ge && ge.input);
    }
    for (const quiet of ["Don't forget to bring the form", 'Remember to call on 2025-01-02', 'I forgot to send it on Monday']) {
      const q = world({ target: { ok: true, connectorId: 'googleTask' } });
      check('no reminder card for: ' + quiet, !(await q.Card.offer(input(quiet, { channel: 'whatsapp' }))).shown && q.injected.length === 0);
    }
    const own = world({ target: { ok: true, connectorId: 'googleTask' } });
    check("the person's own reminder to someone is not offered here", !(await own.Card.offer(input("Don't forget to bring the signed form on Monday", { channel: 'whatsapp', fromMe: true, own: true }))).shown);
  }

  // 5i. A deadline asked without a question ("Need the report by Wednesday") is a task the shared judge leaves quiet.
  {
    for (const [text, titleRe] of [['Need the signed contract by Wednesday', /contract/i], ['תחתום על החוזה עד יום שישי', /החוזה/]]) {
      const g = world({ target: { ok: true, connectorId: 'googleTask' } });
      const r = await g.Card.offer(input(text, { channel: 'messenger' }));
      check('deadline ask offers one task step: ' + text, r.shown && g.injected[0].ctx.process.steps.length === 1 && g.injected[0].ctx.process.steps[0].kind === 'googleTask', r);
      if (!g.injected[0]) continue;
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('the task is the thing, due that day: ' + text, !!ge && titleRe.test(ge.input.title) && /^\d{4}-\d{2}-\d{2}$/.test(ge.input.dueIso) && /Open in Messenger/.test(ge.input.notes), ge && ge.input);
    }
    for (const quiet of ['Need the report', 'Maybe sign the lease by Monday', 'I need the report by 2025-01-02']) {
      const q = world({ target: { ok: true, connectorId: 'googleTask' } });
      check('no deadline card for: ' + quiet, !(await q.Card.offer(input(quiet, { channel: 'messenger' }))).shown && q.injected.length === 0);
    }
  }

  // 5j. "Please call me back tomorrow" is a task to call the sender, due that day; the call itself stays the person's.
  {
    for (const [text, titleRe] of [['Please call me back tomorrow', /^Call back · /], ['תתקשר אליי מחר', /^להתקשר · /]]) {
      const g = world({ target: { ok: true, connectorId: 'googleTask' } });
      const r = await g.Card.offer(input(text, { channel: 'whatsapp' }));
      check('callback ask offers one task step: ' + text, r.shown && g.injected[0].ctx.process.steps.length === 1, r);
      if (!g.injected[0]) continue;
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('the task is the call with the sender, due that day: ' + text, !!ge && titleRe.test(ge.input.title) && /^\d{4}-\d{2}-\d{2}$/.test(ge.input.dueIso) && ge.input.notes.indexOf(text) < 0, ge && ge.input);
    }
    for (const quiet of ['Call me', "Don't call me tomorrow", 'Maybe call me Thursday']) {
      const q = world({ target: { ok: true, connectorId: 'googleTask' } });
      check('no callback card for: ' + quiet, !(await q.Card.offer(input(quiet, { channel: 'whatsapp' }))).shown && q.injected.length === 0);
    }
  }

  // 5k. A payment asked of the person ("Please transfer 500 NIS by Sunday") is a task to pay, with amount and day; nothing is paid.
  {
    for (const [text, titleRe] of [['Please transfer 500 NIS to my account by Sunday', /^Pay 500 NIS · /], ['תעביר לי 500 שקל עד יום ראשון', /^לשלם 500 NIS · /]]) {
      const g = world({ target: { ok: true, connectorId: 'googleTask' } });
      const r = await g.Card.offer(input(text, { channel: 'whatsapp' }));
      check('payment ask offers one task step: ' + text, r.shown && g.injected[0].ctx.process.steps.length === 1, r);
      if (!g.injected[0]) continue;
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('the task is the payment, due that day, without the message: ' + text, !!ge && titleRe.test(ge.input.title) && /^\d{4}-\d{2}-\d{2}$/.test(ge.input.dueIso) && ge.input.notes.indexOf('account') < 0, ge && ge.input);
    }
    for (const quiet of ['Please transfer the money by Sunday', 'Please transfer 500 NIS', 'I already paid 500 NIS on Sunday']) {
      const q = world({ target: { ok: true, connectorId: 'googleTask' } });
      check('no payment card for: ' + quiet, !(await q.Card.offer(input(quiet, { channel: 'whatsapp' }))).shown && q.injected.length === 0);
    }
  }

  // 5l. What the sender promised the person is logged to follow up on ("Waiting on Dana: ..."), not worded as the person's own to-do.
  {
    for (const [text, titleRe] of [["I'll send you the contract on Sunday", /^Waiting on Dana: Send the contract on Sunday$/], ['אשלח לך את החוזה ביום ראשון', /^מחכים ל-Dana: לשלוח את החוזה ביום ראשון$/]]) {
      const g = world({ target: { ok: true, connectorId: 'googleTask' } });
      const r = await g.Card.offer(input(text, { channel: 'whatsapp' }));
      check('sender promise is offered: ' + text, r.shown, r);
      if (!g.injected[0]) continue;
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('the task waits on the sender, due the promised day: ' + text, !!ge && titleRe.test(ge.input.title) && /^\d{4}-\d{2}-\d{2}$/.test(ge.input.dueIso), ge && ge.input);
    }
    const vague = world({ target: { ok: true, connectorId: 'googleTask' } });
    const vr = await vague.Card.offer(input("I'll call you tomorrow", { channel: 'whatsapp' }));
    check('a promise with no nameable thing keeps the generic log title', !vr.shown || !/^Waiting on/.test(vague.injected[0].ctx.process.steps[0].params.title), vr);
  }

  // 5m. An appointment confirmed to the person is a hold titled "Appointment · name"; nobody is invited, nothing is sent.
  {
    for (const [text, titleRe] of [['Your appointment is confirmed for Sunday at 10:00', /^Appointment · Dana$/], ['התור שלך נקבע ליום ראשון בשעה 10:00', /^תור · Dana$/]]) {
      const g = world({ target: { ok: true, connectorId: 'googleHold' } });
      const r = await g.Card.offer(input(text, { channel: 'whatsapp' }));
      check('appointment offers one calendar step: ' + text, r.shown && g.injected[0].ctx.process.steps.length === 1 && g.injected[0].ctx.process.steps[0].kind === 'calendar', r);
      if (!g.injected[0]) continue;
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('the hold is the appointment at 10:00, no guest, note names the chat only: ' + text, !!ge && ge.connectorId === 'googleHold' && titleRe.test(ge.input.title) && ge.input.hour === 10 && !('attendees' in ge.input) && ge.input.quote.indexOf('confirmed') < 0, ge && ge.input);
    }
    for (const quiet of ['Your appointment is confirmed for Sunday', 'Your appointment has been cancelled, it was Sunday at 10:00', 'Available slots: Sunday at 10:00 or Monday at 11:00. Click to choose']) {
      const q = world({ target: { ok: true, connectorId: 'googleHold' } });
      check('no appointment card for: ' + quiet, !(await q.Card.offer(input(quiet, { channel: 'whatsapp' }))).shown && q.injected.length === 0);
    }
  }

  // 5n. A pickup with a last day ("Your order is ready for pickup until Friday") is a task due that day; a delivery that arrives by itself is not.
  {
    for (const [text, titleRe] of [['Your order is ready for pickup until Friday', /^Pick up the order · Dana$/], ['ההזמנה שלך מוכנה לאיסוף עד יום חמישי', /^לאסוף הזמנה · Dana$/]]) {
      const g = world({ target: { ok: true, connectorId: 'googleTask' } });
      const r = await g.Card.offer(input(text, { channel: 'whatsapp' }));
      check('pickup offers one task step: ' + text, r.shown && g.injected[0].ctx.process.steps.length === 1, r);
      if (!g.injected[0]) continue;
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('the task is the pickup, due the last day: ' + text, !!ge && titleRe.test(ge.input.title) && /^\d{4}-\d{2}-\d{2}$/.test(ge.input.dueIso), ge && ge.input);
    }
    for (const quiet of ['Your package will arrive on Monday', 'Your order is ready for pickup', 'Your order was picked up yesterday']) {
      const q = world({ target: { ok: true, connectorId: 'googleTask' } });
      check('no pickup card for: ' + quiet, !(await q.Card.offer(input(quiet, { channel: 'whatsapp' }))).shown && q.injected.length === 0);
    }
  }

  // 5o. An invitation sent to the person is a hold titled "Invitation · name"; accepting or declining stays theirs, nobody is invited.
  {
    for (const [text, titleRe, hour] of [["You're invited to my birthday on Saturday at 8pm", /^Invitation · Dana$/, 20], ['מוזמן ליום ההולדת שלי ביום שישי ב-20:00', /^הזמנה · Dana$/, 20]]) {
      const g = world({ target: { ok: true, connectorId: 'googleHold' } });
      const r = await g.Card.offer(input(text, { channel: 'whatsapp' }));
      check('invitation offers one calendar step: ' + text, r.shown && g.injected[0].ctx.process.steps.length === 1 && g.injected[0].ctx.process.steps[0].kind === 'calendar', r);
      if (!g.injected[0]) continue;
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('the hold is the invitation, no guest, no message text: ' + text, !!ge && titleRe.test(ge.input.title) && ge.input.hour === hour && !('attendees' in ge.input) && ge.input.quote.indexOf('birthday') < 0, ge && ge.input);
    }
    for (const quiet of ["You're invited to my birthday on Saturday", 'Join our webinar on Thursday at 19:00, register now', 'Thank you for the invitation to the party on Saturday at 8pm']) {
      const q = world({ target: { ok: true, connectorId: 'googleHold' } });
      check('no invitation card for: ' + quiet, !(await q.Card.offer(input(quiet, { channel: 'whatsapp' }))).shown && q.injected.length === 0);
    }
  }

  // 5p. A reminder the person writes to themselves ("Remind me tomorrow to pay the bill") is a task titled with the thing, on the own switch.
  {
    const mine = (text) => input(text, { fromMe: true, own: true, sender: { name: 'Dana' } });
    const off = world({ switchOn: true, switchOwn: false });
    check('self note: CHAT_PROMISE_CARD off shows nothing', !(await off.Card.offer(mine('Remind me tomorrow to pay the electricity bill'))).shown);
    for (const [text, titleRe] of [['Remind me tomorrow to pay the electricity bill', /^Pay the electricity bill$/], ['תזכיר לי מחר לשלם חשבון חשמל', /^לשלם חשבון חשמל$/]]) {
      const w = world({ switchOn: false, switchOwn: true });
      const r = await w.Card.offer(mine(text));
      check('self note offers one task: ' + text, r.shown && w.injected[0].ctx.process.steps.length === 1, r);
      if (!w.injected[0]) continue;
      await w.injected[0].handlers.onDoIt(w.injected[0].host, {}, w.injected[0].ctx);
      const ge = w.calls.find((c) => c.type === 'flow:google-write');
      check('the task is the thing itself, due that day, with no name of the other person: ' + text, !!ge && titleRe.test(ge.input.title) && /^\d{4}-\d{2}-\d{2}$/.test(ge.input.dueIso) && ge.input.notes.indexOf('Dana') < 0, ge && ge.input);
    }
    for (const quiet of ['Remind me to pay the bill', 'Maybe remind me tomorrow to pay the bill']) {
      const q = world({ switchOn: false, switchOwn: true });
      check('no self note card for: ' + quiet, !(await q.Card.offer(mine(quiet))).shown);
    }
    const inbound = world({ switchOn: true, switchOwn: true });
    check('an inbound "remind me" is not read as a self note', !(await inbound.Card.offer(input('Remind me tomorrow to pay the electricity bill', { channel: 'whatsapp' }))).shown && inbound.injected.length === 0);
  }

  // 5q. The Outlook meeting write answers with ref.eventId (no externalId): that is still a proved write, so the card must reach Handled.
  {
    const m = world({ target: { ok: true, connectorId: 'outlookCalendar' }, exec: { ok: true, fetchedBack: true, written: 'Calendar · Meeting · Thu 15:00', ref: { eventId: 'AAMk-1', created: { subject: 'Meeting' }, contentHash: 'h1' } } });
    await m.Card.offer(input('Could we meet Thursday at 3pm?', { channel: 'whatsapp' }));
    await m.injected[0].handlers.onDoIt(m.injected[0].host, {}, m.injected[0].ctx);
    check('an Outlook hold whose ref carries only eventId is Handled with the read-back', m.logRows.length === 1 && m.logRows[0].fetchedBack === true && m.logRows[0].ref.eventId === 'AAMk-1', m.logRows);
    const bad = world({ target: { ok: true, connectorId: 'outlookCalendar' }, exec: { ok: true, written: 'Calendar', ref: { eventId: 'AAMk-2' } } });
    await bad.Card.offer(input('Could we meet Thursday at 3pm?', { channel: 'whatsapp' }));
    await bad.injected[0].handlers.onDoIt(bad.injected[0].host, {}, bad.injected[0].ctx);
    check('without the read-back it is still not Handled', bad.logRows.length === 0);
  }

  // 5r. A trip told to the person ("Your flight departs Sunday at 06:30") is a hold titled "Trip · name"; nobody is invited.
  {
    for (const [text, titleRe, hour] of [['Your flight LY001 departs Sunday at 06:30', /^Trip · Dana$/, 6], ['הטיסה שלך ממריאה ביום ראשון ב-06:30', /^נסיעה · Dana$/, 6]]) {
      const g = world({ target: { ok: true, connectorId: 'googleHold' } });
      const r = await g.Card.offer(input(text, { channel: 'whatsapp' }));
      check('trip offers one calendar step: ' + text, r.shown && g.injected[0].ctx.process.steps.length === 1 && g.injected[0].ctx.process.steps[0].kind === 'calendar', r);
      if (!g.injected[0]) continue;
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('the hold is the trip at 06:30, no guest: ' + text, !!ge && titleRe.test(ge.input.title) && ge.input.hour === hour && ge.input.minute === 30 && !('attendees' in ge.input), ge && ge.input);
    }
    for (const quiet of ['Your flight was cancelled, it departed Sunday at 06:30', 'Flight deals departing Sunday at 06:30 - book now']) {
      const q = world({ target: { ok: true, connectorId: 'googleHold' } });
      check('no trip card for: ' + quiet, !(await q.Card.offer(input(quiet, { channel: 'whatsapp' }))).shown && q.injected.length === 0);
    }
  }

  // 5s. The same hold is not made twice: a reminder for an appointment already on the calendar from this chat is not offered again.
  {
    const w = world({ target: { ok: true, connectorId: 'googleHold' } });
    await w.Card.offer(input('Your appointment is confirmed for Sunday at 10:00', { channel: 'whatsapp', key: 'm-1' }));
    await w.injected[0].handlers.onDoIt(w.injected[0].host, {}, w.injected[0].ctx);
    check('the first confirmation makes one hold', w.logRows.length === 1);
    const shownBefore = w.injected.length;
    const again = await w.Card.offer(input('Reminder: your appointment is on Sunday at 10:00', { channel: 'whatsapp', key: 'm-2' }));
    check('a reminder for the same appointment in the same chat is not offered again', !again.shown && again.reason === 'already-on-calendar' && w.injected.length === shownBefore, again);
    const other = await w.Card.offer(input('Your appointment is confirmed for Sunday at 11:00', { channel: 'whatsapp', key: 'm-3' }));
    check('another time in the same chat is a different hold and is offered', other.shown, other);
    await w.receipts.find((x) => x.receipt).receipt.onUndo();
    const afterUndo = await w.Card.offer(input('Reminder: your appointment is on Sunday at 10:00', { channel: 'whatsapp', key: 'm-4' }));
    check('after the hold was undone the same time is offered again', afterUndo.shown, afterUndo);
  }

  // 5t. The same task is not made twice either: a payment ask repeated in the same chat while the first task stands is not offered again.
  {
    const w = world({ target: { ok: true, connectorId: 'googleTask' } });
    await w.Card.offer(input('Please transfer 500 NIS to my account by Sunday', { channel: 'whatsapp', key: 'm-1' }));
    await w.injected[0].handlers.onDoIt(w.injected[0].host, {}, w.injected[0].ctx);
    check('the first payment ask makes one task', w.logRows.length === 1 && !!w.logRows[0].heldKey, w.logRows[0]);
    const shownBefore = w.injected.length;
    const again = await w.Card.offer(input('Reminder: please transfer 500 NIS to my account by Sunday', { channel: 'whatsapp', key: 'm-2' }));
    check('the same payment in the same chat is not offered again', !again.shown && again.reason === 'already-on-task-list' && w.injected.length === shownBefore, again);
    const other = await w.Card.offer(input('Please transfer 900 NIS to my account by Sunday', { channel: 'whatsapp', key: 'm-3' }));
    check('another amount is a different task and is offered', other.shown, other);
    await w.receipts.find((x) => x.receipt).receipt.onUndo();
    const afterUndo = await w.Card.offer(input('Reminder: please transfer 500 NIS to my account by Sunday', { channel: 'whatsapp', key: 'm-4' }));
    check('after the task was undone the same payment is offered again', afterUndo.shown, afterUndo);
  }

  // 5u. A deadline asked and then nudged ("Reminder: please send it by Monday") is one task, not two; a look back is nothing.
  {
    const w = world({ target: { ok: true, connectorId: 'googleTask' } });
    await w.Card.offer(input('Please send the signed form by Monday', { channel: 'whatsapp', key: 'd-1' }));
    check('the deadline ask is offered', w.injected.length === 1);
    await w.injected[0].handlers.onDoIt(w.injected[0].host, {}, w.injected[0].ctx);
    const again = await w.Card.offer(input('Reminder: please send the signed form by Monday', { channel: 'whatsapp', key: 'd-2' }));
    check('the nudged deadline ask is the same task and is not offered again', !again.shown && again.reason === 'already-on-task-list', again);
    const q = world({ target: { ok: true, connectorId: 'googleTask' } });
    check('a Reminder look back offers nothing', !(await q.Card.offer(input('Reminder: the form was due Monday', { channel: 'whatsapp' }))).shown);
  }

  // 5v. A booking that was moved is the same booking at a new day and clock: the new time is offered as its own hold.
  {
    const w = world({ target: { ok: true, connectorId: 'googleHold' } });
    await w.Card.offer(input('Your appointment is confirmed for Sunday at 10:00', { channel: 'whatsapp', key: 'mv-1' }));
    await w.injected[0].handlers.onDoIt(w.injected[0].host, {}, w.injected[0].ctx);
    const moved = await w.Card.offer(input('Your appointment has been moved to Monday at 11:00', { channel: 'whatsapp', key: 'mv-2' }));
    const st = moved.shown && w.injected[w.injected.length - 1].ctx.process.steps[0].params;
    check('the moved appointment is offered at the new day and clock', !!st && st.dateIso === '2026-10-26' && st.hour === 11 && st.minute === 0, st || moved);
    const he = world({ target: { ok: true, connectorId: 'googleHold' } });
    check('Hebrew moved appointment is offered', (await he.Card.offer(input('התור שלך הועבר ליום שני בשעה 11:00', { channel: 'whatsapp' }))).shown);
    const c = world({ target: { ok: true, connectorId: 'googleHold' } });
    check('a cancelled appointment offers nothing', !(await c.Card.offer(input('Your appointment on Sunday at 10:00 was cancelled', { channel: 'whatsapp' }))).shown);
  }

  // 5w. A trip told as delayed with its new time is offered at the new time; a delay with no new time offers nothing.
  {
    const w = world({ target: { ok: true, connectorId: 'googleHold' } });
    const r = await w.Card.offer(input('Your flight LY001 has been delayed, it now departs Sunday at 07:15', { channel: 'whatsapp' }));
    const st = r.shown && w.injected[0].ctx.process.steps[0].params;
    check('the delayed flight is offered at its new time', !!st && st.hour === 7 && st.minute === 15, st || r);
    const q = world({ target: { ok: true, connectorId: 'googleHold' } });
    check('a delay with no new time offers nothing', !(await q.Card.offer(input('Your flight LY001 has been delayed', { channel: 'whatsapp' }))).shown);
  }

  // 5x. A pickup whose last day was moved is offered as a task due the new day; a delivery moved is nothing to pick up.
  {
    const w = world({ target: { ok: true, connectorId: 'googleTask' } });
    const r = await w.Card.offer(input('Your order pickup has been extended to Thursday', { channel: 'whatsapp' }));
    const st = r.shown && w.injected[0].ctx.process.steps[0].params;
    check('the extended pickup is offered with the new last day', !!st && /^\d{4}-\d{2}-\d{2}$/.test(st.dateIso) && /pick up/i.test(st.title), st || r);
    const q = world({ target: { ok: true, connectorId: 'googleTask' } });
    check('a moved delivery offers nothing', !(await q.Card.offer(input('Your order delivery was moved to Thursday', { channel: 'whatsapp' }))).shown);
  }

  // 5y. A cancellation of a booking this chat already put on the calendar offers to remove that event; with no hold there is nothing to do.
  {
    const w = world({ target: { ok: true, connectorId: 'googleHold' } });
    await w.Card.offer(input('Your appointment is confirmed for Monday at 11:00', { channel: 'whatsapp', key: 'c-1' }));
    await w.injected[0].handlers.onDoIt(w.injected[0].host, {}, w.injected[0].ctx);
    check('the confirmation makes one hold', w.logRows.length === 1);
    const r = await w.Card.offer(input('Your appointment on Monday at 11:00 was cancelled', { channel: 'whatsapp', key: 'c-2' }));
    const last = w.injected[w.injected.length - 1];
    check('the cancellation offers to remove the hold', r.shown && r.reason === 'remove-offered' && !!last.ctx.chatTask.remove, r);
    check('the removal card shows no message words', last.ctx.bodyText === '' && !/cancelled$/i.test(JSON.stringify(last.ctx.process)), last.ctx.process);
    const callsBefore = w.calls.length;
    await last.handlers.onDoIt(last.host, {}, last.ctx);
    const undo = w.calls.slice(callsBefore).find((c) => c.type === 'flow:google-undo');
    check('Do It runs the hold undo with the held ref', !!undo && undo.connectorId === 'googleHold' && !!undo.ref, undo);
    check('the removal is logged as undone', w.logRows[w.logRows.length - 1].kind === 'undone' && w.logRows[w.logRows.length - 1].chatKey === w.logRows[0].chatKey, w.logRows[w.logRows.length - 1]);
    const again = await w.Card.offer(input('Your appointment on Monday at 11:00 was cancelled', { channel: 'whatsapp', key: 'c-3' }));
    check('once removed, a second cancellation offers nothing', !again.shown && again.reason === 'no-hold-to-remove', again);

    const none = world({ target: { ok: true, connectorId: 'googleHold' } });
    const n = await none.Card.offer(input('Your appointment on Monday at 11:00 was cancelled', { channel: 'whatsapp', key: 'c-4' }));
    check('a cancellation with no hold offers nothing', !n.shown && n.reason === 'no-hold-to-remove', n);

    const ed = world({ target: { ok: true, connectorId: 'googleHold' }, undo: { ok: false, reason: 'user-edited' } });
    await ed.Card.offer(input('Your appointment is confirmed for Monday at 11:00', { channel: 'whatsapp', key: 'e-1' }));
    await ed.injected[0].handlers.onDoIt(ed.injected[0].host, {}, ed.injected[0].ctx);
    await ed.Card.offer(input('Your appointment on Monday at 11:00 was cancelled', { channel: 'whatsapp', key: 'e-2' }));
    const lastEd = ed.injected[ed.injected.length - 1];
    await lastEd.handlers.onDoIt(lastEd.host, {}, lastEd.ctx);
    check('an event the person edited is left alone and says so', ed.receipts.some((x) => x.state === 'flow-chip-error' && /changed this event/.test(x.text)) && ed.logRows.every((r) => r.kind !== 'undone'), ed.receipts);

    const he = world({ target: { ok: true, connectorId: 'googleHold' } });
    await he.Card.offer(input('התור שלך נקבע ליום שני בשעה 11:00', { channel: 'whatsapp', key: 'h-1' }));
    await he.injected[0].handlers.onDoIt(he.injected[0].host, {}, he.injected[0].ctx);
    const hr = await he.Card.offer(input('התור שלך ביום שני ב-11:00 בוטל', { channel: 'whatsapp', key: 'h-2' }));
    check('Hebrew cancellation offers the removal', hr.shown && hr.reason === 'remove-offered', hr);
  }

  // 5z. An invitation that was moved is offered at the new day and clock; a cancelled one offers nothing.
  {
    const w = world({ target: { ok: true, connectorId: 'googleHold' } });
    const r = await w.Card.offer(input('The launch party you were invited to has been moved to Monday at 20:00', { channel: 'whatsapp' }));
    const st = r.shown && w.injected[0].ctx.process.steps[0].params;
    check('the moved invitation is offered at its new time', !!st && st.hour === 20 && st.minute === 0, st || r);
    const q = world({ target: { ok: true, connectorId: 'googleHold' } });
    check('a cancelled invitation offers nothing', !(await q.Card.offer(input('The party you were invited to was cancelled', { channel: 'whatsapp' }))).shown);
  }

  // 5aa. A cancelled trip and a cancelled invitation take the hold made from this chat off the calendar too.
  {
    for (const [made, gone, label] of [
      ['Your flight LY001 departs Monday at 06:30', 'Your flight LY001 departing Monday at 06:30 was cancelled', 'trip'],
      ['You are invited to our launch party on Monday at 19:00', 'The launch party on Monday at 19:00 has been cancelled', 'invitation'],
      ['הטיסה שלך ממריאה ביום שני ב-06:30', 'הטיסה שלך ביום שני ב-06:30 בוטלה', 'Hebrew trip']
    ]) {
      const w = world({ target: { ok: true, connectorId: 'googleHold' } });
      await w.Card.offer(input(made, { channel: 'whatsapp', key: label + '-1' }));
      await w.injected[0].handlers.onDoIt(w.injected[0].host, {}, w.injected[0].ctx);
      const r = await w.Card.offer(input(gone, { channel: 'whatsapp', key: label + '-2' }));
      const last = w.injected[w.injected.length - 1];
      check('the cancelled ' + label + ' offers the removal', r.shown && r.reason === 'remove-offered' && !!last.ctx.chatTask.remove, r);
      await last.handlers.onDoIt(last.host, {}, last.ctx);
      check('the ' + label + ' hold was undone', w.logRows[w.logRows.length - 1].kind === 'undone', w.logRows[w.logRows.length - 1]);
    }
    const none = world({ target: { ok: true, connectorId: 'googleHold' } });
    check('a cancelled flight with no hold offers nothing', !(await none.Card.offer(input('Your flight LY001 departing Monday at 06:30 was cancelled', { channel: 'whatsapp' }))).shown);
  }

  // 5ab. A delivery window told to the person is a hold at the start of the window titled "Delivery 14:00–18:00 · name"; nobody is invited.
  {
    for (const [text, titleRe, hour] of [['Your package will be delivered tomorrow between 14:00 and 18:00', /^Delivery 14:00–18:00 · Dana$/, 14], ['השליח יגיע מחר בין 10:00 ל-12:00', /^משלוח 10:00–12:00 · Dana$/, 10], ['Your order will arrive tomorrow at 15:30', /^Delivery · Dana$/, 15]]) {
      const g = world({ target: { ok: true, connectorId: 'googleHold' } });
      const r = await g.Card.offer(input(text, { channel: 'whatsapp' }));
      check('delivery offers one calendar step: ' + text, r.shown && g.injected[0].ctx.process.steps.length === 1 && g.injected[0].ctx.process.steps[0].kind === 'calendar', r);
      if (!g.injected[0]) continue;
      await g.injected[0].handlers.onDoIt(g.injected[0].host, {}, g.injected[0].ctx);
      const ge = g.calls.find((c) => c.type === 'flow:google-write');
      check('the hold is the delivery at the start of the window, no guest, no message words: ' + text, !!ge && titleRe.test(ge.input.title) && ge.input.hour === hour && !('attendees' in ge.input) && (ge.input.title + ' ' + ge.input.quote).indexOf('package') < 0, ge && ge.input);
    }
    for (const quiet of ['Your package was delivered yesterday at 14:00', 'The courier will arrive tomorrow between 4 and 6', 'Your order is ready for pickup tomorrow between 14:00 and 18:00']) {
      const q = world({ target: { ok: true, connectorId: 'googleHold' } });
      check('no delivery card for: ' + quiet, !(await q.Card.offer(input(quiet, { channel: 'whatsapp' }))).shown || q.injected[0].ctx.process.steps[0].params.title !== 'Delivery');
    }
  }

  // 5ae. The other side says they paid while this chat has a "Waiting on ...: Payment" task: the card offers to mark that task done.
  {
    const proof = { system: 'google/tasks', externalId: 'T1', fetchedBack: true, verifiedAt: '2026-10-25T10:00:00.000Z' };
    const execOf = (calls) => (msg) => {
      calls.push(msg);
      if (msg.connectorId === 'googleTaskClose') return { ok: true, written: 'Google Task done · Waiting on Dana: Payment 500 NIS', where: 'Google Tasks', ref: { taskListId: 'L1', taskId: 'T1', externalId: 'T1', contentHash: 'h2', closedByGlance: true }, proof: { system: 'google/tasks-close', externalId: 'T1', fetchedBack: true, verifiedAt: '2026-10-25T10:00:00.000Z' } };
      return { ok: true, written: 'Task', where: 'Google Tasks', ref: { taskListId: 'L1', taskId: 'T1', externalId: 'T1', contentHash: 'h1' }, proof: proof };
    };
    const mine = (text, extra) => input(text, Object.assign({ fromMe: true, own: true, sender: { name: 'Dana' } }, extra || {}));
    const make = async (w) => {
      await w.Card.offer(mine('Please transfer 500 NIS to my account by Sunday', { key: 'pw-1' }));
      await w.injected[0].handlers.onDoIt(w.injected[0].host, {}, w.injected[0].ctx);
    };
    {
      const sent = [];
      const w = world({ switchOn: true, switchOwn: true, target: { ok: true, connectorId: 'googleTask' }, exec: execOf(sent) });
      await make(w);
      check('the waiting payment task is written first', w.logRows.length === 1 && /payment 500 nis$/.test(w.logRows[0].heldKey), w.logRows);
      const r = await w.Card.offer(input('I transferred 500 NIS', { key: 'pw-2' }));
      const last = w.injected[w.injected.length - 1];
      check('the claim offers to mark the task done', r.shown && r.reason === 'close-offered' && !!last.ctx.chatTask.close && last.ctx.bodyText === '', r);
      await last.handlers.onDoIt(last.host, {}, last.ctx);
      const closeCall = sent.find((m) => m.connectorId === 'googleTaskClose');
      check('Do It closes the held task by its ids and content hash, nothing else', !!closeCall && closeCall.input.taskId === 'T1' && closeCall.input.taskListId === 'L1' && closeCall.input.contentHash === 'h1' && Object.keys(closeCall.input).length === 3, closeCall);
      const closeRow = w.logRows[w.logRows.length - 1];
      check('the close is logged as written with the task it closes', closeRow.kind === 'written' && closeRow.connectorId === 'googleTaskClose' && closeRow.closes === w.logRows[0].chatKey && closeRow.fetchedBack === true, closeRow);
      const again = await w.Card.offer(input('העברתי לך 500 ש"ח', { key: 'pw-3' }));
      check('once closed, a second claim offers nothing', !again.shown, again);
      await w.receipts.filter((x) => x.receipt).pop().receipt.onUndo();
      check('Undo of the close goes through the lane undo of googleTaskClose', w.calls.some((c) => c.type === 'flow:google-undo' && c.connectorId === 'googleTaskClose'), w.calls.map((c) => c.type + ':' + c.connectorId));
      const after = await w.Card.offer(input('I transferred 500 NIS', { key: 'pw-4' }));
      check('after Undo the task is open again and the claim is offered again', after.shown && after.reason === 'close-offered', after);
    }
    for (const [text, why] of [['I transferred 900 NIS', 'another amount'], ['I will pay tomorrow', 'a promise'], ['Did you get the 500 NIS?', 'a question'], ['I paid for the pizza', 'something else']]) {
      const w = world({ switchOn: true, switchOwn: true, target: { ok: true, connectorId: 'googleTask' }, exec: execOf([]) });
      await make(w);
      const before = w.injected.length;
      const r = await w.Card.offer(input(text, { key: 'q-1' }));
      check('no close card for ' + why + ': ' + text, !(r.shown && r.reason === 'close-offered') && w.injected.length === before + (r.shown ? 1 : 0), r);
    }
    {
      // A person on Microsoft only: the waiting task is a To Do task and the close goes through the worker, with the snapshot Glance took.
      const sent = [];
      const snap = { title: 'Waiting on Dana: Payment 500 NIS', status: 'notStarted' };
      const exec = (msg) => {
        sent.push(msg);
        if (msg.payload && msg.payload.connectorId === 'outlookTaskClose') return { ok: true, fetchedBack: true, written: 'To Do task done · Waiting on Dana: Payment 500 NIS', where: 'Microsoft To Do', ref: { taskListId: 'ML1', taskId: 'MT1', externalId: 'MT1', closed: { title: snap.title, status: 'completed' }, closedByGlance: true }, proof: { system: 'microsoft/todo', externalId: 'MT1', fetchedBack: true, verifiedAt: '2026-10-25T10:00:00.000Z' } };
        return { ok: true, fetchedBack: true, written: 'To Do task', where: 'Microsoft To Do', ref: { taskListId: 'ML1', taskId: 'MT1', externalId: 'MT1', created: snap }, proof: { system: 'microsoft/todo', externalId: 'MT1', fetchedBack: true, verifiedAt: '2026-10-25T10:00:00.000Z' } };
      };
      const w = world({ switchOn: true, switchOwn: true, target: { ok: true, connectorId: 'outlookTask' }, exec: exec });
      await make(w);
      const r = await w.Card.offer(input('I transferred 500 NIS', { key: 'o-2' }));
      const last = w.injected[w.injected.length - 1];
      check('a claim offers the close for a To Do task too', r.shown && r.reason === 'close-offered' && last.ctx.chatTask.connectorId === 'outlookTaskClose', r);
      await last.handlers.onDoIt(last.host, {}, last.ctx);
      const call = sent.find((m) => m.payload && m.payload.connectorId === 'outlookTaskClose');
      check('Do It closes the To Do task by its ids and the snapshot Glance took, nothing else', !!call && call.type === 'flow:execute-action' && call.payload.params.taskId === 'MT1' && call.payload.params.taskListId === 'ML1' && call.payload.params.created.status === 'notStarted' && Object.keys(call.payload.params).length === 3, call);
      const row = w.logRows[w.logRows.length - 1];
      check('the To Do close is logged as written with the task it closes', row.kind === 'written' && row.connectorId === 'outlookTaskClose' && row.closes === w.logRows[0].chatKey, row);
      await w.receipts.filter((x) => x.receipt).pop().receipt.onUndo();
      check('Undo of the To Do close goes through the worker undo of outlookTaskClose', w.calls.some((c) => c.type === 'flow:undo-action' && c.connectorId === 'outlookTaskClose'), w.calls.map((c) => c.type + ':' + c.connectorId));
    }
    {
      const w = world({ switchOn: true, switchOwn: true, target: { ok: true, connectorId: 'googleTask' }, exec: execOf([]) });
      const r = await w.Card.offer(input('I transferred 500 NIS', { key: 'n-1' }));
      check('a claim with no waiting task offers nothing', !r.shown || r.reason !== 'close-offered', r);
    }
    {
      const sent = [];
      const w = world({ switchOn: true, switchOwn: true, target: { ok: true, connectorId: 'googleTask' }, exec: (msg) => { sent.push(msg); return msg.connectorId === 'googleTaskClose' ? { ok: false, reason: 'user-edited' } : execOf([])(msg); } });
      await make(w);
      await w.Card.offer(input('שילמתי', { key: 'e-1' }));
      const last = w.injected[w.injected.length - 1];
      check('an amount-less claim with exactly one waiting task offers the close', !!last.ctx.chatTask.close);
      await last.handlers.onDoIt(last.host, {}, last.ctx);
      check('a task the person changed is left alone and says so', w.receipts.some((x) => x.state === 'flow-chip-error' && /changed this task|שינית את המשימה/.test(x.text)) && w.logRows.every((r) => r.connectorId !== 'googleTaskClose'), w.receipts.map((x) => (x.state || 'receipt') + ':' + (x.text || '')));
    }
    {
      const w = world({ switchOn: true, switchOwn: true, target: { ok: true, connectorId: 'googleTask' }, exec: execOf([]) });
      await make(w);
      await w.Card.offer(mine('Please send me the signed contract by Thursday', { key: 'pw-9' }));
      await w.injected[w.injected.length - 1].handlers.onDoIt(w.injected[w.injected.length - 1].host, {}, w.injected[w.injected.length - 1].ctx);
      const r = await w.Card.offer(input('שילמתי', { key: 'm-1' }));
      check('two waiting asks but one payment: an amount-less claim still closes only the payment', r.reason !== 'close-offered' || w.injected[w.injected.length - 1].ctx.chatTask.close.chatKey === w.logRows[0].chatKey, r);
    }
  }

  // 5d. Hebrew meeting asks in a chat (the first user writes Hebrew): "can we meet" forms offer a hold; looking back stays quiet.
  for (const text of ['אפשר להיפגש ביום חמישי ב-15:00?', 'נוכל להיפגש מחר בשעה 10:00?', 'בא לך להיפגש ביום שלישי ב-16:30?', 'Can we meet tomorrow at 10:00?']) {
    const w = world({ target: { ok: true, connectorId: 'googleHold' } });
    const r = await w.Card.offer(input(text, { channel: 'whatsapp' }));
    check('meeting ask offers a hold: ' + text, r.shown && w.injected[0].ctx.process.steps[0].kind === 'calendar', r);
  }
  for (const text of ['היה נעים להיפגש, תודה על הפגישה', 'נפגשנו אתמול ב-15:00 והכל היה מצוין', 'Nice to meet you, thanks for the call at 3pm yesterday', 'Can we talk tomorrow at 10:00?']) {
    const w = world({ target: { ok: true, connectorId: 'googleHold' } });
    const r = await w.Card.offer(input(text, { channel: 'whatsapp' }));
    check('no hold for: ' + text, !r.shown && w.injected.length === 0, r);
  }

  // 5e. The person's own dated promise in the chat is its own switch (CHAT_PROMISE_CARD, off) and its own card.
  {
    const mine = (text, extra) => input(text, Object.assign({ fromMe: true, own: true, sender: { name: 'Dana' } }, extra || {}));
    const off = world({ switchOn: true, switchOwn: false });
    check('own promise: CHAT_PROMISE_CARD off shows nothing even with CHAT_TASK_CARD on', !(await off.Card.offer(mine('I will send you the proposal by Thursday'))).shown && off.calls.length === 0);
    for (const text of ['I will send you the proposal by Thursday', 'אשלח לך את ההצעה עד יום חמישי', 'אני אעביר לך את החשבונית מחר', "I'll send the contract on Sunday"]) {
      const w = world({ switchOn: false, switchOwn: true });
      const r = await w.Card.offer(mine(text));
      check('own promise offers one task: ' + text, r.shown && w.injected[0].ctx.process.steps.length === 1 && /^\d{4}-/.test(w.injected[0].ctx.process.steps[0].params.dateIso), r);
      const it = w.injected[0];
      check('the promise task is titled with the promise and the person: ' + text, /· Dana$/.test(it.ctx.process.steps[0].params.title), it.ctx.process.steps[0].params);
      await it.handlers.onDoIt(it.host, {}, it.ctx);
      const exec = w.calls.find((c) => c.type === 'flow:google-write');
      check('the promise task is written through the lane, due that day, noting who it was promised to: ' + text, !!exec && /^To: Dana$/m.test(exec.input.notes) && /^\d{4}-\d{2}-\d{2}$/.test(exec.input.dueIso) && exec.input.title.indexOf('Dana') > 0, exec && exec.input);
      const ask = w.calls.find((c) => c.type === 'flow:chat-task-target');
      check('the worker is told it is an own-promise offer', ask && ask.own === true, ask);
    }
    for (const text of ['I will think about it', 'I will try to send it sometime', "Sure, I'll be there", 'נדבר בהמשך', 'Thanks, got it!', 'Could you book the hall for next Monday?']) {
      const w = world({ switchOn: false, switchOwn: true });
      const r = await w.Card.offer(mine(text));
      check('own message stays quiet: ' + text, !r.shown && w.injected.length === 0, r);
    }
    const g = world({ switchOwn: true });
    check('own promise in a group stays out', !(await g.Card.offer(mine('I will send you the proposal by Thursday', { group: true }))).shown);
    const inboundOff = world({ switchOn: false, switchOwn: true });
    check('CHAT_PROMISE_CARD does not turn on the inbound card', !(await inboundOff.Card.offer(input(ASKS[0][0]))).shown);
  }

  // 5ad. What the person asked the other side for in their own message is a loop to chase: "Waiting on Dana: ..." due that day.
  {
    const mine = (text, extra) => input(text, Object.assign({ fromMe: true, own: true, sender: { name: 'Dana' } }, extra || {}));
    for (const [text, titleRe] of [
      ['Please transfer 500 NIS to my account by Sunday', /^Waiting on Dana: Payment 500 NIS$/],
      ['תעביר לי 500 שקל עד יום ראשון', /^מחכים ל-Dana: תשלום 500 NIS$/],
      ['Please send me the signed contract by Thursday', /^Waiting on Dana: /],
      ['I need the report by Wednesday', /^Waiting on Dana: /],
      ['תחתום על החוזה עד יום שישי', /^מחכים ל-Dana: /]
    ]) {
      const w = world({ switchOn: false, switchOwn: true });
      const r = await w.Card.offer(mine(text));
      check('own ask offers one follow-up task: ' + text, r.shown && w.injected[0].ctx.process.steps.length === 1, r);
      if (!w.injected[0]) continue;
      const st = w.injected[0].ctx.process.steps[0].params;
      check('the follow-up task is titled Waiting on the person, due that day: ' + text, titleRe.test(st.title) && /^\d{4}-\d{2}-\d{2}$/.test(st.dateIso), st);
      await w.injected[0].handlers.onDoIt(w.injected[0].host, {}, w.injected[0].ctx);
      const exec = w.calls.find((c) => c.type === 'flow:google-write');
      check('the follow-up is written through the lane with no message words: ' + text, !!exec && titleRe.test(exec.input.title) && JSON.stringify(exec.input).indexOf('my account') < 0, exec && exec.input);
      check('the follow-up is logged as written (Handled only after the read-back): ' + text, w.logRows.length === 1 && w.logRows[0].kind === 'written', w.logRows);
    }
    const off = world({ switchOn: true, switchOwn: false });
    check('CHAT_PROMISE_CARD off: an own ask shows nothing', !(await off.Card.offer(mine('Please transfer 500 NIS to my account by Sunday'))).shown && off.calls.length === 0);
    for (const quiet of ['Could you send me the contract by Thursday?', 'Please send me the contract', 'Thanks for the report, got it', 'I paid you 500 NIS on Sunday', 'תעביר לי את זה מתישהו']) {
      const q = world({ switchOn: false, switchOwn: true });
      check('own message stays quiet: ' + quiet, !(await q.Card.offer(mine(quiet))).shown && q.injected.length === 0);
    }
    const g = world({ switchOwn: true });
    check('an own ask in a group stays out', !(await g.Card.offer(mine('Please transfer 500 NIS to my account by Sunday', { group: true }))).shown);
    const again = world({ switchOn: false, switchOwn: true });
    await again.Card.offer(mine('Please transfer 500 NIS to my account by Sunday', { key: 'a-1' }));
    await again.injected[0].handlers.onDoIt(again.injected[0].host, {}, again.injected[0].ctx);
    const rep = await again.Card.offer(mine('Reminder: please transfer 500 NIS to my account by Sunday', { key: 'a-2' }));
    check('the same ask repeated is not a second follow-up task', !rep.shown && rep.reason === 'already-on-task-list', rep);
  }

  // 5f. An agreed meeting is a hold too, titled "Meeting · Dana", never with the whole message.
  for (const [text, he] of [['מעולה, נתראה ביום חמישי ב-15:00', true], ['Sounds good, see you Thursday at 3pm', false], ['סגור, מחר ב-10:00 אצלך', true]]) {
    const w = world({ target: { ok: true, connectorId: 'googleHold' } });
    const r = await w.Card.offer(input(text, { channel: 'whatsapp', sender: { name: 'Dana' } }));
    check('agreed meeting offers a hold: ' + text, r.shown && w.injected[0].ctx.process.steps[0].kind === 'calendar', r);
    const it = w.injected[0];
    await it.handlers.onDoIt(it.host, {}, it.ctx);
    const exec = w.calls.find((c) => c.type === 'flow:google-write');
    check('the hold is titled with the person, not the message: ' + text, !!exec && exec.input.title === (he ? 'פגישה · Dana' : 'Meeting · Dana') && Number.isInteger(exec.input.hour), exec && exec.input);
  }
  for (const text of ['Sorry, I can\'t make Thursday at 3pm', 'תודה על הפגישה אתמול ב-15:00', 'Sounds good, see you Thursday']) {
    const w = world({ target: { ok: true, connectorId: 'googleHold' } });
    check('no hold for: ' + text, !(await w.Card.offer(input(text, { channel: 'whatsapp' }))).shown && w.injected.length === 0);
  }
  check('chat lanes load core/meeting-confirm.js before the card', /'core\/day-words\.js', 'core\/meeting-confirm\.js', 'core\/teams-meeting\.js', 'core\/chat-reminder\.js', 'core\/chat-deadline-ask\.js', 'core\/chat-callback-ask\.js', 'core\/chat-payment-ask\.js', 'core\/chat-appointment-notice\.js', 'core\/chat-pickup-notice\.js', 'core\/chat-travel-notice\.js', 'core\/chat-delivery-window\.js', 'core\/chat-payment-claim\.js', 'core\/chat-sent-claim\.js', 'core\/chat-chase\.js', 'core\/chat-invitation-notice\.js', 'core\/chat-self-note\.js', 'src\/chip-host\.js', 'src\/chat-task-card\.js'/.test(fs.readFileSync(path.join(ROOT, 'src', 'background.js'), 'utf8')));

  // 6. sync: another newest message, or the person's own, retires the card.
  {
    const w = world();
    await w.Card.offer(input(ASKS[0][0]));
    const mount = w.sandbox.document.getElementById('glance-chat-task');
    check('the card is mounted', !!mount.querySelector('.flow-chip-host'));
    w.Card.sync('m1\n' + ASKS[0][0]);
    check('same message: the card stays', !!mount.querySelector('.flow-chip-host'));
    w.Card.sync(null);
    check('the person replied: the card leaves', !mount.querySelector('.flow-chip-host'));
  }

  // 7. The card never sends: no key events, no clicks, no composer, no Mail.Send, no message text in a URL.
  const src = fs.readFileSync(path.join(ROOT, 'src', 'chat-task-card.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('no send, no Enter, no click, no composer in the card file', !/keydown|keypress|dispatchEvent|\.click\(|contenteditable|execCommand|Mail\.Send|innerText\s*=|textContent\s*=/i.test(src));

  // 8. Production wiring: every chat lane loads the judge, the card, the chip host and the css.
  const bg = fs.readFileSync(path.join(ROOT, 'src', 'background.js'), 'utf8');
  check('chat lanes load the shared judge base, chip host and the card', /function laneChatScripts/.test(bg) && /'src\/chip-host\.js', 'src\/chat-task-card\.js'/.test(bg) && /LANE_CHAT_CSS = \['design\/step-states-v1\/scoped\.css', 'src\/chip\.css'\]/.test(bg) && /js: laneChatScripts\(lane\),\s*css: LANE_CHAT_CSS/.test(bg));
  check('the worker answers flow:chat-task-target behind the switch', /flow:chat-task-target/.test(bg) && /glanceSwitchOn\(msg && msg\.own === true \? 'CHAT_PROMISE_CARD' : 'CHAT_TASK_CARD'\)/.test(bg));
  for (const f of ['content-whatsapp-draft.js', 'content-messenger.js', 'content-instagram.js']) {
    check(f + ' hands the message to the card', /FlowChatTaskCard\.afterDraft\(/.test(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const base = manifest.content_scripts[0].js;
  check('the judge base the lanes load includes the judge and the storage', base.includes('core/incoming-judge.js') && base.includes('src/storage.js') && base.includes('src/step-kit.js'));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat task card checks passed');
  process.exit(failures ? 1 : 0);
})();
