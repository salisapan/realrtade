// One close-chain resolver for every kind of requirement. Portable: no chrome.*, no DOM, no network.
//
// An invoice is not a special case. The ask names a requirement — a file, a fact, a date, an approval,
// or an answer — and this file does the same five steps for all of them:
//   (a) derive the requirement
//   (b) search the connected sources the host already fetched (it does not fetch)
//   (c) one honest find → prepare a draft (Do It). Nothing is sent.
//   (d) nothing found, and every connected source was actually checked → a needs-you card that says
//       what is missing, where it looked, and why. One optional holding reply opens a promise loop.
//   (e) while that promise is open, the same function looks again. A later find resumes at (c).
// A loop closes only when completion evidence is real: a sent message that carries the file, a sent
// answer that carries the fact, an approval that was actually sent, or a calendar event the other
// person accepted. A draft, a holding reply, an event this product only prepared, and a missing
// search are not closes. An invoicing system is not a source and not a writer: issuing an invoice
// is a separate decision and is not implemented here.
const FlowCloseChains = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const factReply = sibling(typeof FlowFactReply !== 'undefined' ? FlowFactReply : null, './fact-reply.js', 'FlowFactReply');
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const sourceText = sibling(typeof FlowSourceText !== 'undefined' ? FlowSourceText : null, './source-text.js', 'FlowSourceText');

  const KINDS = ['file', 'fact', 'date', 'approval', 'answer'];

  const APPROVAL_EN = /\b(?:approve|approval|sign[\s-]?off|green[\s-]?light)\b/i;
  const APPROVAL_HE = /(?:נא\s+לאשר|תאשר(?:י|ו)?|לאשר את|אישורך|אישורכם)/;
  const APPROVAL_DONE = /\b(?:approved|i approve|yes,\s*approved|signed off)\b|(?:^|\s)(?:מאושר|אושר|אישרתי|מאשר)(?=$|[\s,.!?])/i;
  const DATE_EN = /\b(?:meet|meeting|schedule|calendar|hop on|jump on a call|get together)\b/i;
  const DATE_HE = /(?:ניפגש|לקבוע פגישה|נקבע פגישה|פגישה|ביומן|בלוח שנה)/;
  const ANSWER_EN = /\b(?:confirm|let me know|get back to me|reply with|your answer|who will|what is the name)\b/i;
  const ANSWER_HE = /(?:תעדכן|תודיע|תגיב|מי\s+(?:יהיה|יגיע|מטפל))/;
  const CLOCK_EN = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
  const CLOCK_HE = /(?:בשעה|ב-)\s*(\d{1,2})(?::(\d{2}))?/;
  const HOLDING_EN = /\b(?:i(?:'| wi)ll|i will|we(?:'| wi)ll|we will)\s+(?:send|reply|get back|confirm)\b/i;
  const HOLDING_HE = /(?:אשלח|נשלח|אחזור|אעדכן|אשיב)/;
  const TEMPLATE = /template|תבנית/i;

  const PLACES = {
    file: [
      { id: 'drive', label: 'Google Drive', needs: 'drive', key: 'driveFiles' },
      { id: 'drive-other', label: 'other Drive folders', needs: 'drive', key: 'driveOtherFiles' },
      { id: 'thread', label: 'this thread', needs: 'thread', key: 'threadFiles' },
      { id: 'gmail-mail', label: 'Gmail attachments', needs: 'gmail', key: 'gmailFiles' },
      { id: 'outlook-mail', label: 'Outlook attachments', needs: 'outlook', key: 'outlookFiles' },
      { id: 'docs', label: 'Google Docs', needs: 'docs', key: 'docs' }
    ],
    fact: [
      { id: 'sheets', label: 'Google Sheets', needs: 'sheets', key: 'facts' },
      { id: 'docs', label: 'Google Docs', needs: 'docs', key: 'facts' }
    ],
    date: [
      { id: 'calendar', label: 'Google Calendar', needs: 'calendar', key: 'events' }
    ],
    approval: [
      { id: 'gmail-mail', label: 'Gmail', needs: 'gmail', key: 'replies' },
      { id: 'outlook-mail', label: 'Outlook', needs: 'outlook', key: 'replies' }
    ],
    answer: [
      { id: 'gmail-mail', label: 'Gmail', needs: 'gmail', key: 'replies' },
      { id: 'outlook-mail', label: 'Outlook', needs: 'outlook', key: 'replies' }
    ]
  };

  function hebrew(text) { return /[\u0590-\u05FF]/.test(String(text || '')); }
  function fresh(text) {
    const raw = String(text || '');
    return sourceText && sourceText.ownText ? sourceText.ownText(raw) : raw.trim();
  }
  function normName(v) {
    return String(v || '').toLowerCase().replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  function blank(req) {
    return {
      show: false, type: req ? req.kind : null, close: false, sends: false, creates: false,
      requirement: req || null, move: 'silence', reason: null, searched: [], hit: null,
      holding: null, promise: null, card: null, undo: null, origin: null
    };
  }

  // (a) What has to be true before this loop can close. One kind. Unclear file asks stay silent.
  function derive(text, now) {
    const body = fresh(text);
    if (!body) return null;
    const lang = hebrew(body) ? 'he' : 'en';
    if (attach && typeof attach.gate === 'function') {
      const gate = attach.gate(body);
      if (gate && gate.kind === 'block') return { blocked: true, kind: null, lang, label: null };
      if (gate && gate.kind === 'clear' && gate.ask) {
        return { kind: 'file', lang, label: gate.ask.label, object: gate.ask.id, ask: gate.ask, synonym: gate.ask.synonym || [] };
      }
    }
    if (factReply && typeof factReply.detect === 'function') {
      const fact = factReply.detect(body);
      if (fact) return { kind: 'fact', lang, label: fact.factLabel || (lang === 'he' ? 'עובדה' : 'a fact'), fact };
    }
    if (APPROVAL_EN.test(body) || APPROVAL_HE.test(body)) return { kind: 'approval', lang, label: lang === 'he' ? 'אישור' : 'an approval' };
    if (DATE_EN.test(body) || DATE_HE.test(body)) {
      const when = whenOf(body, now);
      return { kind: 'date', lang, label: when.label || (lang === 'he' ? 'מועד' : 'a time'), iso: when.iso, clock: when.clock };
    }
    if (ANSWER_EN.test(body) || ANSWER_HE.test(body)) return { kind: 'answer', lang, label: lang === 'he' ? 'תשובה' : 'an answer' };
    return null;
  }

  function whenOf(body, now) {
    let iso = null;
    let label = null;
    const clockDate = typeof now === 'number' ? new Date(now) : (now instanceof Date ? now : new Date());
    if (extract && typeof extract.parseDate === 'function') {
      try {
        const d = extract.parseDate(body, clockDate);
        if (d && d.iso) { iso = d.iso; label = d.raw || d.iso; }
      } catch (e) { /* no date */ }
    }
    const clock = CLOCK_EN.test(body) || CLOCK_HE.test(body);
    if (!label && clock) label = (body.match(CLOCK_EN) || body.match(CLOCK_HE) || [])[0] || null;
    return { iso, label, clock: Boolean(clock) };
  }

  function byLabel(text, now) {
    const w = whenOf(fresh(text), now);
    if (!w.label) return null;
    return String(w.label).replace(/^(?:by|on|before|due|until|no later than)\s+(?:on\s+)?/i, '').replace(/^עד\s+/, '') || null;
  }

  function holdingText(req, by) {
    const he = req && req.lang === 'he';
    const day = by ? String(by).replace(/^(?:by|on|before|due|until|no later than)\s+(?:on\s+)?/i, '').replace(/^עד\s+/, '') : '';
    if (he) return day ? ('אשלח את זה עד ' + day + '.') : 'אשלח את זה.';
    return day ? ("I'll send it by " + day + '.') : "I'll send it.";
  }

  function holdingFor(req, text, now) {
    const by = byLabel(text, now);
    const textBody = holdingText(req, by);
    return {
      text: textBody,
      by: by,
      claimsFile: false
    };
  }

  function promiseFor(req, holding) {
    return {
      ask: {
        kind: 'reply',
        what: holding.text,
        deadlineIso: null,
        chaseIso: null,
        lang: req.lang || 'en',
        direction: 'mine',
        subtype: req.kind,
        file: req.kind === 'file' ? { object: req.object, label: req.label, synonym: req.synonym || [] } : null
      }
    };
  }

  function cardFor(req, searched) {
    const he = req && req.lang === 'he';
    const looked = searched.filter((s) => s.status === 'empty').map((s) => s.label);
    const skipped = searched.filter((s) => s.status === 'not-connected').map((s) => s.label);
    const missing = (req && req.label) || (req && req.kind) || '';
    if (he) {
      return {
        line: 'לא מצאתי את ' + missing + '.',
        searched: looked.length ? ('חיפשתי ב: ' + looked.join(', ') + '.') : '',
        why: 'אין שם משהו שמתאים, אז לא סגרתי את זה.',
        skipped: skipped.length ? ('לא מחובר, אז לא חיפשתי: ' + skipped.join(', ') + '.') : ''
      };
    }
    return {
      line: 'I could not find ' + missing + '.',
      searched: looked.length ? ('I looked in ' + looked.join(', ') + '.') : '',
      why: 'Nothing there matches, so I did not close this.',
      skipped: skipped.length ? ('Not connected, so not searched: ' + skipped.join(', ') + '.') : ''
    };
  }

  function connected(evidence, needs) {
    if (needs === 'thread') return true;
    return Boolean(evidence && evidence.connected && evidence.connected[needs]);
  }

  // Status of one place. null means the host has not checked a connected source: that is not "empty".
  function placeOf(place, evidence) {
    if (place.id === 'drive-other' && evidence && evidence.driveScope === 'account') {
      return { id: place.id, label: 'Google Drive (all folders)', status: 'covered' };
    }
    if (!connected(evidence, place.needs)) return { id: place.id, label: place.label, status: 'not-connected' };
    const value = evidence ? evidence[place.key] : null;
    if (place.key === 'facts' || place.key === 'replies') {
      const list = Array.isArray(value) ? value.filter((row) => !row || !row.source || row.source === place.id || row.source === place.needs || (place.needs === 'docs' && row.source === 'docs') || (place.needs === 'sheets' && row.source === 'sheets') || (place.needs === 'gmail' && row.source === 'gmail') || (place.needs === 'outlook' && row.source === 'outlook')) : value;
      if (list == null) return { id: place.id, label: place.label, status: 'not-checked' };
      return { id: place.id, label: place.label, status: 'checked', items: list };
    }
    if (value == null) return { id: place.id, label: place.label, status: 'not-checked' };
    return { id: place.id, label: place.label, status: 'checked', items: value };
  }

  function asFile(row) {
    if (!row) return null;
    const name = row.name || row.filename || '';
    if (!name || TEMPLATE.test(name)) return null;
    return { id: row.id || name, name: name, mimeType: row.mimeType || '' };
  }

  function fileHits(items, req, text) {
    const files = (Array.isArray(items) ? items : []).map(asFile).filter(Boolean);
    if (!attach || typeof attach.decide !== 'function' || !req.ask) {
      const syn = req.synonym || [];
      const named = files.filter((f) => syn.some((t) => normName(f.name).includes(normName(t))));
      if (named.length === 1) return { status: 'one', file: named[0] };
      if (named.length > 1) return { status: 'conflict' };
      return { status: 'none' };
    }
    const ask = Object.assign({}, req.ask, { creatable: false });
    const d = attach.decide(ask, files, {}, text || '');
    if (d && d.action === 'attach' && d.file) return { status: 'one', file: d.file };
    if (d && d.reason === 'conflict') return { status: 'conflict' };
    return { status: 'none' };
  }

  function sameHit(a, b) {
    if (!a || !b) return false;
    if (a.file && b.file) return normName(a.file.name) === normName(b.file.name);
    if (a.value && b.value) return String(a.value) === String(b.value);
    if (a.eventId && b.eventId) return a.eventId === b.eventId;
    return false;
  }

  function search(req, evidence, text) {
    const places = PLACES[req.kind] || [];
    const searched = [];
    const hits = [];
    let conflict = false;
    for (const place of places) {
      const row = placeOf(place, evidence || {});
      if (row.status === 'covered') { searched.push(row); continue; }
      if (row.status !== 'checked') { searched.push(row); continue; }
      let found = { status: 'none' };
      if (req.kind === 'file') found = fileHits(row.items, req, text);
      else if (req.kind === 'fact') {
        const list = (row.items || []).filter((f) => f && f.value != null && String(f.value).trim() && (!f.source || f.source === place.needs || f.source === place.id));
        if (list.length === 1) found = { status: 'one', value: String(list[0].value), sourceName: list[0].name || null, id: list[0].id || null };
        else if (list.length > 1) found = { status: 'conflict' };
      } else if (req.kind === 'date') {
        // No day in the ask: an event on the calendar is not "the" meeting.
        if (req.iso) {
          const events = (row.items || []).filter((e) => e && e.status !== 'cancelled' && String(e.startIso || '').indexOf(req.iso) === 0);
          if (events.length === 1) found = { status: 'one', eventId: events[0].id || null, startIso: events[0].startIso || null, accepted: events[0].accepted === true };
          else if (events.length > 1) found = { status: 'conflict' };
        }
      } else {
        const replies = (row.items || []).filter((r) => r && !r.isDraft && (!r.source || r.source === place.needs || r.source === 'gmail' || r.source === 'outlook'));
        const pool = place.needs === 'gmail' ? replies.filter((r) => !r.source || r.source === 'gmail') : place.needs === 'outlook' ? replies.filter((r) => r.source === 'outlook') : replies;
        const fitting = pool.filter((r) => {
          const t = String(r.text || '');
          if (req.kind === 'approval') return APPROVAL_DONE.test(t);
          if (req.kind === 'answer') {
            const body = t.trim();
            return body.length >= 12 && !HOLDING_EN.test(body) && !HOLDING_HE.test(body);
          }
          return false;
        });
        if (fitting.length === 1) found = { status: 'one', reply: fitting[0] };
        else if (fitting.length > 1) found = { status: 'conflict' };
      }
      if (found.status === 'conflict') conflict = true;
      if (found.status === 'one') {
        const hit = Object.assign({ source: place.id }, found);
        delete hit.status;
        if (!hits.some((h) => sameHit(h, hit))) hits.push(hit);
      }
      searched.push({ id: row.id, label: row.label, status: found.status === 'none' ? 'empty' : 'checked' });
    }
    return { searched, hits, conflict };
  }

  // Real completion only. A draft, a holding line, and an event nobody accepted do not count.
  function completionOf(req, completion) {
    if (!req || !completion) return null;
    const sent = completion.sent || null;
    if (sent && sent.isDraft) return null;
    if (req.kind === 'file') {
      if (!sent || sent.direction !== 'out' || !Array.isArray(sent.attachments)) return null;
      const names = sent.attachments.map((a) => String((a && (a.filename || a.name)) || '')).filter(Boolean);
      if (!names.length) return null;
      const syn = req.synonym && req.synonym.length ? req.synonym : [req.label || ''];
      const fit = names.filter((n) => syn.some((t) => normName(n).includes(normName(t))));
      if (fit.length === 1 || (names.length === 1 && fit.length === 1)) return { reason: 'sent-with-file', files: names };
      if (names.length === 1 && req.object && attach && typeof attach.mention === 'function' && attach.mention(sent.text || '') && attach.mention(sent.text).id === req.object) {
        return { reason: 'sent-with-file', files: names };
      }
      return null;
    }
    if (req.kind === 'fact') {
      if (!sent || sent.direction !== 'out') return null;
      const value = req.value || (completion.value != null ? String(completion.value) : '');
      if (!value || !sent.text || String(sent.text).indexOf(value) < 0) return null;
      if (HOLDING_EN.test(sent.text) || HOLDING_HE.test(sent.text)) return null;
      return { reason: 'sent-fact' };
    }
    if (req.kind === 'date') {
      const ev = completion.event;
      if (!ev || !ev.id || ev.accepted !== true || ev.status === 'cancelled') return null;
      return { reason: 'accepted' };
    }
    if (req.kind === 'approval') {
      if (!sent || sent.direction == null) return null;
      if (!APPROVAL_DONE.test(String(sent.text || ''))) return null;
      return { reason: 'approved' };
    }
    if (req.kind === 'answer') {
      if (!sent || sent.direction !== 'out') return null;
      const t = String(sent.text || '').trim();
      if (!t || HOLDING_EN.test(t) || HOLDING_HE.test(t)) return null;
      if (t.length < 12) return null;
      return { reason: 'sent-answer' };
    }
    return null;
  }

  function finish(result, close) {
    result.move = 'close';
    result.show = false;
    result.close = close;
    result.sends = false;
    result.creates = false;
    return result;
  }

  // input: { text, origin, evidence, completion, watching, now }
  // evidence lists are plain data. null = a connected source the host did not check.
  // An `invoicing` or `billing` bag is ignored on purpose.
  // Getting someone else to send the file is not a file this person attaches.
  // Silence, including when a watch already stored a file requirement. No holding
  // line that claims "I'll send it."
  function thirdPartyAsk(text) {
    if (!text || !attach || typeof attach.asksThirdParty !== 'function' || !attach.asksThirdParty(text)) return false;
    if (typeof attach.gate !== 'function') return false;
    const gated = attach.gate(text);
    return Boolean(gated && gated.reason === 'third-party');
  }

  function resolve(input) {
    const i = input || {};
    const text = fresh(i.text);
    const now = typeof i.now === 'number' ? i.now : (i.now instanceof Date ? i.now.getTime() : Date.now());
    if (thirdPartyAsk(text)) {
      const result = blank(null);
      result.origin = i.origin || null;
      result.move = 'silence';
      result.reason = 'third-party';
      return result;
    }
    const req = (i.watching && i.watching.requirement) || derive(text, now);
    const result = blank(req && !req.blocked ? req : null);
    result.origin = i.origin || null;
    if (!text && !req) { result.reason = 'empty'; return result; }
    if (req && req.blocked) { result.reason = 'unclear'; result.type = null; return result; }
    if (!req || KINDS.indexOf(req.kind) < 0) { result.reason = 'no-requirement'; result.type = null; return result; }

    const done = completionOf(req.kind === 'fact' && i.completion && i.completion.value ? Object.assign({}, req, { value: String(i.completion.value) }) : req, i.completion);
    if (done) return finish(result, done);

    const found = search(req, i.evidence || {}, text);
    result.searched = found.searched;
    if (found.conflict || found.hits.length > 1) { result.reason = 'conflict'; return result; }

    if (found.hits.length === 1) {
      const hit = found.hits[0];
      result.show = true;
      result.move = 'prepare';
      result.reason = 'found';
      result.hit = hit;
      result.close = false;
      result.undo = { action: 'delete-draft', closes: false };
      if (req.kind === 'fact' && hit.value) result.requirement = Object.assign({}, req, { value: hit.value });
      return result;
    }

    const notChecked = found.searched.some((s) => s.status === 'not-checked');
    const checkedEmpty = found.searched.some((s) => s.status === 'empty' || s.status === 'covered');
    if (notChecked || !checkedEmpty) { result.reason = 'unverified'; return result; }

    // A named day and a clock can be put on the calendar. That write is preparation, not a close,
    // and only when Calendar itself was checked and had no matching event.
    if (req.kind === 'date' && req.iso && req.clock && found.searched.some((s) => s.id === 'calendar' && s.status === 'empty')) {
      result.show = true;
      result.move = 'prepare';
      result.reason = 'schedule';
      result.hit = { source: 'calendar', create: true, iso: req.iso };
      result.close = false;
      result.creates = false;
      result.undo = { action: 'delete-event', closes: false };
      return result;
    }

    const holding = holdingFor(req, text, now);
    result.show = true;
    result.move = i.watching ? 'watch' : 'needs-you';
    result.reason = 'not-found';
    result.card = cardFor(req, found.searched);
    result.holding = holding;
    result.promise = promiseFor(req, holding);
    result.close = false;
    return result;
  }

  // The evidence bag both inboxes pass today. Drive is account-wide. This thread is
  // whatever names the host actually has. Gmail attachments, Outlook attachments,
  // Docs, Sheets and Calendar stay off until both surfaces turn them on together.
  // driveOk false → driveFiles null (not checked). threadFiles null → this thread
  // was not read. An empty array means it was read and nothing was there.
  function fileEvidence(input) {
    const i = input || {};
    return {
      driveScope: 'account',
      connected: { drive: true, thread: true, gmail: false, outlook: false, docs: false, sheets: false, calendar: false },
      driveFiles: i.driveOk === true ? (Array.isArray(i.driveFiles) ? i.driveFiles : []) : null,
      threadFiles: Object.prototype.hasOwnProperty.call(i, 'threadFiles') ? i.threadFiles : []
    };
  }

  // The planner's "this file ask has not been searched yet" marker. file-needs-drive
  // is the old spelling, still accepted so a diagnostic stored before the split
  // still runs the chain. It is not written anymore.
  function isFileChainPending(reason) {
    return reason === 'file-chain-not-run' || reason === 'file-needs-drive';
  }

  // Why-not-shown lines a finished file chain may leave. A card drops these.
  function isFileSilence(reason) {
    return isFileChainPending(reason) || reason === 'drive-not-granted' || reason === 'drive-search-failed';
  }

  // Host result of flow:search-drive. null: the chain never called Drive.
  // ok true: the resolver may run. Otherwise a silence, never the generic
  // file-needs-drive stall. not-connected is the old worker spelling of
  // "Google is not connected", which is Drive not granted.
  function searchSilence(searched) {
    if (!searched) return 'file-chain-not-run';
    if (searched.ok === true) return null;
    const reason = String(searched.reason || '');
    if (reason === 'drive-not-granted' || reason === 'not-connected') return 'drive-not-granted';
    return 'drive-search-failed';
  }

  return { KINDS, PLACES, derive, resolve, completionOf, holdingText, fresh, fileEvidence, isFileChainPending, isFileSilence, searchSilence };
})();

if (typeof module !== 'undefined') module.exports = { FlowCloseChains };
else if (typeof globalThis !== 'undefined') globalThis.FlowCloseChains = FlowCloseChains;
