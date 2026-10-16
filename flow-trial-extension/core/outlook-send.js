// Preview To, Cc, subject, and body. Sends only on an explicit click when
// MAIL_SEND_ENABLED is true (default false). Otherwise FORBIDDEN_SEND and no
// request. A send is Handled only after Sent Items is read back. The send is
// an event-log row. Never auto-sends. No network in this file: pass call().
const FlowOutlookSend = (() => {
  const CONNECTOR = 'outlookSend';
  const SYSTEM = 'microsoft/mail';
  const MAIL_SEND_ENABLED = false;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function mailSendEnabled(opts) {
    if (opts && opts.enabled === true) return true;
    const cfg = typeof globalThis !== 'undefined' ? globalThis.FlowOutlookConfig : null;
    if (cfg && cfg.MAIL_SEND_ENABLED === true) return true;
    return MAIL_SEND_ENABLED === true;
  }

  function scopeList(scopes) {
    if (scopes == null) return null;
    if (Array.isArray(scopes)) return scopes.map((s) => String(s || '').trim()).filter(Boolean);
    if (typeof scopes === 'string') return scopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return null;
  }

  function hasSendScope(scopes) {
    const list = scopeList(scopes);
    if (!list) return null;
    return list.some((s) => s === 'Mail.Send' || s === 'https://graph.microsoft.com/Mail.Send');
  }

  function addresses(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
    return String(value || '').split(/[,;]/).map((item) => item.trim()).filter(Boolean);
  }

  function validEmail(address) {
    return EMAIL.test(address) && address.length < 254;
  }

  function lineField(text, name) {
    const match = String(text || '').match(new RegExp('(?:^|\\n)' + name + ':\\s*([^\\n]*)', 'i'));
    return match ? match[1].trim() : '';
  }

  function parsePreview(input) {
    const params = (input && input.params) || {};
    const text = String((input && input.text) || params.text || '');
    const to = addresses(params.to != null && params.to !== '' ? params.to : lineField(text, 'To'));
    const cc = addresses(params.cc != null ? params.cc : lineField(text, 'Cc'));
    let subject = params.subject != null && params.subject !== '' ? String(params.subject) : lineField(text, 'Subject');
    subject = subject.replace(/[\r\n]/g, ' ').trim().slice(0, 200);
    let body = params.body != null && params.body !== '' ? String(params.body) : lineField(text, 'Body');
    body = body.trim().slice(0, 8000);
    if (!to.length || !subject || !body) return { ok: false, reason: 'not-ready' };
    if (to.length > 10 || cc.length > 10) return { ok: false, reason: 'not-ready' };
    if (!to.every(validEmail) || !cc.every(validEmail)) return { ok: false, reason: 'not-ready' };
    return { ok: true, to: to, cc: cc, subject: subject, body: body };
  }

  function offer(ctx) {
    if (!mailSendEnabled(ctx)) return { show: false, reason: 'FORBIDDEN_SEND' };
    const preview = parsePreview({ text: ctx && ctx.text, params: ctx && ctx.params });
    if (!preview.ok) return { show: false, reason: preview.reason || 'not-ready' };
    return {
      show: true,
      connectorId: CONNECTOR,
      title: 'Send',
      lines: [
        { label: 'To', value: preview.to.join(', ') },
        { label: 'Cc', value: preview.cc.join(', ') },
        { label: 'Subject', value: preview.subject },
        { label: 'Body', value: preview.body }
      ],
      button: 'Send',
      closes: true,
      explicit: true,
      params: { to: preview.to.join(', '), cc: preview.cc.join(', '), subject: preview.subject, body: preview.body }
    };
  }

  function firstTo(row) {
    const list = row && row.toRecipients;
    const address = list && list[0] && list[0].emailAddress && list[0].emailAddress.address;
    return address ? String(address).toLowerCase() : '';
  }

  function prove(externalId, deps) {
    const Proof = globalThis.FlowProofOfClose;
    if (!Proof || typeof Proof.buildProof !== 'function') return null;
    return Proof.buildProof({
      system: SYSTEM,
      externalId: String(externalId),
      fetchedBack: true,
      verifiedAt: deps && typeof deps.now === 'function' ? deps.now() : ''
    });
  }

  async function run(input, deps) {
    const call = deps && deps.call;
    if (!mailSendEnabled(input) || !input || input.explicitClick !== true) {
      return { ok: false, reason: 'FORBIDDEN_SEND' };
    }
    const preview = parsePreview(input);
    if (!preview.ok) return { ok: false, reason: preview.reason || 'not-ready' };
    if (typeof call !== 'function') return { ok: false, reason: 'unclear' };
    if (hasSendScope(deps.grantedScopes) === false) return { ok: false, reason: 'mail-send-not-granted' };
    const sent = await call({
      method: 'POST',
      path: '/me/sendMail',
      allowSend: true,
      body: {
        message: {
          subject: preview.subject,
          body: { contentType: 'Text', content: preview.body },
          toRecipients: preview.to.map((address) => ({ emailAddress: { address: address } })),
          ccRecipients: preview.cc.map((address) => ({ emailAddress: { address: address } }))
        },
        saveToSentItems: true
      }
    });
    if (!sent || sent.ok !== true || (sent.status !== 202 && sent.status !== 200)) {
      return { ok: false, reason: 'send-failed', status: sent && sent.status };
    }
    const back = await call({
      method: 'GET',
      path: '/me/mailFolders/sentitems/messages?$top=10&$orderby=sentDateTime desc&$select=id,subject,toRecipients,sentDateTime'
    });
    const rows = back && back.ok && back.body && Array.isArray(back.body.value) ? back.body.value : [];
    const hit = rows.find((row) => String(row.subject || '') === preview.subject && firstTo(row) === preview.to[0].toLowerCase());
    if (!hit || !hit.id) return { ok: false, reason: 'verify_failed', proof: null };
    const proof = prove(hit.id, deps);
    if (!proof) return { ok: false, reason: 'verify_failed', proof: null };
    const ref = { messageId: String(hit.id), externalId: String(hit.id) };
    return {
      ok: true,
      connectorId: CONNECTOR,
      proof: proof,
      fetchedBack: true,
      ref: ref,
      written: 'Sent. Confirmed in Sent Items.',
      log: {
        kind: 'written',
        fetchedBack: true,
        externalId: String(hit.id),
        connectorId: CONNECTOR,
        system: SYSTEM,
        where: 'Sent Items',
        event: 'mail-send',
        messageId: (input && input.messageId) || '',
        subject: preview.subject,
        to: preview.to[0],
        ref: ref
      }
    };
  }

  async function undo(ref, deps) {
    const call = deps && deps.call;
    const id = ref && (ref.messageId || ref.externalId);
    if (!id || typeof call !== 'function') return { ok: false, reason: 'unclear' };
    const del = await call({ method: 'DELETE', path: '/me/messages/' + encodeURIComponent(id) });
    if (!del || del.ok !== true) return { ok: false, reason: 'undo-failed' };
    return {
      ok: true,
      written: 'Undone. The Sent Items copy was removed.',
      log: { kind: 'undone', connectorId: CONNECTOR, system: SYSTEM, externalId: String(id), messageId: '', where: 'Sent Items', ref: ref }
    };
  }

  function receiptFromLog(log, pane) {
    const rows = Array.isArray(log) ? log : [];
    const ids = [];
    if (pane) [pane.itemId, pane.messageId, pane.rawUrlId, pane.pathId].forEach((id) => { if (id) ids.push(String(id)); });
    if (!ids.length) return null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (!row || row.connectorId !== CONNECTOR) continue;
      if (row.messageId && ids.indexOf(String(row.messageId)) < 0) continue;
      if (row.kind === 'undone') return null;
      if (row.kind === 'written' && row.fetchedBack === true && row.externalId) return row;
    }
    return null;
  }

  return {
    CONNECTOR: CONNECTOR,
    SYSTEM: SYSTEM,
    MAIL_SEND_ENABLED: MAIL_SEND_ENABLED,
    mailSendEnabled: mailSendEnabled,
    offer: offer,
    run: run,
    undo: undo,
    receiptFromLog: receiptFromLog
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowOutlookSend = FlowOutlookSend;
if (typeof module !== 'undefined') module.exports = { FlowOutlookSend };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookSend = FlowOutlookSend;
