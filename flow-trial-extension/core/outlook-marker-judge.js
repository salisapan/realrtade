// Portable judge input for the Outlook Graph server marker — same shape as src/content-outlook.js decideFromText.
const FlowOutlookMarkerJudge = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }

  const graphMail = sibling(typeof FlowGraphMail !== 'undefined' ? FlowGraphMail : null, './graph-mail.js', 'FlowGraphMail');
  const incoming = sibling(typeof FlowIncomingJudge !== 'undefined' ? FlowIncomingJudge : null, './incoming-judge.js', 'FlowIncomingJudge');
  const intent = sibling(typeof FlowIntent !== 'undefined' ? FlowIntent : null, './intent.js', 'FlowIntent');
  const googleCloses = sibling(typeof FlowGoogleCloses !== 'undefined' ? FlowGoogleCloses : null, './google-closes.js', 'FlowGoogleCloses');

  function recipientEmails(msg, field) {
    const list = (msg && msg[field]) || [];
    const out = [];
    (Array.isArray(list) ? list : []).forEach((r) => {
      const raw = r && r.emailAddress ? r.emailAddress.address : r;
      const e = String(raw || '').trim().toLowerCase();
      if (e) out.push(e);
    });
    return out;
  }

  function bodyPlain(msg) {
    if (!msg) return '';
    const judge = incoming;
    const gm = graphMail;
    const content = msg.body && msg.body.content != null ? String(msg.body.content) : '';
    const type = String((msg.body && msg.body.contentType) || '').toLowerCase();
    let raw = content.trim()
      ? (type === 'html' && gm && typeof gm.htmlToText === 'function' ? gm.htmlToText(content) : content)
      : String(msg.bodyPreview || '');
    if (judge && typeof judge.prepareForJudge === 'function') raw = judge.prepareForJudge(raw);
    if (gm && typeof gm.ownText === 'function') return gm.ownText(raw);
    return String(raw || '').trim();
  }

  function attachmentCountForJudge(msg, text) {
    const body = text != null ? text : bodyPlain(msg);
    const attachments = msg && msg.attachments;
    if (Array.isArray(attachments)) {
      return attachments.filter((a) => {
        if (!a || a.isInline === true) return false;
        return !/itemAttachment/i.test(String(a['@odata.type'] || ''));
      }).length;
    }
    if (googleCloses && typeof googleCloses.needsOneAttachment === 'function' && googleCloses.needsOneAttachment(body)) {
      if (msg && msg.hasAttachments === false) return 0;
      if (msg && msg.hasAttachments === true) return 1;
      return 0;
    }
    return 0;
  }

  function buildJudgeInput(msg, ownAddresses, opts) {
    const o = opts || {};
    const me = Array.isArray(ownAddresses) ? ownAddresses : [];
    const from = msg && msg.from && msg.from.emailAddress;
    const senderEmail = from && from.address;
    const senderName = from && from.name;
    const text = bodyPlain(msg);
    const to = recipientEmails(msg, 'toRecipients');
    const cc = recipientEmails(msg, 'ccRecipients');
    const fromLower = String(senderEmail || '').toLowerCase();
    const selfAddressed = intent && typeof intent.addressedToSelf === 'function' && intent.addressedToSelf({
      senderEmail: senderEmail,
      to: to,
      cc: cc,
      ownAddresses: me,
      onBehalfOf: o.onBehalfOf || null,
      forwarded: o.forwarded === true
    });
    const inbound = Boolean(selfAddressed) || (fromLower ? me.map((a) => String(a || '').toLowerCase()).indexOf(fromLower) < 0 : true);
    const attachmentCount = attachmentCountForJudge(msg, text);
    const now = o.now;
    const nowVal = (now && typeof now.getTime === 'function') ? now : new Date(typeof now === 'number' ? now : Date.now());
    return {
      systemNoticeOn: o.systemNoticeOn === true,
      text: text,
      subject: (msg && msg.subject) || '',
      sender: { name: senderName, email: senderEmail },
      now: nowVal,
      hasThreadAttachment: attachmentCount === 1,
      attachmentCount: attachmentCount,
      surface: 'outlook',
      to: to,
      cc: cc,
      ownAddresses: me,
      userName: o.userName || null,
      ownNames: o.ownNames || null,
      namesPending: o.namesPending === true,
      onBehalfOf: o.onBehalfOf || null,
      forwarded: o.forwarded === true,
      inbound: inbound
    };
  }

  function judgeOutlookInboxMessage(msg, ownAddresses, opts) {
    if (!incoming || typeof incoming.judge !== 'function') return { show: false, reason: 'no-incoming-judge' };
    return incoming.judge(buildJudgeInput(msg, ownAddresses, opts));
  }

  return { bodyPlain, attachmentCountForJudge, buildJudgeInput, judgeOutlookInboxMessage };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookMarkerJudge };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookMarkerJudge = FlowOutlookMarkerJudge;
