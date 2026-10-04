// Resolution paths: finishing an intention that takes MORE THAN ONE step. Portable: no chrome.*, no DOM, no
// network, no model. The caller gathers the evidence (a Drive search, the files in the thread, payments it has
// seen, who issues your receipts) and hands it here as plain data; this file decides the next honest move and
// whether "done" is real. It never sends, issues or generates anything: it names the move, the host performs it
// (a draft, a question) and the loop stays open until the thing itself has been delivered.
//
// The north-star case is "can you send me the receipt?". One macro ("find a file, attach it") fails there in
// three ways that all look like help: it stays silent when no file exists, it attaches the wrong document, or
// it makes a receipt for a payment nobody confirmed. The path instead is:
//
//   1 define    what "done" is, in words: a receipt for THIS amount from THIS person, delivered to them
//   2 find      an artifact that already exists (a file in the thread, one file in Drive) beats making anything
//   3 verify    a receipt attests a payment, so the payment must be confirmed before anything is prepared for one
//   4 prepare / request   a draft with the file; else a draft asking the one who issues it; else a template
//   5 deliver   the person sends it; Glance never does
//   6 confirm   a real attachment named for the thing, in a message the person sent -> closed. Nothing else closes it.
//
// A step is skipped only when it is truly unnecessary (a receipt that already exists needs no payment check: it
// could not have been issued without one). Any path that cannot be walked to the end still returns the right
// next move (a question, a request, a hold) and says WHY the loop is still open.
//
// Hard rules (docs/resolution-paths.md):
//   - a wrong file is worse than none: two candidates, or a file that only the requester sent, is never attached
//   - preparing and requesting never close; only delivery does
//   - no payment confirmation, no receipt: not found, not generated, not asked for
//   - an owner's own "yes, it is paid" counts for asking someone to issue it, never for generating one from a template
//   - nothing here issues a legal document: that needs a billing connector that does not exist yet (FUTURE below)
const FlowResolution = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');

  // What each artifact IS, who can make it, and whether it attests that money moved. Data, not code.
  //   attests:  'payment' = it certifies a payment, so the payment is a precondition of making one
  //   source:   'issuer'  = a billing/accounting system or the person who got paid issues it
  //             'bank'    = only the bank can produce it; the person fetches it
  //             'you'     = the person authors it (an invoice is yours to write)
  const CLASSES = {
    receipt: { attests: 'payment', source: 'issuer', strongTemplate: true },
    'tax-invoice': { attests: null, source: 'issuer', strongTemplate: false },
    invoice: { attests: null, source: 'you', strongTemplate: false },
    transfer: { attests: 'payment', source: 'bank', strongTemplate: false },
    statement: { attests: null, source: 'bank', strongTemplate: false }
  };
  const PAID_BASES_STRONG = ['bank-email', 'loop-paid'];
  const PAYMENT_MAX_AGE_MS = 120 * 24 * 3600 * 1000;
  const TRAIL_MAX = 8;

  const DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayShort(iso) { const d = new Date(String(iso) + 'T12:00:00'); return isNaN(d.getTime()) ? String(iso) : DAYN[d.getDay()] + ', ' + MONN[d.getMonth()] + ' ' + d.getDate(); }
  function isoOf(ms) { const d = new Date(ms); const z = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  const CHASE_AFTER_DAYS = 3;
  const DAY_MS = 24 * 3600 * 1000;
  function handles(objectId) { return Object.prototype.hasOwnProperty.call(CLASSES, objectId); }
  // The artifacts the host surfaces WIRE to this path first: the ones that attest a payment, where one action is most often wrong.
  function owns(objectId) { return handles(objectId) && CLASSES[objectId].attests === 'payment'; }
  function norm(v) { return String(v || '').toLowerCase().replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim(); }
  function he(need) { return Boolean(need && need.lang === 'he'); }
  const sameAmount = (a, b) => Math.abs(a - b) <= Math.max(0.5, a * 0.005);
  const sameCurrency = (a, b) => !a || !b || a === b;
  function amountText(f) { return f && f.amount && (f.amount.raw || (f.amount.value != null ? String(f.amount.value) : null)) || null; }
  function who(facts) { return facts && facts.senderName ? String(facts.senderName).trim().split(/\s+/)[0] : null; }

  // ---- 1. define "done" -------------------------------------------------------------------------------------
  // In words the person can read, and the test delivery has to pass.
  function doneDefinition(need, facts) {
    const label = need.label;
    const amt = amountText(facts);
    const to = who(facts);
    return {
      text: (he(need)
        ? (label + (amt ? ' על ' + amt : '') + (to ? ', נשלחת אל ' + to : ', נשלחת') + ' כקובץ אמיתי')
        : ('A ' + label + (amt ? ' for ' + amt : '') + (to ? ' sent to ' + to : ' sent') + ', as a real attachment')),
      needsFile: true,
      attests: CLASSES[need.object] ? CLASSES[need.object].attests : null
    };
  }

  // ---- 3. is the payment real? ------------------------------------------------------------------------------
  // Evidence the HOST has: payments seen in bank/processor mail (numbers only), loops closed as paid, open loops still
  // waiting for the money, and the person's own answer. Returns { status: 'confirmed'|'unconfirmed'|'contradicted', basis }.
  //   contradicted: a loop still waiting for this person's money, or the person said it is not paid. A receipt for
  //   a payment you are still chasing would be a false document.
  function paymentStatus(input) {
    const i = input || {};
    const facts = i.facts || {};
    const amt = facts.amount && typeof facts.amount.value === 'number' ? facts.amount : null;
    const now = typeof i.now === 'number' ? i.now : Date.now();
    const person = i.person || {};                       // { email, personKey } of the one asking
    const samePerson = (c) => c && ((person.personKey && c.personKey === person.personKey) || (person.email && c.email && String(c.email).toLowerCase() === String(person.email).toLowerCase()));
    const state = i.state || {};
    if (state.notPaidAt) return { status: 'contradicted', basis: 'owner' };
    // 'theirs' payment loops still waiting on the asker's money
    const stillOwed = (i.watches || []).some((w) => w && w.kind === 'payment' && w.direction === 'theirs' && w.status === 'waiting'
      && samePerson(w.counterpart) && (!amt || !w.amount || (sameAmount(amt.value, w.amount.value) && sameCurrency(amt.currency, w.amount.currency))));
    if (stillOwed) return { status: 'contradicted', basis: 'open-loop' };
    // a loop already closed as paid, same person, same amount
    const closedPaid = (i.watches || []).some((w) => w && w.kind === 'payment' && w.status === 'resolved' && w.closedAs === 'paid'
      && samePerson(w.counterpart) && amt && w.amount && sameAmount(amt.value, w.amount.value) && sameCurrency(amt.currency, w.amount.currency));
    if (closedPaid) return { status: 'confirmed', basis: 'loop-paid' };
    // a bank or processor email seen for this amount, recently. The amount must be known to match one.
    const seen = amt && (i.paymentsSeen || []).some((p) => p && typeof p.value === 'number' && now - (p.at || 0) <= PAYMENT_MAX_AGE_MS
      && sameAmount(amt.value, p.value) && sameCurrency(amt.currency, p.currency) && p.trusted !== false);
    // The same amount is still being chased from SOMEONE ELSE: the bank email may be theirs, so it proves nothing for this person.
    const rival = seen && (i.watches || []).some((w) => w && w.kind === 'payment' && w.direction === 'theirs' && w.status === 'waiting' && !samePerson(w.counterpart)
      && w.amount && sameAmount(amt.value, w.amount.value) && sameCurrency(amt.currency, w.amount.currency));
    if (seen && rival) return { status: 'unconfirmed', basis: null, ambiguous: true };
    if (seen) return { status: 'confirmed', basis: 'bank-email' };
    if (state.assertedPaidAt) return { status: 'confirmed', basis: 'owner' };
    return { status: 'unconfirmed', basis: null };
  }

  // ---- 2. an artifact that already exists --------------------------------------------------------------------
  // threadFiles: [{ filename, by: 'me'|'requester'|'other' }] or null when the page cannot list them.
  // driveFiles: the Drive search result, or null when it could not run. A file the requester themselves sent is never a
  // candidate: it is their document, not the one they asked for.
  // Amounts a file NAME states: only a number with a currency mark or a thousands separator counts. A bare run of digits is
  // a receipt or invoice number ("Receipt-7731"), never an amount.
  const NAME_AMOUNT = /(?:[₪$€£]\s?(\d[\d,]*(?:\.\d+)?))|(\d{1,3}(?:,\d{3})+(?:\.\d+)?)|(?:(\d[\d,]*(?:\.\d+)?)\s?(?:₪|\$|€|£|ILS|NIS|USD|EUR|ש"ח|שח))/g;
  function nameAmounts(name) {
    const out = [];
    const t = String(name || '');
    let m;
    NAME_AMOUNT.lastIndex = 0;
    while ((m = NAME_AMOUNT.exec(t))) { const v = parseFloat(String(m[1] || m[2] || m[3]).replace(/,/g, '')); if (v > 0) out.push(v); }
    return out;
  }
  // A file named for ANOTHER amount than the one asked about is a different receipt. No amount in the name, or none asked: no opinion.
  function nameContradictsAmount(name, facts) {
    const want = facts && facts.amount && typeof facts.amount.value === 'number' ? facts.amount.value : null;
    const has = nameAmounts(name);
    return want !== null && has.length > 0 && !has.some((v) => sameAmount(want, v));
  }
  function nameFits(name, synonym) { const n = norm(name); return (synonym || []).some((t) => n.includes(norm(t))); }
  function findExisting(need, evidence, facts, sourceText) {
    const e = evidence || {};
    const threadHits = (Array.isArray(e.threadFiles) ? e.threadFiles : []).filter((f) => f && f.filename && f.by !== 'requester' && nameFits(f.filename, need.synonym) && !nameContradictsAmount(f.filename, facts));
    const driveFiles = Array.isArray(e.driveFiles) ? e.driveFiles.filter((f) => !(f && f.name && nameContradictsAmount(f.name, facts))) : e.driveFiles;
    let drive = null;
    let driveConflict = false;
    let template = null;
    if (attach && Array.isArray(driveFiles)) {
      const ask = { id: need.object, creatable: false, lang: need.lang, label: need.label, query: need.label, synonym: need.synonym || [], line: attach.cardLine(need.lang, need.label) };
      const ctx = { senderName: facts && facts.senderName, amount: amountText(facts), when: facts && facts.when };
      const d = attach.decide(ask, driveFiles, ctx, sourceText || '');
      if (d && d.action === 'attach' && d.file) drive = { source: 'drive', id: d.file.id, name: d.file.name, mimeType: d.file.mimeType };
      if (d && d.action === 'silence' && d.reason === 'conflict') driveConflict = true;
      const tplAsk = Object.assign({}, ask, { creatable: true });
      const t = attach.decide(tplAsk, driveFiles, ctx, sourceText || '');
      if (t && t.action === 'create') template = t;
    }
    const uniqThread = [];
    threadHits.forEach((f) => { if (!uniqThread.some((u) => norm(u.filename) === norm(f.filename))) uniqThread.push(f); });
    const cands = [];
    uniqThread.forEach((f) => cands.push({ source: 'thread', name: f.filename, meta: f }));
    // the same file in both places is one candidate (the Drive copy can be attached without reading bytes)
    if (drive && !cands.some((c) => norm(c.name) === norm(drive.name))) cands.push(drive);
    else if (drive) { const at = cands.findIndex((c) => norm(c.name) === norm(drive.name)); cands[at] = drive; }
    if (driveConflict || cands.length > 1) return { kind: 'conflict', count: Math.max(cands.length, 2), template };
    if (cands.length === 1) return { kind: 'one', file: cands[0], template };
    return { kind: 'none', template, searched: Array.isArray(driveFiles), threadKnown: Array.isArray(e.threadFiles) };
  }

  // ---- the plan ----------------------------------------------------------------------------------------------
  function line(need, en, hb) { return he(need) ? hb : en; }

  // input: { need, facts, evidence:{threadFiles,driveFiles}, payment:{status,basis}, issuer:{email,name}|null, state, sourceText }
  // returns { stage, move, done:false, line, why, ... } — `done` is never true here: only judgeDelivery says done.
  function plan(input) {
    const i = input || {};
    const need = i.need;
    const cls = need && CLASSES[need.object];
    if (!cls) return { stage: 'define', move: 'none', done: false, line: '', why: 'not-a-resolution-class' };
    const facts = i.facts || {};
    const state = i.state || {};
    const payment = i.payment || { status: 'unconfirmed', basis: null };
    const amt = amountText(facts);
    const label = need.label;
    const to = who(facts);
    const base = { done: false, doneWhen: doneDefinition(need, facts).text };
    // Someone who already said they cannot issue it is not asked again.
    const issuer = i.issuer && state.issuerDeclinedEmail && String(i.issuer.email || '').toLowerCase() === state.issuerDeclinedEmail ? null : i.issuer;

    // 2. find
    const found = findExisting(need, i.evidence, facts, i.sourceText);
    if (found.kind === 'conflict') {
      return Object.assign({}, base, { stage: 'find', move: 'choose-file', why: 'several-fit',
        line: line(need, 'More than one ' + label + ' fits. I will not pick one for you.', 'יותר מ' + (need.label) + ' אחד מתאים. לא אבחר בשבילך.'),
        actions: ['prepare-plain-reply'] });
    }
    if (found.kind === 'one') {
      return Object.assign({}, base, { stage: 'prepare', move: 'prepare-reply-with-file', file: found.file, why: 'found-existing', skipped: ['verify'],
        line: line(need, 'Found ' + found.file.name + '. Draft ready to review; it is not sent.', 'נמצא ' + found.file.name + '. טיוטה מוכנה לבדיקה; לא נשלחה.'),
        actions: ['prepare-reply-with-file'] });
    }

    // From here nothing exists yet.
    // 'you'/'bank'-sourced artifacts that do not attest a payment have their own simpler end of the path.
    if (cls.source === 'bank') {
      // The bank is the only issuer. A payment precondition still holds for a proof of transfer.
      if (cls.attests === 'payment' && payment.status === 'contradicted') return waitPayment(base, need, amt, to);
      return Object.assign({}, base, { stage: 'request', move: 'fetch-from-source', why: 'only-the-bank-issues-it',
        line: line(need, 'No ' + label + ' on hand. Only your bank produces it: download it, send it, and I will close this when you do.',
          'אין ' + label + ' זמין. רק הבנק מפיק אותו: הורידו, שלחו, ואסגור כשתשלחו.'), actions: ['hold'] });
    }

    // 3. verify (an attesting artifact needs a real payment before anything is prepared for it)
    if (cls.attests === 'payment') {
      if (payment.status === 'contradicted') return waitPayment(base, need, amt, to);
      if (payment.status === 'unconfirmed') {
        return Object.assign({}, base, { stage: 'verify', move: 'verify-payment', why: 'payment-unverified', blockedBy: 'payment',
          line: line(need, 'I cannot find a payment' + (amt ? ' of ' + amt : '') + (to ? ' from ' + to : '') + '. Was it paid?',
            'לא מצאתי תשלום' + (amt ? ' על ' + amt : '') + (to ? ' מ' + to : '') + '. האם שולם?'),
          actions: ['mark-paid', 'not-paid'] });
      }
    }

    // 4. prepare / request. The issuer is asked before anything is generated.
    if (state.requestedAt) {
      const who = state.requestedTo || 'the issuer';
      const now = typeof i.now === 'number' ? i.now : null;
      const lastTouch = Math.max(state.chasedAt || 0, state.issuerReplyAt || 0, state.requestedAt || 0);
      // A reminder is due when the day they promised has passed with no file, or (no promise) after a few quiet days. Never without a clock.
      const promiseLapsed = now !== null && state.issuerPromisedIso && isoOf(now) > state.issuerPromisedIso && (state.chasedAt || 0) < new Date(state.issuerPromisedIso + 'T00:00:00').getTime();
      const quietDays = now !== null ? Math.floor((now - lastTouch) / DAY_MS) : 0;
      if (promiseLapsed) {
        return Object.assign({}, base, { stage: 'request', move: 'chase-issuer', why: 'promise-lapsed', issuer: issuer || { email: state.requestedToEmail, name: state.requestedTo }, requestedTo: who,
          line: line(need, who + ' promised ' + dayShort(state.issuerPromisedIso) + ' and no file has come. Remind them? A draft, not sent.', who + ' הבטיח/ה ' + dayShort(state.issuerPromisedIso) + ' ועדיין אין קובץ. להזכיר? טיוטה, לא נשלחת.'),
          actions: ['chase-issuer'] });
      }
      if (!state.issuerPromisedIso && now !== null && quietDays >= CHASE_AFTER_DAYS) {
        return Object.assign({}, base, { stage: 'request', move: 'chase-issuer', why: 'no-answer', issuer: issuer || { email: state.requestedToEmail, name: state.requestedTo }, requestedTo: who, quietDays,
          line: line(need, 'Asked ' + who + ' ' + quietDays + ' days ago and no file has come. Remind them? A draft, not sent.', 'ביקשתי מ' + who + ' לפני ' + quietDays + ' ימים ועדיין אין קובץ. להזכיר? טיוטה, לא נשלחת.'),
          actions: ['chase-issuer'] });
      }
      return Object.assign({}, base, { stage: 'request', move: 'await-issuer', why: 'requested', requestedTo: state.requestedTo || null,
        line: state.issuerPromisedIso
          ? line(need, who + ' said they will send it by ' + dayShort(state.issuerPromisedIso) + '. I will look again then.', who + ' אמר/ה שישלח/תשלח עד ' + dayShort(state.issuerPromisedIso) + '.')
          : line(need, 'Asked ' + who + ' for the ' + label + '. Waiting for the file; I will look again when you open this.', 'ביקשתי מ' + who + ' את ' + label + '. ממתין לקובץ.'),
        actions: ['hold'] });
    }
    if (state.ownerIssuing) {
      return Object.assign({}, base, { stage: 'deliver', move: 'await-owner-issue', why: 'owner-issues',
        line: line(need, 'Waiting for you to issue the ' + label + '. I will close this when you send it with the file.',
          'ממתין שתפיקו את ' + label + '. אסגור כשתשלחו אותו עם הקובץ.'), actions: ['hold'] });
    }
    if (cls.source === 'issuer' && issuer && issuer.email) {
      return Object.assign({}, base, { stage: 'request', move: 'request-issuer', why: 'ask-the-issuer', issuer, basis: payment.basis,
        line: line(need, 'No ' + label + ' yet. Ask ' + (issuer.name || issuer.email) + ' to issue it? A draft, not sent.',
          'עדיין אין ' + label + '. לבקש מ' + (issuer.name || issuer.email) + ' להפיק? טיוטה, לא נשלחת.'),
        actions: ['request-issuer'] });
    }
    // an existing template, and a payment confirmed by something other than the person's say-so
    // The host must say it can open the create card (i.canCreate); a surface that cannot never gets this move.
    if (i.canCreate && found.template && (cls.attests !== 'payment' || PAID_BASES_STRONG.indexOf(payment.basis) >= 0)) {
      return Object.assign({}, base, { stage: 'prepare', move: 'create-from-template', template: found.template, why: 'template', basis: payment.basis,
        line: found.template.line, actions: ['create-from-template'] });
    }
    if (cls.source === 'you') {
      // An invoice is the person's to write; with no template there is nothing to prepare but a reply asking nothing of anyone.
      return Object.assign({}, base, { stage: 'deliver', move: 'await-owner-issue', why: 'no-template',
        line: line(need, 'No ' + label + ' and no template to start from. Write it, send it, and I will close this when it goes out with the file.',
          'אין ' + label + ' ואין תבנית. כתבו, שלחו, ואסגור כשיישלח עם הקובץ.'), actions: ['hold'] });
    }
    // FUTURE: a billing connector (invoicing system API) would issue the receipt here. It does not exist, so:
    return Object.assign({}, base, { stage: 'request', move: 'name-issuer', why: 'no-issuer-known', basis: payment.basis,
      line: state.issuerDeclinedEmail
        ? line(need, (state.issuerDeclinedName || 'They') + ' said they cannot issue the ' + label + '. Who else issues your receipts?', (state.issuerDeclinedName || 'הם') + ' אמרו שאי אפשר להפיק. מי עוד מפיק לכם קבלות?')
        : line(need, 'Payment is confirmed, but no ' + label + ' exists and I cannot issue one. Who issues your receipts?',
          'התשלום אושר, אבל אין ' + label + ' ואני לא יכול להפיק. מי מפיק לכם קבלות?'),
      actions: ['set-issuer', 'issue-myself'], future: 'billing-connector' });
  }

  function waitPayment(base, need, amt, to) {
    return Object.assign({}, base, { stage: 'verify', move: 'wait-payment', why: 'payment-not-confirmed', blockedBy: 'payment',
      line: line(need, 'The payment' + (amt ? ' of ' + amt : '') + (to ? ' from ' + to : '') + ' is not confirmed, so no ' + need.label + ' yet. I will keep this open.',
        'התשלום' + (amt ? ' על ' + amt : '') + (to ? ' מ' + to : '') + ' לא אושר, אז עדיין אין ' + need.label + '. אשאיר פתוח.'),
      actions: ['mark-paid'] });
  }

  // ---- state transitions (pure: return the next resolution state) ------------------------------------------
  function trail(state, stage, now, note) {
    const t = (state.trail || []).concat([{ stage, at: now, note: note || null }]);
    return t.slice(-TRAIL_MAX);
  }
  function open(need, facts, now) {
    const t = typeof now === 'number' ? now : Date.now();
    const d = doneDefinition(need, facts);
    return { v: 1, object: need.object, label: need.label, lang: need.lang || 'en', done: d.text, attests: d.attests, stage: 'define', openedAt: t, trail: [{ stage: 'define', at: t, note: null }] };
  }
  function advance(state, stage, now, patch, note) {
    const s = Object.assign({}, state || {}, patch || {});
    const t = typeof now === 'number' ? now : Date.now();
    s.stage = stage;
    s.trail = trail(state || {}, stage, t, note);
    return s;
  }
  const markPaid = (state, now) => advance(state, 'verify', now, { assertedPaidAt: typeof now === 'number' ? now : Date.now(), notPaidAt: null }, 'owner-said-paid');
  const markNotPaid = (state, now) => advance(state, 'verify', now, { notPaidAt: typeof now === 'number' ? now : Date.now(), assertedPaidAt: null }, 'owner-said-not-paid');
  const recordRequest = (state, now, to, toEmail) => advance(state, 'request', now, { requestedAt: typeof now === 'number' ? now : Date.now(), requestedTo: to ? String(to).slice(0, 120) : null, requestedToEmail: toEmail ? String(toEmail).trim().toLowerCase().slice(0, 200) : null }, 'asked-issuer');
  const recordChase = (state, now) => advance(state, 'request', now, { chasedAt: typeof now === 'number' ? now : Date.now() }, 'chased-issuer');
  const recordOwnerIssuing = (state, now) => advance(state, 'deliver', now, { ownerIssuing: true }, 'owner-issues');
  const recordPrepared = (state, now, fileName) => advance(state, 'prepare', now, { preparedAt: typeof now === 'number' ? now : Date.now(), preparedFile: fileName ? String(fileName).slice(0, 120) : null }, 'prepared');

  // What a delegate says when it is NOT their job or not possible for them. Narrow on purpose (the general reply reader holds the
  // general refusals): the verb must be the issuing itself, and any condition ("until", "unless", "if", "once", "after") means it is
  // a delay, not a no. A promise in the same message always wins.
  const ISSUER_NO_EN = /\b(?:we|i)\s+(?:do ?n[o']t|don['’]t|do not|can['’]?t|cannot|are not able to|aren['’]t able to|am not able to|won['’]t|will not)\s+(?:issue|provide|produce|generate|create|handle|do)\b|\bnot something (?:we|i) (?:do|issue|provide|handle)\b|\b(?:that|this|it)(?:['’]s| is) not (?:our|my) (?:job|area|department|responsibility)\b|\bwe(?:['’]re| are) not the (?:ones|right (?:people|place))\b/i;
  const ISSUER_NO_HE = /(?:לא|אין לנו אפשרות|אין לי אפשרות)\s+(?:מנפיקים|מנפיק|מפיקים|מפיק|להנפיק|להפיק)|לא (?:בתחום|באחריות) שלנו/;
  const CONDITION = /\b(?:until|unless|if|once|after|before|when)\b|(?:עד ש|אלא אם|אחרי ש|ברגע ש|כש)/i;
  function issuerSaysNo(text) {
    const parts = String(text || '').split(/(?<=[.!?])\s+|\n+/);
    return parts.some((p) => (ISSUER_NO_EN.test(p) || ISSUER_NO_HE.test(p)) && !CONDITION.test(p));
  }

  // ---- reading the issuer's answer ---------------------------------------------------------------------------
  // `reply` is what core/follow-up.js's classifyReply made of the issuer's message (asked as a request to issue a file). A person
  // answering is not an attachment: they may promise a day, say no, ask you something, or say "done" with nothing attached. Each moves
  // the path differently, and none of them closes it. Returns { kind, state, line }; kind 'file' means a real file came (matchIssuerReply's job).
  function readIssuerAnswer(state, reply, now, text) {
    const s = state || {};
    const t = typeof now === 'number' ? now : Date.now();
    const who = s.requestedTo || 'They';
    const none = { kind: 'none', state: s, line: null };
    if (!reply || !s.requestedAt) return none;
    if (reply.outcome === 'closed' && reply.delivered === 'file') return { kind: 'file', state: s, line: null };
    if (reply.outcome === 'declined' || (reply.outcome !== 'promised' && issuerSaysNo(text))) {
      const next = advance(s, 'request', t, { issuerDeclinedEmail: s.requestedToEmail || null, issuerDeclinedName: s.requestedTo || null, requestedAt: null, requestedTo: null, requestedToEmail: null, issuerPromisedIso: null, issuerReplyAt: null, chasedAt: null }, 'issuer-declined');
      return { kind: 'declined', state: next, line: who + ' said they cannot issue the ' + (s.label || 'receipt') + '. Who else issues your receipts?' };
    }
    if (reply.outcome === 'promised') {
      const next = advance(s, 'request', t, { issuerPromisedIso: reply.promisedIso || null, issuerReplyAt: t }, 'issuer-promised');
      return { kind: 'promised', state: next, line: reply.promisedIso ? who + ' said they will send it by ' + dayShort(reply.promisedIso) + '.' : who + ' said they will send it.' };
    }
    if (reply.outcome === 'yours') {
      const next = advance(s, 'request', t, { issuerAskedAt: t, issuerReplyAt: t }, 'issuer-asked');
      return { kind: 'asked', state: next, line: who + ' asked you something about the ' + (s.label || 'receipt') + '. Open their reply to answer.' };
    }
    if (reply.outcome === 'closed' || reply.claimedOnly) {
      const next = advance(s, 'request', t, { issuerReplyAt: t }, 'issuer-no-file');
      return { kind: 'no-file', state: next, line: who + ' replied, but no file came with it. I kept this open.' };
    }
    return none;
  }

  // ---- 6. is it really done? -------------------------------------------------------------------------------
  // The person's OWN message in the thread. sent: { text, attachments: [{filename}] | null }. Returns { close, reason, ... }.
  // The only way a resolution closes. A claim ("attached", "here is your receipt") with no attachment never does; a file
  // that is not named for the thing closes only when it is the single attachment and the message itself names the thing.
  function judgeDelivery(state, sent) {
    const s = state || {};
    const known = sent && Array.isArray(sent.attachments);
    const text = String((sent && sent.text) || '');
    const names = known ? sent.attachments.map((a) => String((a && a.filename) || '')).filter(Boolean) : [];
    const synonym = attach && s.object ? (attach.mention(s.label || s.object) || {}).synonym || [] : [];
    const syn = synonym.length ? synonym : [s.label || s.object || ''];
    const claims = /\b(?:attached|attaching|enclosed|find attached|here(?:'s| is))\b|(?:מצורף|מצורפת|צירפתי|הנה)/i.test(text);
    if (!known) return { close: false, reason: 'cannot-see-attachments', ask: true };
    if (!names.length) return { close: false, reason: claims ? 'claimed-not-attached' : 'no-file' };
    if (names.some((n) => nameFits(n, syn))) return { close: true, reason: 'delivered', files: names };
    const named = attach && attach.mention(text);
    if (names.length === 1 && named && named.id === s.object) return { close: true, reason: 'delivered', files: names, byText: true };
    return { close: false, reason: 'file-not-named-for-it', ask: true, files: names };
  }

  // The patch that closes the loop. Only ever applied after judgeDelivery said close.
  function closePatch(state, now, verdict) {
    const t = typeof now === 'number' ? now : Date.now();
    return {
      status: 'resolved', resolvedAt: t, resolvedBy: verdict && verdict.manual ? 'manual' : 'delivered', closedAs: 'kept',
      resolution: advance(state, 'close', t, { deliveredAt: t, deliveredFiles: (verdict && verdict.files || []).slice(0, 3) }, verdict && verdict.manual ? 'owner-marked-done' : 'delivered')
    };
  }

  // ---- the answer comes from somewhere else ------------------------------------------------------------------
  // A message from someone Glance asked to issue a receipt, carrying one file named for it. Matches ONE waiting loop that asked
  // that address, or none: two loops on one issuer need the message to name an amount to be told apart. Returns { watch, file } or null.
  // It only proposes the next move (a reply to the original requester with this file); nothing is attached or sent here.
  function matchIssuerReply(watches, msg) {
    const m = msg || {};
    const from = String(m.senderEmail || '').trim().toLowerCase();
    if (!from || !Array.isArray(m.attachments) || !attach) return null;
    const cands = (watches || []).filter((w) => w && w.status === 'waiting' && w.resolution && w.resolution.requestedAt && w.resolution.requestedToEmail === from);
    if (!cands.length) return null;
    const fitFor = (w) => {
      const mention = attach.mention(w.resolution.label || w.resolution.object);
      const syn = mention && mention.synonym && mention.synonym.length ? mention.synonym : [w.resolution.label || w.resolution.object];
      const fits = m.attachments.filter((a) => a && a.filename && nameFits(a.filename, syn) && !nameContradictsAmount(a.filename, { amount: w.amount }));
      return fits.length === 1 ? fits[0] : null;
    };
    let pool = cands;
    if (pool.length > 1) {
      const asked = [];
      const t = String(m.text || '');
      if (extract && extract.parseMoney) { const mo = extract.parseMoney(t); if (mo && mo.value > 0) asked.push(mo.value); }
      pool = cands.filter((w) => w.amount && typeof w.amount.value === 'number' && asked.some((v) => sameAmount(v, w.amount.value)));
      if (pool.length !== 1) return null;
    }
    const file = fitFor(pool[0]);
    return file ? { watch: pool[0], file } : null;
  }

  // A message from someone Glance asked, with or without a file: the one loop that asked that address (amounts break a tie), or null.
  function matchIssuerMessage(watches, msg) {
    const m = msg || {};
    const from = String(m.senderEmail || '').trim().toLowerCase();
    if (!from) return null;
    const cands = (watches || []).filter((w) => w && w.status === 'waiting' && w.resolution && w.resolution.requestedAt && w.resolution.requestedToEmail === from);
    if (cands.length <= 1) return cands[0] ? { watch: cands[0] } : null;
    const mo = extract && extract.parseMoney ? extract.parseMoney(String(m.text || '')) : null;
    const pool = mo && mo.value > 0 ? cands.filter((w) => w.amount && typeof w.amount.value === 'number' && sameAmount(mo.value, w.amount.value)) : [];
    return pool.length === 1 ? { watch: pool[0] } : null;
  }

  // ---- drafts (never sent) ----------------------------------------------------------------------------------
  // The reply to the person who asked. It says a file is attached only when one is: with none, it leaves a visible placeholder.
  function replyDraft(need, facts, opts) {
    const fileName = opts && opts.fileName ? String(opts.fileName).replace(/[\r\n"]+/g, ' ').slice(0, 100) : null;
    const amt = amountText(facts);
    const name = who(facts);
    if (he(need)) {
      return (name ? 'היי ' + name + ',' : 'שלום,') + '\n\n' + (fileName ? 'מצורפת ' + need.label + (amt ? ' על ' + amt : '') + ': ' + fileName + '.' : '[צרפו את ' + need.label + ' כאן ושלחו]') + '\n\nתודה,';
    }
    return (name ? 'Hi ' + name + ',' : 'Hi,') + '\n\n' + (fileName ? 'Attached is the ' + need.label + (amt ? ' for ' + amt : '') + ': ' + fileName + '.' : '[Attach the ' + need.label + ' here, then send]') + '\n\nThanks,';
  }

  // One reminder to the issuer. Same facts as the request; asks for the file; claims nothing.
  function issuerChaseDraft(need, facts, issuer, opts) {
    const o = opts || {};
    const amt = amountText(facts);
    const payer = facts && facts.senderName ? facts.senderName : null;
    const name = issuer && issuer.name ? String(issuer.name).split(/\s+/)[0] : null;
    if (he(need)) return (name ? 'היי ' + name + ',' : 'שלום,') + '\n\nתזכורת קטנה: ' + need.label + (payer ? ' עבור ' + payer : '') + (amt ? ' על סך ' + amt : '') + (o.days ? ' (ביקשתי לפני ' + o.days + ' ימים)' : '') + '. אפשר לשלוח לי אותה כקובץ?\n\nתודה,';
    return (name ? 'Hi ' + name + ',' : 'Hi,') + '\n\nA quick reminder about the ' + need.label + (payer ? ' for ' + payer : '') + (amt ? ' for ' + amt : '') + (o.days ? ' (I asked ' + o.days + ' days ago)' : '') + '. Could you send it to me as a file?\n\nThanks,';
  }

  // Asking the one who issues it. Names the amount, the payer and the date when known; asks for the file, nothing else.
  function issuerRequestDraft(need, facts, issuer, opts) {
    const o = opts || {};
    const amt = amountText(facts);
    const payer = facts && facts.senderName ? facts.senderName : null;
    const name = issuer && issuer.name ? String(issuer.name).split(/\s+/)[0] : null;
    if (he(need)) {
      return (name ? 'היי ' + name + ',' : 'שלום,') + '\n\nאפשר להפיק ' + need.label + (payer ? ' עבור ' + payer : '') + (amt ? ' על סך ' + amt : '') + (o.dateText ? ' (התשלום מ-' + o.dateText + ')' : '') + ' ולשלוח לי כקובץ?\n\nתודה,';
    }
    return (name ? 'Hi ' + name + ',' : 'Hi,') + '\n\nCould you issue a ' + need.label + (payer ? ' for ' + payer : '') + (amt ? ' for ' + amt : '') + (o.dateText ? ' (payment received ' + o.dateText + ')' : '') + ' and send it to me as a file?\n\nThanks,';
  }

  return { CLASSES, handles, owns, doneDefinition, paymentStatus, findExisting, matchIssuerReply, nameAmounts, plan, open, markPaid, markNotPaid, recordRequest, recordOwnerIssuing, recordPrepared, recordChase, readIssuerAnswer, matchIssuerMessage, judgeDelivery, closePatch, replyDraft, issuerRequestDraft, issuerChaseDraft };
})();

if (typeof module !== 'undefined') module.exports = { FlowResolution };
