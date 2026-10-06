// The one cut for "what was written this time". Portable: no chrome.*, no DOM, no network.
//
// Gmail's page cuts at its quote wrapper before this runs. Everything else — Graph, Outlook on the web,
// a pasted forward, a doc comment — only has text. Those callers used to keep their own banner lists.
// This is that list, once: a forward banner, a quote header, a contact line that is only the tail of a
// forward. Judgment's own newContent() still runs first when it is loaded, so a Gmail-shaped header and
// a Graph-shaped header cut at the same place.
const FlowSourceText = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }

  // Line-anchored. The first matching line ends the new text. Same banners graph-mail.js used to own,
  // including the Hebrew forward banner from the real-mail gold set.
  const CUT = [
    /^\s*(?:from|מאת)\s*[:：]\s*.+/i,
    /^\s*on .{5,120} wrote:\s*$/i,
    /^\s*ב-?.{5,80}\s*(?:כתב|כתבה)\s*[:：]?\s*$/,
    /^\s*-{2,}\s*(?:original message|forwarded message|הודעה מקורית|הודעה שהועברה).*$/i,
    /^\s*_{5,}\s*$/,
    /^\s*>/
  ];

  function lineCut(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const out = [];
    for (const l of lines) { if (CUT.some((re) => re.test(l))) break; out.push(l); }
    return out.join('\n').trim();
  }

  function ownText(text) {
    const judgment = sibling(typeof FlowJudgment !== 'undefined' ? FlowJudgment : null, './judgment.js', 'FlowJudgment');
    const raw = String(text == null ? '' : text);
    const headed = judgment && typeof judgment.newContent === 'function' ? judgment.newContent(raw) : raw;
    return lineCut(headed);
  }

  function fromGmail(text) { return ownText(text); }
  function fromGraph(text) { return ownText(text); }

  // A doc comment is the words in the comment. A quoted earlier comment is history, same as a mail quote.
  function fromDocComment(input) {
    if (input == null) return '';
    if (typeof input === 'string') return ownText(input);
    const body = String(input.text || input.body || '');
    const quoted = input.quoted ? String(input.quoted) : '';
    if (!quoted.trim()) return ownText(body);
    const quotedLines = quoted.replace(/\r/g, '').split('\n').map((l) => '> ' + l).join('\n');
    return ownText(body + '\n\n' + quotedLines);
  }

  function normalize(source, raw) {
    const s = String(source || 'gmail');
    if (s === 'doc' || s === 'docs' || s === 'comment') return fromDocComment(raw);
    if (s === 'outlook' || s === 'graph' || s === 'owa') return fromGraph(typeof raw === 'string' ? raw : (raw && (raw.text || raw.body)) || '');
    return fromGmail(typeof raw === 'string' ? raw : (raw && (raw.text || raw.body)) || '');
  }

  return { CUT, ownText, lineCut, fromGmail, fromGraph, fromDocComment, normalize };
})();

if (typeof module !== 'undefined') module.exports = { FlowSourceText };
else if (typeof globalThis !== 'undefined') globalThis.FlowSourceText = FlowSourceText;
