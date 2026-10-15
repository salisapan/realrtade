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
  function normText(value) {
    return textOf(value)
      .replace(/<[^>]+>/g, ' ')
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

  function importanceOf(value) {
    return plain(value).toLowerCase();
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

  function minutesOf(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'boolean') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function emptyToNull(value) {
    if (value == null || value === '') return null;
    return value;
  }

  // Every user-editable field. Server fields (lastModifiedDateTime,
  // @odata.etag, changeKey, cTag, eTag) are not in this list.
  const CONTENT_KEYS = [
    'title', 'subject', 'name', 'body', 'dueDateTime', 'status', 'start', 'end',
    'location', 'to', 'cc', 'importance', 'attendees', 'categories', 'isAllDay',
    'isReminderOn', 'reminderMinutesBeforeStart', 'reminderDateTime'
  ];

  function rawFor(key, o) {
    if (key === 'to') return o.toRecipients || o.to;
    if (key === 'cc') return o.ccRecipients || o.cc;
    return o[key];
  }

  function fieldValue(key, raw) {
    if (key === 'body') return emptyToNull(normText(raw));
    if (key === 'dueDateTime' || key === 'start' || key === 'end' || key === 'reminderDateTime') return emptyToNull(clockOf(raw));
    if (key === 'to' || key === 'cc' || key === 'attendees') return emptyToNull(addressesOf(raw));
    if (key === 'location') return emptyToNull(locationOf(raw));
    if (key === 'categories') return emptyToNull(categoriesOf(raw));
    if (key === 'importance') return emptyToNull(importanceOf(raw));
    if (key === 'isAllDay' || key === 'isReminderOn') return boolOf(raw);
    if (key === 'reminderMinutesBeforeStart') return minutesOf(raw);
    if (key === 'status') return emptyToNull(plain(raw));
    return emptyToNull(plain(raw));
  }

  // Every content key is present. An empty field is null, not omitted,
  // so clearing it later is a difference.
  function snapshotOf(obj) {
    const o = obj || {};
    const snap = {};
    for (let i = 0; i < CONTENT_KEYS.length; i++) {
      const key = CONTENT_KEYS[i];
      snap[key] = fieldValue(key, rawFor(key, o));
    }
    return snap;
  }

  // 'edited' when a stored field differs, including empty versus a value.
  // 'unconfirmed' when the live object has a field the snapshot never stored.
  // 'match' only when every stored field matches and nothing new is present.
  // The snapshot's own keys are what it stored. Normalizing it as a fresh
  // snapshot would invent nulls and hide a field it never recorded.
  function compareContent(snapshot, live) {
    if (!snapshot || !live || typeof snapshot !== 'object') return 'unconfirmed';
    const liveSnap = snapshotOf(live);
    let unseen = false;
    for (let i = 0; i < CONTENT_KEYS.length; i++) {
      const key = CONTENT_KEYS[i];
      const liveVal = liveSnap[key];
      if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
        if (liveVal != null) unseen = true;
        continue;
      }
      if (fieldValue(key, snapshot[key]) !== liveVal) return 'edited';
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
    userEditedLine, unconfirmedLine, snapshotOf, userEdited, compareContent, CONTENT_KEYS,
    fillOnce, textOf, normText, clockOf
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowNativeEdit = FlowNativeEdit;
if (typeof module !== 'undefined') module.exports = { FlowNativeEdit };
