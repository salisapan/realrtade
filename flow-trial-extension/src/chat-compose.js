// The only way a chat surface puts text into the open conversation.
// It writes the input box. It does not press Enter, click Send, or submit a form.
// A non-empty box is left alone. sends is always false.
const FlowChatCompose = (() => {
  function textOf(el) {
    if (!el) return '';
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') return String(el.value || '');
    const shown = el.innerText != null && String(el.innerText) !== '' ? el.innerText : el.textContent;
    return String(shown || '');
  }

  function inputEvent(data) {
    try { return new InputEvent('input', { bubbles: true, inputType: 'insertText', data: data }); }
    catch (e) { return new Event('input', { bubbles: true }); }
  }

  function writeBox(el, body) {
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, body);
      else el.value = body;
      return;
    }
    el.textContent = body;
  }

  function normalizeBody(text) {
    return String(text || '').replace(/[\r\n]+/g, ' ').trim();
  }

  function draftHash(text) {
    const body = normalizeBody(text);
    let h = 0;
    for (let i = 0; i < body.length; i++) h = ((h << 5) - h + body.charCodeAt(i)) | 0;
    return 'd' + (h >>> 0).toString(16);
  }

  function threadIdHash(threadId) {
    const t = String(threadId || '');
    let h = 0;
    for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
    return 't' + (h >>> 0).toString(16);
  }

  // Returns { ok, sends: false, reason }. Never sends.
  function insertDraft(el, text) {
    const body = normalizeBody(text);
    if (!el || !body) return { ok: false, sends: false, reason: el ? 'empty' : 'no-box' };
    if (textOf(el).trim()) return { ok: false, sends: false, reason: 'composer-not-empty' };
    try { if (typeof el.focus === 'function') el.focus(); } catch (e) { /* the box can still take the text */ }
    let inserted = false;
    const editable = el.isContentEditable === true || (el.getAttribute && el.getAttribute('contenteditable') === 'true');
    if (editable && typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      try { inserted = document.execCommand('insertText', false, body) === true; } catch (e) { inserted = false; }
    }
    if (inserted && !textOf(el).trim()) inserted = false;
    if (!inserted) {
      writeBox(el, body);
      if (typeof el.dispatchEvent === 'function') el.dispatchEvent(inputEvent(body));
    }
    return { ok: textOf(el).indexOf(body) >= 0, sends: false, reason: 'drafted' };
  }

  // Undo of a draft: the box is emptied only while it still holds exactly the words Glance put there. A box the person typed in is left alone.
  function clearIfUnchanged(el, text) {
    const body = normalizeBody(text);
    if (!el || !body) return { ok: false, reason: el ? 'empty' : 'no-box' };
    const now = normalizeBody(textOf(el));
    if (!now) return { ok: true, reason: 'already-empty' };
    if (now !== body) return { ok: false, reason: 'user-edited' };
    writeBox(el, '');
    if (typeof el.dispatchEvent === 'function') el.dispatchEvent(inputEvent(''));
    return { ok: !textOf(el).trim(), reason: 'cleared' };
  }

  function undoDraft(el, text, expectedHash) {
    const body = normalizeBody(text);
    const now = normalizeBody(textOf(el));
    if (expectedHash && draftHash(now) !== expectedHash) return { ok: false, reason: 'edited', sends: false };
    return clearIfUnchanged(el, body);
  }

  function sleep(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
  }

  async function insertDraftWithProof(el, text, meta) {
    const body = normalizeBody(text);
    const wrote = insertDraft(el, body);
    wrote.sends = false;
    if (!wrote.ok) return wrote;
    const m = meta || {};
    const proof = {
      surface: m.surface || null,
      threadIdHash: threadIdHash(m.threadId || ''),
      draftHash: draftHash(body),
      ts: Date.now()
    };
    await sleep(300);
    const back = normalizeBody(textOf(el));
    const fetchedBack = back.indexOf(body) >= 0;
    return Object.assign({}, wrote, { proof: proof, fetchedBack: fetchedBack, draftText: body, sends: false });
  }

  return { insertDraft, clearIfUnchanged, undoDraft, insertDraftWithProof, draftHash, threadIdHash, normalizeBody };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatCompose };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatCompose = FlowChatCompose;
