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
      '.flow-lane-ms{position:relative;z-index:30;pointer-events:auto;margin:8px 0;padding:10px 12px;border:1px solid #d7dce3;border-radius:8px;background:#fff;font:13px/1.4 Arial,sans-serif;color:#1a1a1a;max-width:440px}',
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

  function bodyCover() {
    return document.getElementById('mailMessageBodyContainer')
      || document.querySelector('#ReadingPaneContainerId #mailMessageBodyContainer')
      || document.querySelector('[id="mailMessageBodyContainer"]');
  }

  function place(card) {
    const cover = bodyCover();
    if (cover && cover.parentNode) {
      cover.parentNode.insertBefore(card, cover);
      return;
    }
    const parent = mount();
    const host = cardHost && cardHost.isConnected && cardHost.parentNode === parent ? cardHost : null;
    if (host) {
      if (host.nextSibling) parent.insertBefore(card, host.nextSibling);
      else parent.appendChild(card);
      return;
    }
    if (parent.firstChild) parent.insertBefore(card, parent.firstChild);
    else parent.appendChild(card);
  }

  function clearMailWhy() {
    const roots = [document.getElementById('ReadingPaneContainerId'), document.body];
    roots.forEach((root) => {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('.flow-why-not').forEach((node) => {
        try { node.remove(); } catch (e) { /* already gone */ }
      });
    });
  }

  function clearCard() {
    document.querySelectorAll('.flow-lane-ms').forEach((node) => node.remove());
  }

  const GRANT_HE = 'כדי למצוא את איש הקשר, פתח את חלון Glance וסמן אנשי קשר בשורת Outlook.';

  function quietGrantLine() {
    return GRANT_HE;
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
    // Contacts only. A Teams draft is also posted:false with a draft, and that
    // card stays "Not posted." below. Do not treat every unsent draft as a send.
    if (res.connectorId === 'outlookContacts' && res.draft && res.posted === false) {
      let draft = card.querySelector('.flow-lane-draft');
      if (!draft) {
        draft = document.createElement('div');
        draft.className = 'flow-lane-draft';
        card.appendChild(draft);
      }
      draft.textContent = res.draft || '';
      status.textContent = res.written || 'Draft ready. You send it.';
      const button = card.querySelector('.flow-lane-do');
      if (button) button.hidden = true;
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
    if (res.reason === 'contacts-not-granted') {
      status.textContent = res.written || quietGrantLine();
      status.setAttribute('dir', 'rtl');
      const button = card.querySelector('.flow-lane-do');
      if (button) button.hidden = true;
      return;
    }
    const quiet = {
      'not-found': 'No match.',
      ambiguous: 'More than one match.',
      'contacts-not-granted': 'כדי למצוא את איש הקשר, פתח את חלון Glance וסמן אנשי קשר בשורת Outlook.',
      'files-not-granted': 'OneDrive is not on for this sign-in.',
      'chat-not-granted': 'Teams chat is not on for this sign-in.',
      unclear: '',
      verify_failed: 'Could not confirm.',
      'cells-differ': 'The row that came back does not match what was written.',
      'row-changed': 'That row changed, so it was left as it is.',
      'file-changed': 'The file changed, so it was left as it is.',
      'user-edited': 'You edited this. Undo left it alone.',
      unconfirmed: "Couldn't confirm it's unchanged. Undo left it alone."
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

  function replyControl() {
    const nodes = document.querySelectorAll('button, [role="button"]');
    for (let i = 0; i < nodes.length; i++) {
      const name = String((nodes[i].getAttribute && nodes[i].getAttribute('aria-label')) || nodes[i].textContent || '').trim();
      if (name === 'Reply' || name === 'השב') return nodes[i];
    }
    return null;
  }

  function composeBox() {
    const nodes = document.querySelectorAll('[data-glance-reply-body], div[role="textbox"][contenteditable="true"]');
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].closest && nodes[i].closest('.flow-lane-ms')) continue;
      return nodes[i];
    }
    return null;
  }

  function flatText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function abandonCompose(text) {
    const box = composeBox();
    if (!box) return;
    const cur = flatText(box.textContent || box.innerText || '');
    const want = flatText(text);
    if (want && cur.indexOf(want) >= 0) return;
    if (cur) return;
    box.textContent = '';
    const nodes = document.querySelectorAll('button, [role="button"]');
    for (let i = 0; i < nodes.length; i++) {
      const name = String((nodes[i].getAttribute && nodes[i].getAttribute('aria-label')) || nodes[i].textContent || '').trim();
      if (name === 'Discard' || name === 'בטל' || name === 'מחק') {
        nodes[i].click();
        break;
      }
    }
  }

  function insertCompose(text) {
    const want = flatText(text);
    if (!want) return { ok: false, reason: 'no-text' };
    const btn = replyControl();
    if (btn) btn.click();
    const box = composeBox();
    if (!box) return { ok: false, reason: 'no-compose' };
    const cur = flatText(box.textContent || box.innerText || '');
    if (cur && cur.indexOf(want) < 0) return { ok: false, reason: 'compose-not-empty' };
    if (cur.indexOf(want) < 0) box.textContent = String(text || '').trim();
    const got = flatText(box.textContent || box.innerText || '');
    const ok = !!want && got.indexOf(want) >= 0;
    return { ok: ok, reason: ok ? '' : 'not-inserted' };
  }

  function clearComposeIfUnchanged(text) {
    const box = composeBox();
    if (!box) return true;
    const cur = flatText(box.textContent || box.innerText || '');
    if (cur !== flatText(text)) return false;
    box.textContent = '';
    return true;
  }

  function copyButton(text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flow-lane-copy';
    button.textContent = 'העתק';
    button.addEventListener('click', () => {
      const value = String(text || '');
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(value).catch(() => {});
        return;
      }
      const area = document.createElement('textarea');
      area.value = value;
      button.parentNode.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch (e) { /* the text stays on the card */ }
      area.remove();
    });
    return button;
  }

  function draftStatus(lang, ok) {
    if (!ok) return 'לא הצלחתי להכניס לטיוטה';
    return lang === 'he'
      ? 'פרטי איש הקשר בטיוטה. אתה שולח.'
      : 'Contact details in the draft. You send it.';
  }

  function finishContactsDraft(card, pane, offer, res, button) {
    const lang = offer && offer.params && offer.params.lang === 'he' ? 'he' : 'en';
    if (!res || res.ok !== true || !res.draft) {
      button.disabled = false;
      paintResult(card, res);
      return;
    }
    let messageId = (pane && (pane.itemId || pane.rawUrlId || pane.pathId)) || '';
    if (!messageId) {
      const parse = named('FlowOwaParse');
      if (parse && typeof parse.urlIds === 'function') {
        try {
          const ids = parse.urlIds(location.href) || {};
          messageId = ids.itemId || ids.raw || '';
        } catch (e) { messageId = ''; }
      }
    }
    chrome.runtime.sendMessage({
      type: 'flow:execute-action',
      payload: {
        connectorId: 'outlookDraft',
        body: res.draft,
        comment: res.draft,
        outlookIncomingId: messageId,
        messageId: messageId,
        explicitClick: true
      }
    }, (graph) => {
      const err = chrome.runtime.lastError;
      const opened = insertCompose(res.draft);
      const graphOk = !!(graph && graph.ok === true && graph.ref);
      const verified = !err && opened.ok === true && graphOk && graph.fetchedBack !== false;
      const status = statusNode(card);
      let draft = card.querySelector('.flow-lane-draft');
      if (!draft) {
        draft = document.createElement('div');
        draft.className = 'flow-lane-draft';
        card.appendChild(draft);
      }
      draft.textContent = res.draft;
      if (!verified) {
        abandonCompose(res.draft);
        status.textContent = draftStatus(lang, false);
        status.setAttribute('dir', 'rtl');
        const why = document.createElement('span');
        why.className = 'flow-lane-draft-why';
        why.hidden = true;
        why.textContent = [
          err ? 'channel' : '',
          graph && graph.ok === true ? 'graph-ok' : 'graph-not-ok',
          graph && graph.ref ? 'ref' : 'no-ref',
          graph && graph.fetchedBack === false ? 'fetchedBack-false' : '',
          graph && graph.reason ? String(graph.reason) : '',
          graph && graph.error ? String(graph.error).slice(0, 80) : '',
          opened.ok ? 'compose-ok' : (opened.reason || 'compose-no')
        ].filter(Boolean).join(' ');
        card.appendChild(why);
        if (!card.querySelector('.flow-lane-copy')) card.appendChild(copyButton(res.draft));
        button.disabled = false;
        return;
      }
      status.textContent = draftStatus(lang, true);
      button.hidden = true;
      showDraftUndo(card, graph, res.draft, lang);
    });
  }

  function showDraftUndo(card, graph, text, lang) {
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
      if (clearComposeIfUnchanged(text) === false) {
        statusNode(card).textContent = lang === 'he' ? 'שינית את הטיוטה, השארתי אותה' : 'You edited this. Undo left it alone.';
        return;
      }
      undo.disabled = true;
      chrome.runtime.sendMessage({
        type: 'flow:undo-action',
        connectorId: 'outlookDraft',
        ref: graph.ref,
        created: graph.created
      }, (u) => {
        const err = chrome.runtime.lastError;
        if (err || !u || u.ok !== true) {
          statusNode(card).textContent = (u && u.written) || (lang === 'he' ? 'שינית את הטיוטה, השארתי אותה' : 'You edited this. Undo left it alone.');
          undo.disabled = false;
          return;
        }
        statusNode(card).textContent = 'Undone.';
        undo.hidden = true;
      });
    };
  }

  function paintOffer(offer, pane, text) {
    clearCard();
    clearMailWhy();
    if (offer && offer.connectorId === 'outlookContacts') clearStaleContactsWhy();
    const card = document.createElement('div');
    card.className = 'flow-lane-ms';
    card.setAttribute('data-glance-ms-card', '1');
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
          if (offer.connectorId === 'outlookContacts') {
            finishContactsDraft(card, pane, offer, res, button);
            return;
          }
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
    card.setAttribute('data-glance-ms-card', '1');
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
  let whyKey = '';
  let timer = null;
  let busy = false;

  function readContactsAccess() {
    return new Promise((resolve) => {
      try {
        const store = chrome && chrome.storage && chrome.storage.local;
        if (!store || typeof store.get !== 'function') { resolve(null); return; }
        store.get(['outlookAuth', 'glanceContactsChoice'], (bag) => {
          try { void chrome.runtime.lastError; } catch (e) { /* the read still settles */ }
          const token = bag && bag.outlookAuth && bag.outlookAuth.token;
          const scopes = token ? (token.grantedScopes || token.scopes || token.scope || []) : [];
          resolve({
            grantedScopes: scopes,
            contactsChoice: !!(bag && bag.glanceContactsChoice === true)
          });
        });
      } catch (e) { resolve(null); }
    });
  }

  function reportContactsWhy(reason, detail, key) {
    const mark = key + '|' + String(detail || '');
    if (whyKey === mark) return;
    whyKey = mark;
    try {
      chrome.runtime.sendMessage({
        type: 'flow:contacts-why',
        reason: reason || 'contacts-not-granted',
        detail: detail || ''
      }, () => {
        try { void chrome.runtime.lastError; } catch (e) { /* the log is on the worker */ }
      });
    } catch (e) { /* the card still says how to grant it */ }
  }

  function clearStaleContactsWhy() {
    document.querySelectorAll('.flow-why-not').forEach((node) => {
      const why = (node.getAttribute && node.getAttribute('data-glance-why')) || '';
      if (why.indexOf('contacts-unavailable') >= 0) node.remove();
    });
  }

  function paintGrant(offer, key) {
    clearCard();
    clearStaleContactsWhy();
    const card = document.createElement('div');
    card.className = 'flow-lane-ms';
    card.setAttribute('data-glance-ms-card', '1');
    card.setAttribute('data-connector', offer.connectorId || 'outlookContacts');
    card.setAttribute('data-glance-contacts-why', offer.reason || 'contacts-not-granted');
    const title = document.createElement('div');
    title.className = 'flow-lane-title';
    title.textContent = offer.title || '';
    card.appendChild(title);
    const row = document.createElement('div');
    row.className = 'flow-lane-line';
    row.setAttribute('dir', 'rtl');
    row.textContent = offer.written || quietGrantLine();
    card.appendChild(row);
    place(card);
    clearMailWhy();
    reportContactsWhy(offer.reason || 'contacts-not-granted', offer.detail || '', key);
  }

  function paintLookup(offer, pane, text) {
    clearCard();
    clearMailWhy();
    clearStaleContactsWhy();
    const lang = offer && offer.params && offer.params.lang === 'he' ? 'he' : 'en';
    const card = document.createElement('div');
    card.className = 'flow-lane-ms';
    card.setAttribute('data-glance-ms-card', '1');
    card.setAttribute('data-connector', offer.connectorId || 'outlookContacts');
    const title = document.createElement('div');
    title.className = 'flow-lane-title';
    title.textContent = offer.title || '';
    card.appendChild(title);
    const line = document.createElement('div');
    line.className = 'flow-lane-line';
    line.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    line.textContent = lang === 'he' ? 'מחפש…' : 'Looking…';
    card.appendChild(line);
    place(card);
    sendAction(card, pane, { connectorId: offer.connectorId, params: offer.params, text: text }, (res) => {
      paintLookupResult(card, pane, offer, res);
    });
  }

  function paintLookupResult(card, pane, offer, res) {
    const lang = offer && offer.params && offer.params.lang === 'he' ? 'he' : 'en';
    const name = (offer && offer.params && offer.params.name) || '';
    const line = card.querySelector('.flow-lane-line');
    card.querySelectorAll('.flow-lane-pick, .flow-lane-do').forEach((node) => node.remove());
    const honest = (res && res.written) || (lang === 'he' ? ('לא מצאתי את ' + name + ' באנשי הקשר') : ("I didn't find " + name + ' in Contacts'));
    if (!res || res.ok !== true) {
      if (res && res.reason === 'ambiguous' && Array.isArray(res.choices) && res.choices.length > 1) {
        if (line) line.textContent = lang === 'he' ? 'יש כמה אנשי קשר בשם הזה. בחר אחד.' : 'Several matches. Pick one.';
        res.choices.forEach((choice) => {
          const pick = document.createElement('button');
          pick.type = 'button';
          pick.className = 'flow-lane-pick';
          const label = choice.displayName || name;
          const value = choice.email || choice.phone || '';
          pick.textContent = value ? (label + ' · ' + value) : label;
          pick.addEventListener('click', () => {
            if (pick.disabled) return;
            pick.disabled = true;
            const params = Object.assign({}, offer.params, { chosenId: choice.id, chosenEmail: choice.email || '' });
            sendAction(card, pane, { connectorId: offer.connectorId, params: params }, (picked) => {
              paintLookupResult(card, pane, offer, picked);
            });
          });
          card.appendChild(pick);
        });
        return;
      }
      if (line) {
        line.textContent = honest;
        if (lang === 'he') line.setAttribute('dir', 'rtl');
      }
      return;
    }
    const address = res.email || res.phone || '';
    if (!res.draft || !address || !res.button) {
      if (line) line.textContent = honest;
      return;
    }
    if (line) {
      line.textContent = address;
      line.setAttribute('dir', 'ltr');
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flow-lane-do';
    button.textContent = res.button;
    button.addEventListener('click', () => {
      if (button.disabled || !res.draft) return;
      button.disabled = true;
      finishContactsDraft(card, pane, offer, res, button);
    });
    card.appendChild(button);
  }

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
      const chipUp = cardHost && cardHost.isConnected;
      const list = chipUp ? mods : mods.filter((mod) => mod && mod.CONNECTOR === 'outlookContacts');
      let access = null;
      if (list.some((mod) => mod && mod.CONNECTOR === 'outlookContacts')) {
        try { access = await readContactsAccess(); } catch (e) { access = null; }
      }
      const offerDeps = access || { grantedScopes: [], contactsChoice: false };
      for (let i = 0; i < mods.length; i++) {
        if (typeof mods[i].receiptFromLog !== 'function') continue;
        const row = mods[i].receiptFromLog(log, pane);
        if (row && row.fetchedBack === true) {
          paintReceipt(row);
          return;
        }
      }
      for (let i = 0; i < list.length; i++) {
        let offer = null;
        try { offer = list[i].offer(ctx, list[i].CONNECTOR === 'outlookContacts' ? offerDeps : undefined); } catch (e) { offer = null; }
        if (offer && offer.grant) {
          paintGrant(offer, key);
          return;
        }
        if (offer && offer.lookup) {
          paintLookup(offer, pane, text);
          return;
        }
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

  try {
    if (chrome.storage && chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === 'function') {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!changes.glanceContactsChoice && !changes.outlookAuth) return;
        paneKey = '';
        whyKey = '';
        schedule();
      });
    }
  } catch (e) { /* the next mail open still reads the choice */ }

  function bootWatch() {
    if (named('FlowOwaParse')) {
      if (!watching) {
        watching = true;
        watch();
      }
      return;
    }
    setTimeout(bootWatch, 250);
  }

  bootWatch();

  globalThis.FlowLaneMsPage = { attach: attach };
})();
