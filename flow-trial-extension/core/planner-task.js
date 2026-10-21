// "Add the task 'X' to the Website relaunch plan" becomes a task in that
// Microsoft Planner plan (ecosystem gap: Planner). Portable: no chrome.*, no
// DOM, no network. Behind the off switch PLANNER_TASK (default off).
//
// The close is a Planner task that exists in the named plan with that title
// (and the date, when the mail gave one). Glance offers one Do It. The plan
// must be named in the request and be exactly one of the plans the person is
// a member of (listed by the host); a missing, unknown or ambiguous plan is
// silence, Glance never picks a plan or invents a title. After the click
// Glance creates the task with no assignee (so nobody is notified), reads it
// back by id and says Handled only when title, plan and date match. Undo
// deletes it with the entity tag from the read-back (If-Match), so a task the
// person edited since is left alone.
//
// Delegated `Tasks.ReadWrite` covers Planner as well as To Do; it is already
// requested when the To Do box is ticked. No new scope. Never Mail.Send.
//
// The host injects graph(method, path, body?, headers?) -> Promise<{ status,
// ok, json }> against https://graph.microsoft.com/v1.0. No src/ file calls
// this yet.
const FlowPlannerTask = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'PLANNER_TASK';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'microsoft/planner';
  const CONNECTOR = 'plannerTask';
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';

  const QUOTED = '["“\'‘]([^"”\'’\\n]{3,100})["”\'’]';
  // add a task "X" to the Y plan  /  add a task to review the contract on the Y plan
  const ADD_EN = new RegExp('\\b(?:add|put|create|log|track|set\\s+up)\\s+(?:a\\s+|the\\s+)?(?:new\\s+)?task\\s*(?::|to|for)?\\s*(?:' + QUOTED + '|([^"“”\\n.;?!]{3,100}?))\\s+(?:to|on|in|into|under)\\s+(?:the\\s+|our\\s+)?([^"“”\\n.;?!,]{2,60}?)\\s+(?:plan|board|planner)\\b', 'i');
  const ADD_EN2 = new RegExp('\\b(?:add|put)\\s+' + QUOTED + '\\s+(?:to|on|in|into)\\s+(?:the\\s+|our\\s+)?([^"“”\\n.;?!,]{2,60}?)\\s+(?:plan|board|planner)\\b', 'i');
  const ADD_HE = new RegExp('(?:תוסיף(?:י|ו)?|הוסף(?:י|ו)?|תפתח(?:י|ו)?|תיצור|תיצרי)\\s+(?:בבקשה\\s+)?משימה\\s*(?::|בשם)?\\s*(?:' + QUOTED + '|([^"“”\\n.;?!]{3,100}?))\\s+(?:ל|ב|אל\\s+)(?:תוכנית|תכנית|לוח)\\s+(?:ה)?([^"“”\\n.;?!,]{2,60}?)(?=\\s*(?:[.;?!,]|\\s+(?:עד|לפני|בבקשה)(?:\\s|$)|$))');
  const ASK = /\b(?:please|can you|could you|would you|will you|kindly|i need you to|we need you to|let'?s)\b|^\s*(?:add|put|create|log|track)\b|בבקשה|אפשר|תוכל|תוכלי|תוכלו|^\s*(?:תוסיף|הוסף|תפתח|תיצור)/i;
  const NEG = /\b(?:no need to|don'?t need to|do not|don'?t)\s+(?:add|create|put|log)\b|אין\s+צורך|אל\s+תוסיף|לא\s+צריך/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|if it helps|no pressure|sometime|at some point|might)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך/i;
  const FYI = /\b(?:fyi|for your information|no action needed)\b|לידיעתך|לידיעה/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:add|create|put|log)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;
  const OTHER_APP = /\b(?:jira|asana|trello|clickup|monday|linear|notion|todoist|google\s+tasks|to\s*do\b)\b|ג'ירה|אסאנה|טרלו|מאנדיי/i;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function clean(raw, max) {
    const s = String(raw || '').replace(/[\r\n]+/g, ' ').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
    if (s.length < 3 || s.length > max) return '';
    return s;
  }

  function isoOf(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  // The ask, or silence with a reason.
  function recognize(text, now) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim()) return { kind: 'ignore' };
    const lang = /[֐-׿]/.test(s) ? 'he' : 'en';
    let title;
    let plan;
    let m = null;
    if (lang === 'he') {
      m = s.match(ADD_HE);
      if (m) { title = m[1] || m[2]; plan = m[3]; }
    } else {
      m = s.match(ADD_EN);
      if (m) { title = m[1] || m[2]; plan = m[3]; } else {
        m = s.match(ADD_EN2);
        if (m) { title = m[1]; plan = m[2]; }
      }
    }
    if (!m) return { kind: 'ignore' };
    if (OTHER_APP.test(s)) return { kind: 'block', reason: 'other-app' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (FYI.test(s)) return { kind: 'block', reason: 'fyi' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (THIRD.test(s) || (attach && attach.asksThirdParty && attach.asksThirdParty(s))) return { kind: 'block', reason: 'third-party' };
    if (!ASK.test(s)) return { kind: 'block', reason: 'no-request' };
    const name = clean(title, 100);
    const planName = clean(plan, 60);
    if (!name) return { kind: 'block', reason: 'no-title' };
    if (!planName) return { kind: 'block', reason: 'no-plan' };
    let dueIso = null;
    if (extract) {
      const at = now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now());
      const d = extract.parseDate(s, at);
      if (d && d.iso && d.iso >= isoOf(at)) dueIso = d.iso;
    }
    return { kind: 'clear', lang: lang, title: name, planName: planName, dueIso: dueIso };
  }

  function norm(t) {
    return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  // The plans the host listed (GET /me/planner/plans) → the one that is named.
  function pickPlan(plans, planName) {
    if (!Array.isArray(plans)) return { reason: 'not-listed' };
    const want = norm(planName);
    const hit = plans.filter((p) => p && typeof p.id === 'string' && norm(p.title) === want);
    if (hit.length === 0) return { reason: 'unknown-plan' };
    if (hit.length > 1) return { reason: 'ambiguous-plan' };
    return { plan: { id: hit[0].id, title: String(hit[0].title) } };
  }

  function silence(reason) {
    return { action: 'silence', reason: reason };
  }

  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text, input.now);
    if (r.kind !== 'clear') return silence(r.reason || 'no-ask');
    const picked = pickPlan(input.plans, r.planName);
    if (!picked.plan) return silence(picked.reason);
    const he = r.lang === 'he';
    const due = r.dueIso ? (he ? ' (עד ' + r.dueIso + ')' : ' (due ' + r.dueIso + ')') : '';
    return {
      action: 'offer',
      approval: 'DoIt',
      title: r.title,
      plan: picked.plan,
      dueIso: r.dueIso,
      line: he ? 'להוסיף ל-Planner, בתוכנית ' + picked.plan.title + ', משימה: ' + r.title + due + '?' : 'Add to Planner, in the ' + picked.plan.title + ' plan, the task: ' + r.title + due + '?',
      steps: [{ id: 'task', kind: 'task', label: he ? 'יצירת המשימה בתוכנית ובדיקה חוזרת (בלי לשייך לאף אחד)' : 'Create the task in the plan and read it back (assigned to no one)', proof: SYSTEM }],
      lang: r.lang
    };
  }

  function taskPath(id) {
    return '/planner/tasks/' + encodeURIComponent(id);
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  function dayOf(dt) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(dt || ''));
    return m ? m[1] : '';
  }

  // Do It. The host passes the plan card's plan, title and date as the person saw them.
  async function create(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    if (typeof io.graph !== 'function') return miss('no-host');
    const planId = input.plan && typeof input.plan.id === 'string' ? input.plan.id : '';
    const title = clean(input.title, 100);
    if (!planId || !title) return miss('unclear');
    const dueIso = /^\d{4}-\d{2}-\d{2}$/.test(String(input.dueIso || '')) ? input.dueIso : null;
    const graph = io.graph;
    const body = { planId: planId, title: title, assignments: {} };
    if (dueIso) body.dueDateTime = dueIso + 'T12:00:00Z';
    const posted = await graph('POST', '/planner/tasks', body);
    if (posted.status === 401 || posted.status === 403) return miss('not-connected');
    if (!posted.ok || !posted.json || !posted.json.id) return miss('write-failed');
    const id = posted.json.id;
    const ref = { taskId: id, externalId: id, planId: planId, createdByGlance: true, etag: posted.json['@odata.etag'] || null };
    // Nothing stays in the plan that the card does not own: a task that cannot
    // be confirmed is deleted again, and if that fails the ref is kept for Undo.
    const withdraw = async (why, etag) => {
      const gone = await graph('DELETE', taskPath(id), undefined, { 'If-Match': etag || ref.etag || '*' });
      const removed = !!(gone.ok || gone.status === 204 || gone.status === 404);
      return miss(FAILED, { ref: removed ? null : ref, removed: removed, why: why, taskId: id });
    };
    const back = await graph('GET', taskPath(id));
    if (!back.ok || !back.json || back.json.id !== id) return withdraw('get-' + back.status);
    const t = back.json;
    const etag = t['@odata.etag'] || ref.etag;
    if (String(t.title || '') !== title) return withdraw('title-differs', etag);
    if (t.planId !== planId) return withdraw('plan-differs', etag);
    if (dueIso && dayOf(t.dueDateTime) !== dueIso) return withdraw('date-differs', etag);
    if (t.assignments && Object.keys(t.assignments).length) return withdraw('has-assignee', etag);
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const finalRef = Object.assign({}, ref, { etag: etag || null });
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: id, url: '', fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: finalRef });
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'Microsoft Planner',
      target: String(input.plan.title || 'your plan'),
      written: 'Planner · ' + title + (dueIso ? ' · ' + dueIso : ''),
      proof: proof,
      ref: finalRef,
      // The task exists in the plan; whether the work is done is not claimed.
      loopClosed: true
    };
  }

  // Undo: delete the task, only while its entity tag is still the one read back.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.taskId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.graph !== 'function') return { ok: false, reason: 'no-host' };
    const got = await io.graph('GET', taskPath(ref.taskId));
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404) return { ok: true, undone: true, externalId: ref.taskId };
    if (!got.ok || !got.json) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    const live = got.json['@odata.etag'];
    if (!ref.etag || !live) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    if (live !== ref.etag) return { ok: false, reason: 'user-edited', undoUnavailable: true, error: 'You edited this. Undo left it alone.' };
    const del = await io.graph('DELETE', taskPath(ref.taskId), undefined, { 'If-Match': live });
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (del.status === 412) return { ok: false, reason: 'user-edited', undoUnavailable: true, error: 'You edited this. Undo left it alone.' };
    if (!(del.ok || del.status === 204 || del.status === 404)) return { ok: false, reason: 'undo-failed' };
    const after = await io.graph('GET', taskPath(ref.taskId));
    return after.status === 404 ? { ok: true, undone: true, externalId: ref.taskId } : { ok: false, reason: 'undo-unverified' };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, CONNECTOR, enabled, recognize, pickPlan, plan, create, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowPlannerTask };
else if (typeof globalThis !== 'undefined') globalThis.FlowPlannerTask = FlowPlannerTask;
