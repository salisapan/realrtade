// Connector catalog — the "which systems may Flow touch" dimension.
//
// Choosing a connector is a permission grant, never a rule. The judgment engine
// runs identically whichever one is connected; a connector only decides where an
// already-made decision gets written. Adding a destination means adding an entry
// here plus a write path in background.js — never a change to how detection works.
//
// `auth` describes what connecting actually costs the user:
//   'oauth' — a redirect through the vendor's consent screen (needs a registered
//             app, so it is gated on the owner configuring a Client ID)
//   'token' — the user pastes a credential they create themselves in ~30 seconds,
//             which is why Notion works today with no app review and no server.
//   'google' — chrome.identity.getAuthToken against the Google account the user
//              is already signed into — the account chooser Chrome itself
//              renders, not a redirect Flow has to build a page for. Still
//              gated on the owner registering an OAuth Client ID (manifest.json
//              oauth2.client_id), same as an 'oauth' connector, but with no
//              server-side exchange or Client Secret to hold at all.
//
// manifest.json's host_permissions currently covers only what the live MVP
// scope can actually reach: mail.google.com, the four Google API hosts, and
// theflow-ai.com. HubSpot/Notion/Salesforce/Slack/Monday.com's API hosts
// were deliberately removed from it (Chrome Web Store review — and just
// good practice — expects host_permissions to match what a real user can
// actually trigger, not every write path that exists in background.js but
// has no live UI path today; see popup.js's mvp-only renderConnectors
// filter). Re-enabling any of these connectors in onboarding means adding
// its API host back to manifest.json's host_permissions in the same change
// — otherwise its fetch calls in background.js will start failing with a
// permission error the moment someone can actually reach them.

const FLOW_CONNECTORS = [
  {
    id: 'googleTasks',
    // Labeled 'Google', not 'Google Tasks' — see the accuracy note below.
    // 'Google Tasks' undersold what the single sign-in this card triggers
    // actually grants: getGoogleAuthToken() in background.js calls
    // chrome.identity.getAuthToken with no scopes override, so ONE consent
    // here covers every scope in manifest.json's oauth2.scopes at once
    // (tasks, calendar.events, gmail.compose, drive.readonly), not just Tasks.
    // A card titled 'Google Tasks' with a 'Connect Google Tasks' button
    // (popup.js builds both directly from this label) read as authorizing
    // one destination when it was actually authorizing four. 'Google' is
    // the honest scope of what's being granted; the note below spells out
    // what each part is actually used for.
    label: 'Google',
    kind: 'Tasks, Calendar & Gmail',
    status: 'live',
    auth: 'google',
    // The only connector shown on the MVP setup screen (see popup.js's
    // renderConnectors filter) — one destination, no "where should this go"
    // decision for someone who just wants Glance to catch things for them.
    // The rest still work (see WRITERS/UNDOERS in background.js) but aren't
    // part of onboarding until the core loop has proven itself.
    mvp: true,
    note: 'One native Google sign-in, covering Tasks, Calendar, and Gmail drafts together — since a single email might need any of them, not a separate authorization per feature. Glance creates a task with the amount, the date, and a link back to the email in a "Glance" list; schedules real Calendar events for meetings; and prepares (never sends) draft replies.'
  },
  {
    id: 'notion',
    label: 'Notion',
    kind: 'Database',
    status: 'live',
    auth: 'token',
    setupUrl: 'https://www.notion.so/my-integrations',
    note: 'Creates a real page in a Notion database you choose, with the amount, the date and the quoted sentence filled in. Needs an internal integration token and a database shared with it.',
    fields: [
      { key: 'token', label: 'Internal integration token', placeholder: 'ntn_… or secret_…', type: 'password' },
      { key: 'database', label: 'Database URL or ID', placeholder: 'https://notion.so/…?v=…', type: 'text' }
    ]
  },
  {
    id: 'hubspot',
    label: 'HubSpot',
    kind: 'CRM',
    status: 'building',
    auth: 'oauth',
    note: 'Logs a real Note on the Contact matching the sender. Needs a HubSpot app Client ID in config/oauth.public.js — see docs/SETUP.md.'
  },
  {
    id: 'salesforce',
    label: 'Salesforce',
    kind: 'CRM',
    status: 'building',
    auth: 'oauth',
    note: 'Logs a Task on the Contact matching the sender. Needs a Salesforce Connected App Consumer Key in config/oauth.public.js — see docs/SETUP.md.'
  },
  {
    id: 'slack',
    label: 'Slack',
    kind: 'Team chat',
    status: 'building',
    auth: 'oauth',
    note: 'Posts one message to a channel you choose, with the amount, the date and the quoted sentence. Needs a Slack App Client ID in config/oauth.public.js — see docs/SETUP.md.',
    fields: [
      { key: 'channel', label: 'Channel ID', placeholder: 'C0123456789', type: 'text' }
    ]
  },
  {
    id: 'monday',
    label: 'Monday.com',
    kind: 'Work management',
    status: 'building',
    auth: 'oauth',
    note: 'Creates one item on a board you choose, with the facts attached as an update. Needs a Monday.com OAuth app Client ID in config/oauth.public.js — see docs/SETUP.md.',
    fields: [
      { key: 'board', label: 'Board ID', placeholder: '1234567890', type: 'text' }
    ]
  },
  { id: 'pipedrive', label: 'Pipedrive', kind: 'CRM', status: 'planned' }
];

if (typeof module !== 'undefined') module.exports = { FLOW_CONNECTORS };
