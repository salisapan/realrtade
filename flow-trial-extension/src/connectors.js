// Connector catalog — the "which systems" dimension of flexibility.
//
// Picking a connector is a permission grant, never a rule. The user checks
// the boxes for systems they actually use; the same judgment engine (see
// judgment.js) runs unchanged regardless of which one is connected. Adding a
// new destination means adding an entry here plus its OAuth + write path in
// background.js — never a change to how detection works.
//
// `status: 'live' | 'building' | 'planned'` drives what the popup shows so we
// never claim a connector works before its OAuth + write path actually exist.
// `oauth: true` means selecting it in the popup triggers a real
// chrome.identity.launchWebAuthFlow connection, not just a checkbox.

const FLOW_CONNECTORS = [
  {
    id: 'hubspot',
    label: 'HubSpot',
    kind: 'CRM',
    status: 'building',
    oauth: true,
    note: 'Real write once configured: looks up the Gmail sender by email and logs a Note on the matching Contact. Needs a HubSpot app Client ID — see README.'
  },
  {
    id: 'monday',
    label: 'Monday.com',
    kind: 'Work management',
    status: 'planned'
  },
  {
    id: 'notion',
    label: 'Notion',
    kind: 'Docs / database',
    status: 'planned'
  },
  {
    id: 'salesforce',
    label: 'Salesforce',
    kind: 'CRM',
    status: 'planned'
  },
  {
    id: 'pipedrive',
    label: 'Pipedrive',
    kind: 'CRM',
    status: 'planned'
  }
];

if (typeof module !== 'undefined') module.exports = { FLOW_CONNECTORS };
