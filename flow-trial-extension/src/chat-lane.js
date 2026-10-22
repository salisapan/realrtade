// Shared by the chat content scripts. Reads a decision from src/chat-draft.js,
// asks the worker for sources the person already connected, and inserts one draft
// through src/chat-compose.js. This file does not press Enter or click Send.
// A fact ask uses the existing flow:fact-sources message. A place ask uses
// flow:chat-evidence, which returns locations only.
const FlowChatLane = (() => {
  function runtimeAlive() {
    try { return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage); }
    catch (e) { return false; }
  }

  function ask(type, payload) {
    return new Promise((resolve) => {
      if (!runtimeAlive()) {
        resolve({ ok: false, reason: 'invalidated' });
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: type, payload: payload }, (r) => {
          let err = null;
          try { err = chrome.runtime && chrome.runtime.lastError; } catch (e) { resolve({ ok: false, reason: 'invalidated' }); return; }
          if (!runtimeAlive()) { resolve({ ok: false, reason: 'invalidated' }); return; }
          if (err && /invalidated/i.test(String(err.message || ''))) { resolve({ ok: false, reason: 'invalidated' }); return; }
          if (err) { resolve({ ok: false, reason: 'runtime' }); return; }
          resolve(r || { ok: false });
        });
      } catch (e) {
        resolve({ ok: false, reason: /invalidated/i.test(String(e && e.message || e)) ? 'invalidated' : 'runtime' });
      }
    });
  }

  function bagFromFact(detected, reply) {
    const fact = detected.fact || {};
    const kind = fact.sourceKind === 'doc' ? 'docs' : 'sheets';
    const connected = { sheets: kind === 'sheets', docs: kind === 'docs', calendar: false, drive: false, thread: true, gmail: false, outlook: false };
    if (!reply || reply.ok === false || reply.truncated || reply.reason === 'not-connected') {
      return { connected, facts: null, events: null };
    }
    let match = null;
    if (typeof FlowFactReply !== 'undefined' && typeof FlowFactReply.resolve === 'function') {
      match = FlowFactReply.resolve(fact, reply.sources || [], { truncated: false });
    }
    const facts = match && match.value != null
      ? [{ value: String(match.value), source: kind, name: match.fileName || null, id: match.fileId || null }]
      : [];
    return { connected, facts, events: [] };
  }

  // box is the open chat's input. input.evidence skips the worker (tests).
  // A missing box, a veto, or two answers leaves the page untouched.
  async function draftInto(box, input) {
    const i = input || {};
    if (typeof FlowChatDraft === 'undefined' || typeof FlowChatCompose === 'undefined') {
      return { ok: false, sends: false, reason: 'missing' };
    }
    const detected = FlowChatDraft.detect(i.text, i);
    let evidence = Object.prototype.hasOwnProperty.call(i, 'evidence') ? i.evidence : null;
    if (evidence == null && detected && detected.fetch) {
      if (detected.kind === 'fact') {
        const reply = await ask('flow:fact-sources', detected.fact || {});
        if (reply && reply.reason === 'invalidated') return { ok: false, sends: false, reason: 'invalidated' };
        evidence = bagFromFact(detected, reply);
      } else {
        const reply = await ask('flow:chat-evidence', detected.fetch);
        if (reply && reply.reason === 'invalidated') return { ok: false, sends: false, reason: 'invalidated' };
        evidence = (reply && reply.evidence) || { connected: { calendar: false }, events: null };
      }
    }
    const judged = FlowChatDraft.judge(Object.assign({}, i, { evidence: evidence || {}, detected: detected }));
    if (!judged || judged.sends !== false || !judged.show || !judged.draft) {
      const reason = (judged && judged.reason) || 'silence';
      try { console.info('[Glance] whyNotShown: ' + reason); } catch (e) { /* the console can be missing */ }
      return { ok: false, sends: false, reason: reason, judged: judged };
    }
    const wrote = FlowChatCompose.insertDraft(box, judged.draft);
    wrote.sends = false;
    wrote.judged = judged;
    if (wrote.ok) showComposerUndo(box, judged.draft, i);
    return wrote;
  }

  function pageDoc() {
    if (typeof document !== 'undefined') return document;
    return globalThis.document || null;
  }

  function draftReceiptHost() {
    const document = pageDoc();
    if (!document || typeof document.getElementById !== 'function') return null;
    let el = document.getElementById('glance-chat-draft-receipt');
    if (!el && typeof document.createElement === 'function') {
      el = document.createElement('div');
      el.id = 'glance-chat-draft-receipt';
      el.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000;width:min(360px,calc(100vw - 40px));';
      const root = document.body || document.documentElement;
      if (root && typeof root.appendChild === 'function') root.appendChild(el);
    }
    return el;
  }

  function showComposerUndo(box, draftText, input) {
    const FlowChipHost = globalThis.FlowChipHost;
    const FlowChatCompose = globalThis.FlowChatCompose;
    if (!box || !draftText || typeof FlowChipHost === 'undefined' || typeof FlowChatCompose === 'undefined') return;
    const host = draftReceiptHost();
    if (!host) return;
    const he = /[֐-׿]/.test(String((input && input.text) || draftText || ''));
    FlowChipHost.showDraftReceipt(host, {
      uiLang: he ? 'he' : 'en',
      status: he ? 'טיוטה בתיבה.' : 'Draft in the box.',
      written: he ? 'אפשר לערוך או לשלוח. Glance לא שולח.' : 'You can edit or send. Glance will not send.',
      onUndo: () => {
        const r = FlowChatCompose.undoDraft(box, draftText);
        if (r && r.ok) {
          try { host.remove(); } catch (e) { /* gone */ }
        }
        return r || { ok: false, sends: false };
      }
    });
  }

  return { draftInto, showComposerUndo };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatLane };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatLane = FlowChatLane;
