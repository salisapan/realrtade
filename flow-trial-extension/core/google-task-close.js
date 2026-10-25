// Closing a task Glance wrote: the person says the thing is done ("Waiting on Dana: Payment 500 NIS" and Dana wrote that it is paid),
// the person approves, and the task is marked completed in Google Tasks. Completing is not enough: Handled waits for a GET of that
// task showing status completed. A task the person changed since Glance wrote it (title, notes or due day) is left exactly as it is.
// Undo reopens it, and only when it is still completed and still unchanged. Portable: no chrome.*, no DOM, no network.
const FlowGoogleTaskClose = (() => {
  const SYSTEM = 'google/tasks-close';
  const CONNECTOR = 'googleTaskClose';
  const API = 'https://tasks.googleapis.com/tasks/v1';
  const READ_BACK_DELAYS = [250, 500, 750, 1000, 500];

  function cfg() {
    return typeof FlowGoogleConfig !== 'undefined' ? FlowGoogleConfig : null;
  }

  function idOf(v) {
    const id = String(v || '').trim();
    return id && id.length <= 200 && !/[\/\\\s]/.test(id) ? id : '';
  }

  function taskUrl(listId, taskId) {
    return API + '/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId);
  }

  function hash(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  // The same content hash core/google-tasks.js keeps in its ref: title, notes and due day. A status change is not an edit.
  function contentHash(task) {
    const title = task && task.title ? String(task.title) : '';
    const notes = task && task.notes ? String(task.notes) : '';
    const due = task && task.due ? String(task.due) : '';
    return hash(title + '\n' + notes + '\n' + due);
  }

  async function call(http, req) {
    try {
      const res = await http(req);
      const status = res && typeof res.status === 'number' ? res.status : 0;
      return { status: status, ok: !!(res && (res.ok === true || (status >= 200 && status < 300))), json: res && res.json ? res.json : null };
    } catch (e) {
      return { status: 0, ok: false, json: null };
    }
  }

  function pause(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function denied(status) {
    return status === 401 || status === 403;
  }

  // Reads the task until it shows the wanted status (Google can lag a moment), or the waits run out.
  async function readUntil(http, listId, taskId, wanted, delays) {
    const waits = Array.isArray(delays) ? delays : READ_BACK_DELAYS;
    let got = await call(http, { method: 'GET', url: taskUrl(listId, taskId) });
    for (let n = 0; n < waits.length && !(got.ok && got.json && got.json.status === wanted); n++) {
      await pause(waits[n]);
      got = await call(http, { method: 'GET', url: taskUrl(listId, taskId) });
    }
    return got;
  }

  function userEdited() {
    return { ok: false, reason: 'user-edited', error: 'You changed this task, so I left it as you left it.' };
  }

  // input: { taskListId, taskId, contentHash, readBackDelays?, scopes? }. ref: { taskListId, taskId, externalId, contentHash }.
  async function write(input, http, clock) {
    const C = cfg();
    const i = input || {};
    const blocked = C && C.gate(i.scopes, C.SCOPE_TASKS, 'tasks-not-granted');
    if (blocked) return blocked;
    const listId = idOf(i.taskListId || i.listId);
    const taskId = idOf(i.taskId || i.externalId);
    if (!listId || !taskId || !i.contentHash) return { ok: false, reason: 'unclear', error: 'No single task to close.' };
    const before = await call(http, { method: 'GET', url: taskUrl(listId, taskId) });
    if (denied(before.status)) return { ok: false, reason: 'not-connected' };
    if (before.status === 404 || before.status === 410) return { ok: false, reason: 'not-found', error: 'That task is gone, so there is nothing to close.' };
    if (!before.ok || !before.json || before.json.deleted) return { ok: false, reason: 'http-' + before.status };
    if (contentHash(before.json) !== String(i.contentHash)) return userEdited();
    const title = String(before.json.title || '');
    if (before.json.status === 'completed') {
      // Already done (the person ticked it themselves): nothing to write, and the read is the proof.
      return finish(C, listId, taskId, before.json, title, clock, false);
    }
    const patched = await call(http, { method: 'PATCH', url: taskUrl(listId, taskId), body: JSON.stringify({ status: 'completed' }), headers: { 'Content-Type': 'application/json' }, json: { status: 'completed' } });
    if (denied(patched.status)) return { ok: false, reason: 'not-connected' };
    if (!patched.ok) return { ok: false, reason: 'http-' + patched.status };
    const got = await readUntil(http, listId, taskId, 'completed', i.readBackDelays);
    if (!got.ok || !got.json || got.json.id !== taskId || got.json.status !== 'completed') {
      return { ok: false, reason: 'verify_failed', ref: { taskListId: listId, taskId: taskId, externalId: taskId, contentHash: String(i.contentHash) }, proof: null, title: title };
    }
    return finish(C, listId, taskId, got.json, title, clock, true);
  }

  function finish(C, listId, taskId, task, title, clock, wrote) {
    const link = 'https://tasks.google.com/embed/list/' + encodeURIComponent(listId) + '?pli=1';
    const ref = { taskListId: listId, taskId: taskId, externalId: taskId, contentHash: contentHash(task), closedByGlance: wrote === true };
    const proof = C && C.proofOf(SYSTEM, taskId, link, C.clockIso(clock));
    const base = { where: 'Google Tasks', target: 'Google Tasks', written: 'Google Task done · ' + title, url: link, title: title };
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof }, base);
  }

  // Reopens a task Glance completed, only when it is still completed by that close and still has the content Glance saw.
  async function undo(ref, http) {
    const listId = idOf(ref && (ref.taskListId || ref.listId));
    const taskId = idOf(ref && (ref.taskId || ref.externalId));
    if (!listId || !taskId || !ref.contentHash) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    if (ref.closedByGlance === false) return { ok: true, written: 'It was already done before, so it stays done.' };
    const got = await call(http, { method: 'GET', url: taskUrl(listId, taskId) });
    if (denied(got.status)) return { ok: false, reason: 'not-connected' };
    if (got.status === 404 || got.status === 410) return { ok: true, written: 'The task is gone.' };
    if (!got.ok || !got.json) return { ok: false, reason: 'http-' + got.status };
    if (contentHash(got.json) !== String(ref.contentHash)) return userEdited();
    if (got.json.status !== 'completed') return { ok: true, written: 'Google Task is open again.' };
    const body = { status: 'needsAction', completed: null };
    const patched = await call(http, { method: 'PATCH', url: taskUrl(listId, taskId), body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, json: body });
    if (denied(patched.status)) return { ok: false, reason: 'not-connected' };
    if (!patched.ok) return { ok: false, reason: 'http-' + patched.status };
    const back = await readUntil(http, listId, taskId, 'needsAction', undefined);
    if (!back.ok || !back.json || back.json.status === 'completed') return { ok: false, reason: 'unverified', error: 'Not verified: Google still shows the task as done.' };
    return { ok: true, written: 'Google Task is open again.' };
  }

  return { SYSTEM: SYSTEM, CONNECTOR: CONNECTOR, contentHash: contentHash, write: write, undo: undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleTaskClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleTaskClose = FlowGoogleTaskClose;
