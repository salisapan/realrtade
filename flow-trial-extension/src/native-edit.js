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

  function put(snap, key, value) {
    if (value == null || value === '') return;
    snap[key] = value;
  }

  // Content the person can change. Server fields (lastModifiedDateTime,
  // @odata.etag, changeKey, cTag) are not content and are not stored.
  function snapshotOf(obj) {
    const o = obj || {};
    const snap = {};
    put(snap, 'title', o.title != null ? String(o.title).replace(/\s+/g, ' ').trim() : '');
    put(snap, 'subject', o.subject != null ? String(o.subject).replace(/\s+/g, ' ').trim() : '');
    put(snap, 'name', o.name != null ? String(o.name).replace(/\s+/g, ' ').trim() : '');
    put(snap, 'body', normText(o.body));
    put(snap, 'dueDateTime', clockOf(o.dueDateTime));
    put(snap, 'status', o.status != null ? String(o.status).trim() : '');
    put(snap, 'start', clockOf(o.start));
    put(snap, 'end', clockOf(o.end));
    put(snap, 'location', locationOf(o.location));
    put(snap, 'to', addressesOf(o.toRecipients || o.to));
    return snap;
  }

  const CONTENT_KEYS = ['title', 'subject', 'name', 'body', 'dueDateTime', 'status', 'start', 'end', 'location', 'to'];

  // A stored content field that the live object also has, and that no longer
  // matches, is an edit. A field the live read omitted is not an edit.
  // A new etag, changeKey, or lastModifiedDateTime is not an edit.
  function userEdited(snapshot, live) {
    if (!snapshot || !live) return false;
    const kept = snapshotOf(snapshot);
    const liveSnap = snapshotOf(live);
    for (let i = 0; i < CONTENT_KEYS.length; i++) {
      const key = CONTENT_KEYS[i];
      if (kept[key] == null || kept[key] === '') continue;
      if (liveSnap[key] == null || liveSnap[key] === '') continue;
      if (String(liveSnap[key]) !== String(kept[key])) return true;
    }
    return false;
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

  return { userEditedLine, unconfirmedLine, snapshotOf, userEdited, fillOnce, textOf, normText, clockOf };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowNativeEdit = FlowNativeEdit;
if (typeof module !== 'undefined') module.exports = { FlowNativeEdit };
