// Fills the Gmail compose window that is already open. The person presses
// Send. This file does not look up a Send control and does not activate one.
// Open Reply first when the message body is not on the page.
// Rule 9: after the person types, this file does not refill or rewrite.
// There is no observer that puts Glance's text back. Undo refuses when the
// content hash no longer matches the fill.
const FlowGoogleComposePage = (() => {
  let lastBody = null;
  let lastHash = '';
  let lastStamp = null;
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

  function edited() {
    return {
      ok: false,
      reason: 'user-edited',
      preview: true,
      closes: false,
      sent: false,
      error: 'You changed the compose. Glance did not rewrite it.'
    };
  }

  function composeApi() {
    return typeof FlowGoogleCompose !== 'undefined' ? FlowGoogleCompose : null;
  }

  function typed(el) {
    if (!el) return false;
    if (el.__glanceUserTyped) return true;
    return !!(el.getAttribute && el.getAttribute('data-glance-user-typed') === '1');
  }

  // fillOnce: the first keystroke after the fill stops any later write.
  // The listener records that. It does not put Glance's text back.
  function watchInput(el) {
    if (!el || typeof el.addEventListener !== 'function') return;
    if (el.getAttribute && el.getAttribute('data-glance-watch') === '1') return;
    if (el.setAttribute) el.setAttribute('data-glance-watch', '1');
    el.addEventListener('input', () => {
      el.__glanceUserTyped = true;
      if (el.setAttribute) el.setAttribute('data-glance-user-typed', '1');
    });
  }

  function firstBoundary(bodyEl) {
    if (!bodyEl || typeof bodyEl.querySelector !== 'function') return null;
    return bodyEl.querySelector('.gmail_signature, [data-smartmail="gmail_signature"], .gmail_quote, blockquote');
  }

  function textAbove(bodyEl, boundary) {
    if (!boundary) return readValue(bodyEl);
    const kids = bodyEl.childNodes;
    if (!kids) return '';
    let text = '';
    for (let i = 0; i < kids.length; i++) {
      const node = kids[i];
      if (node === boundary || (node.contains && node.contains(boundary))) break;
      text += node.textContent || '';
    }
    return text;
  }

  function plainSplit(text) {
    const src = String(text || '').replace(/\r\n/g, '\n');
    const at = src.search(/\n-- ?\n|\nOn [^\n]{0,180}wrote:/);
    if (at < 0) return null;
    return { above: src.slice(0, at), rest: src.slice(at) };
  }

  function insertDraft(bodyEl, boundary, text, rest) {
    if (boundary && boundary.parentNode) {
      const doc = bodyEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
      if (doc && typeof doc.createElement === 'function') {
        const node = doc.createElement('div');
        node.setAttribute('data-glance-draft', '1');
        node.textContent = text;
        boundary.parentNode.insertBefore(node, boundary);
        return true;
      }
    }
    if (rest) {
      writeValue(bodyEl, text + rest);
      if (bodyEl.setAttribute) bodyEl.setAttribute('data-glance-draft', '1');
      return true;
    }
    writeValue(bodyEl, text);
    return true;
  }

  function removeDraft(bodyEl) {
    if (!bodyEl || typeof bodyEl.querySelector !== 'function') return false;
    const node = bodyEl.querySelector('[data-glance-draft="1"]');
    if (!node || node === bodyEl || !node.parentNode) return false;
    node.parentNode.removeChild(node);
    return true;
  }

  function kept(before, seen, draft) {
    if (before.to && seen.to !== before.to) return false;
    if (before.subject && seen.subject !== before.subject) return false;
    if (!seen.body || seen.body.indexOf(draft) < 0) return false;
    const rest = String(before.body || '').trim();
    if (rest && seen.body.indexOf(rest) < 0) return false;
    return true;
  }

  function fill(payload, root) {
    const Compose = composeApi();
    const doc = root || (typeof document !== 'undefined' ? document : null);
    if (!Compose || !doc || typeof doc.querySelector !== 'function') return closed();
    const bodyEl = findBody(doc);
    if (!bodyEl) return closed();
    const toEl = findTo(doc);
    const subEl = findSubject(doc);
    if (typed(bodyEl) || typed(toEl) || typed(subEl)) return edited();
    const before = {
      to: toEl ? readValue(toEl) : '',
      subject: subEl ? readValue(subEl) : '',
      body: readValue(bodyEl)
    };
    const currentHash = typeof Compose.contentHash === 'function'
      ? Compose.contentHash(before.to, before.subject, before.body)
      : '';
    if (lastBody === bodyEl && lastHash && currentHash === lastHash && lastStamp) return lastStamp;
    if (lastBody === bodyEl && lastHash && currentHash !== lastHash) return edited();
    const boundary = firstBoundary(bodyEl);
    const above = textAbove(bodyEl, boundary);
    const plain = boundary ? null : plainSplit(before.body);
    const aboveText = plain ? plain.above : above;
    if (String(aboveText || '').trim()) return edited();
    const planned = Compose.plan(payload || {});
    if (!planned.ok) return planned;
    if (toEl && !before.to) writeValue(toEl, planned.to);
    if (subEl && !before.subject) writeValue(subEl, planned.subject);
    insertDraft(bodyEl, boundary, planned.body, plain ? plain.rest : '');
    watchInput(toEl);
    watchInput(subEl);
    watchInput(bodyEl);
    const seen = {
      to: toEl ? readValue(toEl) : before.to,
      subject: subEl ? readValue(subEl) : before.subject,
      body: readValue(bodyEl),
      sendClicks: 0
    };
    if (!kept(before, seen, planned.body)) {
      removeDraft(bodyEl);
      if (!boundary && !plain) writeValue(bodyEl, before.body);
      if (toEl && !before.to) writeValue(toEl, '');
      if (subEl && !before.subject) writeValue(subEl, '');
      return { ok: false, reason: 'verify_failed', preview: true, closes: false, sent: false, error: 'The compose window is still empty.', proof: null };
    }
    const stamped = Compose.stamp(planned, before);
    if (!stamped || stamped.ok !== true) return stamped;
    stamped.fetchedBack = true;
    stamped.seen = { to: seen.to, subject: seen.subject, body: seen.body };
    const domHash = typeof Compose.contentHash === 'function' ? Compose.contentHash(seen.to, seen.subject, seen.body) : '';
    if (stamped.ref) stamped.ref.contentHash = domHash;
    lastBody = bodyEl;
    lastHash = domHash;
    lastStamp = stamped;
    return stamped;
  }

  function undo(ref, root) {
    const Compose = composeApi();
    const doc = root || (typeof document !== 'undefined' ? document : null);
    if (!Compose || !doc || typeof doc.querySelector !== 'function') return closed();
    const bodyEl = findBody(doc);
    if (!bodyEl) return closed();
    const toEl = findTo(doc);
    const subEl = findSubject(doc);
    let state = null;
    try {
      const to = toEl ? readValue(toEl) : '';
      const subject = subEl ? readValue(subEl) : '';
      const body = readValue(bodyEl);
      if (typeof to !== 'string' || typeof subject !== 'string' || typeof body !== 'string') {
        state = { readFailed: true, sendClicks: (ref && ref.sendClicks) || 0 };
      } else {
        state = { to: to, subject: subject, body: body, sendClicks: (ref && ref.sendClicks) || 0 };
      }
    } catch (e) {
      state = { readFailed: true, sendClicks: (ref && ref.sendClicks) || 0 };
    }
    const result = Compose.undo(ref, state);
    if (!result.ok) return result;
    if (toEl) writeValue(toEl, state.to);
    if (subEl) writeValue(subEl, state.subject);
    if (!removeDraft(bodyEl)) writeValue(bodyEl, state.body);
    lastBody = null;
    lastHash = '';
    lastStamp = null;
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
