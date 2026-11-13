(() => {
  const paste = document.getElementById('paste');
  const note = document.getElementById('note');
  const host = document.getElementById('card-host');
  const receiptEl = document.getElementById('receipt');
  const consentBox = document.getElementById('consent');
  const drop = document.getElementById('drop');
  let last = null;

  function send(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(Object.assign({ type: type }, payload || {}), (r) => {
          const err = chrome.runtime.lastError;
          if (err) resolve({ ok: false, reason: 'runtime' });
          else resolve(r || { ok: false });
        });
      } catch (e) { resolve({ ok: false, reason: 'runtime' }); }
    });
  }

  function he() { return /[֐-׿]/.test(paste.value || ''); }

  function setNote(msg) { note.textContent = msg || ''; }

  async function ensureConsent() {
    const bag = await new Promise((resolve) => chrome.storage.local.get({ whatsappShareModelConsentAt: 0 }, resolve));
    if (bag.whatsappShareModelConsentAt) { consentBox.hidden = true; return true; }
    consentBox.hidden = false;
    return false;
  }

  document.getElementById('consent-ok').addEventListener('click', async () => {
    await send('flow:whatsapp-share-model-consent', { given: true });
    consentBox.hidden = true;
  });

  function clearCard() {
    host.innerHTML = '';
    receiptEl.hidden = true;
    last = null;
  }

  function showReceipt(r) {
    if (!r || !r.receipt) return;
    receiptEl.hidden = false;
    const line = he() ? (r.receipt.honestLineHe || r.receipt.honestLine) : r.receipt.honestLine;
    receiptEl.innerHTML = '<strong>' + line + '</strong>';
  }

  async function onDoIt() {
    if (!last || !last.hasReply) return;
    const r = await send('flow:whatsapp-share-wame-open', {
      payload: {
        sessionId: last.sessionId,
        phone: last.phone,
        draftText: last.draftText,
        waUrl: last.waUrl
      }
    });
    if (!r || !r.ok) {
      setNote(he() ? 'לא נפתח. נסו שוב.' : 'Could not open WhatsApp. Try again.');
      return;
    }
    showReceipt(r);
    setNote(he() ? 'טיוטה נפתחה — אתם שולחים.' : 'Draft opened — you send it.');
  }

  function renderCard(data) {
    clearCard();
    if (!data.process || !data.intent) return;
    if (!data.hasReply) {
      setNote(he() ? 'אין כאן תשובה ל-wa.me (שקט או משימה בלבד).' : 'No wa.me reply for this message (silent or task-only).');
      return;
    }
    const ctx = {
      app: 'whatsapp-share',
      doLabel: he() ? 'פתח טיוטה' : 'Open draft',
      messageId: data.sessionId,
      intent: data.intent,
      process: Object.assign({}, data.process, {
        closedLine: he() ? 'טיוטה נפתחה ב-WhatsApp — אתה שולח.' : 'Draft opened in WhatsApp — you send it.'
      }),
      sender: data.sender || {},
      bodyText: String(data.focusText || '').slice(0, 2000),
      subject: '',
      uiLang: he() ? 'he' : 'en',
      glanceChain: 'whatsapp-share-wame'
    };
    const injected = FlowChipHost.inject(host, ctx, {
      onDoIt: () => { onDoIt(); },
      onDismiss: (h) => { h.remove(); clearCard(); }
    });
    if (!injected) setNote(he() ? 'לא הצלחתי להציג כרטיס.' : 'Could not show the card.');
  }

  async function analyze() {
    setNote('');
    clearCard();
    const ready = await ensureConsent();
    if (!ready) {
      setNote(he() ? 'אשרו את הגילוי כדי להמשיך.' : 'Accept the disclosure to continue.');
      return;
    }
    const kill = await send('flow:whatsapp-share-kill-status');
    if (kill && kill.blocked) {
      setNote(he() ? 'מסלול WhatsApp כבוי.' : 'WhatsApp share lane is off.');
      return;
    }
    const text = String(paste.value || '').trim();
    if (!text) {
      setNote(he() ? 'הדביקו טקסט.' : 'Paste some text.');
      return;
    }
    const r = await send('flow:whatsapp-share-intake', { payload: { text: text } });
    if (!r || !r.ok) {
      const reason = (r && r.reason) || 'silent';
      setNote(he() ? ('שקט (' + reason + ').') : ('Quiet (' + reason + ').'));
      return;
    }
    last = r;
    renderCard(r);
  }

  document.getElementById('analyze').addEventListener('click', analyze);
  document.getElementById('clear').addEventListener('click', () => { paste.value = ''; clearCard(); setNote(''); });

  drop.addEventListener('dragover', (e) => { e.preventDefault(); });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { paste.value = String(reader.result || ''); analyze(); };
    reader.readAsText(file);
  });

  document.querySelectorAll('[data-lang]').forEach((el) => {
    const showHe = he();
    if (el.getAttribute('data-lang') === 'he') el.hidden = !showHe;
    if (el.getAttribute('data-lang') === 'en') el.hidden = showHe;
  });
})();
