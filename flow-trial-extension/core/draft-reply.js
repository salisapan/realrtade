// Shared reply-draft body for every surface (Gmail, Outlook, …). Portable: no chrome.*.
// Used by background gmailDraftWrite / outlookDraftWrite and by any on-device composer.
// One engine: the same greeting + body shape whether the draft lands in Gmail or Outlook Drafts.
// Prefer reply-with-facts / plan content; acknowledge concrete asks with the facts we have;
// never invent facts; keep placeholders only when the person still must fill something in.
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

  function cleanLine(value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').trim();
  }

  // Strip greeting / sign-off wrappers so signal detection reads the asks.
  function ownAskText(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/^[^\n]*\bHi\b[^\n]*,?\s*/i, '')
      .replace(/\n+(?:Thanks|Thank you|Best|Regards|Cheers)[^\n]*\n[\s\S]*$/i, '')
      .trim();
  }

  // Signals taken only from the ask text / planned `what` — never invented.
  function askSignals(askText, what) {
    const ask = (ownAskText(askText) + '\n' + String(what || '')).trim();
    return {
      ask: ask,
      wantsReview: /\breview\b/i.test(ask) || /\bpilot proposal\b/i.test(ask) || /\bproposal\b/i.test(ask),
      wantsConfirm: /\bconfirm\b/i.test(ask),
      wantsOwner: /\b(?:onboarding owner|name of the (?:person|owner)|person on your side|who will own)\b/i.test(ask)
        || /\bsend me the name\b/i.test(ask),
      hasPilot: /\bpilot proposal\b/i.test(ask),
      whetherStart: /\bwhether\b/i.test(ask) && /\bstart\b/i.test(ask)
    };
  }

  // Rich acknowledgment when the ask is concrete enough. Returns body lines
  // (no greeting) or null when we should fall back to the short follow-up template.
  function richAckLines(params, askText) {
    const what = cleanLine(params && params.what);
    const when = cleanLine(params && params.when) || null;
    const sig = askSignals(askText, what);
    if (!sig.wantsReview && !sig.wantsConfirm && !sig.wantsOwner && !what) return null;

    const lines = [];
    if (sig.wantsReview && sig.wantsConfirm) {
      if (sig.hasPilot) {
        let line = "Thanks for sending the pilot proposal. I'll review it and confirm";
        if (when) line += ' by ' + when;
        // Echo the ask's own "whether we can start…" clause when present — not invented.
        if (sig.whetherStart) line += ' whether we can start next week';
        line += '.';
        lines.push(line);
      } else {
        lines.push("Thanks. I'll review and confirm"
          + (what ? (': ' + what) : ' on your request')
          + (when ? (' by ' + when) : '')
          + '.');
      }
    } else if (sig.wantsConfirm || sig.wantsReview) {
      lines.push("Thanks. I'll follow up on: " + (what || 'your request')
        + (when ? (' (' + when + ')') : '') + '.');
    } else if (what) {
      lines.push("Thanks. I'll follow up on: " + what + (when ? (' (' + when + ')') : '') + '.');
    } else {
      lines.push('Thanks for your note.');
    }

    if (sig.wantsOwner) {
      lines.push('The onboarding owner on our side will be [name].');
    } else if (!sig.wantsReview && !sig.wantsConfirm) {
      lines.push('[Write your reply here]');
    }
    return lines;
  }

  function attachmentLines(attachment, attachmentSource, params) {
    const lines = [];
    if (attachment && (attachmentSource === 'found' || attachmentSource === 'template')) {
      lines.push('', 'Attached: ' + attachment.filename);
      if (attachmentSource === 'template') {
        const fields = (params && params.fields) || [];
        for (const field of fields) {
          if (field && field.label && String(field.value || '').trim()) {
            lines.push(String(field.label) + ': ' + cleanLine(field.value));
          }
        }
      }
    }
    return lines;
  }

  // Same contract as the former background.js draftBodyText: fact reply, share link,
  // or a rich acknowledgment of what/when (with optional ask text), else a short
  // follow-up + fill-in placeholder.
  function draftBodyText(p, attachment, attachmentSource, shareUrl) {
    const params = (p && p.params) || {};
    const greet = draftGreeting(p && p.senderName, p && p.senderEmail);
    if (params.replyFact && !params.shareLink) {
      const factLine = cleanLine(params.factLine);
      return [greet, '', factLine].join('\n').replace(/\u2014/g, '-').replace(/\u2013/g, '-');
    }
    const lines = [greet, ''];
    if (shareUrl) {
      lines.push(params.what || 'The file is ready.');
      lines.push(shareUrl);
      return lines.join('\n').replace(/\u2014/g, '-').replace(/\u2013/g, '-');
    }

    const askText = params.askText || params.text || null;
    const rich = richAckLines(params, askText);
    if (rich && rich.length) {
      for (const line of rich) lines.push(line);
      const att = attachmentLines(attachment, attachmentSource, params);
      for (const line of att) lines.push(line);
      // Trailing blank line matches the pre-unification Outlook reply shape.
      if (lines[lines.length - 1] !== '') lines.push('');
      return lines.join('\n').replace(/\u2014/g, '-').replace(/\u2013/g, '-');
    }

    if (params.what && params.when) lines.push('Following up on: ' + cleanLine(params.what) + ' (' + cleanLine(params.when) + ')');
    else if (params.what) lines.push('Following up on: ' + cleanLine(params.what));
    else lines.push('Following up on your message below.');
    const att = attachmentLines(attachment, attachmentSource, params);
    for (const line of att) lines.push(line);
    lines.push('', '[Write your reply here]');
    return lines.join('\n').replace(/\u2014/g, '-').replace(/\u2013/g, '-');
  }

  // Build the payload shape writers expect from an Intent + Actions plan draft step.
  // opts.text / opts.subject (optional) let the rich path see the original ask.
  function bodyFromIntent(intent, senderName, senderEmail, opts) {
    const o = opts || {};
    const e = (intent && intent.entities) || {};
    const what = e.requestWhat || e.what || (intent && intent.label) || null;
    const when = e.when || (intent && intent.facts && intent.facts.date && intent.facts.date.raw) || null;
    const askText = o.askText || o.text || e.askText || null;
    const subject = o.subject || null;
    const combined = askText
      ? ((subject && String(askText).indexOf(subject) !== 0) ? (subject + '\n' + askText) : askText)
      : (subject || null);
    return draftBodyText({
      senderName: senderName,
      senderEmail: senderEmail,
      params: {
        what: what,
        when: when,
        replyFact: Boolean(intent && intent.signals && intent.signals.factReply),
        factLine: e.factLine || null,
        askText: combined
      }
    });
  }

  return { draftGreeting, draftBodyText, greetingName, bodyFromIntent, askSignals, richAckLines };
})();

if (typeof module !== 'undefined') module.exports = { FlowDraftReply };
else if (typeof globalThis !== 'undefined') globalThis.FlowDraftReply = FlowDraftReply;
