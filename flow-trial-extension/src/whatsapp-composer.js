// Draft card for one place question in an open WhatsApp Web chat.
// Shows the found item and the line. Types and sends only after the
// approve click. Reads the sent line back before Handled. Deletes the
// message only when the page exposes a delete control; otherwise the
// receipt says Undo unavailable.
//
// Messenger is not a host. A group is not a chat this file answers.
const FlowWhatsAppComposer = (() => {
  const CARD_ID = 'glance-answer-card';
  const STYLE_ID = 'glance-answer-style';
  const LOG_KEY = 'glance-chat-answer-log';
  let timer = null;
  let seq = 0;
  let phase = 'idle';
  let currentKey = '';

  function engine() {
    return typeof FlowChatAnswer !== 'undefined' ? FlowChatAnswer : null;
  }

  function proof() {
    return typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null;
  }

  function clean(value) {
    return String(value || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim();
  }

  function parseId(id) {
    if (typeof FlowWhatsAppParse !== 'undefined') return FlowWhatsAppParse.parseDataId(id);
    const parts = String(id || '').split('_');
    if (parts.length < 3 || (parts[0] !== 'true' && parts[0] !== 'false')) return null;
    if (parts[1].indexOf('@g.us') >= 0 || parts[1].indexOf('@broadcast') >= 0 || parts[1].indexOf('@newsletter') >= 0) return null;
    return { fromMe: parts[0] === 'true' };
  }

  function oneToOneIds(ids) {
    if (typeof FlowWhatsAppParse !== 'undefined') return FlowWhatsAppParse.isOneToOne(ids);
    if (!ids.length) return false;
    return ids.every((id) => parseId(id) && String(id).split('_').length === 3);
  }

  function textOf(node) {
    if (!node) return '';
    const spans = node.querySelectorAll('span.selectable-text, span[data-testid="selectable-text"]');
    if (!spans.length) return clean(node.innerText || node.textContent || '');
    const bits = [];
    for (let i = 0; i < spans.length; i++) {
      const quoted = spans[i].closest('[aria-label^="Quoted"], [data-testid="quoted-message"], [data-testid="quoted-msg"]');
      if (quoted) continue;
      bits.push(spans[i].innerText || spans[i].textContent || '');
    }
    return clean(bits.join(' '));
  }

  function hostName() {
    try { return String(location.hostname || '').toLowerCase(); } catch (e) { return ''; }
  }

  function logKey() {
    const bag = window.__glanceChatAnswer;
    return (bag && bag.logKey) || LOG_KEY;
  }

  function flowStorage() {
    return typeof FlowStorage !== 'undefined' && FlowStorage.appendLog && FlowStorage.get ? FlowStorage : null;
  }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(logKey()) || '[]'); } catch (e) { return []; }
  }

  function writeLocal(log) {
    try { localStorage.setItem(logKey(), JSON.stringify((log || []).slice(0, 40))); } catch (e) { /* private mode */ }
  }

  function readLog() {
    const store = flowStorage();
    if (!store) return Promise.resolve(readLocal());
    return store.get().then((state) => (state && state.log) || []).catch(() => readLocal());
  }

  function writeRow(row) {
    const store = flowStorage();
    if (store) return store.appendLog(row).catch(() => null);
    const log = readLocal();
    log.unshift(row);
    writeLocal(log);
    return Promise.resolve(log);
  }

  function saveRewritten(log) {
    if (flowStorage()) return Promise.resolve(log);
    writeLocal(log);
    return Promise.resolve(log);
  }

  function setState(name) {
    try { document.documentElement.setAttribute('data-glance-answer-state', name); } catch (e) { /* page closing */ }
  }

  function removeCard() {
    const card = document.getElementById(CARD_ID);
    if (card) card.remove();
    currentKey = '';
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + CARD_ID + '{position:fixed;inset-inline-end:20px;bottom:20px;z-index:2147483001;width:min(340px,calc(100vw - 40px));box-sizing:border-box;padding:14px 16px 12px;border-radius:14px;background:#0E1322;color:#EEF2F9;border:1px solid rgba(150,166,204,.28);box-shadow:0 16px 40px -12px rgba(0,0,0,.55);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}',
      '#' + CARD_ID + ' .glance-answer-kicker{margin:0 0 4px;color:#AEB9D6;font-size:12px;}',
      '#' + CARD_ID + ' .glance-answer-place{margin:0 0 8px;font-weight:700;font-size:16px;}',
      '#' + CARD_ID + ' .glance-answer-draft{margin:0 0 12px;padding:8px 10px;border-inline-start:3px solid #3B74FF;background:rgba(59,116,255,.08);border-radius:4px;}',
      '#' + CARD_ID + ' .glance-answer-status{margin:0 0 8px;font-weight:700;}',
      '#' + CARD_ID + ' .glance-answer-actions{display:flex;gap:8px;align-items:center;}',
      '#' + CARD_ID + ' .flow-chip{all:initial;position:relative;isolation:isolate;display:inline-flex;align-items:center;justify-content:center;padding:9px 20px;border:0;border-radius:999px;cursor:pointer;font-family:inherit;}',
      '#' + CARD_ID + ' .flow-chip .shell{position:absolute;inset:0;border-radius:inherit;z-index:-2;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(219,230,250,.72));border:1px solid rgba(40,70,150,.3);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.95),0 10px 30px -10px rgba(59,116,255,.3);}',
      '#' + CARD_ID + ' .flow-chip .ring{position:absolute;inset:4px;border-radius:999px;z-index:-1;border:1.5px solid #2f5bd8;box-shadow:0 0 8px rgba(59,116,255,.3),inset 0 0 7px rgba(47,91,216,.38);}',
      '#' + CARD_ID + ' .flow-chip .shine{position:absolute;inset:0;border-radius:inherit;overflow:hidden;z-index:-1;}',
      '#' + CARD_ID + ' .flow-chip-do-label{position:relative;z-index:1;font-weight:800;font-size:13.5px;color:#123ccb;}',
      '#' + CARD_ID + ' .flow-chip:focus-visible{outline:2px solid #8FB0FF;outline-offset:3px;}',
      '#' + CARD_ID + ' .glance-answer-ghost{all:unset;cursor:pointer;color:#AEB9D6;font:600 13px/1 system-ui,sans-serif;padding:7px 10px;}',
      '#' + CARD_ID + ' .glance-answer-ghost:focus-visible{outline:2px solid #8FB0FF;outline-offset:2px;}'
    ].join('');
    document.documentElement.appendChild(style);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function cardShell(lang) {
    ensureStyle();
    removeCard();
    const card = el('section', '');
    card.id = CARD_ID;
    card.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    card.setAttribute('lang', lang === 'he' ? 'he' : 'en');
    document.documentElement.appendChild(card);
    return card;
  }

  function doItButton(label) {
    const button = el('button', 'flow-chip');
    button.type = 'button';
    button.appendChild(el('span', 'shell'));
    button.appendChild(el('span', 'ring'));
    button.appendChild(el('span', 'shine'));
    button.appendChild(el('span', 'flow-chip-do-label', label));
    return button;
  }

  function sourceLine(decision) {
    const hit = decision.hit || {};
    const fromMail = hit.source === 'mail';
    const where = decision.lang === 'he'
      ? (fromMail ? 'ממייל שפתחת' : 'מהיומן')
      : (fromMail ? 'From a mail you opened' : 'From your calendar');
    return [hit.place, hit.whenLabel, where].filter(Boolean).join(' · ');
  }

  function findBox(main) {
    return main.querySelector('footer [contenteditable="true"], [contenteditable="true"][data-tab="10"], footer [role="textbox"]');
  }

  function findSend(main) {
    return main.querySelector('[data-glance-send], footer button[aria-label="Send"], footer button[aria-label="שליחה"], [data-testid="send"], footer [data-icon="send"]');
  }

  function outgoingMatch(main, text) {
    const want = clean(text);
    const nodes = Array.from(main.querySelectorAll('[data-id]'));
    for (let i = nodes.length - 1; i >= 0; i--) {
      const id = nodes[i].getAttribute('data-id');
      const parsed = parseId(id);
      if (!parsed || !parsed.fromMe) continue;
      if (textOf(nodes[i]) === want) return { id: id, node: nodes[i] };
    }
    return null;
  }

  function canDelete(node) {
    return !!(node && node.querySelector('[data-glance-delete]'));
  }

  function waitForLine(main, text) {
    const found = outgoingMatch(main, text);
    if (found) return Promise.resolve(found);
    return new Promise((resolve) => {
      let left = 8;
      const tick = () => {
        const hit = outgoingMatch(main, text);
        if (hit || left <= 0) return resolve(hit);
        left -= 1;
        setTimeout(tick, 50);
      };
      setTimeout(tick, 50);
    });
  }

  function typeAndSend(main, text, token) {
    if (token.arm !== true) return Promise.resolve(null);
    const box = findBox(main);
    const send = findSend(main);
    if (!box || !send) return Promise.resolve(null);
    box.focus();
    box.textContent = text;
    try { box.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })); }
    catch (e) { box.dispatchEvent(new Event('input', { bubbles: true })); }
    send.click();
    return waitForLine(main, text);
  }

  function messageNode(main, id) {
    if (!id) return null;
    const nodes = main.querySelectorAll('[data-id]');
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-id') === id) return nodes[i];
    }
    return null;
  }

  function showDraft(snapshot, ask, decision) {
    const key = ask.id + ':draft';
    if (currentKey === key && document.getElementById(CARD_ID)) return;
    currentKey = key;
    phase = 'draft';
    const lang = decision.lang === 'he' ? 'he' : 'en';
    const card = cardShell(lang);
    card.appendChild(el('p', 'glance-answer-kicker', sourceLine(decision).split(' · ').slice(1).join(' · ') || (lang === 'he' ? 'מהיומן' : 'From your calendar')));
    card.appendChild(el('p', 'glance-answer-place', decision.hit.place));
    const when = decision.hit.whenLabel ? el('p', 'glance-answer-kicker', decision.hit.whenLabel) : null;
    if (when) card.appendChild(when);
    card.appendChild(el('p', 'glance-answer-draft', decision.draft));
    const actions = el('div', 'glance-answer-actions');
    const button = doItButton(lang === 'he' ? 'שלח' : 'Send');
    button.addEventListener('click', () => { approve(snapshot, ask, decision, button); });
    const dismiss = el('button', 'glance-answer-ghost', lang === 'he' ? 'לא עכשיו' : 'Not now');
    dismiss.type = 'button';
    dismiss.addEventListener('click', () => {
      phase = 'idle';
      removeCard();
      setState('silent');
      try { sessionStorage.setItem('glance-answer-skip:' + ask.id, '1'); } catch (e) { /* ignore */ }
    });
    actions.appendChild(button);
    actions.appendChild(dismiss);
    card.appendChild(actions);
    setState('draft');
  }

  function showReceipt(row, lang, main) {
    const P = proof();
    const copy = P ? P.remountCopy(row) : null;
    const he = lang === 'he' || (row && row.receiptStatus === 'טופל.');
    const card = cardShell(he ? 'he' : 'en');
    currentKey = (row.questionId || row.messageId) + ':receipt';
    phase = 'receipt';
    const status = (copy && copy.status) || (he ? 'טופל.' : 'Handled.');
    card.appendChild(el('p', 'glance-answer-status', status));
    card.appendChild(el('p', 'glance-answer-draft', (copy && copy.writtenLine) || row.writtenLine || ''));
    const node = messageNode(main, row.externalId || row.messageId);
    const available = !!(node && canDelete(node));
    const actions = el('div', 'glance-answer-actions');
    if (available) {
      const undo = el('button', 'glance-answer-ghost', 'Undo');
      undo.type = 'button';
      undo.addEventListener('click', () => { runUndo(main, row, node, 'deleted'); });
      actions.appendChild(undo);
    } else {
      const line = el('button', 'glance-answer-ghost', (P && P.CHAT_UNDO_UNAVAILABLE) || 'Undo unavailable');
      line.type = 'button';
      line.addEventListener('click', () => { runUndo(main, row, null, 'unavailable'); });
      actions.appendChild(line);
    }
    card.appendChild(actions);
    setState('receipt');
  }

  function showClosed(text, lang) {
    const card = cardShell(lang === 'he' ? 'he' : 'en');
    phase = 'closed';
    card.appendChild(el('p', 'glance-answer-status', text));
    setState(text === 'Undo unavailable' ? 'unavailable' : 'undone');
  }

  function approve(snapshot, ask, decision, button) {
    if (phase === 'sending') return;
    phase = 'sending';
    if (button) button.disabled = true;
    const main = snapshot.main;
    const token = { arm: true };
    typeAndSend(main, decision.draft, token).then((sent) => {
      if (!sent) {
        phase = 'draft';
        if (button) button.disabled = false;
        setState('draft');
        return null;
      }
      const P = proof();
      const verifiedAt = new Date().toISOString();
      const built = P ? P.buildProof({
        system: P.SYSTEM_WHATSAPP_WEB,
        externalId: sent.id,
        fetchedBack: true,
        verifiedAt: verifiedAt
      }) : null;
      if (!built) {
        phase = 'draft';
        setState('draft');
        return null;
      }
      const he = decision.lang === 'he';
      const fields = P.receiptLogFields(built, {
        writtenLine: decision.draft,
        status: he ? 'טופל.' : 'Handled.',
        closedLine: decision.hit.place
      });
      const row = Object.assign({
        kind: 'written',
        messageId: sent.id,
        questionId: ask.id,
        connectorId: 'chatAnswer',
        undoAvailable: canDelete(sent.node),
        place: decision.hit.place
      }, fields || {});
      return writeRow(row).then(() => {
        phase = 'receipt';
        showReceipt(row, decision.lang, main);
      });
    }).catch(() => {
      phase = 'draft';
      if (button) button.disabled = false;
      setState('draft');
    });
  }

  function runUndo(main, row, node, mode) {
    if (mode === 'deleted' && node) {
      const control = node.querySelector('[data-glance-delete]');
      if (control) control.click();
      const gone = !messageNode(main, row.externalId || row.messageId);
      if (!gone) mode = 'unavailable';
    }
    const P = proof();
    const ids = { messageIds: [row.messageId, row.questionId, row.externalId].filter(Boolean) };
    const finish = (text) => { showClosed(text, row.receiptStatus === 'טופל.' ? 'he' : 'en'); };
    if (!P) {
      finish(mode === 'unavailable' ? 'Undo unavailable' : 'Undone — the chat message was removed.');
      return;
    }
    if (flowStorage()) {
      writeRow({
        kind: 'undone',
        messageId: row.messageId,
        questionId: row.questionId,
        connectorId: 'chatAnswer',
        system: P.SYSTEM_WHATSAPP_WEB,
        externalId: row.externalId,
        undoUnavailable: mode === 'unavailable',
        fetchedBack: false,
        label: mode === 'unavailable' ? P.CHAT_UNDO_UNAVAILABLE : P.CHAT_UNDONE_LINE
      }).then(() => finish(mode === 'unavailable' ? P.CHAT_UNDO_UNAVAILABLE : P.CHAT_UNDONE_LINE));
      return;
    }
    readLog().then((log) => {
      const next = P.applyChatUndo(log, ids, mode);
      return saveRewritten(next.log).then(() => finish(mode === 'unavailable' ? P.CHAT_UNDO_UNAVAILABLE : P.CHAT_UNDONE_LINE));
    });
  }

  function latestAsk(messages) {
    const lib = engine();
    if (!lib) return null;
    let found = null;
    for (let i = 0; i < messages.length; i++) {
      const row = messages[i];
      if (!row || row.fromMe) continue;
      const ask = lib.detect(row.text, nowOf());
      if (ask) found = { id: row.id, text: row.text, ask: ask, index: i };
    }
    return found;
  }

  function nowOf() {
    const bag = window.__glanceChatAnswer;
    if (bag && bag.now && engine()) return engine().parseNow(bag.now);
    return new Date();
  }

  function repliedAfter(messages, ask) {
    for (let i = ask.index + 1; i < messages.length; i++) {
      if (messages[i] && messages[i].fromMe && clean(messages[i].text)) return true;
    }
    return false;
  }

  function skipped(id) {
    try { return sessionStorage.getItem('glance-answer-skip:' + id) === '1'; } catch (e) { return false; }
  }

  function queryFor(ask, log) {
    const ids = [ask.id];
    for (let i = 0; i < log.length; i++) {
      const row = log[i];
      if (!row) continue;
      if (row.questionId !== ask.id && row.messageId !== ask.id) continue;
      if (row.messageId) ids.push(row.messageId);
      if (row.externalId) ids.push(row.externalId);
      if (row.questionId) ids.push(row.questionId);
    }
    return { messageIds: ids };
  }

  function latestUndo(log, ask) {
    const P = proof();
    if (!P) return null;
    const found = P.taskReceiptFromLog ? null : null;
    void found;
    for (let i = 0; i < log.length; i++) {
      const row = log[i];
      if (!row || row.kind !== 'undone') continue;
      if (row.questionId === ask.id || row.messageId === ask.id) return row;
    }
    return null;
  }

  function loadDecision(ask) {
    const lib = engine();
    const bag = window.__glanceChatAnswer;
    if (bag && (bag.events || bag.mail || bag.calendarChecked === false)) {
      return Promise.resolve(lib.decide({
        ask: ask.ask,
        events: bag.events || [],
        mail: bag.mail || [],
        calendarChecked: bag.calendarChecked !== false,
        mailChecked: bag.mailChecked !== false,
        oneToOne: true,
        host: hostName(),
        now: bag.now || nowOf()
      }));
    }
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return resolve(null);
      try {
        chrome.runtime.sendMessage({ type: 'flow:chat-answer-sources', text: ask.text, oneToOne: true }, (reply) => {
          void chrome.runtime.lastError;
          resolve(reply || null);
        });
      } catch (e) { resolve(null); }
    }).then((reply) => {
      if (reply && reply.reason && reply.draft !== undefined && reply.hit !== undefined) return reply;
      if (reply && (reply.calendarChecked === true || reply.events)) {
        return lib.decide({
          ask: ask.ask,
          events: reply.events || [],
          mail: reply.mail || [],
          calendarChecked: reply.calendarChecked !== false,
          mailChecked: reply.mailChecked === true,
          oneToOne: true,
          host: hostName(),
          truncated: reply.truncated === true
        });
      }
      return lib.decide({ ask: ask.ask, calendarChecked: false, host: hostName() });
    });
  }

  function consider(snapshot) {
    const mine = seq + 1;
    seq = mine;
    const lib = engine();
    if (!snapshot || !lib) {
      removeCard();
      setState('silent');
      return Promise.resolve();
    }
    if (phase === 'sending') return Promise.resolve();
    if (snapshot.oneToOne === false || !lib.hostAllowed(snapshot.host || hostName())) {
      removeCard();
      setState('silent');
      return Promise.resolve();
    }
    const ask = latestAsk(snapshot.messages || []);
    if (!ask || skipped(ask.id)) {
      if (phase !== 'receipt' && phase !== 'closed') {
        removeCard();
        setState('silent');
      }
      return Promise.resolve();
    }
    return readLog().then((log) => {
      if (mine !== seq) return;
      const P = proof();
      const prior = P ? P.taskReceiptFromLog(log, queryFor(ask, log)) : null;
      if (prior) {
        showReceipt(prior, ask.ask.lang, snapshot.main);
        return;
      }
      const undone = latestUndo(log, ask);
      if (undone) {
        showClosed(undone.label || (undone.undoUnavailable ? 'Undo unavailable' : 'Undone — the chat message was removed.'), ask.ask.lang);
        return;
      }
      if (repliedAfter(snapshot.messages, ask)) {
        removeCard();
        setState('silent');
        return;
      }
      return loadDecision(ask).then((decision) => {
        if (mine !== seq || phase === 'sending') return;
        if (!decision || decision.show !== true) {
          removeCard();
          setState('silent');
          return;
        }
        showDraft(snapshot, ask, decision);
      });
    }).catch(() => {
      removeCard();
      setState('silent');
    });
  }

  function readSnapshot(root) {
    const doc = root || document;
    const main = doc.getElementById ? (doc.getElementById('main') || doc.querySelector('#main')) : null;
    if (!main) return { main: null, oneToOne: false, host: hostName(), messages: [] };
    const nodes = Array.from(main.querySelectorAll('[data-id]')).filter((node) => parseId(node.getAttribute('data-id')));
    const messages = nodes.slice(-40).map((node) => {
      const id = node.getAttribute('data-id');
      const parsed = parseId(id);
      return { id: id, fromMe: !!(parsed && parsed.fromMe), text: textOf(node), node: node };
    });
    return {
      main: main,
      oneToOne: oneToOneIds(messages.map((row) => row.id)),
      host: hostName(),
      messages: messages
    };
  }

  function watch() {
    const run = () => { consider(readSnapshot(document)); };
    run();
    const app = document.getElementById('app') || document.body;
    if (!app || app.getAttribute('data-glance-answer-watch') === '1') return;
    app.setAttribute('data-glance-answer-watch', '1');
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(run, 200);
    }).observe(app, { childList: true, subtree: true });
  }

  return { consider: consider, watch: watch, readSnapshot: readSnapshot };
})();

if (typeof module !== 'undefined') module.exports = { FlowWhatsAppComposer };
else if (typeof globalThis !== 'undefined') globalThis.FlowWhatsAppComposer = FlowWhatsAppComposer;

if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.__glanceChatAnswer) {
  const bootAnswer = () => { try { FlowWhatsAppComposer.watch(); } catch (e) { /* fixture still loads */ } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAnswer);
  else bootAnswer();
}
