// Application (client) ID of the registered "Glance Outlook" Microsoft Entra app. It is not a secret:
// a public client (PKCE, no client secret) that identifies the app, not a person. An empty string still
// means the Outlook row says "Not set up yet" and nothing can connect or read anything.
//
// Registration (docs/multi-platform.md, "Outlook"): any Entra tenant plus personal Microsoft accounts,
// so the authority stays /common rather than one directory. Platform is "Single-page application"
// (verified live 2026-10-05: "Mobile and desktop" fails with invalid_request / likely AADSTS9002326
// because the token POST from the extension carries Origin: chrome-extension://...). Redirect
// https://<this extension's id>.chromiumapp.org/ from chrome.identity.getRedirectURL() (pinned by
// manifest.json "key"). SPA refresh tokens last 24h and do not slide; silent renewal (outlook-auth
// silentReauth) renews without a window before that window ends.
//
// Delegated Graph on the default sign-in: Mail.Read, Mail.ReadWrite (drafts only, by code:
// createReply / PATCH / DELETE of Glance's own draft on the person's Do It), User.Read,
// offline_access. Tasks.ReadWrite is the To Do checkbox, not Mail. Never Mail.Send. Glance
// never sends on the person's behalf. The Entra app must list Tasks.ReadWrite or the To Do
// box's consent fails until the person signs in again with that box checked.
const FlowOutlookConfig = {
  CLIENT_ID: '22682454-808b-41e5-80fe-6abadc1d5595',
  AUTHORITY: 'https://login.microsoftonline.com/common',
  GRAPH: 'https://graph.microsoft.com/v1.0',
  // Default sign-in: mail only. scopesFor() adds a service's scopes only when
  // that box is checked on the one Connect screen. Never Mail.Send.
  SCOPES: ['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite'],
  // One screen: Select all, then one checkbox per service. Mail is required.
  // To Do asks Tasks.ReadWrite only when that box is checked. Calendar asks
  // Calendars.ReadWrite only when that box is checked. The Entra app must list
  // that delegated permission or consent for the box fails.
  // OneDrive search from a mail is not built; the box only grants Files.Read.
  CONNECT_SERVICES: [
    { id: 'mail', label: 'Mail', detail: 'Read mail and write a reply draft. Never sends.', scopes: ['Mail.Read', 'Mail.ReadWrite'], required: true },
    { id: 'todo', label: 'To Do', detail: 'Add one task on a task-only Do It. Glance reads it back before it is handled. Undo deletes that task.', scopes: ['Tasks.ReadWrite'], required: false },
    // Write one event for a named file at a clock. Not added to the default
    // mail sign-in. Never Mail.Send, never Calendars.ReadWrite.Shared.
    { id: 'calendar', label: 'Calendar', detail: 'Place one named file on the calendar. Undo removes that event. Never invites anyone.', scopes: ['Calendars.ReadWrite'], required: false },
    { id: 'onedrive', label: 'OneDrive', detail: 'Read files you choose. A mail does not search OneDrive.', scopes: ['Files.Read'], required: false },
    { id: 'contacts', label: 'Contacts', detail: 'Read contacts.', scopes: ['Contacts.Read'], required: false },
    { id: 'teams', label: 'Teams', detail: 'Read chats you are in.', scopes: ['Chat.Read'], required: false }
  ],
  // How far back one check looks, and how many messages per folder (newest first). A bounded window, not "the mailbox".
  LOOKBACK_DAYS: 14,
  PAGE_SIZE: 50,
  MAX_PAGES: 2
};

// ids: service ids from the Connect screen. Mail is always included.
// Returns the scope list for that sign-in. Mail.Send is never included.
FlowOutlookConfig.scopesFor = function scopesFor(ids) {
  const want = {};
  (Array.isArray(ids) ? ids : []).forEach((id) => { want[String(id)] = true; });
  want.mail = true;
  const out = ['offline_access', 'User.Read'];
  (FlowOutlookConfig.CONNECT_SERVICES || []).forEach((svc) => {
    if (!svc || !want[svc.id]) return;
    (svc.scopes || []).forEach((sc) => {
      if (!sc || /Mail\.Send/i.test(sc) || /\.Send$/i.test(sc)) return;
      if (out.indexOf(sc) < 0) out.push(sc);
    });
  });
  return out;
};

FlowOutlookConfig.defaultConnectIds = function defaultConnectIds() {
  return ['mail'];
};

if (typeof module !== 'undefined') module.exports = { FlowOutlookConfig };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookConfig = FlowOutlookConfig;
