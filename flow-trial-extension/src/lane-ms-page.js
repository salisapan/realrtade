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
    if (!cur) return true;
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

  function draftCandidates(pane) {
    const out = [];
    [pane && pane.pathId, pane && pane.rawUrlId, pane && pane.itemId, pane && pane.conversationId].forEach((id) => {
      const s = String(id || '').trim();
      if (s && out.indexOf(s) < 0) out.push(s);
    });
    return out;
  }

  function draftTarget(pane) {
    const candidates = draftCandidates(pane);
    const resolve = globalThis.FlowOutlookDraftTarget;
    if (typeof resolve !== 'function') {
      return Promise.resolve({ id: '', immutable: false, how: 'resolver-missing', candidates: candidates });
    }
    return Promise.resolve(resolve(pane)).then((found) => ({
      id: found && found.id ? String(found.id) : '',
      immutable: !!(found && found.immutable),
      how: (found && found.how) || (found && found.id ? 'resolved' : 'unproven'),
      candidates: candidates
    }), () => ({ id: '', immutable: false, how: 'resolver-failed', candidates: candidates }));
  }

  function markInDraft(card, button, lang) {
    card.setAttribute('data-glance-draft-state', 'in-draft');
    const status = statusNode(card);
    status.textContent = draftStatus(lang, true);
    status.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    button.hidden = true;
  }

  function restoreInsert(card, button, lang) {
    card.removeAttribute('data-glance-draft-state');
    const status = statusNode(card);
    status.textContent = '';
    button.hidden = false;
    button.disabled = false;
    button.textContent = lang === 'he' ? 'הכנס לטיוטה' : 'Put in draft';
    const undo = card.querySelector('.flow-lane-undo');
    if (undo) undo.hidden = true;
  }

  function mailIdentity(pane) {
    return [pane && pane.itemId || '', pane && pane.rawUrlId || '', pane && pane.pathId || '', pane && pane.conversationId || '', pane && pane.subject || ''].join('|');
  }

  function draftCardStays(card, sameMail) {
    if (!sameMail || !card) return false;
    if (card.getAttribute && card.getAttribute('data-glance-draft-hold') === '1') return true;
    if (card.getAttribute && card.getAttribute('data-glance-draft-state') === 'in-draft') return true;
    if (card.querySelector && card.querySelector('.flow-lane-draft-why')) return true;
    return false;
  }

  function glanceFreeText(text) {
    let t = String(text || '');
    const nodes = document.querySelectorAll('.flow-lane-ms');
    for (let i = 0; i < nodes.length; i++) {
      const chunk = String(nodes[i].innerText || nodes[i].textContent || '').trim();
      if (chunk) t = t.split(chunk).join(' ');
    }
    return t.replace(/\s+/g, ' ').trim();
  }

  let holdMail = '';
  let heldDraft = null;

  function keepDraftCard() {
    if (!heldDraft || heldDraft.isConnected) return;
    const state = heldDraft.getAttribute && heldDraft.getAttribute('data-glance-draft-state');
    const hold = heldDraft.getAttribute && heldDraft.getAttribute('data-glance-draft-hold');
    if (state !== 'in-draft' && hold !== '1') return;
    place(heldDraft);
  }

  function finishContactsDraft(card, pane, offer, res, button) {
    const lang = offer && offer.params && offer.params.lang === 'he' ? 'he' : 'en';
    if (card) card.setAttribute('data-glance-draft-hold', '1');
    heldDraft = card || null;
    holdMail = mailIdentity(pane);
    if (!res || res.ok !== true || !res.draft) {
      button.disabled = false;
      paintResult(card, res);
      return;
    }
    draftTarget(pane).then((target) => {
      chrome.runtime.sendMessage({
        type: 'flow:execute-action',
        payload: {
          connectorId: 'outlookDraft',
          body: res.draft,
          comment: res.draft,
          requireProvenId: true,
          outlookCandidates: (target && target.candidates) || [],
          outlookIncomingId: (target && target.id) || '',
          messageId: (target && target.id) || '',
          outlookImmutableId: !!(target && target.immutable),
          outlookIdHow: (target && target.how) || '',
          internetMessageId: (pane && pane.internetMessageId) || '',
          subject: (pane && pane.subject) || '',
          senderEmail: (pane && pane.senderEmail) || '',
          ownSenderEmail: (pane && pane.ownSenderEmail) || '',
          openSenderEmail: (pane && (pane.openSenderEmail || pane.senderEmail || pane.ownSenderEmail)) || '',
          conversationId: (pane && pane.conversationId) || '',
          receivedDateTime: (pane && pane.receivedDateTime) || '',
          openFolder: (pane && pane.openFolder) || '',
          headerHasAt: pane && pane.headerHasAt ? 1 : 0,
          senderSkip: (pane && pane.senderSkip) || '',
          explicitClick: true
        }
      }, (graph) => {
        const err = chrome.runtime.lastError;
        const graphOk = !err && !!(graph && graph.ok === true && graph.ref);
        const readBack = graphOk && graph.fetchedBack !== false;
        if (!graphOk || !readBack) {
          const status = statusNode(card);
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
            graph && graph.errorCode ? String(graph.errorCode) : '',
            graph && graph.how ? String(graph.how) : (target && target.how) || '',
            target && target.id ? '' : 'unproven'
          ].filter(Boolean).join(' ');
          card.appendChild(why);
          if (!card.querySelector('.flow-lane-copy')) card.appendChild(copyButton(res.draft));
          button.disabled = false;
          return;
        }
        let draft = card.querySelector('.flow-lane-draft');
        if (!draft) {
          draft = document.createElement('div');
          draft.className = 'flow-lane-draft';
          card.appendChild(draft);
        }
        draft.textContent = res.draft;
        draft.setAttribute('data-glance-draft-id', String(graph.ref));
        markInDraft(card, button, lang);
        showDraftUndo(card, graph, res.draft, lang, button, graph.immutable === true || target.immutable === true);
        heldDraft = card;
        if (!card.isConnected) keepDraftCard();
      });
    });
  }

  function showDraftUndo(card, graph, text, lang, button, immutable) {
    let undo = card.querySelector('.flow-lane-undo');
    if (!undo) {
      undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'flow-lane-undo';
      card.appendChild(undo);
    }
    undo.textContent = lang === 'he' ? 'בטל' : 'Undo';
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
        created: graph.created,
        createdBodyHash: graph.createdBodyHash || '',
        outlookImmutableId: immutable === true
      }, (u) => {
        const err = chrome.runtime.lastError;
        if (err || !u || u.ok !== true) {
          const edited = u && (u.reason === 'user-edited' || u.reason === 'unconfirmed');
          statusNode(card).textContent = (lang === 'he' && edited)
            ? 'שינית את הטיוטה, השארתי אותה'
            : ((u && u.written) || (lang === 'he' ? 'שינית את הטיוטה, השארתי אותה' : 'You edited this. Undo left it alone.'));
          undo.disabled = false;
          return;
        }
        restoreInsert(card, button, lang);
      });
    };
  }

  function recallPayload(pane) {
    return {
      subject: (pane && pane.subject) || '',
      conversationId: (pane && pane.conversationId) || '',
      internetMessageId: (pane && pane.internetMessageId) || '',
      openFolder: (pane && pane.openFolder) || '',
      senderEmail: (pane && pane.senderEmail) || '',
      ownSenderEmail: (pane && pane.ownSenderEmail) || '',
      openSenderEmail: (pane && (pane.openSenderEmail || pane.senderEmail || pane.ownSenderEmail)) || ''
    };
  }

  function recallDraft(pane) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'flow:outlook-draft-recall', payload: recallPayload(pane) }, (res) => {
          try { void chrome.runtime.lastError; } catch (e) { /* the card still offers insert */ }
          resolve(res || null);
        });
      } catch (e) { resolve(null); }
    });
  }

  function paintRecalledDraft(pane, rec) {
    clearCard();
    const lang = /[\u0590-\u05FF]/.test(String((pane && pane.subject) || '') + String((pane && pane.text) || '') + String((rec && rec.body) || '')) ? 'he' : 'en';
    const card = document.createElement('div');
    card.className = 'flow-lane-ms';
    card.setAttribute('data-glance-ms-card', '1');
    card.setAttribute('data-connector', 'outlookContacts');
    card.setAttribute('data-glance-draft-hold', '1');
    card.setAttribute('data-glance-draft-state', 'in-draft');
    const status = statusNode(card);
    status.textContent = draftStatus(lang, true);
    status.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    const draft = document.createElement('div');
    draft.className = 'flow-lane-draft';
    draft.textContent = (rec && rec.body) || '';
    draft.setAttribute('data-glance-draft-id', String((rec && rec.ref) || ''));
    card.appendChild(draft);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flow-lane-do';
    button.hidden = true;
    button.textContent = lang === 'he' ? 'הכנס לטיוטה' : 'Put in draft';
    card.appendChild(button);
    place(card);
    showDraftUndo(card, {
      ref: rec && rec.ref,
      created: rec && rec.created,
      createdBodyHash: (rec && rec.createdBodyHash) || '',
      immutable: !!(rec && rec.immutable)
    }, (rec && rec.body) || '', lang, button, !!(rec && rec.immutable));
    heldDraft = card;
    holdMail = mailIdentity(pane);
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

  function ownFromAuth(auth) {
    const out = [];
    function add(raw) {
      const e = String(raw || '').trim().toLowerCase();
      if (e && e.indexOf('@') > 0 && out.indexOf(e) < 0) out.push(e);
    }
    if (!auth) return out;
    if (auth.account) { add(auth.account.address); add(auth.account.mail); }
    (auth.ownAddresses || []).forEach(add);
    if (auth.profile) {
      add(auth.profile.mail);
      add(auth.profile.userPrincipalName);
      (auth.profile.proxyAddresses || []).forEach((p) => {
        const m = String(p || '').match(/^smtp:(.+)$/i);
        if (m) add(m[1]);
      });
    }
    return out;
  }

  function readPane(own) {
    const parse = named('FlowOwaParse');
    if (!parse || typeof parse.readPane !== 'function') return null;
    try { return parse.readPane(document, location.href, { own: own || [] }) || null; } catch (e) { return null; }
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
    keepDraftCard();
    if (busy) return;
    let pane = readPane();
    if (!pane || (!pane.subject && !pane.text)) return;
    const identity = mailIdentity(pane);
    const held = document.querySelector('.flow-lane-ms');
    if (draftCardStays(held, holdMail === identity)) return;
    const body = glanceFreeText(pane.text);
    const key = [pane.itemId || '', pane.rawUrlId || '', pane.subject || '', body.slice(0, 240)].join('|');
    if (key === paneKey) return;
    paneKey = key;
    busy = true;
    try {
      const text = (pane.subject ? pane.subject + '\n' : '') + body;
      const ctx = { text: text, subject: pane.subject || '' };
      let state = null;
      const store = named('FlowStorage');
      if (store && typeof store.get === 'function') {
        try { state = await store.get(); } catch (e) { state = null; }
      }
      if (paneKey !== key) return;
      const owned = readPane(ownFromAuth(state && state.outlookAuth));
      if (owned && mailIdentity(owned) === identity) pane = owned;
      const log = (state && state.log) || [];
      const mods = modules();
      const chipUp = cardHost && cardHost.isConnected;
      const list = chipUp ? mods : mods.filter((mod) => mod && mod.CONNECTOR === 'outlookContacts');
      let access = null;
      if (list.some((mod) => mod && mod.CONNECTOR === 'outlookContacts')) {
        try { access = await readContactsAccess(); } catch (e) { access = null; }
      }
      const offerDeps = access || { grantedScopes: [], contactsChoice: false };
      if (list.some((mod) => mod && mod.CONNECTOR === 'outlookContacts')) {
        let recalled = null;
        try { recalled = await recallDraft(pane); } catch (e) { recalled = null; }
        if (paneKey !== key) return;
        if (recalled && recalled.ok === true && recalled.ref) {
          paintRecalledDraft(pane, recalled);
          return;
        }
      }
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
        holdMail = '';
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
  globalThis.FlowLaneMsPage.draftCardStays = draftCardStays;
  globalThis.FlowLaneMsPage.finishContactsDraft = finishContactsDraft;
  globalThis.FlowLaneMsPage.keepDraftCard = keepDraftCard;
  globalThis.FlowLaneMsPage.paintRecalledDraft = paintRecalledDraft;
})();
