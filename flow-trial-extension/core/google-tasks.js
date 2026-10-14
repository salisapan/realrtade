// One Google Task. Creating it is not the close: Handled waits for a GET
// of that id. Undo deletes that task. Portable: no chrome.*, no DOM, no network.
const FlowGoogleTasks = (() => {
  const SYSTEM = 'google/tasks';
  const CONNECTOR = 'googleLaneTask';
  const API = 'https://tasks.googleapis.com/tasks/v1';

  function cfg() {
    return typeof FlowGoogleConfig !== 'undefined' ? FlowGoogleConfig : null;
  }

  function hasWriteScope(scopes) {
    const C = cfg();
    if (!C) return null;
    return C.hasScope(scopes, C.SCOPE_TASKS);
  }

  function listIdOf(input) {
    const i = input || {};
    const id = String(i.taskListId || i.listId || '').trim();
    if (!id || id.length > 200 || /[\/\\\s]/.test(id)) return '';
    return id;
  }

  function taskBody(input) {
    const i = input || {};
    const title = String(i.title || i.label || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 1024);
    if (!title) return null;
    const body = { title: title };
    const notes = i.notes ? String(i.notes).slice(0, 8192) : '';
    if (notes) body.notes = notes;
    if (typeof i.dueIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(i.dueIso)) body.due = i.dueIso + 'T00:00:00.000Z';
    return body;
  }

  function taskUrl(listId, taskId) {
    return API + '/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId);
  }

  function createRequest(listId, body) {
    if (!listId || !body) return null;
    return { method: 'POST', url: API + '/lists/' + encodeURIComponent(listId) + '/tasks', json: body };
  }

  function undoRequest(listId, taskId) {
    if (!listId || !taskId) return null;
    return { method: 'DELETE', url: taskUrl(listId, taskId) };
  }

  function hash(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

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

  async function write(input, http, clock) {
    const C = cfg();
    const i = input || {};
    const blocked = C && C.gate(i.scopes, C.SCOPE_TASKS, 'tasks-not-granted');
    if (blocked) return blocked;
    const listId = listIdOf(i);
    const body = taskBody(i);
    const req = createRequest(listId, body);
    if (!req) return { ok: false, reason: 'unclear', error: 'Nothing to put on the task.' };
    const posted = await call(http, Object.assign({ body: JSON.stringify(req.json), headers: { 'Content-Type': 'application/json' } }, req));
    if (posted.status === 401 || posted.status === 403) return { ok: false, reason: 'not-connected' };
    if (!posted.ok) return { ok: false, reason: 'http-' + posted.status };
    const task = posted.json || {};
    const written = 'Google Task · ' + body.title;
    const base = { where: 'Google Tasks', target: 'Glance list', written: written, url: null };
    if (!task.id) return Object.assign({ ok: false, reason: 'proof_pending', ref: null, proof: null }, base);
    const got = await call(http, { method: 'GET', url: taskUrl(listId, task.id) });
    if (!got.ok || !got.json || got.json.id !== task.id || got.json.deleted) {
      return Object.assign({ ok: false, reason: 'verify_failed', ref: { taskListId: listId, taskId: task.id, externalId: task.id }, proof: null }, base);
    }
    const link = 'https://tasks.google.com/embed/list/' + encodeURIComponent(listId) + '?pli=1';
    base.url = link;
    const proof = C && C.proofOf(SYSTEM, task.id, link, C.clockIso(clock));
    const ref = { taskListId: listId, taskId: task.id, externalId: task.id, contentHash: contentHash(got.json) };
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof }, base);
  }

  async function undo(ref, http) {
    const taskId = ref && (ref.externalId || ref.taskId);
    const listId = ref && (ref.taskListId || ref.listId);
    const req = undoRequest(listId, taskId);
    if (!req) return { ok: false };
    if (ref && ref.contentHash) {
      const got = await call(http, { method: 'GET', url: taskUrl(listId, taskId) });
      if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
      if (got.status === 404) return { ok: true, written: 'Google Task removed.' };
      if (!got.ok || !got.json) return { ok: false, reason: 'http-' + got.status };
      if (contentHash(got.json) !== ref.contentHash) {
        return { ok: false, reason: 'user-edited', error: 'Undo stopped. You changed the task, so it was left as you left it.' };
      }
    }
    const del = await call(http, req);
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (del.ok || del.status === 204 || del.status === 404) return { ok: true, written: 'Google Task removed.' };
    return { ok: false, reason: 'http-' + del.status };
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    hasWriteScope: hasWriteScope,
    taskBody: taskBody,
    contentHash: contentHash,
    createRequest: createRequest,
    undoRequest: undoRequest,
    write: write,
    undo: undo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleTasks };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleTasks = FlowGoogleTasks;
