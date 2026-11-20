// Rows for a new or existing Google Sheet, read from one mail.
// A table, a list, or several amounts, and an explicit ask to put them in a
// sheet. One amount with no list stays with the template path. FYI, a
// newsletter, a negation, and a hedge stay silent. Portable: no chrome.*,
// no DOM, no network.
const FlowSheetMail = (() => {
  const QUIET = /\b(?:fyi|for your information|no action needed|no need to (?:reply|do anything)|unsubscribe|you(?:'| a)?re receiving this|you are receiving this|you received this email|maybe|perhaps)\b|לידיעתך|אין צורך|להסרה|קיבלת מייל זה|הנך רשום|אולי/i;
  const NEG = /\b(?:don't|do not|never)\b|אל\s*ת|לא\s+צריך/i;
  const SHEET_WORD = /\b(?:spreadsheets?|google sheets?|sheets?)\b|גיליון|טבלה|אקסל/i;
  const RECORD = /\b(?:put|log|record|enter|add|create|make|prepare|track)\b|בבקשה|תכין|תכיני|תרשום|תרשמי|תוסיף|תוסיפי|רשום|הכן|הכיני/i;
  const PICK = /\b(?:existing (?:sheet|spreadsheet)|append (?:this|these|it|them) to|add (?:this|these|them) to (?:the|my) (?:sheet|spreadsheet))\b|בגיליון הקיים|לגיליון הקיים|תוסיף לגיליון|תוסיפי לגיליון|הוסף לגיליון/i;
  const NEW_WORD = /\b(?:new spreadsheet|new sheet)\b|גיליון חדש|טבלה חדשה/i;

  function clean(s) {
    return String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function usable(cells) {
    if (!cells || cells.length < 2 || cells.length > 12) return null;
    if (!cells.some((c) => c)) return null;
    return cells;
  }

  function csvSep(raw) {
    const counts = { ',': 0, '\u060C': 0, '\uFF0C': 0 };
    let quote = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"') {
        if (quote && raw[i + 1] === '"') { i++; continue; }
        quote = !quote;
        continue;
      }
      if (!quote && Object.prototype.hasOwnProperty.call(counts, ch)) counts[ch]++;
    }
    let best = '';
    let n = 0;
    Object.keys(counts).forEach((k) => {
      if (counts[k] > n) { n = counts[k]; best = k; }
    });
    return best;
  }

  function csvCells(raw) {
    const sep = csvSep(raw);
    if (!sep) return null;
    const cells = [];
    let cell = '';
    let quote = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (quote) {
        if (ch === '"') {
          if (raw[i + 1] === '"') { cell += '"'; i++; }
          else quote = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"') { quote = true; continue; }
      if (ch === sep) { cells.push(clean(cell)); cell = ''; continue; }
      cell += ch;
    }
    cells.push(clean(cell));
    return usable(cells);
  }

  function splitCells(line) {
    const raw = String(line || '').trim();
    if (!raw) return null;
    if (raw.indexOf('|') >= 0) {
      return usable(raw.replace(/^\|/, '').replace(/\|$/, '').split('|').map(clean));
    }
    if (raw.indexOf('\t') >= 0) return usable(raw.split('\t').map(clean));
    return csvCells(raw);
  }

  function isRule(line) {
    return /^\s*\|?\s*:?-{3,}/.test(String(line || ''));
  }

  function tableRows(text) {
    const lines = String(text || '').split(/\r?\n/);
    const block = [];
    let current = [];
    function flush() {
      if (current.length >= 2) block.push(current.slice());
      current = [];
    }
    for (let i = 0; i < lines.length; i++) {
      if (isRule(lines[i])) continue;
      const cells = splitCells(lines[i]);
      if (cells && cells.length >= 2) {
        if (current.length && current[0].length !== cells.length) flush();
        current.push(cells.slice(0, 12));
      } else flush();
    }
    flush();
    if (!block.length) return null;
    block.sort((a, b) => b.length - a.length);
    const rows = block[0].slice(0, 40);
    return rows.length >= 2 ? rows : null;
  }

  function bulletRows(text) {
    const lines = String(text || '').split(/\r?\n/);
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const m = String(lines[i] || '').match(/^\s*(?:[-*•–—]|\d+[.)])\s+(.+)$/);
      if (!m) {
        if (rows.length >= 2) break;
        rows.length = 0;
        continue;
      }
      const cell = clean(m[1]);
      if (cell && cell.length <= 500) rows.push([cell]);
      if (rows.length >= 40) break;
    }
    return rows.length >= 2 ? rows : null;
  }

  function amountRows(text) {
    const lines = String(text || '').split(/\r?\n/);
    const rows = [];
    const re = /^(.+?)\s+([₪$€£]\s?[\d][\d,.]*(?:\s?₪)?|\d[\d,.]*(?:\s?(?:₪|nis|usd|ils|ש"ח|ש״ח))?)$/i;
    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i] || '').replace(/^\s*(?:[-*•–—]|\d+[.)])\s+/, '').trim();
      const m = line.match(re);
      if (!m) continue;
      const label = clean(m[1]);
      const amount = clean(m[2]);
      if (!label || !amount || label.length > 200) continue;
      rows.push([label, amount]);
      if (rows.length >= 40) break;
    }
    return rows.length >= 2 ? rows : null;
  }

  function headerCell(cell) {
    const s = String(cell || '').trim();
    if (!s || s.length > 40 || /\d/.test(s)) return false;
    return /^[\p{L}][\p{L}\s.'’\-]{0,39}$/u.test(s);
  }

  function hasHeader(rows) {
    if (!rows || rows.length < 2) return false;
    if (!rows[0].every(headerCell)) return false;
    return rows.slice(1).some((r) => r.some((c) => /\d/.test(String(c || ''))));
  }

  function rowsOf(text) {
    return tableRows(text) || bulletRows(text) || amountRows(text);
  }

  function titleOf(text, subject, he) {
    const sub = clean(subject);
    const named = String(text || '').match(/(?:called|named|בשם)\s+[«"']?([^"'\n]{2,80})/i);
    if (named && clean(named[1])) return clean(named[1]).slice(0, 120);
    if (sub && sub.length <= 120 && !/^(?:re|fw|fwd)\s*:/i.test(sub)) return sub;
    return he ? 'גיליון' : 'Sheet';
  }

  const NO_ACCESS = 'ל-Glance אין גישה לגיליון הזה. אפשר לבחור גיליון ש-Glance יצר, או ליצור גיליון חדש.';

  function parseSheetLink(text) {
    const s = String(text || '').trim();
    const fromUrl = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/);
    if (fromUrl) return fromUrl[1];
    if (/^[a-zA-Z0-9_-]{20,200}$/.test(s)) return s;
    return '';
  }

  function plan(input) {
    const i = input || {};
    const text = String(i.text || '');
    const subject = String(i.subject || '');
    const whole = subject ? subject + '\n' + text : text;
    if (!whole.trim() || QUIET.test(whole) || NEG.test(whole)) return null;
    const rows = rowsOf(text) || rowsOf(whole);
    if (!rows || rows.length < 2) return null;
    const he = /[\u0590-\u05FF]/.test(whole);
    const sheetWord = SHEET_WORD.test(whole);
    const table = !!tableRows(text);
    const pick = PICK.test(whole) && !NEW_WORD.test(whole);
    const ask = RECORD.test(whole) || sheetWord || pick;
    if (!ask) return null;
    if (!sheetWord && !table && !pick) return null;
    return {
      action: 'offer',
      mode: pick ? 'pick' : 'create',
      title: titleOf(whole, subject, he),
      rows: rows,
      header: hasHeader(rows),
      lang: he ? 'he' : 'en'
    };
  }

  return { plan: plan, rowsOf: rowsOf, parseSheetLink: parseSheetLink, NO_ACCESS: NO_ACCESS };
})();

if (typeof module !== 'undefined') module.exports = { FlowSheetMail };
else if (typeof globalThis !== 'undefined') globalThis.FlowSheetMail = FlowSheetMail;
