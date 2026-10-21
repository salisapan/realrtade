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
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'incoming-judge.js'];
const NOW = new Date('2026-10-20T10:00:00+03:00').getTime();

function world(opts) {
  const o = Object.assign({ switchOn: true, target: { ok: true, connectorId: 'googleTask' }, exec: null, undo: null, log: [] }, opts || {});
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
          else if (msg.type === 'flow:execute-action' || msg.type === 'flow:google-write') r = o.exec || { ok: true, ref: { taskId: 'T1', externalId: 'T1' }, written: 'Task added.', url: 'https://tasks.example/T1', proof: { system: 'googleTasks', externalId: 'T1', fetchedBack: true } };
          else if (msg.type === 'flow:undo-action' || msg.type === 'flow:google-undo') r = o.undo || { ok: true, written: 'Task removed.' };
          Promise.resolve().then(() => cb(r));
        }
      },
      storage: { local: { async get() { return { glanceSwitches: o.switchOn ? { CHAT_TASK_CARD: true } : {} }; } } }
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
    await w.receipts.find((x) => x.receipt).receipt.onUndo();
    check('Microsoft: Undo goes through flow:undo-action', w.calls.some((c) => c.type === 'flow:undo-action' && c.connectorId === 'outlookTask'));
  }

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
  check('the worker answers flow:chat-task-target behind the switch', /flow:chat-task-target/.test(bg) && /glanceSwitchOn\('CHAT_TASK_CARD'\)/.test(bg));
  for (const f of ['content-whatsapp-draft.js', 'content-messenger.js', 'content-instagram.js']) {
    check(f + ' hands the message to the card', /FlowChatTaskCard\.afterDraft\(/.test(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const base = manifest.content_scripts[0].js;
  check('the judge base the lanes load includes the judge and the storage', base.includes('core/incoming-judge.js') && base.includes('src/storage.js') && base.includes('src/step-kit.js'));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat task card checks passed');
  process.exit(failures ? 1 : 0);
})();
