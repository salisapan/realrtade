// Shared reply-draft body for every surface (Gmail, Outlook, …). Portable: no chrome.*.
// Used by background gmailDraftWrite / outlookDraftWrite and by any on-device composer.
// One engine: the same greeting + body shape whether the draft lands in Gmail or Outlook Drafts.
const FlowDraftReply = (() => {
  // Prefer a real first name; skip display names that are just the email local-part
  // (e.g. OWA "flow" for ai.local.flow@gmail.com) or a team/company signature line.
  function greetingName(senderName, senderEmail) {
    const email = String(senderEmail || '').toLowerCase();
    const localFull = email.split('@')[0] || '';
    const localParts = localFull.split(/[._+\-]/).filter(Boolean);
    const name = String(senderName || '').trim();
    if (!name) return null;
    if (/\bteam\b/i.test(name) || /\b(llc|inc|ltd)\b/i.test(name)) return null;
    const first = name.split(/\s+/)[0];
    if (!first) return null;
    const fl = first.toLowerCase();
    // Skip when the display name is just a local-part segment (e.g. "flow" for ai.local.flow@…).
    if (localParts.some((p) => p === fl) || fl === localFull) return null;
    if (first.length <= 2 && first === first.toLowerCase()) return null;
    return first;
  }

  function draftGreeting(senderName, senderEmail) {
    const who = greetingName(senderName, senderEmail);
    return who ? ('Hi ' + who + ',') : 'Hi,';
  }

  // Same contract as the former background.js draftBodyText: fact reply, share link,
  // or follow-up on what/when with an optional attachment line and a fill-in placeholder.
  function draftBodyText(p, attachment, attachmentSource, shareUrl) {
    const params = (p && p.params) || {};
    const greet = draftGreeting(p && p.senderName, p && p.senderEmail);
    if (params.replyFact && !params.shareLink) {
      const factLine = String(params.factLine || '').replace(/[\r\n]+/g, ' ').trim();
      return [greet, '', factLine].join('\n').replace(/\u2014/g, '-').replace(/\u2013/g, '-');
    }
    const lines = [greet, ''];
    if (shareUrl) {
      lines.push(params.what || 'The file is ready.');
      lines.push(shareUrl);
      return lines.join('\n').replace(/\u2014/g, '-').replace(/\u2013/g, '-');
    }
    if (params.what && params.when) lines.push('Following up on: ' + params.what + ' (' + params.when + ')');
    else if (params.what) lines.push('Following up on: ' + params.what);
    else lines.push('Following up on your message below.');
    if (attachment && (attachmentSource === 'found' || attachmentSource === 'template')) {
      lines.push('', 'Attached: ' + attachment.filename);
      if (attachmentSource === 'template') {
        const fields = params.fields || [];
        for (const field of fields) {
          if (field && field.label && String(field.value || '').trim()) {
            lines.push(String(field.label) + ': ' + String(field.value).replace(/[\r\n]+/g, ' ').trim());
          }
        }
      }
    }
    lines.push('', '[Write your reply here]');
    return lines.join('\n').replace(/\u2014/g, '-').replace(/\u2013/g, '-');
  }

  // Build the payload shape writers expect from an Intent + Actions plan draft step.
  function bodyFromIntent(intent, senderName, senderEmail) {
    const e = (intent && intent.entities) || {};
    const what = e.requestWhat || e.what || (intent && intent.label) || null;
    const when = e.when || null;
    return draftBodyText({
      senderName: senderName,
      senderEmail: senderEmail,
      params: {
        what: what,
        when: when,
        replyFact: Boolean(intent && intent.signals && intent.signals.factReply),
        factLine: e.factLine || null
      }
    });
  }

  return { draftGreeting, draftBodyText, greetingName, bodyFromIntent };
})();

if (typeof module !== 'undefined') module.exports = { FlowDraftReply };
else if (typeof globalThis !== 'undefined') globalThis.FlowDraftReply = FlowDraftReply;
