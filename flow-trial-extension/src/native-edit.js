// Glance never blocks the person. A draft, task, event, or file Glance
// created stays editable in the native tool. The body is written once.
// The first keystroke stops any later fill. Undo compares the creation
// snapshot and leaves the object alone when the person has changed it.
const FlowNativeEdit = (() => {
  function userEditedLine() {
    return 'You edited this. Undo left it alone.';
  }

  function textOf(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value.content != null) return String(value.content);
    return '';
  }

  function snapshotOf(obj) {
    const o = obj || {};
    const snap = {};
    if (o.changeKey) snap.changeKey = String(o.changeKey);
    if (o.lastModifiedDateTime) snap.lastModifiedDateTime = String(o.lastModifiedDateTime);
    if (o.eTag) snap.eTag = String(o.eTag);
    if (o.cTag) snap.cTag = String(o.cTag);
    const body = textOf(o.body);
    if (body) snap.body = body;
    if (o.title) snap.title = String(o.title);
    if (o.subject) snap.subject = String(o.subject);
    if (o.name) snap.name = String(o.name);
    return snap;
  }

  // A stored field that the live object also has, and that no longer matches,
  // is an edit. A field the live read omitted is not an edit.
  function userEdited(snapshot, live) {
    if (!snapshot || !live) return false;
    const keys = ['changeKey', 'lastModifiedDateTime', 'eTag', 'cTag', 'title', 'subject', 'name'];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (snapshot[key] == null || snapshot[key] === '') continue;
      if (live[key] == null || live[key] === '') continue;
      if (String(live[key]) !== String(snapshot[key])) return true;
    }
    if (snapshot.body) {
      const liveBody = textOf(live.body);
      if (liveBody && liveBody !== String(snapshot.body)) return true;
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

  return { userEditedLine, snapshotOf, userEdited, fillOnce, textOf };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowNativeEdit = FlowNativeEdit;
if (typeof module !== 'undefined') module.exports = { FlowNativeEdit };
