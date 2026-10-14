// Fills the Gmail compose window that is already open. The person presses
// Send. This file does not look up a Send control and does not activate one.
// Open Reply first when the message body is not on the page.
const FlowGoogleComposePage = (() => {
  function findTo(root) {
    return root.querySelector('textarea[name="to"], input[name="to"]');
  }

  function findSubject(root) {
    return root.querySelector('input[name="subjectbox"]');
  }

  function findBody(root) {
    return root.querySelector('div[aria-label="Message Body"], div[contenteditable="true"][role="textbox"]');
  }

  function editable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const flag = el.getAttribute && el.getAttribute('contenteditable');
    return flag === 'true' || flag === '';
  }

  function readValue(el) {
    if (!el) return '';
    if (editable(el)) return el.textContent || '';
    return el.value != null ? String(el.value) : (el.textContent || '');
  }

  function writeValue(el, text) {
    if (!el) return;
    if (editable(el)) el.textContent = text;
    else el.value = text;
    if (typeof el.dispatchEvent === 'function' && typeof Event === 'function') {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function closed() {
    return {
      ok: false,
      reason: 'compose-closed',
      preview: true,
      closes: false,
      sent: false,
      error: 'Open Reply first. Glance does not press Send.'
    };
  }

  function composeApi() {
    return typeof FlowGoogleCompose !== 'undefined' ? FlowGoogleCompose : null;
  }

  function fill(payload, root) {
    const Compose = composeApi();
    const doc = root || (typeof document !== 'undefined' ? document : null);
    if (!Compose || !doc || typeof doc.querySelector !== 'function') return closed();
    const bodyEl = findBody(doc);
    if (!bodyEl) return closed();
    const toEl = findTo(doc);
    const subEl = findSubject(doc);
    const state = {
      to: toEl ? readValue(toEl) : '',
      subject: subEl ? readValue(subEl) : '',
      body: readValue(bodyEl),
      sendClicks: 0
    };
    const planned = Compose.plan(payload || {});
    if (!planned.ok) return planned;
    const applied = Compose.apply(state, planned);
    if (toEl) writeValue(toEl, state.to);
    if (subEl) writeValue(subEl, state.subject);
    writeValue(bodyEl, state.body);
    const seen = {
      to: toEl ? readValue(toEl) : state.to,
      subject: subEl ? readValue(subEl) : state.subject,
      body: readValue(bodyEl),
      sendClicks: 0
    };
    if (!Compose.readBack(seen, planned)) {
      if (toEl) writeValue(toEl, applied.before.to);
      if (subEl) writeValue(subEl, applied.before.subject);
      writeValue(bodyEl, applied.before.body);
      return { ok: false, reason: 'verify_failed', preview: true, closes: false, sent: false, proof: null };
    }
    return Compose.stamp(planned, applied.before);
  }

  function undo(ref, root) {
    const Compose = composeApi();
    const doc = root || (typeof document !== 'undefined' ? document : null);
    if (!Compose || !doc || typeof doc.querySelector !== 'function') return closed();
    const bodyEl = findBody(doc);
    if (!bodyEl) return closed();
    const toEl = findTo(doc);
    const subEl = findSubject(doc);
    const state = {
      to: toEl ? readValue(toEl) : '',
      subject: subEl ? readValue(subEl) : '',
      body: readValue(bodyEl),
      sendClicks: (ref && ref.sendClicks) || 0
    };
    const result = Compose.undo(ref, state);
    if (!result.ok) return result;
    if (toEl) writeValue(toEl, state.to);
    if (subEl) writeValue(subEl, state.subject);
    writeValue(bodyEl, state.body);
    return result;
  }

  function isComposeMessage(msg) {
    const type = msg && msg.type;
    return type === 'flow:gmail-compose' || type === 'flow:gmail-compose-undo';
  }

  function install(chromeLike) {
    const c = chromeLike || (typeof chrome !== 'undefined' ? chrome : null);
    if (!c || !c.runtime || !c.runtime.onMessage || typeof c.runtime.onMessage.addListener !== 'function') return;
    c.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!isComposeMessage(msg)) return undefined;
      const result = msg.type === 'flow:gmail-compose-undo' ? undo(msg.ref) : fill(msg.payload || msg.input);
      sendResponse(result);
      return true;
    });
  }

  install();

  return {
    findTo: findTo,
    findSubject: findSubject,
    findBody: findBody,
    fill: fill,
    undo: undo,
    isComposeMessage: isComposeMessage,
    install: install
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleComposePage };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleComposePage = FlowGoogleComposePage;
