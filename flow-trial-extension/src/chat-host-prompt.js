// In-page prompt for an optional chat host that is not granted yet.
// The button asks the browser for that one origin. A refusal leaves the button usable.
// This file does not read the chat and does not press Send.
const FlowChatHostPrompt = (() => {
  const LINE_HE = 'Glance קורא את הצ׳אט הפתוח בדפדפן רק אחרי שמדליקים אותו. טיוטה בלבד, והוא לא שולח.';
  const DENIED_HE = 'הדפדפן לא נתן גישה, אז זה נשאר כבוי.';
  const BUTTON_HE = 'הפעל';

  function hostsFor(id) {
    if (id === 'telegram') return ['https://web.telegram.org/*'];
    if (id === 'slack') return ['https://app.slack.com/*'];
    return [];
  }

  function paint(doc, opts) {
    const o = opts || {};
    const documentRef = (doc && typeof doc.createElement === 'function') ? doc : ((doc && doc.ownerDocument) || (typeof document !== 'undefined' ? document : null));
    const root = o.root || (doc && doc.nodeType === 1 ? doc : null) || (documentRef && (documentRef.body || documentRef.documentElement));
    if (!root || typeof root.appendChild !== 'function' || !documentRef || typeof documentRef.createElement !== 'function') return null;
    let bar = root.querySelector ? root.querySelector('[data-glance-host-prompt]') : null;
    if (!bar) {
      bar = documentRef.createElement('div');
      bar.setAttribute('data-glance-host-prompt', '1');
      bar.setAttribute('role', 'dialog');
      const line = documentRef.createElement('p');
      line.setAttribute('data-glance-host-line', '1');
      const btn = documentRef.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-glance-host-grant', '1');
      btn.textContent = BUTTON_HE;
      bar.appendChild(line);
      bar.appendChild(btn);
      if (root.firstChild) root.insertBefore(bar, root.firstChild);
      else root.appendChild(bar);
    }
    const line = bar.querySelector('[data-glance-host-line]');
    const btn = bar.querySelector('[data-glance-host-grant]');
    if (line && line.textContent !== LINE_HE && line.textContent !== DENIED_HE) line.textContent = LINE_HE;
    if (line && !line.textContent) line.textContent = LINE_HE;
    if (btn && btn.dataset && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        btn.disabled = true;
        let pending = Promise.resolve(false);
        try { pending = Promise.resolve(typeof o.request === 'function' ? o.request() : false); }
        catch (e) { pending = Promise.resolve(false); }
        pending.then((ok) => {
          if (ok) {
            if (bar.remove) bar.remove();
            if (typeof o.onGranted === 'function') o.onGranted();
            return;
          }
          btn.disabled = false;
          if (line) line.textContent = DENIED_HE;
        }, () => {
          btn.disabled = false;
          if (line) line.textContent = DENIED_HE;
        });
      });
    }
    return bar;
  }

  return { LINE_HE: LINE_HE, DENIED_HE: DENIED_HE, BUTTON_HE: BUTTON_HE, hostsFor: hostsFor, paint: paint };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowChatHostPrompt = FlowChatHostPrompt;
if (typeof module !== 'undefined') module.exports = { FlowChatHostPrompt };
