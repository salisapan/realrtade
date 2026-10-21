// Glance never blocks the person. A draft, task, event, or file Glance
// created stays editable in the native tool. The body is written once.
// The first keystroke stops any later fill. Undo compares the creation
// snapshot and leaves the object alone when the person has changed it.
const FlowNativeEdit = (() => {
  function userEditedLine() {
    return 'You edited this. Undo left it alone.';
  }

  function unconfirmedLine() {
    return "Couldn't confirm it's unchanged. Undo left it alone.";
  }

  function textOf(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value.content != null) return String(value.content);
    return '';
  }

  // Graph stores the same sentence as text or as HTML. Tags, CRLF, and
  // extra whitespace are not an edit. The words are.
  // Microsoft appends a join block to an online meeting's body, sometimes
  // after the first read. It is not the person's text: from its underscore
  // rule to the end is left out, so it can never read as an edit.
  const TEAMS_JOIN_BLOCK = /_{8,}\s*(?:Microsoft Teams|Join (?:the meeting|on your computer|with a video)|Meeting ID|הצטרפות|הצטרף)[\s\S]*$/i;

  function normText(value) {
    return textOf(value)
      .replace(/<[^>]+>/g, ' ')
      .replace(TEAMS_JOIN_BLOCK, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // dateTime only. timeZone, fractional seconds, and the wrapper object are
  // how Graph spells the same clock.
  function clockOf(value) {
    if (value == null || value === '') return '';
    const raw = typeof value === 'object' ? (value.dateTime || value.date || '') : value;
    const s = String(raw || '').trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
    return m ? m[1] : s;
  }

  function addressesOf(value) {
    const list = [];
    const push = (addr) => {
      const e = String(addr || '').trim().toLowerCase();
      if (e && list.indexOf(e) < 0) list.push(e);
    };
    const rows = Array.isArray(value) ? value : (value ? [value] : []);
    rows.forEach((row) => {
      if (!row) return;
      if (typeof row === 'string') {
        row.split(/[,;]/).forEach(push);
        return;
      }
      const box = row.emailAddress || row;
      push(box.address || box.email || '');
    });
    list.sort();
    return list.join(',');
  }

  function locationOf(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
    if (typeof value === 'object') return String(value.displayName || '').replace(/\s+/g, ' ').trim();
    return '';
  }

  function plain(value) {
    if (value == null) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  // A category name can contain a comma. The stored set is sorted and joined
  // with a separator that is not part of a name.
  function categoriesOf(value) {
    const list = [];
    const push = (item) => {
      const s = plain(item);
      if (s && list.indexOf(s) < 0) list.push(s);
    };
    if (Array.isArray(value)) value.forEach(push);
    else if (typeof value === 'string' && value) value.split('\u001f').forEach(push);
    list.sort();
    return list.join('\u001f');
  }

  // false and 0 are values. Missing and blank are empty, stored as null.
  function boolOf(value) {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }

  function emptyToNull(value) {
    if (value == null || value === '') return null;
    return value;
  }

  // The stored body is a hash of the full normalized text plus a prefix.
  // The prefix is what a person can look at. The hash is what Undo compares,
  // so a change past the prefix is still an edit.
  const BODY_PREFIX = 8192;

  function hashText(text) {
    let h1 = 2166136261;
    let h2 = 2166136261;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 16777619);
      h2 ^= (c + 1);
      h2 = Math.imul(h2, 16777619);
    }
    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  function bodyRecord(raw) {
    if (raw && typeof raw === 'object' && typeof raw.hash === 'string' && raw.content == null) {
      return { hash: raw.hash, prefix: String(raw.prefix || '').slice(0, BODY_PREFIX) };
    }
    const text = normText(raw);
    if (!text) return null;
    return { hash: hashText(text), prefix: text.slice(0, BODY_PREFIX) };
  }

  // Content the person can change. Reminder fields stay out: Graph fills
  // those on its own. Importance is stored. A later value of normal, or a
  // missing importance, is Graph's default and is not an edit. A current
  // value other than normal that differs from the snapshot is an edit.
  // Server fields (lastModifiedDateTime, @odata.etag, changeKey) are not here.
  const CONTENT_KEYS = [
    'title', 'subject', 'name', 'body', 'dueDateTime', 'status', 'start', 'end',
    'location', 'to', 'cc', 'attendees', 'categories', 'isAllDay', 'importance', 'recurrence'
  ];

  function rawFor(key, o) {
    if (key === 'to') return o.toRecipients || o.to;
    if (key === 'cc') return o.ccRecipients || o.cc;
    return o[key];
  }

  function present(key, o) {
    if (!o || typeof o !== 'object') return false;
    if (key === 'to') return Object.prototype.hasOwnProperty.call(o, 'toRecipients') || Object.prototype.hasOwnProperty.call(o, 'to');
    if (key === 'cc') return Object.prototype.hasOwnProperty.call(o, 'ccRecipients') || Object.prototype.hasOwnProperty.call(o, 'cc');
    return Object.prototype.hasOwnProperty.call(o, key);
  }

  function fieldValue(key, raw) {
    if (key === 'body') return bodyRecord(raw);
    if (key === 'dueDateTime' || key === 'start' || key === 'end') return emptyToNull(clockOf(raw));
    if (key === 'to' || key === 'cc' || key === 'attendees') return emptyToNull(addressesOf(raw));
    if (key === 'location') return emptyToNull(locationOf(raw));
    if (key === 'categories') return emptyToNull(categoriesOf(raw));
    if (key === 'recurrence') return emptyToNull(recurrenceOf(raw));
    if (key === 'isAllDay') return boolOf(raw);
    if (key === 'importance') return importanceOf(raw);
    if (key === 'status') return emptyToNull(plain(raw));
    return emptyToNull(plain(raw));
  }

  // A repeat rule as one string: type, interval, days, day of month, range kind
  // and start. Another spelling of the same rule is not an edit; another rule is.
  function recurrenceOf(raw) {
    if (typeof raw === 'string') return raw.trim() || null; // an already-stored snapshot value
    if (!raw || typeof raw !== 'object' || !raw.pattern || typeof raw.pattern !== 'object') return null;
    const p = raw.pattern;
    const days = Array.isArray(p.daysOfWeek) ? p.daysOfWeek.map((d) => String(d).toLowerCase()).sort().join(',') : '';
    const r = raw.range && typeof raw.range === 'object' ? raw.range : {};
    return [String(p.type || '').toLowerCase(), String(p.interval == null ? 1 : p.interval), days, Number(p.dayOfMonth) > 0 ? String(p.dayOfMonth) : '',
      String(r.type || '').toLowerCase(), String(r.startDate || '').slice(0, 10)].join('|');
  }

  // Graph's own default is normal. low and high are a star the person set.
  function importanceOf(raw) {
    const v = emptyToNull(plain(raw));
    if (v == null) return null;
    return String(v).toLowerCase();
  }

  // Current normal or missing is not an edit, even when the snapshot held
  // a different value. A non-default current that differs from the snapshot
  // is an edit, including when the snapshot never stored the key.
  function importanceEdited(snapshot, live) {
    const liveVal = present('importance', live) ? importanceOf(rawFor('importance', live)) : null;
    if (liveVal == null || liveVal === 'normal') return false;
    const has = Object.prototype.hasOwnProperty.call(snapshot, 'importance');
    const stored = has ? importanceOf(snapshot.importance) : null;
    return stored !== liveVal;
  }

  // Only keys the read actually returned. An empty value is null.
  // A key Graph did not send is omitted, not stored as null.
  function snapshotOf(obj) {
    const o = obj || {};
    const snap = {};
    for (let i = 0; i < CONTENT_KEYS.length; i++) {
      const key = CONTENT_KEYS[i];
      if (!present(key, o)) continue;
      snap[key] = fieldValue(key, rawFor(key, o));
    }
    return snap;
  }

  function sameField(key, stored, liveVal) {
    if (key !== 'body') return stored === liveVal;
    const a = stored && stored.hash;
    const b = liveVal && liveVal.hash;
    return a != null && a === b;
  }

  // 'edited' only when a stored non-null value changed, including to empty.
  // A stored null, or a key the snapshot never had, that is non-null now is
  // 'unconfirmed': the server may have filled a default. 'match' is an exact
  // match of every stored value and no new non-null field.
  function compareContent(snapshot, live) {
    if (!snapshot || !live || typeof snapshot !== 'object') return 'unconfirmed';
    if (importanceEdited(snapshot, live)) return 'edited';
    let unseen = false;
    for (let i = 0; i < CONTENT_KEYS.length; i++) {
      const key = CONTENT_KEYS[i];
      if (key === 'importance') continue;
      const liveVal = present(key, live) ? fieldValue(key, rawFor(key, live)) : null;
      if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
        if (liveVal != null) unseen = true;
        continue;
      }
      const stored = fieldValue(key, snapshot[key]);
      if (stored == null) {
        if (liveVal != null) unseen = true;
        continue;
      }
      if (!sameField(key, stored, liveVal)) return 'edited';
    }
    return unseen ? 'unconfirmed' : 'match';
  }

  function userEdited(snapshot, live) {
    return compareContent(snapshot, live) === 'edited';
  }

  // Write the compose box once. A later call, or the first input after the
  // write, does not replace what the person typed.
  function fillOnce(box, text, opts) {
    if (!box) return { wrote: false, reason: 'no-box' };
    const typed = box.__glanceUserTyped || (box.getAttribute && box.getAttribute('data-glance-user-typed') === '1');
    const filled = box.__glanceFilled || (box.getAttribute && box.getAttribute('data-glance-filled') === '1');
    const current = String(box.value != null ? box.value : (box.textContent || ''));
    if (typed || (current.trim() && current.trim() !== String(text || '').trim())) {
      return { wrote: false, reason: 'user-typed' };
    }
    if (filled) return { wrote: false, reason: 'already-filled' };
    let writing = true;
    const onInput = () => {
      if (writing) return;
      box.__glanceUserTyped = true;
      if (box.setAttribute) box.setAttribute('data-glance-user-typed', '1');
    };
    if (box.addEventListener) box.addEventListener('input', onInput);
    const write = opts && opts.write;
    if (typeof write === 'function') write(box, String(text || ''));
    else if (box.value != null && typeof box.value === 'string') box.value = String(text || '');
    else box.textContent = String(text || '');
    writing = false;
    box.__glanceFilled = true;
    if (box.setAttribute) box.setAttribute('data-glance-filled', '1');
    return { wrote: true };
  }

  return {
    userEditedLine, unconfirmedLine, snapshotOf, userEdited, compareContent, CONTENT_KEYS, BODY_PREFIX,
    fillOnce, textOf, normText, clockOf
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowNativeEdit = FlowNativeEdit;
if (typeof module !== 'undefined') module.exports = { FlowNativeEdit };
