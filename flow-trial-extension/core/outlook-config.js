// The one value the owner must supply before Outlook can be connected: the Application (client) ID of a Microsoft Entra app
// registration. Until it is filled in, the Outlook row in the popup says "Not set up yet" and nothing can connect or read anything.
//
// How to get it (docs/multi-platform.md, "Outlook"):
//   1. Microsoft Entra admin center > App registrations > New registration. Supported account types: "Accounts in any organizational
//      directory and personal Microsoft accounts".
//   2. Authentication > Add a platform > "Mobile and desktop applications" > a custom redirect URI of the form
//      https://<this extension's id>.chromiumapp.org/   (the popup shows the exact value), then "Allow public client flows: Yes".
//   3. API permissions > Microsoft Graph > Delegated > Mail.Read, User.Read, offline_access. (No write permission, ever.)
//   4. Paste the Application (client) ID below. It is not a secret: it identifies the app, not a person.
const FlowOutlookConfig = {
  CLIENT_ID: '',
  AUTHORITY: 'https://login.microsoftonline.com/common',
  GRAPH: 'https://graph.microsoft.com/v1.0',
  SCOPES: ['offline_access', 'Mail.Read', 'User.Read'],
  // How far back one check looks, and how many messages per folder (newest first). A bounded window, not "the mailbox".
  LOOKBACK_DAYS: 14,
  PAGE_SIZE: 50,
  MAX_PAGES: 2
};

if (typeof module !== 'undefined') module.exports = { FlowOutlookConfig };
