// Google personal closes that land a real Drive / Doc / Sheet write.
//
// Families this module owns (see the locked close-scenario note):
//   B — one clear file, placed on one clear target (calendar description
//       or task note). A Docs comment on someone else's file is not a
//       close this module can make: drive.file cannot see that file, and
//       a full-drive scope is not granted here. Those asks stay silent.
//   C — the message itself asks to create the artifact (decision log,
//       a new sheet, or save the one attached file into Drive) and then
//       share the link on a draft.
//   I — a clear artifact (quote, proposal, invoice, letter, and the same
//       create-shaped docs) with no single safe Drive match. Do It
//       creates from the company template already on the account. No
//       template, no clear artifact, or more than one Drive match → silence.
//       Never a blank Doc.
//
// Missing details, on I and on any Doc/Sheet create:
//   0 missing  → the close card only.
//   1–4 missing → those fields on the same card. Chat stays closed.
//   >4 missing → a slot checklist, and only that. It names the missing
//       slots. It does not advise, rewrite, search, or summarize.
//       Two replies max. A reply that fills nothing, a dismiss, or a
//       second reply that still leaves more than four slots → silence,
//       and nothing is created.
// After the slots are filled the same card is the only surface: one Do It.
//
// Nothing here calls the network or touches chrome.* / document / window.
// Facts come from the thread, the template's own structure, or a slot the
// user just filled. A value that was not in one of those three places is
// not written.

const FlowGoogleCloses = (() => {
  const MAX_CHAT_TURNS = 2;
  const FIELD_CAP = 4;
  const KNOWN_SLOTS = ['party', 'amount', 'date', 'title', 'what', 'reference'];
  const SLOT_LABELS = {
    party: ['party', 'client', 'customer', 'לקוח'],
    amount: ['amount', 'sum', 'price', 'total', 'סכום'],
    date: ['date', 'due', 'תאריך'],
    title: ['title', 'כותרת'],
    what: ['what', 'decision', 'החלטה'],
    reference: ['reference', 'ref', 'אסמכתא']
  };

  const ARTIFACTS = {
    quote: { en: 'quote', he: 'הצעת מחיר', kind: 'doc', slots: ['party', 'amount', 'title'] },
    proposal: { en: 'proposal', he: 'הצעה', kind: 'doc', slots: ['party', 'title'] },
    invoice: { en: 'invoice', he: 'חשבונית', kind: 'doc', slots: ['party', 'amount'] },
    letter: { en: 'letter', he: 'מכתב', kind: 'doc', slots: ['party', 'title'] },
    'decision-log': { en: 'decision log', he: 'סיכום החלטה', kind: 'doc', slots: ['what'] },
    'amount-sheet': { en: 'sheet', he: 'גיליון', kind: 'sheet', slots: ['amount', 'date'] }
  };

  const CREATE_EN = /\b(?:please\s+)?(?:prepare|draft|write|issue|draw up|put together)\b(?:\s+\w+){0,5}\s+(?:a|an|the)\s+(quote|quotation|proposal|invoice|letter|decision log)\b/i;
  const CREATE_HE = /(?:תכין|תכינו|נא\s+להכין|להכין|תכתוב|תנסח|תוציא)\s+(הצעת\s+מחיר|הצעה|חשבונית|מכתב|סיכום\s+החלטה)/;
  const SHEET_EN = /\b(?:log|record|enter)\b[^.!?\n]{0,80}?\s+(?:in|into|on)\s+a\s+new\s+(?:google\s+)?(?:spreadsheet|sheet)\b/i;
  const SHEET_HE = /(?:תרשום|רשום|לרשום)\s+בגיליון\s+חדש/;
  const SHEET_EXISTING = /\b(?:the|our|my)\s+(?:\w+\s+){0,3}(?:spreadsheet|sheet|tracker|workbook)\b|הגיליון\s+ה|בגיליון\s+ה/i;
  const SHEET_MUTATE = /\b(?:update|edit|change|append|add a row)\b|עדכן|תעדכן|תוסיף\s+שורה/i;
  const SAVE_EN = /\b(?:save|file|store|upload)\b(?:\s+\w+){0,6}\s+(?:the\s+)?(?:attached\s+file|attachment|attached\s+pdf)\b[^.!?\n]{0,50}\b(?:to|in|into|on)\s+(?:google\s+)?drive\b/i;
  const SAVE_HE = /(?:תשמור|שמור|לשמור|תתייק)[^\n]{0,40}(?:בדרייב|בגוגל\s*דרייב)/;
  const COMMENT_EN = /\b(?:comment|add a comment|leave a note)\b[^.!?\n]{0,40}\b(?:on|in)\s+(?:the\s+)?(?:doc|document|google doc)\b/i;
  const COMMENT_HE = /(?:תגיב|תוסיף\s+הערה|הערה)[^\n]{0,30}(?:במסמך|בדוק|במסמך\s+גוגל)/;
  const HEDGE = /\b(?:maybe|might|perhaps|possibly)\b|(?:^|\s)(?:אולי|ייתכן)/i;
  const PLACE_EN = /\b(?:add|put|attach|include|place|note)\b(?:\s+\w+){0,4}\s+(?:the\s+)?([a-z][\w-]{2,24})\b(?:\s+\w+){0,10}\s+(?:on|to|into|in)\s+(?:the\s+)?(calendar|invite|event|hold|task|reminder)\b/i;
  const PLACE_HE = /(?:תוסיף|תצרף|שים|תשים)\s+את\s+ה?([א-ת]{2,24})\s+[^\n]{0,40}(ליומן|בזימון|בתזכורת|במשימה)/;
  const PLACE_STOP = /^(?:meeting|call|sync|this|that|these|those|file|files|doc|docs|document|documents|stuff|one|email|message|it|them|thing|things)$/i;
  const SEND_ONLY = /\b(?:send|attach|forward|share)\b/i;

  function englishPluralTerm(term) {
    if (!term || !/^[a-z]/i.test(term)) return false;
    if (term.toLowerCase() === 'agenda') return false;
    return /s$/i.test(term);
  }

  function detailMode(missingCount) {
    const n = Number(missingCount);
    if (!Number.isFinite(n) || n <= 0) return 'ready';
    if (n > FIELD_CAP) return 'chat';
    return 'fields';
  }

  function chatLine(slotNames, lang) {
    const names = (slotNames || []).filter(Boolean).join(', ');
    if (!names) return null;
    return lang === 'he' ? ('חסר: ' + names) : ('Still needed: ' + names);
  }

  function cardPlan(close) {
    const missing = (close && close.missing) || [];
    const mode = detailMode(missing.length);
    const lang = close && close.lang === 'he' ? 'he' : 'en';
    return {
      line: lang === 'he' ? close.cardLineHe : close.cardLine,
      mode: mode,
      fields: mode === 'fields' ? missing.slice(0, FIELD_CAP) : [],
      chatSlots: mode === 'chat' ? missing.slice() : [],
      chat: mode === 'chat',
      chatLine: mode === 'chat' ? chatLine(missing, lang) : null
    };
  }

  function cleanLine(value) {
    const s = String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    return s.slice(0, 200);
  }

  function cleanParty(raw) {
    let s = cleanLine(raw);
    if (!s) return null;
    s = s.split(/\s+(?:at|for|on|by|of)\s+|[,(]/i)[0].trim().replace(/[.,;:]+$/, '');
    if (s.length < 2 || s.length > 60) return null;
    if (/^(?:the|a|an|me|us|you|this|that)$/i.test(s)) return null;
    return s;
  }

  function partyFrom(text) {
    const en = String(text || '').match(/\bfor\s+([A-Z][\p{L}\p{N}&.'’-]{0,30}(?:\s+[A-Z][\p{L}\p{N}&.'’-]{0,30}){0,3})/u);
    if (en) return cleanParty(en[1]);
    const he = String(text || '').match(/(?:עבור|אל)\s+([\u0590-\u05FF][\u0590-\u05FF\s"']{1,40})/);
    if (he) return cleanParty(he[1]);
    return null;
  }

  function titleFrom(text) {
    const m = String(text || '').match(/\b(?:titled|title)\s*[:=]\s*([^\n]{3,80})/i)
      || String(text || '').match(/[“"]([^”"\n]{3,80})[”"]/);
    return m ? cleanLine(m[1]) : null;
  }

  function whatFrom(text) {
    const m = String(text || '').match(/\b(?:agreed|confirmed|approved)\b[^.!?\n]{0,180}/i)
      || String(text || '').match(/(?:סוכם|אושר|מאושר)[^.!?\n]{0,180}/);
    return m ? cleanLine(m[0]) : null;
  }

  function referenceFrom(text) {
    const m = String(text || '').match(/\b(?:reference|ref)\s*[:=]\s*([^\n]{2,80})/i)
      || String(text || '').match(/אסמכתא\s*[:=]\s*([^\n]{2,80})/);
    return m ? cleanLine(m[1]) : null;
  }

  function hebrewText(text) {
    return /[\u0590-\u05FF]/.test(String(text || ''));
  }

  function artifactFromCreate(text) {
    const he = text.match(CREATE_HE);
    if (he) {
      const word = he[1].replace(/\s+/g, ' ');
      if (word === 'הצעת מחיר') return 'quote';
      if (word === 'הצעה') return 'proposal';
      if (word === 'חשבונית') return 'invoice';
      if (word === 'מכתב') return 'letter';
      if (word === 'סיכום החלטה') return 'decision-log';
    }
    const en = text.match(CREATE_EN);
    if (!en) return null;
    const word = en[1].toLowerCase();
    if (word === 'quotation') return 'quote';
    if (word === 'decision log') return 'decision-log';
    return word;
  }

  function templateFor(store, artifact) {
    if (!store || !artifact) return null;
    const list = Array.isArray(store) ? store : (Array.isArray(store.templates) ? store.templates : [store]);
    const hits = [];
    for (const t of list) {
      if (!t || t.artifact !== artifact) continue;
      if (t.kind !== 'doc' && t.kind !== 'sheet') continue;
      if (!cleanLine(t.name)) continue;
      const spec = ARTIFACTS[artifact];
      if (spec && t.kind !== spec.kind) continue;
      hits.push(t);
    }
    if (hits.length !== 1) return null;
    return hits[0];
  }

  function slotsFor(template, artifact) {
    const spec = ARTIFACTS[artifact];
    const fallback = spec ? spec.slots.slice() : [];
    if (!template || !Array.isArray(template.slots) || !template.slots.length) return fallback;
    const out = [];
    for (const name of template.slots) {
      if (KNOWN_SLOTS.indexOf(name) === -1) continue;
      if (out.indexOf(name) === -1) out.push(name);
    }
    return out.length ? out : null;
  }

  function filledFrom(text, input, slots) {
    const filled = {};
    if (slots.indexOf('party') !== -1) {
      const party = partyFrom(text);
      if (party) filled.party = party;
    }
    if (slots.indexOf('amount') !== -1 && input.amount) filled.amount = cleanLine(input.amount);
    if (slots.indexOf('date') !== -1 && input.dateIso) filled.date = cleanLine(input.dateText || input.dateIso);
    if (slots.indexOf('title') !== -1) {
      const title = titleFrom(text);
      if (title) filled.title = title;
    }
    if (slots.indexOf('what') !== -1) {
      const what = whatFrom(text);
      if (what) filled.what = what;
    }
    if (slots.indexOf('reference') !== -1) {
      const reference = referenceFrom(text);
      if (reference) filled.reference = reference;
    }
    return filled;
  }

  function missingSlots(slots, filled) {
    const missing = [];
    for (const name of slots) {
      if (!filled[name]) missing.push(name);
    }
    return missing;
  }

  function linesFor(close, lang) {
    const spec = ARTIFACTS[close.artifact] || {};
    const noun = lang === 'he' ? (spec.he || close.artifact) : (spec.en || close.artifact);
    if (close.family === 'I') {
      return {
        cardLine: "Didn't find " + noun + ' — draft from template',
        cardLineHe: 'לא נמצא ' + (spec.he || noun) + ' — טיוטה מהתבנית'
      };
    }
    if (close.copyAttachment) {
      return {
        cardLine: 'Saving the attached file to Drive.',
        cardLineHe: 'שומר את הקובץ המצורף בדרייב.'
      };
    }
    return {
      cardLine: 'Drafting the ' + noun + ' from the template.',
      cardLineHe: 'טיוטה של ' + (spec.he || noun) + ' מהתבנית.'
    };
  }

  function fileMatchOf(input) {
    const value = input && input.fileMatch;
    if (value === 'none' || value === 'one' || value === 'many' || value === 'unknown') return value;
    return null;
  }

  function placeTarget(which) {
    if (which === 'calendar' || which === 'invite' || which === 'event' || which === 'hold' || which === 'ליומן' || which === 'בזימון') return 'calendar';
    if (which === 'task' || which === 'reminder' || which === 'בתזכורת' || which === 'במשימה') return 'task';
    return null;
  }

  function artifactForTerm(term) {
    const t = String(term || '').toLowerCase();
    if (t === 'quote' || t === 'quotation' || t === 'הצעה' || t === 'הצעת') return 'quote';
    if (t === 'proposal') return 'proposal';
    if (t === 'invoice' || t === 'חשבונית') return 'invoice';
    if (t === 'letter' || t === 'מכתב') return 'letter';
    return null;
  }

  function bothDestinations(text) {
    const cal = /(?:\b(?:calendar|invite)\b|ליומן|בזימון)/i.test(text);
    const task = /(?:\b(?:task|reminder)\b|בתזכורת|במשימה)/i.test(text);
    return cal && task;
  }

  function consider(input) {
    input = input || {};
    const text = String(input.text || '');
    if (!text.trim()) return null;
    if (COMMENT_EN.test(text) || COMMENT_HE.test(text)) return { silence: true };
    if (input.blocked) return null;
    if (HEDGE.test(text) && (CREATE_EN.test(text) || CREATE_HE.test(text) || SHEET_EN.test(text) || SHEET_HE.test(text) || SAVE_EN.test(text) || SAVE_HE.test(text) || PLACE_EN.test(text) || PLACE_HE.test(text))) {
      return { silence: true };
    }

    if (SAVE_EN.test(text) || SAVE_HE.test(text)) {
      if (input.attachmentCount !== 1) return { silence: true };
      const lang = hebrewText(text) ? 'he' : 'en';
      const close = {
        family: 'C',
        personalClose: 'drive-file',
        artifact: null,
        kind: 'file',
        copyAttachment: true,
        destination: 'draft',
        fileTerm: null,
        slots: [],
        filled: {},
        missing: [],
        chat: false,
        lang: lang,
        templateName: null,
        logo: null,
        intro: null
      };
      const lines = linesFor(close, lang);
      close.cardLine = lines.cardLine;
      close.cardLineHe = lines.cardLineHe;
      return { close: close };
    }

    const place = text.match(PLACE_EN) || text.match(PLACE_HE);
    if (place) {
      if (bothDestinations(text)) return { silence: true };
      const term = cleanLine(place[1]);
      const destination = placeTarget(place[2]);
      // A trailing s is plural English ("files", "invoices") — not one file.
      // "agenda" is not plural. Hebrew terms do not use that suffix.
      if (!term || !destination || PLACE_STOP.test(term) || englishPluralTerm(term)) return { silence: true };
      const match = fileMatchOf(input);
      if (!match) return { wait: term };
      if (match !== 'one') {
        const creatable = artifactForTerm(term);
        if (match === 'none' && creatable && destination) {
          if (destination === 'calendar' && (!input.dateIso || !input.hasClock)) return { silence: true };
          return createClose(text, input, creatable, 'I', destination);
        }
        return { silence: true };
      }
      if (destination === 'calendar' && (!input.dateIso || !input.hasClock)) return { silence: true };
      if (destination === 'task' && !input.dateIso && !/(?:task|reminder|תזכורת|משימה)/i.test(text)) return { silence: true };
      const lang = hebrewText(text) ? 'he' : 'en';
      const close = {
        family: 'B',
        personalClose: destination === 'calendar' ? 'file-on-hold' : 'file-on-task',
        artifact: null,
        kind: null,
        copyAttachment: false,
        destination: destination,
        fileTerm: term,
        slots: [],
        filled: {},
        missing: [],
        chat: false,
        lang: lang,
        templateName: null,
        logo: null,
        intro: null,
        what: whatFrom(text)
      };
      close.cardLine = destination === 'calendar'
        ? 'Putting ' + term + ' on the calendar.'
        : 'Noting ' + term + ' on the task.';
      close.cardLineHe = destination === 'calendar'
        ? 'שם את ' + term + ' ביומן.'
        : 'מציין את ' + term + ' בתזכורת.';
      return { close: close };
    }

    if (SHEET_EXISTING.test(text) && SHEET_MUTATE.test(text) && !SHEET_EN.test(text) && !SHEET_HE.test(text)) return { silence: true };
    if (SHEET_EN.test(text) || SHEET_HE.test(text)) {
      return createClose(text, input, 'amount-sheet', 'C', 'draft');
    }

    const artifact = artifactFromCreate(text);
    if (!artifact) return null;
    // "Please send the invoice" is family A (the sibling find-and-attach
    // path). A prepare/draft/write verb is this stream. A send verb with
    // no create verb was already excluded by artifactFromCreate.
    if (SEND_ONLY.test(text) && !CREATE_EN.test(text) && !CREATE_HE.test(text)) return null;
    return createClose(text, input, artifact, 'I', 'draft');
  }

  function createClose(text, input, artifact, family, destination) {
    const spec = ARTIFACTS[artifact];
    if (!spec) return { silence: true };
    const template = templateFor(input.template, artifact);
    if (!template) return { silence: true };
    const slots = slotsFor(template, artifact);
    if (!slots || !slots.length) return { silence: true };
    const match = fileMatchOf(input);
    // Family I must not create a second file when Drive already has one
    // clear match, and must not guess among several. Unknown means the
    // host has not checked yet.
    if (family === 'I' || destination === 'calendar' || destination === 'task') {
      if (!match) return { wait: hebrewText(text) && spec.he ? spec.he : spec.en };
      if (match !== 'none') return { silence: true };
    }
    const filled = filledFrom(text, input, slots);
    const missing = missingSlots(slots, filled);
    const lang = hebrewText(text) ? 'he' : 'en';
    const close = {
      family: family,
      personalClose: 'create-missing',
      artifact: artifact,
      kind: spec.kind,
      copyAttachment: false,
      destination: destination,
      fileTerm: null,
      slots: slots,
      filled: filled,
      missing: missing,
      chat: detailMode(missing.length) === 'chat',
      lang: lang,
      templateName: cleanLine(template.name),
      logo: cleanLine(template.logo),
      intro: template.intro && String(template.intro).indexOf('{{') === -1 ? cleanLine(template.intro) : null,
      what: filled.what || null
    };
    const lines = linesFor(close, lang);
    close.cardLine = lines.cardLine;
    close.cardLineHe = lines.cardLineHe;
    return { close: close };
  }

  function parseSlotReply(reply, slotNames) {
    const wanted = (slotNames || []).filter((name) => KNOWN_SLOTS.indexOf(name) !== -1);
    const text = String(reply == null ? '' : reply).trim();
    if (!text || !wanted.length) return { fills: {}, unsure: !text ? false : true, ignore: !text };
    const fills = {};
    const lines = text.split(/\n+/);
    for (const line of lines) {
      for (const name of wanted) {
        if (fills[name]) continue;
        const labels = SLOT_LABELS[name] || [name];
        for (const label of labels) {
          const re = new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:=]\\s*(.+)$', 'i');
          const m = line.match(re);
          if (m && cleanLine(m[1])) fills[name] = cleanLine(m[1]);
        }
      }
    }
    if (!Object.keys(fills).length && wanted.length === 1) {
      const only = wanted[0];
      const value = cleanLine(text);
      if (!value) return { fills: {}, unsure: true };
      if (only === 'amount' && !/\d/.test(value)) return { fills: {}, unsure: true };
      if (only === 'date' && !/\d/.test(value)) return { fills: {}, unsure: true };
      if (value.length > 120) return { fills: {}, unsure: true };
      fills[only] = value;
    }
    if (!Object.keys(fills).length) return { fills: {}, unsure: true };
    return { fills: fills, unsure: false };
  }

  function acceptTurn(close, reply, turnsSoFar) {
    const turns = Number(turnsSoFar) || 0;
    const parsed = parseSlotReply(reply, close && close.missing);
    if (parsed.ignore) return { ignore: true };
    if (parsed.unsure) return { silence: true };
    const filled = Object.assign({}, close.filled, parsed.fills);
    const missing = missingSlots(close.slots || [], filled);
    const nextTurns = turns + 1;
    if (missing.length > FIELD_CAP && nextTurns >= MAX_CHAT_TURNS) return { silence: true };
    return {
      filled: filled,
      missing: missing,
      turns: nextTurns,
      mode: detailMode(missing.length)
    };
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function mergedFills(close, fills) {
    const merged = Object.assign({}, (close && close.filled) || {});
    const allowed = (close && close.slots) || [];
    fills = fills || {};
    for (const name of allowed) {
      const value = cleanLine(fills[name]);
      if (value) merged[name] = value;
    }
    return merged;
  }

  function artifactBody(close, fills) {
    if (!close || close.copyAttachment) return { blank: true };
    if (!close.templateName) return { blank: true };
    const merged = mergedFills(close, fills);
    const missing = missingSlots(close.slots || [], merged);
    if (missing.length) return { blank: true, missing: missing };
    const labels = { party: 'Party', amount: 'Amount', date: 'Date', title: 'Title', what: 'What', reference: 'Reference' };
    const factLines = [];
    for (const name of close.slots) {
      if (merged[name]) factLines.push([labels[name] || name, merged[name]]);
    }
    if (!factLines.length) return { blank: true, missing: missing };
    const title = close.templateName;
    const html = [];
    html.push('<h1>' + esc(title) + '</h1>');
    if (close.logo) html.push('<p>' + esc(close.logo) + '</p>');
    if (close.intro) html.push('<p>' + esc(close.intro) + '</p>');
    html.push('<ul>');
    for (const row of factLines) html.push('<li>' + esc(row[0] + ': ' + row[1]) + '</li>');
    html.push('</ul>');
    const csv = ['Field,Value'].concat(factLines.map((row) => '"' + row[0].replace(/"/g, '""') + '","' + row[1].replace(/"/g, '""') + '"')).join('\n');
    return {
      blank: false,
      missing: [],
      title: title,
      html: html.join(''),
      csv: csv,
      mimeType: close.kind === 'sheet'
        ? 'application/vnd.google-apps.spreadsheet'
        : 'application/vnd.google-apps.document'
    };
  }

  function nameTokens(value) {
    return String(value || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }

  // Contiguous token phrase. "quote" matches "Acme quote.pdf" and does not
  // match "quotation". "decision log" matches "Decision log.pdf".
  function nameHasPhrase(name, term) {
    const tokens = nameTokens(name);
    const needle = nameTokens(term);
    if (!needle.length || needle.join('').length < 2) return false;
    for (let i = 0; i <= tokens.length - needle.length; i++) {
      let same = true;
      for (let j = 0; j < needle.length; j++) {
        if (tokens[i + j] !== needle[j]) { same = false; break; }
      }
      if (same) return true;
    }
    return false;
  }

  // Exactly one name match. Zero or two-plus is not a file we may use.
  function pickOneFile(files, term) {
    const hits = [];
    for (const file of files || []) {
      if (!file || file.trashed) continue;
      if (!nameHasPhrase(file.name, term)) continue;
      hits.push(file);
    }
    if (hits.length !== 1) return null;
    return hits[0];
  }

  return {
    consider: consider,
    detailMode: detailMode,
    cardPlan: cardPlan,
    chatLine: chatLine,
    parseSlotReply: parseSlotReply,
    acceptTurn: acceptTurn,
    artifactBody: artifactBody,
    pickOneFile: pickOneFile,
    MAX_CHAT_TURNS: MAX_CHAT_TURNS,
    FIELD_CAP: FIELD_CAP,
    ARTIFACTS: ARTIFACTS
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleCloses };
