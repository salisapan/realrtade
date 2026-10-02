// Family A (find + attach) and the handoff into Family I (create only
// when a company template already exists). Pure: no chrome, no DOM, no
// network. The host searches Drive and writes the draft; this file only
// decides whether there is exactly one file to attach, whether to hand
// off to a template, or whether to stay silent.
//
// Silence wins whenever the ask itself is unclear, or more than one file
// could honestly be the one. A clear ask with no safe file hands off to
// create-when-missing only when exactly one template for that object is
// in the results. No template means silence — never a blank document.
// The handoff collects missing facts as named slots: at most four on the
// card. More than four still missing is a slot checklist, one name at a
// time, never a free prompt.

const FlowFileAttach = (() => {
  // Longer phrases before the nouns they contain, so "tax invoice" and
  // "חשבונית מס" are one object, not two.
  const OBJECTS = [
    { id: 'tax-invoice', creatable: true, en: /\btax invoices?\b/gi, he: /חשבונית מס/g, enLabel: 'tax invoice', heLabel: 'חשבונית מס', synonym: ['tax invoice', 'invoice', 'חשבונית מס', 'חשבונית'] },
    { id: 'invoice', creatable: true, en: /\binvoices?\b/gi, he: /חשבונית/g, enLabel: 'invoice', heLabel: 'חשבונית', synonym: ['invoice', 'חשבונית'] },
    { id: 'receipt', creatable: true, en: /\breceipts?\b/gi, he: /קבלה/g, enLabel: 'receipt', heLabel: 'קבלה', synonym: ['receipt', 'קבלה'] },
    { id: 'quote', creatable: true, en: /\b(?:quotes?|quotations?)\b/gi, he: /הצעת (?:ה)?מחיר/g, enLabel: 'quote', heLabel: 'הצעת מחיר', synonym: ['quote', 'quotation', 'הצעת מחיר', 'הצעת המחיר'] },
    { id: 'proposal', creatable: true, en: /\bproposals?\b/gi, he: /הצעה/g, enLabel: 'proposal', heLabel: 'הצעה', synonym: ['proposal', 'הצעה'] },
    { id: 'contract', creatable: true, en: /\b(?:contracts?|agreements?|ndas?)\b/gi, he: /הסכם סודיות|חוזה|הסכם/g, enLabel: 'contract', heLabel: 'חוזה', synonym: ['contract', 'agreement', 'nda', 'חוזה', 'הסכם'] },
    { id: 'letter', creatable: true, en: /\bletters?\b/gi, he: /מכתב/g, enLabel: 'letter', heLabel: 'מכתב', synonym: ['letter', 'מכתב'] },
    { id: 'brief', creatable: true, en: /\bbriefs?\b/gi, he: /בריף/g, enLabel: 'brief', heLabel: 'בריף', synonym: ['brief', 'בריף'] },
    { id: 'statement', creatable: true, en: /\bstatements?\b/gi, he: /דף חשבון/g, enLabel: 'statement', heLabel: 'דף חשבון', synonym: ['statement', 'דף חשבון'] },
    { id: 'passport', creatable: false, en: /\bpassports?\b/gi, he: /דרכון/g, enLabel: 'passport', heLabel: 'דרכון', synonym: ['passport', 'דרכון'] },
    { id: 'id-scan', creatable: false, en: /\b(?:photo ids?|id scans?|ids?|identity cards?|driver'?s licen[cs]es?)\b/gi, he: /תעודת (?:ה)?זהות/g, enLabel: 'ID', heLabel: 'תעודת זהות', synonym: ['identity', 'license', 'תעודת זהות', 'זהות'] },
    { id: 'insurance', creatable: false, en: /\binsurance (?:form|certificate|policy)\b/gi, he: /טופס ביטוח|פוליסת?\s+(?:ה)?ביטוח/g, enLabel: 'insurance form', heLabel: 'טופס ביטוח', synonym: ['insurance', 'ביטוח', 'פוליסה', 'פוליסת'] },
    { id: 'tax-form', creatable: false, en: /\b(?:w-?9s?|w-?2s?|1099s?|tax returns?|tax documents?|tax docs?|tax forms?)\b/gi, he: /טופס (?:ה)?מס|אישור (?:ה)?מס/g, enLabel: 'tax form', heLabel: 'טופס מס', synonym: ['w-9', 'w9', '1099', 'tax form', 'טופס מס', 'טופס המס', 'אישור מס'] },
    { id: 'po', creatable: false, en: /\b(?:purchase orders?|pos?)\b/gi, he: /הזמנת רכש/g, enLabel: 'purchase order', heLabel: 'הזמנת רכש', synonym: ['purchase', 'הזמנת', 'רכש'] },
    { id: 'deck', creatable: false, en: /\b(?:decks?|presentations?|slides?)\b/gi, he: /מצגת/g, enLabel: 'deck', heLabel: 'מצגת', synonym: ['deck', 'presentation', 'slides', 'מצגת'] },
    { id: 'logo', creatable: false, en: /\blogos?\b/gi, he: /לוגו/g, enLabel: 'logo', heLabel: 'לוגו', synonym: ['logo', 'לוגו'] },
    { id: 'transfer', creatable: false, en: /\b(?:transfer (?:confirmation|receipt)|proof of (?:payment|transfer))\b/gi, he: /אישור (?:ה)?העברה/g, enLabel: 'transfer confirmation', heLabel: 'אישור העברה', synonym: ['transfer', 'העברה', 'אישור העברה', 'אישור ההעברה'] },
    { id: 'report', creatable: false, en: /\breports?\b/gi, he: /דו["״]ח|דוח/g, enLabel: 'report', heLabel: 'דוח', synonym: ['report', 'דוח', 'דו"ח'] },
    { id: 'signed-copy', creatable: false, en: /\bsigned (?:pdf|copy|scan)\b/gi, he: /עותק חתום|מסמך חתום/g, enLabel: 'signed copy', heLabel: 'עותק חתום', synonym: ['signed', 'חתום'] }
  ];

  const NEED_EN = /\b(?:please\s+(?:send|attach|forward|share|resend|provide|email|enclose)|(?:can|could|would)\s+you\s+(?:please\s+)?(?:send|attach|forward|share|resend|provide|email)|would\s+you\s+mind\s+(?:sending|attaching|forwarding|sharing|emailing)|mind\s+(?:sending|forwarding|emailing|sharing)|kindly\s+(?:send|attach|forward|share|resend|provide|email)|(?:sending|send|attach|forward|share|resend|email)\s+(?:me\s+|us\s+|over\s+)?(?:the|your|our|a|an|that)|(?:i|we)\s+(?:still\s+|also\s+)?need\s+(?:you\s+to\s+(?:send|forward|attach|share|email)\s+)?(?:a\s+copy\s+of\s+)?(?:the|your|our|a|an)|(?:can|could)\s+i\s+(?:please\s+)?(?:get|have)\s+(?:a\s+copy\s+of\s+)?(?:the|your|a|an)|be\s+able\s+to\s+(?:send|forward|share|attach|email|resend|provide)|if\s+you\s+could\s+(?:please\s+)?(?:send|forward|share|attach|email|resend|provide)|pass\s+along\s+(?:the|your|a|an))\b/i;
  // צריך uses a final kaf; צריכה and צריכים use a regular kaf. One optional
  // letter cannot spell both. שלח is bounded so אשלח (a promise) is not a need.
  const NEED_HE = /(?:תשלח(?:י|ו)?|לשלוח|להעביר|לצרף|(?:^|[^\u0590-\u05FF])שלח(?:י|ו)?(?:\s+לי)?|תצר(?:ף|פי|פו)|צר(?:ף|פי|פו)|תעביר(?:י|ו)?(?:\s+לי)?|אשמח\s+לקבל|אפשר\s+(?:לקבל|לצרף)|אבקש\s+לקבל|(?:צריך|צריכה|צריכים)\s+את|נשמח\s+לקבל|מבקש(?:ת|ים)?\s+לשלוח|תוכל(?:י|ו)?(?:\s+בבקשה)?\s+(?:לשלוח|להעביר|לצרף))/;
  const NEG_EN = /\b(?:do not|don't|no need to)\s+(?:send|attach|forward|share|resend|provide)\b/i;
  const NEG_HE = /(?:אל\s+תשלח|אין\s+צורך|לא\s+צריך\s+לשלוח|בלי\s+לצרף)/;
  const HEDGE = /\b(?:maybe|perhaps|possibly|if you want|if you feel like|no rush|any chance|not sure which|whichever)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם בא לך|לא בטוח(?:ה)?\s+איז|איזה\s+קובץ|איזו\s+חשבונית|יש סיכוי/i;
  const FYI = /\b(?:fyi|for your information|no action needed|no reply needed)\b|לידיעה|אין צורך בפעולה/i;
  const ALREADY = /\b(?:i|we)\s+(?:already\s+)?(?:sent|attached|forwarded|shared)\b|\b(?:please\s+find|find)\s+attached\b|מצורף|שלחתי|צירפתי/i;

  const UNSURE = /^(?:i don'?t know|not sure|unsure|no idea|skip|idk|לא יודע(?:ת)?|לא בטוח(?:ה)?|אין לי מושג|\?+)$/i;
  const CHAT_ATTEMPT = /\b(?:how can i help|what should i|rewrite this|summarize|search my drive|help me write)\b|איך אפשר לעזור|תחפש בדרייב/i;

  const TEMPLATE_MARK = /template|תבנית/i;
  const ATTACH_SCORE = 100;
  const SCORE_GAP = 40;
  const MAX_CARD_FIELDS = 4;
  const MAX_VALUE = 160;
  const MAX_BYTES = 8 * 1024 * 1024;

  const STOP = {
    please: 1, send: 1, could: 1, would: 1, your: 1, this: 1, that: 1, with: 1, from: 1,
    have: 1, need: 1, attach: 1, forward: 1, share: 1, thanks: 1, thank: 1, hello: 1,
    regards: 1, attached: 1, attachment: 1, file: 1, document: 1, copy: 1,
    when: 1, chance: 1, friday: 1, monday: 1,
    tuesday: 1, wednesday: 1, thursday: 1, saturday: 1, sunday: 1, about: 1, just: 1,
    following: 1, follow: 1, kind: 1, regards: 1
  };

  const FIELDS = {
    'tax-invoice': 'invoice',
    invoice: [
      { id: 'billTo', en: 'Bill to', he: 'לחיוב', from: 'sender' },
      { id: 'amount', en: 'Amount', he: 'סכום', from: 'amount' },
      { id: 'date', en: 'Date', he: 'תאריך', from: 'when' },
      { id: 'number', en: 'Invoice number', he: 'מספר חשבונית' },
      { id: 'forWhat', en: 'What it’s for', he: 'עבור' }
    ],
    quote: [
      { id: 'forWhom', en: 'For', he: 'עבור', from: 'sender' },
      { id: 'amount', en: 'Amount', he: 'סכום', from: 'amount' },
      { id: 'date', en: 'Valid until', he: 'בתוקף עד', from: 'when' },
      { id: 'scope', en: 'Scope', he: 'היקף' }
    ],
    proposal: [
      { id: 'forWhom', en: 'For', he: 'עבור', from: 'sender' },
      { id: 'amount', en: 'Amount', he: 'סכום', from: 'amount' },
      { id: 'date', en: 'Date', he: 'תאריך', from: 'when' },
      { id: 'scope', en: 'Scope', he: 'היקף' }
    ],
    receipt: [
      { id: 'from', en: 'From', he: 'מאת', from: 'sender' },
      { id: 'amount', en: 'Amount', he: 'סכום', from: 'amount' },
      { id: 'date', en: 'Date', he: 'תאריך', from: 'when' },
      { id: 'forWhat', en: 'What it’s for', he: 'עבור' }
    ],
    contract: [
      { id: 'party', en: 'Other party', he: 'הצד השני', from: 'sender' },
      { id: 'date', en: 'Effective date', he: 'תאריך', from: 'when' }
    ],
    letter: [
      { id: 'to', en: 'To', he: 'אל', from: 'sender' },
      { id: 'about', en: 'About', he: 'נושא' },
      { id: 'date', en: 'Date', he: 'תאריך', from: 'when' }
    ],
    brief: [
      { id: 'about', en: 'About', he: 'נושא' },
      { id: 'date', en: 'Date', he: 'תאריך', from: 'when' }
    ],
    statement: [
      { id: 'account', en: 'Account', he: 'חשבון', from: 'sender' },
      { id: 'date', en: 'Date', he: 'תאריך', from: 'when' }
    ]
  };

  function fresh(text) {
    const raw = String(text || '');
    if (typeof FlowJudgment !== 'undefined' && FlowJudgment.newContent) return FlowJudgment.newContent(raw);
    return raw.split(/\n/).filter((line) => !/^\s*>/.test(line)).join('\n');
  }

  function norm(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\.[a-z0-9]{1,8}$/i, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function collectHits(text) {
    const hits = [];
    for (const obj of OBJECTS) {
      const patterns = [obj.en, obj.he];
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text))) {
          hits.push({ obj, index: match.index, length: match[0].length, he: pattern === obj.he });
          if (!pattern.global) break;
        }
      }
    }
    const kept = [];
    for (const hit of hits) {
      const covered = hits.some((other) => other !== hit
        && other.length > hit.length
        && hit.index >= other.index
        && hit.index + hit.length <= other.index + other.length);
      if (!covered) kept.push(hit);
    }
    const byId = new Map();
    for (const hit of kept) {
      if (!byId.has(hit.obj.id)) byId.set(hit.obj.id, hit);
    }
    return Array.from(byId.values());
  }

  function sentencesOf(body) {
    const parts = String(body || '').split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : [String(body || '').trim()].filter(Boolean);
  }

  // "the invoices" names more than one file. "slides" is one deck.
  function askedPlural(hit, sentence) {
    if (!hit || hit.he) return false;
    const word = sentence.slice(hit.index, hit.index + hit.length);
    if (/^(?:slides|series)$/i.test(word)) return false;
    return /s$/i.test(word) && !/ss$/i.test(word);
  }

  // Two nouns are one file when the sentence links them ("signed PDF of
  // the contract") or replaces one with the other ("the receipt instead").
  // or / and / both / או / וגם stay two files.
  function narrowHits(sentence, hits) {
    if (hits.length < 2) return hits;
    if (/\b(?:and|or|both|plus)\b|(?:^|\s)או(?:\s|$)|וגם|ואת|גם את/i.test(sentence)) return hits;
    const cue = sentence.search(/\b(?:instead|rather)\b/i);
    const heCue = sentence.lastIndexOf('במקום');
    const idx = cue >= 0 ? cue : heCue;
    if (idx >= 0) {
      const after = hits.filter((h) => h.index >= idx);
      const before = hits.filter((h) => h.index < idx);
      if (after.length === 1) return after;
      if (!after.length && before.length === 1) return before;
    }
    if (/\bof the\b/i.test(sentence) || /של\s+ה/.test(sentence)) {
      const signed = hits.filter((h) => h.obj.id === 'signed-copy');
      if (signed.length === 1) return signed;
    }
    return hits;
  }

  // The latest sentence that actually asks is the file. An earlier noun
  // that is not itself the ask does not make a second candidate.
  function pickAsk(body) {
    const list = sentencesOf(body);
    for (let i = list.length - 1; i >= 0; i--) {
      const sentence = list[i];
      if (!NEED_EN.test(sentence) && !NEED_HE.test(sentence)) continue;
      const hits = narrowHits(sentence, collectHits(sentence));
      if (!hits.length) continue;
      if (hits.length !== 1 || askedPlural(hits[0], sentence)) return { block: true };
      return { hit: hits[0] };
    }
    return null;
  }

  // ignore: not a file ask, leave the other closes alone.
  // block: it is about a file, but not one clear object — no chip.
  // clear: one object, one need.
  function gate(text) {
    const body = fresh(text);
    const hits = collectHits(body);
    if (!hits.length) return { kind: 'ignore' };
    if (NEG_EN.test(body) || NEG_HE.test(body) || HEDGE.test(body) || FYI.test(body)) {
      return { kind: 'block', reason: 'unclear' };
    }
    const picked = pickAsk(body);
    if (!picked) return { kind: 'ignore' };
    if (picked.block) return { kind: 'block', reason: 'unclear' };
    const hit = picked.hit;
    const lang = hit.he ? 'he' : 'en';
    const label = lang === 'he' ? hit.obj.heLabel : hit.obj.enLabel;
    return {
      kind: 'clear',
      ask: {
        id: hit.obj.id,
        creatable: hit.obj.creatable,
        lang,
        label,
        query: lang === 'he' ? hit.obj.heLabel : hit.obj.enLabel,
        synonym: hit.obj.synonym.slice(),
        line: cardLine(lang, label)
      }
    };
  }

  function cardLine(lang, label) {
    if (lang === 'he') return 'לא מצאתי ' + label + ' — טיוטה מתבנית';
    return "Didn't find " + label + " — draft from template";
  }

  function driveQuery(term) {
    const escaped = String(term || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return "trashed = false and (name contains '" + escaped + "' or fullText contains '" + escaped + "')";
  }

  function isTemplateName(name) {
    return TEMPLATE_MARK.test(String(name || ''));
  }

  function fileTooBig(file) {
    return Boolean(file && file.size) && Number(file.size) > MAX_BYTES;
  }

  function skippedKind(mime) {
    return mime === 'application/vnd.google-apps.folder'
      || mime === 'application/vnd.google-apps.shortcut'
      || mime === 'application/vnd.google-apps.form';
  }

  function nameHasSynonym(name, synonym) {
    const n = norm(name);
    return synonym.some((term) => n.includes(norm(term)));
  }

  function distinctiveTokens(text, ask) {
    const tokens = norm(fresh(text)).split(' ').filter(Boolean);
    const synonyms = {};
    (ask.synonym || []).forEach((term) => { synonyms[norm(term)] = 1; });
    const out = [];
    const seen = {};
    for (const token of tokens) {
      if (token.length < 3) continue;
      if (STOP[token] || synonyms[token]) continue;
      if (/^\d+$/.test(token) && token.length < 3) continue;
      if (seen[token]) continue;
      seen[token] = 1;
      out.push(token);
    }
    return out;
  }

  function scoreFile(file, ask, tokens) {
    if (!file || !file.id || skippedKind(file.mimeType) || fileTooBig(file)) return null;
    if (isTemplateName(file.name)) return { file, template: true, score: 0 };
    const named = nameHasSynonym(file.name, ask.synonym || []);
    let score = named ? ATTACH_SCORE : 10;
    if (named) {
      const n = norm(file.name);
      for (const token of tokens) {
        if (n.includes(token)) score += SCORE_GAP;
      }
    }
    return { file, template: false, score, named };
  }

  function knownValue(spec, ctx) {
    ctx = ctx || {};
    if (spec.from === 'sender') return cleanValue(ctx.senderName);
    if (spec.from === 'amount') return cleanValue(ctx.amount);
    if (spec.from === 'when') return cleanValue(ctx.when);
    return '';
  }

  function cleanValue(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text || UNSURE.test(text)) return '';
    return text.slice(0, MAX_VALUE);
  }

  function fieldSpecs(ask) {
    const key = FIELDS[ask.id] && !Array.isArray(FIELDS[ask.id]) ? FIELDS[ask.id] : ask.id;
    return FIELDS[key] || [];
  }

  function buildFields(ask, ctx) {
    const he = ask.lang === 'he';
    return fieldSpecs(ask).map((spec) => ({
      id: spec.id,
      label: he ? spec.he : spec.en,
      value: knownValue(spec, ctx)
    }));
  }

  function missingFields(fields) {
    return (fields || []).filter((field) => !cleanValue(field && field.value));
  }

  // card: 1–4 empty slots, all on the card, no checklist.
  // slots: more than 4 still empty — one named slot at a time.
  // ready: nothing left to ask.
  function present(fields) {
    const miss = missingFields(fields);
    const filled = (fields || []).filter((field) => cleanValue(field && field.value));
    if (miss.length > MAX_CARD_FIELDS) {
      return {
        mode: 'slots',
        slot: { id: miss[0].id, label: miss[0].label },
        turnsLeft: miss.length,
        freePrompt: false,
        filled
      };
    }
    if (miss.length > 0) {
      return { mode: 'card', slots: miss.map((field) => ({ id: field.id, label: field.label })), freePrompt: false, filled };
    }
    return { mode: 'ready', freePrompt: false, filled };
  }

  function rejectAnswer(raw) {
    const text = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!text) return { stay: true };
    if (UNSURE.test(text) || CHAT_ATTEMPT.test(text) || text.length > MAX_VALUE) return { silence: true, create: false };
    return { value: text };
  }

  function withValue(fields, id, value) {
    return (fields || []).map((field) => field.id === id ? { id: field.id, label: field.label, value } : field);
  }

  function fillSlot(fields, id, raw) {
    const verdict = rejectAnswer(raw);
    if (verdict.silence) return verdict;
    if (verdict.stay) return { stay: true, fields, present: present(fields) };
    const next = withValue(fields, id, verdict.value);
    return { fields: next, present: present(next), silence: false, create: false };
  }

  function fillAll(fields, valuesById) {
    valuesById = valuesById || {};
    let next = (fields || []).map((field) => ({ id: field.id, label: field.label, value: field.value || '' }));
    for (const field of next) {
      if (cleanValue(field.value)) continue;
      const verdict = rejectAnswer(valuesById[field.id]);
      if (verdict.silence) return verdict;
      if (verdict.stay) return { stay: true, fields: next, present: present(next) };
      field.value = verdict.value;
    }
    const view = present(next);
    if (view.mode !== 'ready') return { stay: true, fields: next, present: view };
    return { ready: true, fields: next, present: view, silence: false };
  }

  function decline() {
    return { silence: true, create: false };
  }

  function copyTitle(ask, fields) {
    const bits = [ask && ask.label ? ask.label : 'File'];
    for (const field of fields || []) {
      const value = cleanValue(field && field.value);
      if (value) bits.push(value);
    }
    let title = bits.slice(0, 4).join(' — ');
    if (title.length > 80) title = title.slice(0, 79) + '…';
    return title;
  }

  function fileRef(file) {
    return { id: file.id, name: file.name || '', mimeType: file.mimeType || '' };
  }

  function decide(ask, files, ctx, sourceText) {
    if (!ask || !ask.id) return { action: 'silence', reason: 'unclear' };
    const list = Array.isArray(files) ? files : null;
    if (!list) return { action: 'silence', reason: 'search' };
    const tokens = distinctiveTokens(sourceText || '', ask);
    const scored = [];
    const templates = [];
    for (const file of list) {
      const row = scoreFile(file, ask, tokens);
      if (!row) continue;
      if (row.template && nameHasSynonym(file.name, ask.synonym || [])) templates.push(file);
      else if (!row.template) scored.push(row);
    }
    const named = scored.filter((row) => row.named).sort((a, b) => b.score - a.score || String(a.file.name).length - String(b.file.name).length);
    if (named.length === 1 || (named.length > 1 && named[0].score >= named[1].score + SCORE_GAP)) {
      return { action: 'attach', file: fileRef(named[0].file) };
    }
    if (named.length > 1) return { action: 'silence', reason: 'conflict' };
    if (!ask.creatable) return { action: 'silence', reason: 'none' };
    if (templates.length !== 1) return { action: 'silence', reason: 'none' };
    const fields = buildFields(ask, ctx);
    return {
      action: 'create',
      template: fileRef(templates[0]),
      fields,
      present: present(fields),
      line: ask.line,
      freePrompt: false
    };
  }

  // The one file object a sentence names, or null. Used by the loops
  // (core/file-path.js) to tell whether finishing an intention takes a file. Several
  // objects, a plural ("the invoices"), a hedge or a negation all mean null:
  // a loop is only file-backed when it is clear which file.
  function mention(text) {
    const body = fresh(text);
    if (!body.trim()) return null;
    if (NEG_EN.test(body) || NEG_HE.test(body) || HEDGE.test(body) || FYI.test(body)) return null;
    const hits = narrowHits(body, collectHits(body));
    if (hits.length !== 1 || askedPlural(hits[0], body)) return null;
    const hit = hits[0];
    const lang = hit.he ? 'he' : 'en';
    return {
      id: hit.obj.id,
      creatable: hit.obj.creatable,
      lang,
      label: lang === 'he' ? hit.obj.heLabel : hit.obj.enLabel,
      query: lang === 'he' ? hit.obj.heLabel : hit.obj.enLabel,
      synonym: hit.obj.synonym.slice()
    };
  }

  return {
    gate, decide, mention, present, fillSlot, fillAll, decline, driveQuery, copyTitle, cardLine,
    MAX_CARD_FIELDS, ATTACH_SCORE, MAX_BYTES
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowFileAttach };
