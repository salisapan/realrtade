// Card for a Messenger or Instagram ask that arrived through Meta's official webhook.
// Do It sends only the reply in the box. The worker refuses when the switch is off.
// Undo cannot take a sent Meta message back, and the card says so.
const FlowMetaOfficialCard = (() => {
  const COPY = {
    he: {
      off: 'הנתיב כבוי.',
      empty: 'אין בקשה פתוחה.',
      title: 'תשובה לאישור',
      reply: 'התשובה',
      hint: 'התשובה נשלחת רק בלחיצה על בצע.',
      sent: 'התשובה נשלחה ואומתה.',
      noUndo: 'אי אפשר למשוך הודעה שנשלחה. Meta לא נותנת לבטל שליחה.',
      unverified: 'לא אומת',
      notConfigured: 'הנתיב לא מוגדר עדיין.',
      window: 'חלון 24 השעות של Meta נסגר.',
      emptyReply: 'חסרה תשובה.',
      failed: 'לא נשלח.'
    },
    en: {
      off: 'This lane is off.',
      empty: 'Nothing to close.',
      title: 'Reply to approve',
      reply: 'Reply',
      hint: 'This reply is sent only when you press Do It.',
      sent: 'The reply was sent and read back.',
      noUndo: 'A sent reply stays sent. Meta does not take it back.',
      unverified: "Couldn't confirm",
      notConfigured: 'This lane is not configured yet.',
      window: "Meta's 24 hour window has closed.",
      emptyReply: 'The reply is empty.',
      failed: 'Not sent.'
    }
  };

  function words(lang) {
    return COPY[lang === 'he' ? 'he' : 'en'];
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (r) => {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) { resolve({ ok: false, reason: 'runtime' }); return; }
          resolve(r || { ok: false });
        });
      } catch (e) { resolve({ ok: false, reason: 'runtime' }); }
    });
  }

  function root() {
    return document.getElementById('glance-meta-official');
  }

  function pageLang() {
    const fromDoc = String((document.documentElement && document.documentElement.getAttribute('lang')) || '').toLowerCase();
    if (fromDoc.indexOf('he') === 0) return 'he';
    if (String(navigator.language || '').toLowerCase().indexOf('he') === 0) return 'he';
    return 'en';
  }

  function setState(state, text) {
    const node = root();
    if (!node) return;
    node.setAttribute('data-glance-meta', state);
    let line = node.querySelector('[data-glance-meta-line]');
    if (!line) {
      line = document.createElement('p');
      line.setAttribute('data-glance-meta-line', '1');
      node.appendChild(line);
    }
    line.textContent = text || '';
  }

  function reasonLine(w, reason) {
    if (reason === 'not-configured' || reason === 'not-authorized') return w.notConfigured;
    if (reason === 'window') return w.window;
    if (reason === 'unverified') return w.unverified;
    if (reason === 'empty') return w.emptyReply;
    return w.failed;
  }

  async function onDoIt(item, box, host, chip) {
    const w = words(item.lang);
    const text = String(box.value || '').trim();
    if (!text) {
      if (typeof FlowChipHost !== 'undefined') FlowChipHost.setChipState(chip, 'flow-chip-error', w.emptyReply);
      return;
    }
    chip.disabled = true;
    const result = await send({
      type: 'flow:meta-official-send',
      approved: true,
      channel: item.channel,
      pageId: item.pageId,
      recipientId: item.recipientId,
      messageId: item.messageId,
      timestamp: item.timestamp,
      text: text,
      lang: item.lang
    });
    if (result && result.ok && result.proof && result.proof.fetchedBack === true) {
      setState('handled', w.sent);
      FlowChipHost.showDraftReceipt(host, {
        uiLang: item.lang,
        status: 'Handled.',
        written: w.sent,
        onUndo: function () {
          const u = (typeof FlowMetaOfficial !== 'undefined' && FlowMetaOfficial.undo) ? FlowMetaOfficial.undo() : { he: w.noUndo, en: w.noUndo };
          return { ok: false, written: item.lang === 'he' ? u.he : u.en };
        }
      });
      return;
    }
    chip.disabled = false;
    const line = reasonLine(w, result && result.reason);
    setState(result && result.reason === 'unverified' ? 'unverified' : 'error', line);
    FlowChipHost.setChipState(chip, 'flow-chip-error', line);
  }

  function showItem(item) {
    const node = root();
    const lang = item.lang === 'he' ? 'he' : 'en';
    const w = words(lang);
    node.setAttribute('lang', lang);
    node.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    node.replaceChildren();
    const line = document.createElement('p');
    line.setAttribute('data-glance-meta-line', '1');
    node.appendChild(line);
    const label = document.createElement('label');
    label.textContent = w.reply;
    label.setAttribute('for', 'glance-meta-reply');
    const box = document.createElement('textarea');
    box.id = 'glance-meta-reply';
    box.value = item.draft || '';
    box.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    node.appendChild(label);
    node.appendChild(box);
    const mount = document.createElement('div');
    mount.id = 'glance-meta-card';
    node.appendChild(mount);
    if (typeof FlowChipHost === 'undefined') return;
    FlowChipHost.setUiLang(lang);
    FlowChipHost.inject(mount, {
      uiLang: lang,
      app: item.channel,
      messageId: item.messageId,
      process: { id: 'meta-official-reply', name: w.title, closingLine: w.hint, steps: [] },
      intent: { label: w.hint }
    }, {
      onDoIt: function (host, chip) { onDoIt(item, box, host, chip); },
      onDismiss: function (host) { host.remove(); setState('empty', w.empty); }
    });
    setState('card', '');
  }

  async function start() {
    const status = await send({ type: 'flow:meta-official-status' });
    const lang = pageLang();
    if (!status || status.on !== true) {
      setState('off', words(lang).off);
      return;
    }
    const pending = await send({ type: 'flow:meta-official-pending' });
    const items = pending && Array.isArray(pending.items) ? pending.items : [];
    if (!items.length) {
      setState('empty', words(lang).empty);
      return;
    }
    showItem(items[0]);
  }

  return { start: start, words: words };
})();

if (typeof module !== 'undefined') module.exports = { FlowMetaOfficialCard };
else if (typeof globalThis !== 'undefined') globalThis.FlowMetaOfficialCard = FlowMetaOfficialCard;
