// Add one row to the tracker they named (close map row D4). Portable: no chrome.*,
// no DOM, no network. Behind the off switch SHEET_ROW (default off).
//
// The loop: "Log the ₪3,850 in the payments sheet." / "תרשום 3,850 ש״ח בגיליון
// התשלומים." The close is that row really sitting in that sheet. Glance finds the
// one Google Sheet whose name fits, reads its header row, puts the amount (and the
// date and a short label) under the matching columns, appends one row, and reads
// that exact range back. Handled only when the read-back holds the same values.
// Undo re-reads the row, deletes it only while it still holds what Glance wrote,
// and reads the range again.
//
// Rules:
//   - one explicit ask: a log/add/record verb, a named sheet or tracker, exactly one
//     amount with a currency. Two amounts, no amount, or no named sheet: silence;
//   - negation, a hedge, a past tense ("I logged", "רשמתי"), a question about
//     whether it was logged, and "ask Dana to log it" stay silent;
//   - zero or several spreadsheets that fit the name: silence; a template is never
//     the target;
//   - a header row with no amount column: silence. Glance never adds a column;
//   - nothing is read or written until the switch is on.
//
// The person's existing sheet needs the Sheets scope (spreadsheets), which the
// manifest does not ask today (drive.file reaches only files Glance created).
// Going live adds that scope with the privacy page and store text, by the owner.
//
// The host injects: sheets(method, path, body?) -> Promise<{ status, ok, json }>
// against https://sheets.googleapis.com/v4. Drive search results (files with
// id, name, mimeType) come from the host too. No src/ file calls this yet.
const FlowSheetRow = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'SHEET_ROW';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'google/sheets';
  const CONNECTOR = 'sheetRowAppend';
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';

  const VERB_EN = /\b(?:please\s+)?(?:log|add|record|enter|put|note down|track)\b/i;
  const VERB_HE = /(?:תרשו?ם|תרשמי|תרשמו|רשו?ם|רשמי|לרשום|תוסיף|תוסיפי|תוסיפו|להוסיף|תכניס(?:י|ו)?|להכניס|תעדכן|תעדכני|לעדכן)(?![֐-׿])/;
  // "in the payments sheet", "to our expenses tracker", "on the Q3 spreadsheet"
  const TARGET_EN = /\b(?:in|into|to|on)\s+(?:the|my|our)\s+((?:[A-Za-z0-9][\w'&-]*\s+){0,3}?[A-Za-z0-9][\w'&-]*)\s+(?:sheet|spreadsheet|tracker|log|excel)\b/i;
  const TARGET_EN_BARE = /\b(?:in|into|to|on)\s+(?:the|my|our)\s+(?:sheet|spreadsheet|tracker)\b/i;
  // "בגיליון התשלומים", "לטבלת ההוצאות", "באקסל של הלקוחות"
  const TARGET_HE = /(?:^|[^֐-׿])(?:ב|ל)(?:גיליון|גליון|טבלת|טבלה|קובץ|אקסל)(?:\s+של)?\s+(?:ה)?([֐-׿][֐-׿"״'׳-]{1,24}(?:\s+[֐-׿][֐-׿"״'׳-]{1,24})?)/;

  const NEG = /\b(?:do not|don't|dont|no need to|never mind|not yet)\b|אל\s+ת|אין\s+צורך|לא\s+צריך|לא\s+לרשום|לא\s+להוסיף/i;
  const HEDGE = /\b(?:maybe|perhaps|possibly|if you want|if you feel like|no rush|whenever|not sure)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|לא\s+בטוח/i;
  const PAST = /\b(?:i|we)\s+(?:already\s+|just\s+)?(?:logged|added|recorded|entered|put|updated)\b|\balready\s+(?:logged|added|recorded|in the)\b|(?:^|[^֐-׿])(?:רשמתי|הוספתי|עדכנתי|הכנסתי|רשמנו|הוספנו|כבר\s+רשום|כבר\s+נרשם)/i;
  const ASKS_STATUS = /\b(?:did|have|has)\s+(?:you|it|this|that|anyone)\b[^?]*\?|האם\s+(?:רשמת|הוספת|עדכנת)|(?:רשמת|הוספת|עדכנת)\s*\?/i;
  const THIRD_EN = /\b(?:ask|have|get|tell)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+to\s+(?:log|add|record|enter|update|put)\b/i;
  const THIRD_HE = /תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))|(?:^|[^֐-׿])ש(?!ת)[֐-׿]{2,20}\s+(?:ירשום|תרשום|יוסיף|תוסיף|יעדכן|תעדכן)/;

  const COL_AMOUNT = /^(?:amount|sum|total|price|paid|value|cost|₪|\$|סכום|סה["״]?כ|סך|מחיר|שולם|תשלום)$/i;
  const COL_DATE = /^(?:date|day|when|paid on|תאריך|יום|מועד)$/i;
  const COL_LABEL = /^(?:description|desc|item|note|notes|details|from|payer|client|customer|vendor|name|for|what|תיאור|פירוט|הערה|הערות|ממי|לקוח|ספק|שם|עבור|על מה)$/i;
  const COL_CURRENCY = /^(?:currency|cur|מטבע)$/i;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function moneyHits(text) {
    if (!extract) return [];
    const hits = [];
    let rest = String(text || '');
    for (let i = 0; i < 4; i++) {
      const m = extract.parseMoney(rest);
      if (!m) break;
      hits.push(m);
      rest = rest.slice(0, m.index) + ' '.repeat(m.raw.length) + rest.slice(m.index + m.raw.length);
    }
    return hits;
  }

  function cleanName(s) {
    return String(s || '').replace(/["״'׳]/g, '').replace(/\s+/g, ' ').trim();
  }

  // The ask, or silence with a reason. One sentence-sized text.
  function recognize(text) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim()) return { kind: 'ignore' };
    const verb = VERB_EN.test(s) || VERB_HE.test(s);
    const en = s.match(TARGET_EN);
    const he = s.match(TARGET_HE);
    const bare = !en && !he && TARGET_EN_BARE.test(s);
    if (!verb || (!en && !he && !bare)) return { kind: 'ignore' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (PAST.test(s)) return { kind: 'block', reason: 'already-done' };
    if (ASKS_STATUS.test(s)) return { kind: 'block', reason: 'status-question' };
    if (THIRD_EN.test(s) || THIRD_HE.test(s) || (attach && attach.asksThirdParty && attach.asksThirdParty(s))) {
      return { kind: 'block', reason: 'third-party' };
    }
    if (bare) return { kind: 'block', reason: 'no-sheet-name' };
    const money = moneyHits(s);
    if (money.length === 0) return { kind: 'block', reason: 'no-amount' };
    if (money.length > 1) return { kind: 'block', reason: 'several-amounts' };
    const lang = he && (!en || he.index < en.index) ? 'he' : 'en';
    const sheetName = cleanName(lang === 'he' ? he[1] : en[1]);
    if (!sheetName) return { kind: 'block', reason: 'no-sheet-name' };
    return {
      kind: 'clear',
      lang: lang,
      sheetName: sheetName,
      amount: { value: money[0].value, currency: money[0].currency, raw: money[0].raw },
      label: labelOf(s, money[0], lang)
    };
  }

  // A short label: the words after "for" / "from" / "עבור" / "מ־", if any.
  function labelOf(s, money, lang) {
    const m = lang === 'he'
      ? s.match(/(?:^|[^֐-׿])(?:עבור\s+|על\s+|מ[-־])([֐-׿A-Za-z][֐-׿A-Za-z0-9 '"״-]{1,40}?)(?=\s+(?:ב|ל)(?:גיליון|גליון|טבלת|טבלה|קובץ|אקסל)|[.,!?]|$)/)
      : s.match(/\b(?:for|from)\s+([A-Za-z][\w '&-]{1,40}?)(?=\s+(?:in|into|to|on)\s+(?:the|my|our)\b|[.,!?]|$)/i);
    const label = m ? cleanName(m[1]).replace(/^(?:the|a|an)\s+/i, '') : '';
    if (!label || label.indexOf(money.raw) !== -1) return '';
    return label.slice(0, 60);
  }

  function norm(v) {
    return String(v || '').toLowerCase().replace(/^ה(?=[֐-׿]{3})/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  // Hebrew plurals and the definite article: "התשלומים" fits "תשלומים - 2026".
  function nameFits(fileName, sheetName) {
    const f = norm(fileName);
    const words = norm(sheetName).split(' ').filter((w) => w.length >= 3);
    if (!words.length) return false;
    return words.every((w) => {
      const stem = w.replace(/^ה/, '').replace(/(?:ים|ות|s)$/u, '');
      return f.indexOf(w) !== -1 || (stem.length >= 3 && f.indexOf(stem) !== -1);
    });
  }

  function pickSheet(files, sheetName) {
    if (!Array.isArray(files)) return { reason: 'not-searched' };
    const fits = files.filter((f) => f && f.id && f.mimeType === SHEET_MIME && !f.trashed && !/template|תבנית/i.test(f.name || '') && nameFits(f.name, sheetName));
    if (fits.length === 0) return { reason: 'none' };
    if (fits.length > 1) return { reason: 'conflict' };
    return { file: { id: fits[0].id, name: fits[0].name } };
  }

  function driveQuery(sheetName) {
    const t = String(sheetName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return "trashed = false and mimeType = '" + SHEET_MIME + "' and name contains '" + t + "'";
  }

  function silence(reason) {
    return { action: 'silence', reason: reason };
  }

  function line(lang, raw, fileName) {
    if (lang === 'he') return 'לרשום ' + raw + ' ב' + fileName + '?';
    return 'Add ' + raw + ' to ' + fileName + '?';
  }

  // The plan, after the host searched Drive for spreadsheets (driveQuery).
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text);
    if (r.kind !== 'clear') return silence(r.reason || 'no-ask');
    const picked = pickSheet(input.files, r.sheetName);
    if (!picked.file) return silence(picked.reason);
    const he = r.lang === 'he';
    return {
      action: 'offer',
      approval: 'Do It',
      ask: r,
      sheet: picked.file,
      line: line(r.lang, r.amount.raw, picked.file.name),
      steps: [
        { id: 'read-header', kind: 'sheet', label: he ? 'קריאת שורת הכותרת' : 'Read the header row' },
        { id: 'append-row', kind: 'sheet', label: he ? 'הוספת שורה ובדיקה חוזרת' : 'Add the row and read it back', proof: SYSTEM }
      ]
    };
  }

  // The row, under the sheet's own headers. Null when there is no amount column.
  function rowFor(header, ask, todayIso) {
    if (!Array.isArray(header) || !header.length) return null;
    const cells = header.map((h) => String(h == null ? '' : h).trim());
    const find = (re) => cells.findIndex((c) => re.test(c));
    const iAmount = find(COL_AMOUNT);
    if (iAmount === -1) return null;
    const row = cells.map(() => '');
    row[iAmount] = String(ask.amount.value);
    const iDate = find(COL_DATE);
    if (iDate !== -1) row[iDate] = todayIso;
    const iLabel = find(COL_LABEL);
    if (iLabel !== -1 && ask.label) row[iLabel] = ask.label;
    const iCur = find(COL_CURRENCY);
    if (iCur !== -1) row[iCur] = ask.amount.currency;
    while (row.length && row[row.length - 1] === '') row.pop();
    return row;
  }

  function quoteTab(title) {
    return "'" + String(title).replace(/'/g, "''") + "'";
  }

  function rowIndexOf(range) {
    const m = String(range || '').match(/![A-Z]+(\d+)(?::[A-Z]+(\d+))?$/);
    if (!m) return null;
    if (m[2] && m[2] !== m[1]) return null;
    return Number(m[1]);
  }

  function sameRow(got, want) {
    const g = (got || []).map((v) => String(v == null ? '' : v).trim());
    while (g.length && g[g.length - 1] === '') g.pop();
    if (g.length !== want.length) return false;
    return want.every((v, i) => {
      if (v === g[i]) return true;
      const a = Number(String(v).replace(/,/g, ''));
      const b = Number(String(g[i]).replace(/[,\s₪$€£]/g, ''));
      return v !== '' && Number.isFinite(a) && Number.isFinite(b) && a === b;
    });
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  // Do It: read the first tab's header, append one row, read that row back.
  async function append(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const sheetId = input.sheet && input.sheet.id;
    const ask = input.ask;
    if (!sheetId || !ask || !ask.amount) return miss('invalid');
    if (typeof io.sheets !== 'function') return miss('no-host');
    const sheets = io.sheets;
    const base = '/spreadsheets/' + encodeURIComponent(sheetId);

    const meta = await sheets('GET', base + '?fields=sheets.properties(sheetId,title,index)');
    if (meta.status === 401 || meta.status === 403) return miss('not-connected');
    if (!meta.ok || !meta.json || !Array.isArray(meta.json.sheets) || !meta.json.sheets.length) return miss('sheet-unreadable');
    const tab = meta.json.sheets.map((s) => s.properties || {}).sort((a, b) => (a.index || 0) - (b.index || 0))[0];
    const tabRef = quoteTab(tab.title);

    const head = await sheets('GET', base + '/values/' + encodeURIComponent(tabRef + '!1:1'));
    if (!head.ok || !head.json) return miss('sheet-unreadable');
    const header = (head.json.values && head.json.values[0]) || [];
    const todayIso = typeof input.today === 'string' ? input.today : new Date().toISOString().slice(0, 10);
    const row = rowFor(header, ask, todayIso);
    if (!row) return miss('no-amount-column');

    const put = await sheets('POST', base + '/values/' + encodeURIComponent(tabRef + '!A1') + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', { values: [row] });
    if (put.status === 401 || put.status === 403) return miss('not-connected');
    if (!put.ok) return miss('append-failed');
    const range = put.json && put.json.updates && put.json.updates.updatedRange;
    const rowIndex = rowIndexOf(range);
    if (!range || !rowIndex) return miss(PENDING);
    const ref = { spreadsheetId: sheetId, tabId: tab.sheetId, tabTitle: tab.title, range: range, rowIndex: rowIndex, row: row, createdByGlance: true };

    const back = await sheets('GET', base + '/values/' + encodeURIComponent(range));
    if (!back.ok || !back.json) return miss(FAILED, { ref: ref, why: 'get-' + back.status });
    const got = back.json.values && back.json.values[0];
    if (!sameRow(got, row)) return miss(FAILED, { ref: ref, why: 'row-differs' });

    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: sheetId + '!' + range, url: 'https://docs.google.com/spreadsheets/d/' + sheetId, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: ref });
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'Google Sheets',
      target: input.sheet.name || 'sheet',
      written: 'Sheets · ' + (input.sheet.name || 'sheet') + ' · ' + ask.amount.raw,
      proof: proof,
      ref: ref,
      // The row in the sheet is the thing they asked for: this is the close.
      loopClosed: true
    };
  }

  // Undo: delete that row only while it still holds what Glance wrote.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.spreadsheetId || !ref.range || !ref.rowIndex || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.sheets !== 'function') return { ok: false, reason: 'no-host' };
    const base = '/spreadsheets/' + encodeURIComponent(ref.spreadsheetId);
    const now = await io.sheets('GET', base + '/values/' + encodeURIComponent(ref.range));
    if (now.status === 401 || now.status === 403) return { ok: false, reason: 'not-connected' };
    if (!now.ok || !sameRow(now.json && now.json.values && now.json.values[0], ref.row)) {
      return { ok: false, reason: 'row-changed', undoUnavailable: true };
    }
    const del = await io.sheets('POST', base + ':batchUpdate', {
      requests: [{ deleteDimension: { range: { sheetId: ref.tabId, dimension: 'ROWS', startIndex: ref.rowIndex - 1, endIndex: ref.rowIndex } } }]
    });
    if (!del.ok) return { ok: false, reason: 'undo-failed' };
    const after = await io.sheets('GET', base + '/values/' + encodeURIComponent(ref.range));
    if (after.ok && !sameRow(after.json && after.json.values && after.json.values[0], ref.row)) {
      return { ok: true, undone: true, externalId: ref.spreadsheetId + '!' + ref.range };
    }
    return { ok: false, reason: 'undo-unverified' };
  }

  return {
    SWITCH, SWITCH_DEFAULT, SYSTEM, CONNECTOR, SCOPE,
    enabled, recognize, nameFits, pickSheet, driveQuery, plan, rowFor, append, undo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowSheetRow };
else if (typeof globalThis !== 'undefined') globalThis.FlowSheetRow = FlowSheetRow;
