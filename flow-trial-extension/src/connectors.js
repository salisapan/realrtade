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

const FLOW_CONNECTORS = [
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
    note: 'Logs a real Note on the Contact matching the sender. Needs a HubSpot app Client ID configured by the site owner — see README.'
  },
  { id: 'salesforce', label: 'Salesforce', kind: 'CRM', status: 'planned' },
  { id: 'monday', label: 'Monday.com', kind: 'Work management', status: 'planned' },
  { id: 'pipedrive', label: 'Pipedrive', kind: 'CRM', status: 'planned' }
];

if (typeof module !== 'undefined') module.exports = { FLOW_CONNECTORS };
