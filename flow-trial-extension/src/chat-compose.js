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

  // Returns { ok, sends: false, reason }. Never sends.
  function insertDraft(el, text) {
    const body = String(text || '').replace(/[\r\n]+/g, ' ').trim();
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

  return { insertDraft };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatCompose };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatCompose = FlowChatCompose;
