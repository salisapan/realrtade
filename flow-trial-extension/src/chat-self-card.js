// One Do It on a self-chat ask. Do It writes the compose box. Undo clears that text
// only while it is still exactly the draft. This file never presses Send.
const FlowChatSelfCard = (() => {
  function node() {
    try { return document.getElementById('glance-self-draft'); }
    catch (e) { return null; }
  }

  function clear() {
    const card = node();
    if (card && card.remove) card.remove();
  }

  function hebrewUi(text) {
    if (/[\u0590-\u05FF]/.test(String(text || ''))) return true;
    try {
      const lang = (document.documentElement && document.documentElement.lang) || '';
      if (/^he/i.test(lang)) return true;
    } catch (e) { /* no document */ }
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function' && /^he/i.test(chrome.i18n.getUILanguage() || '')) return true;
    } catch (e) { /* no chrome language */ }
    return false;
  }

  function labels(text) {
    const he = hebrewUi(text);
    try {
      if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.chrome === 'function') {
        const table = FlowDisplay.chrome(he ? 'he' : 'en') || {};
        if (table.doIt && table.undo) return { doIt: table.doIt, undo: table.undo, he: he };
      }
    } catch (e) { /* the shared table is optional */ }
    return he ? { doIt: 'בצע', undo: 'בטל', he: true } : { doIt: 'Do It', undo: 'Undo', he: false };
  }

  function paint(opts) {
    const o = opts || {};
    const text = String(o.text || '');
    if (!o.self) { clear(); return { shown: false, reason: 'not-self' }; }
    if (o.fyi) { clear(); return { shown: false, reason: 'fyi' }; }
    if (!o.ask) { clear(); return { shown: false, reason: 'not-an-ask' }; }
    const existing = node();
    if (existing && existing.getAttribute('data-glance-key') === text) return { shown: true, reason: 'already' };
    clear();
    const words = labels(text);
    const card = document.createElement('div');
    card.id = 'glance-self-draft';
    card.className = 'flow-chip-host';
    card.setAttribute('data-glance-self-draft', '1');
    card.setAttribute('data-glance-key', text);
    card.setAttribute('dir', words.he ? 'rtl' : 'ltr');
    const doIt = document.createElement('button');
    doIt.type = 'button';
    doIt.className = 'flow-chip';
    doIt.setAttribute('data-glance-do-it', '1');
    doIt.textContent = words.doIt;
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'flow-chip';
    undo.setAttribute('data-glance-undo', '1');
    undo.textContent = words.undo;
    undo.hidden = true;
    let drafted = '';
    doIt.addEventListener('click', () => {
      const box = typeof o.composer === 'function' ? o.composer() : null;
      const draft = typeof o.draft === 'function' ? String(o.draft(text) || '') : '';
      if (typeof FlowChatCompose === 'undefined' || typeof FlowChatCompose.insertDraft !== 'function') {
        if (typeof o.whyNot === 'function') o.whyNot('compose-missing');
        return;
      }
      const wrote = FlowChatCompose.insertDraft(box, draft);
      if (!(wrote && wrote.ok && wrote.sends === false)) {
        if (typeof o.whyNot === 'function') o.whyNot((wrote && wrote.reason) || 'draft-failed');
        return;
      }
      drafted = draft;
      undo.hidden = false;
    });
    undo.addEventListener('click', () => {
      const box = typeof o.composer === 'function' ? o.composer() : null;
      if (typeof FlowChatCompose === 'undefined' || typeof FlowChatCompose.clearIfUnchanged !== 'function') return;
      const cleared = FlowChatCompose.clearIfUnchanged(box, drafted);
      if (cleared && cleared.ok) undo.hidden = true;
    });
    card.appendChild(doIt);
    card.appendChild(undo);
    const mount = document.body || document.documentElement;
    mount.appendChild(card);
    return { shown: true, reason: 'offered' };
  }

  return { paint: paint, clear: clear };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowChatSelfCard = FlowChatSelfCard;
if (typeof module !== 'undefined') module.exports = { FlowChatSelfCard };
