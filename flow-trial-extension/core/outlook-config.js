// Application (client) ID of the registered "Glance Outlook" Microsoft Entra app. It is not a secret:
// a public client (PKCE, no client secret) that identifies the app, not a person. An empty string still
// means the Outlook row says "Not set up yet" and nothing can connect or read anything.
//
// Registration (docs/multi-platform.md, "Outlook"): any Entra tenant plus personal Microsoft accounts,
// so the authority stays /common rather than one directory. Platform is "Mobile and desktop applications",
// public client flows on, redirect https://<this extension's id>.chromiumapp.org/ from
// chrome.identity.getRedirectURL() (pinned by manifest.json "key"). Delegated Graph only:
// Mail.Read, User.Read, offline_access. No write permission, ever.
const FlowOutlookConfig = {
  CLIENT_ID: '22682454-808b-41e5-80fe-6abadc1d5595',
  AUTHORITY: 'https://login.microsoftonline.com/common',
  GRAPH: 'https://graph.microsoft.com/v1.0',
  SCOPES: ['offline_access', 'Mail.Read', 'User.Read'],
  // How far back one check looks, and how many messages per folder (newest first). A bounded window, not "the mailbox".
  LOOKBACK_DAYS: 14,
  PAGE_SIZE: 50,
  MAX_PAGES: 2
};

if (typeof module !== 'undefined') module.exports = { FlowOutlookConfig };
