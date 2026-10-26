// Fill a Gmail compose window. The person presses Send. This module never
// does. A filled compose is a preview: it is not a close, and Handled is
// not this result. Undo restores the fields that were there before, and
// only while Send has not been pressed.
// Portable: no chrome.*, no DOM, no network.
const FlowGoogleCompose = (() => {
  const SYSTEM = 'gmail/compose';
  const CONNECTOR = 'gmailCompose';

  function cfg() {
    return typeof FlowGoogleConfig !== 'undefined' ? FlowGoogleConfig : null;
  }

  function emailOf(value) {
    const s = String(value || '').trim();
    if (!s || s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return '';
    return s;
  }

  function subjectOf(input) {
    const raw = String((input && (input.subject || input.quote)) || 'Following up').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
    if (!raw) return '';
    if (/^re:/i.test(raw)) return raw;
    return 'Re: ' + raw;
  }

  function bodyOf(input) {
    const i = input || {};
    if (i.body) return String(i.body).slice(0, 8000);
    if (typeof FlowDraftReply !== 'undefined' && i.useDraft && typeof FlowDraftReply.draftBodyText === 'function') {
      const text = FlowDraftReply.draftBodyText(i.draft || i, i.attachment, i.attachmentSource, i.shareUrl);
      if (text) return String(text).slice(0, 8000);
    }
    if (i.quote) return String(i.quote).slice(0, 8000);
    return 'Following up.';
  }

  function hash(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function contentHash(to, subject, body) {
    return hash(String(to || '') + '\n' + String(subject || '') + '\n' + String(body || ''));
  }

  function plan(input) {
    const i = input || {};
    if (i.send === true || i.pressSend === true) {
      return { ok: false, reason: 'never-sends', preview: true, closes: false, sent: false };
    }
    const to = emailOf(i.to);
    const subject = subjectOf(i);
    const body = bodyOf(i);
    if (!to || !subject || !body) return { ok: false, reason: 'unclear', preview: true, closes: false, sent: false };
    return { ok: true, to: to, subject: subject, body: body, send: false };
  }

  function apply(state, planned) {
    const current = state || { to: '', subject: '', body: '', sendClicks: 0 };
    const before = { to: current.to || '', subject: current.subject || '', body: current.body || '' };
    current.to = planned.to;
    current.subject = planned.subject;
    current.body = planned.body;
    return { before: before };
  }

  function readBack(state, planned) {
    if (!state || !planned) return false;
    if ((state.sendClicks || 0) !== 0) return false;
    return state.to === planned.to && state.subject === planned.subject && state.body === planned.body;
  }

  function stamp(planned, before, clock) {
    const C = cfg();
    const id = 'compose:' + contentHash(planned.to, planned.subject, planned.body);
    const proof = C && C.proofOf(SYSTEM, id, null, C.clockIso(clock));
    const base = {
      where: 'Gmail',
      target: planned.to,
      written: 'Draft opened in compose. You send it.',
      undoHint: 'Undo clears the compose window.',
      preview: true,
      closes: false,
      sent: false,
      url: null
    };
    const ref = {
      before: before,
      externalId: id,
      to: planned.to,
      subject: planned.subject,
      body: planned.body,
      contentHash: contentHash(planned.to, planned.subject, planned.body)
    };
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof, fields: planned }, base);
  }

  function fill(input, state, clock) {
    const planned = plan(input);
    if (!planned.ok) return planned;
    const current = state || { to: '', subject: '', body: '', sendClicks: 0 };
    const applied = apply(current, planned);
    if (!readBack(current, planned)) {
      return { ok: false, reason: 'verify_failed', preview: true, closes: false, sent: false, proof: null };
    }
    return stamp(planned, applied.before, clock);
  }

  function unconfirmedCompose() {
    return {
      ok: false,
      reason: 'unconfirmed',
      closes: false,
      sent: false,
      error: "Couldn't confirm it's unchanged. Undo left it alone."
    };
  }

  function editedCompose() {
    return {
      ok: false,
      reason: 'user-edited',
      closes: false,
      sent: false,
      error: 'You edited this. Undo left it alone.'
    };
  }

  // A live read is three strings. A missing state, a thrown read, or a timeout
  // is not an empty compose and is not an edit.
  function liveHash(state) {
    if (!state || typeof state !== 'object') return null;
    if (state.readFailed === true || state.timeout === true) return null;
    if (state.reason === 'verify-timeout' || state.reason === 'timeout') return null;
    if (typeof state.to !== 'string' || typeof state.subject !== 'string' || typeof state.body !== 'string') return null;
    try {
      return contentHash(state.to, state.subject, state.body);
    } catch (e) {
      return null;
    }
  }

  function undo(ref, state) {
    const current = state && typeof state === 'object' ? state : null;
    if ((current && (current.sendClicks || 0) > 0) || (ref && ref.sendClicks > 0)) {
      return { ok: false, reason: 'already-sent', sent: true, closes: false, written: 'Already sent. Nothing was cleared.' };
    }
    if (!ref || ref.contentHash == null || ref.contentHash === '') return unconfirmedCompose();
    const live = liveHash(current);
    if (!live) return unconfirmedCompose();
    if (live !== String(ref.contentHash)) return editedCompose();
    const before = ref.before;
    if (!before || typeof before !== 'object') return unconfirmedCompose();
    current.to = before.to || '';
    current.subject = before.subject || '';
    current.body = before.body || '';
    return { ok: true, closes: false, sent: false, written: 'Undone. Nothing was sent.' };
  }

  // Present so a caller can ask. It does not press Send and does not count a click.
  function clickSend() {
    return { ok: false, reason: 'never-sends', sent: false, closes: false };
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    plan: plan,
    contentHash: contentHash,
    apply: apply,
    readBack: readBack,
    stamp: stamp,
    fill: fill,
    undo: undo,
    clickSend: clickSend
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleCompose };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleCompose = FlowGoogleCompose;
