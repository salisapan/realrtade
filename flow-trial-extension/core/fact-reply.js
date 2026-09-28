// Reply-with-facts. One inbound ask for one concrete fact that lives in a
// Google Sheet or Doc. This file never writes, never calls the network, and
// never touches FlowJudgment's threshold. A chip exists only when detect()
// names a single fact and resolve() finds exactly one cell or paragraph.
// Anything ambiguous — two facts, two cells, two files, a summary, a
// rewrite, a hedge — is null. Wrong fact is worse than silence.
//
// Loaded as a classic script after judgment.js (it reuses newContent so a
// quoted older ask cannot reopen) and as a vm global under Node.

const FlowFactReply = (() => {
  const MAX_VALUE = 40;
  const MAX_PARA = 280;
  const MAX_LINE = 180;

  const KILL = new RegExp([
    '\\b(?:summari[sz]e|summary of|rewrite|re-?write|draft (?:a |the )?(?:reply|email|response|message)|',
    'help me (?:write|reply|draft)|how can I help|compose|what do you think|your thoughts|',
    'what should I|how should I|any advice|write (?:a |the )reply)\\b',
    '|תסכם|סכם את|סיכום של|תכתוב|תנסח|איך אפשר לעזור|איך אוכל לעזור|מה דעתך|',
    'תשלח לי את הגיליון|שלח לי את הגיליון|שלח את (?:ה)?מסמך|תשלח את (?:ה)?קובץ'
  ].join(''), 'i');

  const HEDGE = /\b(?:maybe|perhaps|not sure|whenever you|if you happen)\b|(?:^|\s)(?:אולי|לא בטוח)/i;
  const NEGATION = /\b(?:do not|don'?t|never mind)\b|(?:^|\s)(?:אל ת|לא צריך את|אין צורך)/;
  const INFO = /\b(?:fyi|for your information|no reply needed|no action needed)\b|(?:^|\s)לידיעה/i;
  const FILE_SEND = /\b(?:send|attach|forward) (?:me )?(?:the |this |that )?(?:spreadsheet|sheet|workbook|google doc|document|doc|file)\b/i;

  const KIND_EN = '(spreadsheets?|google sheets?|workbooks?|sheets?|google docs?|documents?|docs?)';
  const EN_ASKS = [
    new RegExp("\\bwhat(?:'s| is| was) (?:the )?(.{2,60}?) (?:in|on|from) (?:the |your )?(.{0,40}?)\\b" + KIND_EN + '\\b', 'i'),
    new RegExp('\\b(?:can|could|would) you (?:please )?(?:tell me|let me know|confirm|share|look up) (?:the )?(.{2,60}?) (?:in|on|from) (?:the |your )?(.{0,40}?)\\b' + KIND_EN + '\\b', 'i'),
    new RegExp('\\bhow much is (?:the )?(.{2,60}?) (?:in|on|from) (?:the |your )?(.{0,40}?)\\b' + KIND_EN + '\\b', 'i'),
    new RegExp('\\b(?:please |can you |could you )?(?:send|forward) (?:me )?(?:the )?(.{2,60}?) (?:in|from) (?:the |your )?(.{0,40}?)\\b' + KIND_EN + '\\b', 'i')
  ];

  const SLOT_HE = 'סכום|יתרה|מחיר|תעריף|עמלה|עלות|תאריך|סטטוס|כמות|מספר|מע["״\']מ|הנחה|תקציב|שכר|סה["״\']כ';
  const KIND_HE = 'גיליון(?:\\s+האלקטרוני)?|גוגל\\s+שיטס|גוגל\\s+דוקס?|מסמך|דוקומנט|דוק';
  const HE_ASK = new RegExp('(?:מה|כמה)\\s+(?:ה)?(' + SLOT_HE + ')\\s+ב(?:ה)?(' + KIND_HE + ')(?:\\s+([^\\s?.!,]{2,40}))?', 'g');

  const SLOT_PHRASE_EN = /\b(invoice numbers?|po numbers?|order numbers?|due dates?)\b/gi;
  const SLOT_WORD_EN = /\b(amounts?|totals?|sums?|balances?|prices?|rates?|fees?|costs?|dates?|statuses|status|quantit(?:y|ies)|qty|numbers?|counts?|subtotals?|taxes|tax|vats?|discounts?|headcounts?|salar(?:y|ies)|quotas?|budgets?)\b/gi;
  const VAGUE_FACT = /^(?:it|that|this|something|anything|everything|details|info|information|data|stuff|help|update|numbers|rows|things?)$/i;
  const GENERIC_SOURCE = /^(?:sheet|spreadsheet|workbook|doc|document|google|גיליון|מסמך|אלקטרוני|דוק|דוקומנט)$/i;
  const STATUS_VALUE = /^(?:paid|unpaid|open|closed|yes|no|approved|pending|active|שולם|לא שולם|פתוח|סגור|מאושר|ממתין)$/i;
  const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'in', 'on', 'from', 'your', 'my', 'sheet', 'doc', 'document', 'spreadsheet']);

  function freshText(text) {
    const raw = String(text || '');
    if (typeof FlowJudgment !== 'undefined' && FlowJudgment.newContent) return FlowJudgment.newContent(raw);
    return raw.trim();
  }

  function kindOf(word) {
    const w = String(word || '');
    if (/sheet|workbook|גיליון|שיטס/i.test(w)) return 'sheet';
    if (/doc|מסמך|דוק/i.test(w)) return 'doc';
    return null;
  }

  function cleanPiece(value) {
    return String(value || '').replace(/[?.!,"']/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function cleanSourceName(raw) {
    let s = cleanPiece(raw);
    s = s.replace(/^ה(?=[\u0590-\u05FF])/, '');
    if (!s || GENERIC_SOURCE.test(s)) return null;
    return s.slice(0, 60);
  }

  function normToken(token) {
    let s = String(token || '').toLowerCase().replace(/["״']/g, '');
    if (/^ה[\u0590-\u05FF]{2,}$/.test(s)) s = s.slice(1);
    return s;
  }

  function tokens(value) {
    const parts = String(value || '').split(/[^\p{L}\p{N}]+/u);
    const out = [];
    for (const part of parts) {
      const t = normToken(part);
      if (!t || STOP.has(t)) continue;
      out.push(t);
    }
    return out;
  }

  function slotCountEn(label) {
    const phrases = label.match(SLOT_PHRASE_EN) || [];
    const rest = label.replace(SLOT_PHRASE_EN, ' ');
    const words = rest.match(SLOT_WORD_EN) || [];
    return phrases.length + words.length;
  }

  function allTokensIn(need, have) {
    if (!need.length) return false;
    for (const t of need) {
      if (have.indexOf(t) === -1) return false;
    }
    return true;
  }

  function labelMatches(label, ask) {
    return allTokensIn(tokens(ask.factLabel), tokens(label));
  }

  function nameMatches(fileName, sourceName) {
    if (!sourceName) return true;
    return allTokensIn(tokens(sourceName), tokens(fileName));
  }

  function execAll(re, text) {
    const flags = re.flags.indexOf('g') === -1 ? re.flags + 'g' : re.flags;
    const g = new RegExp(re.source, flags);
    const hits = [];
    let m;
    while ((m = g.exec(text))) {
      hits.push(m);
      if (m.index === g.lastIndex) g.lastIndex += 1;
    }
    return hits;
  }

  function fromEnglish(match, moneyAsk) {
    const factLabel = cleanPiece(match[1]);
    const sourceName = cleanSourceName(match[2]);
    const sourceKind = kindOf(match[3]);
    if (!factLabel || !sourceKind || VAGUE_FACT.test(factLabel)) return null;
    const slots = slotCountEn(factLabel);
    if (slots > 1) return null;
    if (!moneyAsk && slots !== 1) return null;
    return { factLabel: factLabel.slice(0, 80), sourceKind, sourceName, lang: 'en' };
  }

  function fromHebrew(match) {
    const factLabel = cleanPiece(match[1]);
    const sourceKind = kindOf(match[2]);
    const sourceName = cleanSourceName(match[3]);
    if (!factLabel || !sourceKind) return null;
    return { factLabel: factLabel.slice(0, 80), sourceKind, sourceName, lang: 'he' };
  }

  // null unless the new text is one concrete "what's the X in the sheet/doc"
  // ask. A second ask, a file send, or a writing request is silence.
  function detect(text) {
    const fresh = freshText(text);
    if (!fresh || fresh.length < 8) return null;
    if (KILL.test(fresh) || HEDGE.test(fresh) || NEGATION.test(fresh) || INFO.test(fresh) || FILE_SEND.test(fresh)) return null;

    const asks = [];
    EN_ASKS.forEach((re, i) => {
      for (const match of execAll(re, fresh)) {
        const ask = fromEnglish(match, i === 2);
        if (ask) asks.push({ ask, index: match.index });
      }
    });
    for (const match of execAll(HE_ASK, fresh)) {
      const ask = fromHebrew(match);
      if (ask) asks.push({ ask, index: match.index });
    }
    if (asks.length !== 1) return null;
    return asks[0].ask;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const s = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"') {
          if (s[i + 1] === '"') { cell += '"'; i += 1; }
          else quoted = false;
        } else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows
      .map((r) => r.map((c) => String(c).trim()))
      .filter((r) => r.some(Boolean));
  }

  function sheetValue(cell) {
    const v = String(cell || '').replace(/\s+/g, ' ').trim();
    if (!v || v.length > MAX_VALUE) return null;
    if (v.split(/\s+/).length > 4) return null;
    if (/[.!?]/.test(v)) return null;
    if (STATUS_VALUE.test(v)) return v;
    if (!/\d/.test(v)) return null;
    return v;
  }

  function uniqueHeaderIndex(headers, ask) {
    const hits = [];
    headers.forEach((header, i) => {
      if (labelMatches(header, ask)) hits.push(i);
    });
    return hits.length === 1 ? hits[0] : -1;
  }

  function matchSheet(csv, ask) {
    if (!csv || csv.length > 200000) return { ambiguous: true };
    const rows = parseCsv(csv);
    if (!rows.length || rows.length > 400) return { ambiguous: true };
    const hits = [];

    if (rows.length === 2) {
      const idx = uniqueHeaderIndex(rows[0], ask);
      if (idx >= 0) {
        const value = sheetValue(rows[1][idx]);
        if (value) hits.push({ value, label: rows[0][idx] });
      }
    }

    const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
    if (width === 2) {
      const firstValue = sheetValue(rows[0][1]);
      const start = rows.length > 1 && !labelMatches(rows[0][0], ask) && !firstValue ? 1 : 0;
      const rowHits = [];
      for (let i = start; i < rows.length; i++) {
        if (!labelMatches(rows[i][0], ask)) continue;
        const value = sheetValue(rows[i][1]);
        if (value) rowHits.push({ value, label: rows[i][0] });
      }
      if (rowHits.length > 1) return { ambiguous: true };
      if (rowHits.length === 1) hits.push(rowHits[0]);
    }

    const unique = [];
    for (const hit of hits) {
      if (!unique.some((u) => u.value === hit.value && tokens(u.label).join(' ') === tokens(hit.label).join(' '))) unique.push(hit);
    }
    if (unique.length > 1) return { ambiguous: true };
    return { match: unique[0] || null };
  }

  function concreteValues(text) {
    const re = /[$₪€£]\s?\d[\d,]*(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|(?<![\p{L}\d])\d{2,}(?:\.\d+)?%?(?![\p{L},])/gu;
    const out = [];
    let m;
    while ((m = re.exec(text))) out.push(m[0]);
    return out;
  }

  function matchDoc(text, ask) {
    if (!text || text.length > 200000) return { ambiguous: true };
    const chunks = String(text).split(/\n\s*\n|\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const hits = [];
    for (const para of chunks) {
      if (para.length > MAX_PARA) continue;
      if (!labelMatches(para, ask)) continue;
      const values = concreteValues(para);
      if (values.length !== 1) continue;
      hits.push({ value: values[0].trim(), label: ask.factLabel });
    }
    if (hits.length > 1) return { ambiguous: true };
    return { match: hits[0] || null };
  }

  // sources: [{ id, name, kind: 'sheet'|'doc', text }]. One match, or null.
  // truncated means the Drive list was not the full candidate set — silence.
  function resolve(ask, sources, opts) {
    if (!ask || !ask.factLabel || !ask.sourceKind) return null;
    if (opts && opts.truncated) return null;
    const list = Array.isArray(sources) ? sources : [];
    const eligible = [];
    for (const source of list) {
      if (!source || typeof source.text !== 'string') continue;
      if (source.kind !== ask.sourceKind) continue;
      if (ask.sourceName && !nameMatches(source.name, ask.sourceName)) continue;
      eligible.push(source);
    }
    if (ask.sourceName && !eligible.length) return null;
    const matches = [];
    for (const source of eligible) {
      const found = source.kind === 'doc' ? matchDoc(source.text, ask) : matchSheet(source.text, ask);
      if (!found || found.ambiguous) return null;
      if (!found.match) continue;
      matches.push({
        value: found.match.value,
        label: found.match.label,
        kind: source.kind,
        fileId: source.id || null,
        fileName: source.name || ''
      });
    }
    return matches.length === 1 ? matches[0] : null;
  }

  function factLine(ask, match) {
    const label = String((match && match.label) || (ask && ask.factLabel) || '').replace(/[\r\n]+/g, ' ').trim();
    const value = String((match && match.value) || '').replace(/[\r\n]+/g, ' ').trim();
    if (!value) return null;
    const line = label && label.toLowerCase() !== value.toLowerCase() ? label + ': ' + value : value;
    return line.length > MAX_LINE ? null : line;
  }

  function stripFactLine(body, line) {
    const target = String(line || '').replace(/[\r\n]+/g, ' ').trim();
    const lines = String(body || '').split('\n');
    if (!target) return { body: lines.join('\n'), removed: false };
    let removed = false;
    const kept = [];
    for (const row of lines) {
      if (!removed && row.replace(/\r/g, '').trim() === target) {
        removed = true;
        continue;
      }
      kept.push(row);
    }
    return { body: kept.join('\n').replace(/\n{3,}/g, '\n\n'), removed };
  }

  function yieldsTo(intent) {
    if (!intent) return false;
    // Families B/C/I already decided this message: create, place, or share
    // a file, or stay silent. A cell lookup must not replace that close.
    if (intent.googleClose || intent.googleSilence || intent.googleWait) return true;
    if (!intent.type) return false;
    if (intent.type === 'event' || intent.type === 'commitment') return true;
    const close = intent.personalClose;
    return close === 'calendar-hold' || close === 'dated-commitment' || close === 'confirmed-amount';
  }

  // Connected + a fact ask that is not a stronger close: Glance owns this
  // message. A match becomes the fact intent. No match is silence — the
  // generic reply/task chip must not stand in for a fact we would not write.
  // Not connected: leave the existing classification alone.
  function ownsClose(factAsk, intent, connected) {
    return Boolean(factAsk && connected && !yieldsTo(intent));
  }

  // The morning list has no Sheet/Doc lookup. A fact ask must not become a
  // generic reply card there — the open thread is where the one cell is
  // confirmed, or where Glance stays quiet.
  function blocksInbox(intent, text) {
    const ask = detect(text);
    return Boolean(ask && !yieldsTo(intent));
  }

  function apply(intent, factAsk, opts) {
    opts = opts || {};
    if (!factAsk || yieldsTo(intent) || !opts.connected) return intent;
    if (!opts.match) {
      return {
        type: null,
        signals: (intent && intent.signals) || {},
        facts: (intent && intent.facts) || {}
      };
    }
    return toIntent(factAsk, opts.match, intent) || intent;
  }

  function toIntent(ask, match, prior) {
    const line = factLine(ask, match);
    if (!line) return null;
    const signals = Object.assign({}, (prior && prior.signals) || {}, { factReply: true });
    if (typeof signals.score !== 'number') signals.score = 0;
    const value = String(match.value).replace(/[\r\n]+/g, ' ').trim();
    return {
      type: 'fact',
      confidence: 'high',
      label: value.slice(0, 80),
      entities: {
        what: line,
        factLabel: ask.factLabel,
        factValue: value,
        factLine: line,
        sourceKind: match.kind || ask.sourceKind,
        sourceName: ask.sourceName || null,
        fileName: match.fileName || null,
        fileId: match.fileId || null,
        requestWhat: null,
        requestedObjectTerm: null
      },
      signals,
      facts: (prior && prior.facts) || {}
    };
  }

  return {
    detect, resolve, factLine, stripFactLine, yieldsTo, ownsClose, blocksInbox, apply, toIntent
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowFactReply };
