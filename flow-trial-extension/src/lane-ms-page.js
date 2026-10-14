// Lane MS card on Outlook on the web. Separate from the Glance chip so a
// scan that drops .flow-chip-host leaves this card alone. Text is set with
// textContent. Nothing here sends mail.
(() => {
  if (globalThis.__glanceLaneMsPage) return;
  globalThis.__glanceLaneMsPage = true;

  // Content scripts share one lexical scope. FlowStorage is a top-level const
  // in storage.js and is never copied onto globalThis. A missing later binding
  // is still in the temporal dead zone, so the read is wrapped.
  function binding(read) {
    try {
      const value = read();
      return typeof value === 'undefined' ? null : value;
    } catch (e) {
      return null;
    }
  }

  function named(key) {
    const fromGlobal = globalThis[key];
    if (fromGlobal) return fromGlobal;
    return binding(() => {
      if (key === 'FlowOutlookContacts') return FlowOutlookContacts;
      if (key === 'FlowOutlookWord') return FlowOutlookWord;
      if (key === 'FlowOutlookExcel') return FlowOutlookExcel;
      if (key === 'FlowTeamsChat') return FlowTeamsChat;
      if (key === 'FlowOutlookSend') return FlowOutlookSend;
      if (key === 'FlowOwaParse') return FlowOwaParse;
      if (key === 'FlowStorage') return FlowStorage;
      return undefined;
    });
  }

  function modules() {
    return ['FlowOutlookContacts', 'FlowOutlookWord', 'FlowOutlookExcel', 'FlowTeamsChat', 'FlowOutlookSend']
      .map(named)
      .filter((mod) => mod && typeof mod.offer === 'function');
  }

  function ensureStyle() {
    if (document.getElementById('flow-lane-ms-style')) return;
    const style = document.createElement('style');
    style.id = 'flow-lane-ms-style';
    style.textContent = [
      '.flow-lane-ms{margin:8px 0;padding:10px 12px;border:1px solid #d7dce3;border-radius:8px;background:#fff;font:13px/1.4 Arial,sans-serif;color:#1a1a1a;max-width:440px}',
      '.flow-lane-ms .flow-lane-title{font-weight:700;margin:0 0 6px}',
      '.flow-lane-ms .flow-lane-line{margin:2px 0}',
      '.flow-lane-ms .flow-lane-label{color:#555;margin-right:6px}',
      '.flow-lane-do,.flow-lane-undo{margin-top:8px;margin-right:6px;padding:4px 10px;border:1px solid #1a1a1a;background:#fff;border-radius:4px;cursor:pointer}',
      '.flow-lane-address,.flow-lane-draft{margin-top:6px;font-weight:600;white-space:pre-wrap}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  let cardHost = null;

  function mount() {
    const host = cardHost && cardHost.isConnected ? cardHost : null;
    if (host && host.parentNode) return host.parentNode;
    return document.getElementById('ReadingPaneContainerId') || document.body;
  }

  function place(card) {
    const parent = mount();
    const host = cardHost && cardHost.isConnected && cardHost.parentNode === parent ? cardHost : null;
    if (host) {
      if (host.nextSibling) parent.insertBefore(card, host.nextSibling);
      else parent.appendChild(card);
      return;
    }
    parent.appendChild(card);
  }

  function clearCard() {
    document.querySelectorAll('.flow-lane-ms').forEach((node) => node.remove());
  }

  function line(label, value) {
    const row = document.createElement('div');
    row.className = 'flow-lane-line';
    const lab = document.createElement('span');
    lab.className = 'flow-lane-label';
    lab.textContent = label;
    const val = document.createElement('span');
    val.className = 'flow-lane-value';
    val.textContent = value;
    row.appendChild(lab);
    row.appendChild(val);
    return row;
  }

  function statusNode(card) {
    let node = card.querySelector('.flow-lane-status');
    if (!node) {
      node = document.createElement('div');
      node.className = 'flow-lane-status';
      card.appendChild(node);
    }
    return node;
  }

  function remember(entry) {
    const store = named('FlowStorage');
    if (!entry || !store || typeof store.appendLog !== 'function') return;
    Promise.resolve(store.appendLog(entry)).catch(() => {});
  }

  function paintResult(card, res) {
    const status = statusNode(card);
    if (!res) {
      status.textContent = 'Could not reach Outlook.';
      return;
    }
    if (res.recipient && res.recipient.address) {
      let address = card.querySelector('.flow-lane-address');
      if (!address) {
        address = document.createElement('div');
        address.className = 'flow-lane-address';
        card.appendChild(address);
      }
      address.textContent = res.recipient.address;
      const button = card.querySelector('.flow-lane-do');
      if (button) button.hidden = true;
      return;
    }
    if (res.posted === false) {
      let draft = card.querySelector('.flow-lane-draft');
      if (!draft) {
        draft = document.createElement('div');
        draft.className = 'flow-lane-draft';
        card.appendChild(draft);
      }
      draft.textContent = res.draft || '';
      if (res.chat && res.chat.topic) {
        let topic = card.querySelector('.flow-lane-topic');
        if (!topic) {
          topic = document.createElement('div');
          topic.className = 'flow-lane-topic flow-lane-line';
          card.insertBefore(topic, draft);
        }
        topic.textContent = res.chat.topic;
      }
      status.textContent = 'Not posted.';
      const button = card.querySelector('.flow-lane-do');
      if (button) button.hidden = true;
      return;
    }
    const proof = res.proof;
    if (res.ok === true && proof && proof.fetchedBack === true && proof.externalId) {
      status.textContent = 'Handled.';
      let written = card.querySelector('.flow-lane-written');
      if (!written) {
        written = document.createElement('div');
        written.className = 'flow-lane-written';
        card.appendChild(written);
      }
      written.textContent = res.written || '';
      const button = card.querySelector('.flow-lane-do');
      if (button) button.hidden = true;
      showUndo(card, res.ref, card.getAttribute('data-connector'));
      remember(res.log);
      return;
    }
    if (res.reason === 'FORBIDDEN_SEND') {
      status.textContent = 'Not sent.';
      return;
    }
    const quiet = {
      'not-found': 'No match.',
      ambiguous: 'More than one match.',
      'contacts-not-granted': 'Contacts is not on for this sign-in.',
      'files-not-granted': 'OneDrive is not on for this sign-in.',
      'chat-not-granted': 'Teams chat is not on for this sign-in.',
      unclear: '',
      verify_failed: 'Could not confirm.',
      'cells-differ': 'The row that came back does not match what was written.',
      'row-changed': 'That row changed, so it was left as it is.',
      'file-changed': 'The file changed, so it was left as it is.'
    };
    status.textContent = Object.prototype.hasOwnProperty.call(quiet, res.reason) ? quiet[res.reason] : (res.written || 'Could not finish that.');
  }

  function showUndo(card, ref, connectorId) {
    if (!ref || !connectorId) return;
    let undo = card.querySelector('.flow-lane-undo');
    if (!undo) {
      undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'flow-lane-undo';
      undo.textContent = 'Undo';
      card.appendChild(undo);
    }
    undo.hidden = false;
    undo.onclick = () => {
      const href = location.href;
      undo.disabled = true;
      chrome.runtime.sendMessage({ type: 'flow:lane-undo', connectorId: connectorId, ref: ref }, (res) => {
        if (location.href !== href) return;
        const err = chrome.runtime.lastError;
        if (err || !res) {
          statusNode(card).textContent = 'Undo unavailable.';
          undo.disabled = false;
          return;
        }
        if (res.ok !== true) {
          paintResult(card, res);
          undo.disabled = false;
          return;
        }
        statusNode(card).textContent = 'Undone.';
        let written = card.querySelector('.flow-lane-written');
        if (written && res.written) written.textContent = res.written;
        undo.hidden = true;
        remember(res.log);
      });
    };
  }

  function sendAction(card, pane, payload, onDone) {
    const href = location.href;
    const messageId = (pane && (pane.itemId || pane.rawUrlId || pane.pathId)) || '';
    chrome.runtime.sendMessage({
      type: 'flow:lane-execute',
      payload: {
        connectorId: payload.connectorId,
        params: payload.params || {},
        explicitClick: true,
        messageId: messageId,
        text: payload.text || ''
      }
    }, (res) => {
      if (location.href !== href) return;
      const err = chrome.runtime.lastError;
      onDone(err ? null : res);
    });
  }

  function paintOffer(offer, pane, text) {
    clearCard();
    const card = document.createElement('div');
    card.className = 'flow-lane-ms';
    card.setAttribute('data-connector', offer.connectorId || '');
    const title = document.createElement('div');
    title.className = 'flow-lane-title';
    title.textContent = offer.title || '';
    card.appendChild(title);
    (offer.lines || []).forEach((row) => {
      if (!row) return;
      card.appendChild(line(row.label || '', row.value || ''));
    });
    if (offer.button) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'flow-lane-do';
      button.textContent = offer.button;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        button.disabled = true;
        sendAction(card, pane, { connectorId: offer.connectorId, params: offer.params, text: text }, (res) => {
          button.disabled = false;
          paintResult(card, res);
        });
      });
      card.appendChild(button);
    }
    place(card);
  }

  function paintReceipt(row) {
    clearCard();
    const card = document.createElement('div');
    card.className = 'flow-lane-ms';
    card.setAttribute('data-connector', row.connectorId || '');
    const title = document.createElement('div');
    title.className = 'flow-lane-title';
    title.textContent = 'Handled.';
    card.appendChild(title);
    const written = document.createElement('div');
    written.className = 'flow-lane-written';
    written.textContent = row.where ? ('In ' + row.where + '.') : '';
    card.appendChild(written);
    showUndo(card, row.ref, row.connectorId);
    place(card);
  }

  function readPane() {
    const parse = named('FlowOwaParse');
    if (!parse || typeof parse.readPane !== 'function') return null;
    try { return parse.readPane(document, location.href, {}) || null; } catch (e) { return null; }
  }

  let paneKey = '';
  let timer = null;
  let busy = false;

  async function tick() {
    if (busy) return;
    const pane = readPane();
    if (!pane || (!pane.subject && !pane.text)) return;
    const key = [pane.itemId || '', pane.rawUrlId || '', pane.subject || '', String(pane.text || '').slice(0, 240)].join('|');
    if (key === paneKey) return;
    paneKey = key;
    busy = true;
    try {
      const text = (pane.subject ? pane.subject + '\n' : '') + (pane.text || '');
      const ctx = { text: text, subject: pane.subject || '' };
      let state = null;
      const store = named('FlowStorage');
      if (store && typeof store.get === 'function') {
        try { state = await store.get(); } catch (e) { state = null; }
      }
      if (paneKey !== key) return;
      const log = (state && state.log) || [];
      const mods = modules();
      for (let i = 0; i < mods.length; i++) {
        if (typeof mods[i].receiptFromLog !== 'function') continue;
        const row = mods[i].receiptFromLog(log, pane);
        if (row && row.fetchedBack === true) {
          paintReceipt(row);
          return;
        }
      }
      for (let i = 0; i < mods.length; i++) {
        let offer = null;
        try { offer = mods[i].offer(ctx); } catch (e) { offer = null; }
        if (offer && offer.show) {
          paintOffer(offer, pane, text);
          return;
        }
      }
      clearCard();
    } finally {
      busy = false;
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; tick(); }, 350);
  }

  function watch() {
    ensureStyle();
    try { document.documentElement.setAttribute('data-glance-lane-ms', 'on'); } catch (e) { /* page gone */ }
    const root = document.documentElement;
    if (root && typeof MutationObserver === 'function') {
      const obs = new MutationObserver(() => schedule());
      obs.observe(root, { childList: true, subtree: true });
    }
    schedule();
  }

  let watching = false;

  function attach(host) {
    if (host && host.nodeType === 1) cardHost = host;
    if (!named('FlowOwaParse')) return false;
    if (watching) {
      paneKey = '';
      schedule();
      return true;
    }
    watching = true;
    watch();
    return true;
  }

  globalThis.FlowLaneMsPage = { attach: attach };
})();
