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
      let body = payload;
      if (typeof FlowChatRedact !== 'undefined' && FlowChatRedact.redactPayload) {
        body = FlowChatRedact.redactPayload(payload || {}, { names: (payload && payload.redactNames) || [] });
      }
      try {
        chrome.runtime.sendMessage({ type: type, payload: body }, (r) => {
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
    return wrote;
  }

  return { draftInto };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatLane };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatLane = FlowChatLane;
