// The consent catalogue — the data behind the one sweeping consent screen (owner, 2026-10-13: "select all, one checkbox
// per service"). Portable: no chrome.*, no DOM, no network, no UI. The owner designs the screen; this decides what a tick
// means.
//
// One entry per service: id, label, one honest line, group, the permission steps a tick needs, and a state:
//   built         works today and is on by default for the person who ticks it
//   experimental  built and tested against a mock or behind an off switch; the person may tick it, nothing runs until they do
//   coming        listed so the screen can say so; NEVER selected by "Select all" and never produces a permission step
// stepsFor(ids) returns exactly the permission steps for the ticked ids and nothing else. Nothing is asked until ticked.
// A new connector adds ONE entry here (docs/glance-ai/connectors-queue.md). Mail.Send is never a step.
const FlowConsentCatalog = (() => {
  const STATES = ['built', 'experimental', 'coming'];
  const GROUPS = ['google', 'microsoft', 'chat', 'tasks', 'files', 'sign', 'meetings', 'payments', 'learning'];

  const SERVICES = [
    { id: 'google', label: 'Google', detail: 'Gmail drafts, Tasks, Calendar and Drive files Glance itself creates. Never sends.', group: 'google', state: 'built',
      steps: [{ type: 'google-signin' }] },
    { id: 'ms-mail', label: 'Outlook mail', detail: 'Read mail and write a reply draft. Never sends.', group: 'microsoft', state: 'built',
      steps: [{ type: 'microsoft-service', service: 'mail' }] },
    { id: 'ms-todo', label: 'Microsoft To Do', detail: 'Add one task. Glance reads it back before it is handled. Undo deletes it.', group: 'microsoft', state: 'built',
      steps: [{ type: 'microsoft-service', service: 'todo' }] },
    { id: 'ms-calendar', label: 'Outlook calendar', detail: 'Place one named file on the calendar. Never invites anyone.', group: 'microsoft', state: 'built',
      steps: [{ type: 'microsoft-service', service: 'calendar' }] },
    { id: 'ms-onedrive', label: 'OneDrive', detail: 'Write one file, read it back, undo that write.', group: 'microsoft', state: 'built',
      steps: [{ type: 'microsoft-service', service: 'onedrive' }] },
    { id: 'ms-contacts', label: 'Outlook contacts', detail: 'Read contacts.', group: 'microsoft', state: 'built',
      steps: [{ type: 'microsoft-service', service: 'contacts' }] },
    { id: 'ms-teams', label: 'Teams chats', detail: 'Read chats you are in.', group: 'microsoft', state: 'built',
      steps: [{ type: 'microsoft-service', service: 'teams' }] },
    { id: 'notion', label: 'Notion', detail: 'Add one row to the Notion database you pick, then read it back. Undo archives it. Nothing else in your workspace is read.', group: 'tasks', state: 'experimental',
      steps: [{ type: 'oauth-relay', vendor: 'notion' }, { type: 'host-permission', origin: 'https://api.notion.com/*' }] },
    { id: 'asana', label: 'Asana', detail: 'Add one task to the Asana project you pick, then read it back. Undo removes it. Nothing else in your workspace is read.', group: 'tasks', state: 'experimental',
      steps: [{ type: 'oauth-relay', vendor: 'asana' }, { type: 'host-permission', origin: 'https://app.asana.com/*' }] },
    // Listed so the screen can show them honestly. Select all never includes these.
    { id: 'jira', label: 'Jira', detail: 'Create one issue and read it back.', group: 'tasks', state: 'coming', steps: [] },
    { id: 'linear', label: 'Linear', detail: 'Create one issue and read it back.', group: 'tasks', state: 'coming', steps: [] },
    { id: 'docusign', label: 'DocuSign', detail: 'Count a request closed when the envelope is signed.', group: 'sign', state: 'coming', steps: [] },
    { id: 'dropbox', label: 'Dropbox', detail: 'Save one file and read it back.', group: 'files', state: 'coming', steps: [] },
    { id: 'zoom', label: 'Zoom', detail: 'Create one meeting link and read it back.', group: 'meetings', state: 'coming', steps: [] },
    { id: 'slack', label: 'Slack', detail: 'Count a request closed when the answer arrives in the DM.', group: 'chat', state: 'coming', steps: [] },
    { id: 'stripe', label: 'Stripe', detail: 'Count a request closed when the payment arrives.', group: 'payments', state: 'coming', steps: [] },
    // Path D (docs/glance-ai/learning-from-use.md): dormant until the owner approves the consent and privacy text. Off by default.
    { id: 'contribute', label: 'Help improve Glance (no text leaves your device)', detail: 'Share noisy statistics only. Off by default; not available yet.', group: 'learning', state: 'coming', steps: [] }
  ];

  function all() { return SERVICES.map((s) => Object.assign({}, s, { steps: s.steps.map((x) => Object.assign({}, x)) })); }
  function byId(id) { for (let i = 0; i < SERVICES.length; i++) if (SERVICES[i].id === id) return SERVICES[i]; return null; }
  function tickable(s) { return !!s && (s.state === 'built' || s.state === 'experimental'); }

  // "Select all" = every service that is built or experimental. A `coming` service is never selected.
  function selectAll() { return SERVICES.filter(tickable).map((s) => s.id); }

  function groups() {
    const out = {};
    GROUPS.forEach((g) => { out[g] = SERVICES.filter((s) => s.group === g).map((s) => s.id); });
    return out;
  }

  // From the ticked ids, exactly the steps to run. Unknown ids and `coming` ids are dropped (and reported), duplicates are
  // collapsed, and no Send permission can appear. Microsoft service ticks arrive as ONE step with the service list, because
  // the person signs in to Microsoft once.
  function stepsFor(ids) {
    const want = [];
    (Array.isArray(ids) ? ids : []).forEach((id) => { if (typeof id === 'string' && want.indexOf(id) < 0) want.push(id); });
    const steps = [];
    const dropped = [];
    const msServices = [];
    const seen = {};
    want.forEach((id) => {
      const s = byId(id);
      if (!tickable(s)) { dropped.push(id); return; }
      s.steps.forEach((st) => {
        if (/send/i.test(JSON.stringify(st))) return;
        if (st.type === 'microsoft-service') { if (msServices.indexOf(st.service) < 0) msServices.push(st.service); return; }
        const key = JSON.stringify(st);
        if (seen[key]) return;
        seen[key] = true;
        steps.push(Object.assign({ for: id }, st));
      });
    });
    if (msServices.length) steps.unshift({ type: 'microsoft-signin', services: msServices });
    return { steps: steps, dropped: dropped };
  }

  return { STATES: STATES, GROUPS: GROUPS, all: all, byId: byId, selectAll: selectAll, groups: groups, stepsFor: stepsFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowConsentCatalog };
else if (typeof globalThis !== 'undefined') globalThis.FlowConsentCatalog = FlowConsentCatalog;
