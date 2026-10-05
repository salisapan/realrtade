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
// Delegated Graph: Mail.Read, Mail.ReadWrite (drafts only, by code: createReply / PATCH / DELETE of
// Glance's own draft on the person's Do It), User.Read, offline_access. Never Mail.Send. Glance
// never sends on the person's behalf.
const FlowOutlookConfig = {
  CLIENT_ID: '22682454-808b-41e5-80fe-6abadc1d5595',
  AUTHORITY: 'https://login.microsoftonline.com/common',
  GRAPH: 'https://graph.microsoft.com/v1.0',
  SCOPES: ['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite'],
  // How far back one check looks, and how many messages per folder (newest first). A bounded window, not "the mailbox".
  LOOKBACK_DAYS: 14,
  PAGE_SIZE: 50,
  MAX_PAGES: 2
};

if (typeof module !== 'undefined') module.exports = { FlowOutlookConfig };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookConfig = FlowOutlookConfig;
