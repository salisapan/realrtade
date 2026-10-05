// Outlook reply draft body (never sent). Portable: no chrome.*, no network.
// Mirrors the spirit of Gmail's draftBodyText / fact-reply path: acknowledge the
// ask, leave a fill-in placeholder, never claim a file we cannot attach.
// Product copy: no em dash (U+2014); prefer a real greeting name over a local-part display name.
const FlowOutlookReply = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const followUp = sibling(typeof FlowFollowUp !== 'undefined' ? FlowFollowUp : null, './follow-up.js', 'FlowFollowUp');

  // Strip common greeting / sign-off wrappers so we can read the asks.
  function ownAskText(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/^[^\n]*\bHi\b[^\n]*,?\s*/i, '')
      .replace(/\n+(?:Thanks|Thank you|Best|Regards|Cheers)[^\n]*\n[\s\S]*$/i, '')
      .trim();
  }

  // Signature name: last non-empty line after Thanks/Best/Regards, when it looks like a person or team.
  function signatureName(text) {
    const raw = String(text || '').replace(/\r/g, '');
    const m = raw.match(/(?:^|\n)(?:Thanks|Thank you|Best|Regards|Cheers),?\s*\n+([^\n]+)\s*$/i);
    if (!m) return null;
    const name = m[1].replace(/\s+/g, ' ').trim();
    if (!name || /@/.test(name) || name.length > 60) return null;
    return name;
  }

  // Prefer signature ("Flow team"), else a real first name; skip display names that are just the email local-part.
  function greetingName(senderName, senderEmail, bodyText) {
    const sig = signatureName(bodyText);
    if (sig) {
      // "Flow team" is a group label: greet without a personal name.
      if (/\bteam\b/i.test(sig) || /\b(llc|inc|ltd)\b/i.test(sig)) return null;
      const first = sig.split(/\s+/)[0];
      if (first && first.length > 1) return first;
    }
    const email = String(senderEmail || '').toLowerCase();
    const local = email.split('@')[0] || '';
    const name = String(senderName || '').trim();
    if (!name) return null;
    const first = name.split(/\s+/)[0];
    if (!first) return null;
    if (local && first.toLowerCase() === local.split(/[._+\-]/)[0]) return null;
    if (first.length <= 2 && first === first.toLowerCase()) return null;
    return first;
  }

  function greetingLine(senderName, senderEmail, bodyText) {
    const who = greetingName(senderName, senderEmail, bodyText);
    return who ? ('Hi ' + who + ',') : 'Hi,';
  }

  // Pull the concrete asks: review/confirm by date, and name/owner requests.
  function buildBody(opts) {
    const o = opts || {};
    const intent = o.intent || {};
    const entities = intent.entities || {};
    const text = String(o.text || '');
    const subject = String(o.subject || '');
    const combined = (subject && text.indexOf(subject) !== 0 ? subject + '\n' : '') + text;
    const ask = ownAskText(combined);
    const when = entities.when || (intent.facts && intent.facts.date && intent.facts.date.raw) || null;
    const lines = [];
    lines.push(greetingLine(o.senderName, o.senderEmail, text));
    lines.push('');

    const wantsReview = /\breview\b/i.test(ask) || /\bpilot proposal\b/i.test(ask) || /\bproposal\b/i.test(ask);
    const wantsConfirm = /\bconfirm\b/i.test(ask);
    const wantsOwner = /\b(?:onboarding owner|name of the (?:person|owner)|person on your side|who will own)\b/i.test(ask)
      || /\bsend me the name\b/i.test(ask);

    if (wantsReview && wantsConfirm) {
      lines.push("Thanks for sending the pilot proposal. I'll review it and confirm"
        + (when ? (' by ' + when) : '')
        + (/\bwhether\b/i.test(ask) ? ' whether we can start next week' : '')
        + '.');
    } else if (wantsConfirm || wantsReview) {
      const what = entities.requestWhat || entities.what || 'your request';
      lines.push("Thanks. I'll follow up on: " + String(what).replace(/[\r\n]+/g, ' ').trim()
        + (when ? (' (' + when + ')') : '') + '.');
    } else {
      lines.push('Thanks for your note.');
    }

    if (wantsOwner) {
      lines.push('The onboarding owner on our side will be [name].');
    } else if (!wantsReview && !wantsConfirm) {
      lines.push('[Your reply here]');
    }

    lines.push('');
    return lines.join('\n').replace(/\u2014/g, '-').replace(/\u2013/g, '-');
  }

  return { buildBody, greetingName, greetingLine, signatureName, ownAskText };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookReply };
