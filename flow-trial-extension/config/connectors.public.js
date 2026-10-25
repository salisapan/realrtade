// The switches for the connectors added by the daily connector builder (docs/glance-ai/connectors-queue.md). Public: nothing here is a secret.
// Every one is FALSE in this build on purpose. With a switch off, behaviour is identical to the build before it: nothing is asked,
// nothing is read, nothing is written, no learning event is emitted. Turning one on is the owner's «מאשר».
//
// notionReadBack: the Notion write goes through core/notion-close.js: one POST, a GET back, Handled only when the read-back matches,
//              one page per loop (a retry never makes a second), Undo archives and reads the archive back. Uses the Notion
//              connection the person already made. Off = the earlier Notion write, unchanged.
// notionOAuth: "Sign in with Notion" through the token relay (flow-landing/netlify/functions/token-relay). Needs the relay deployed,
//              NOTION_CLIENT_ID / NOTION_CLIENT_SECRET set in Netlify, and OAUTH_PUBLIC.notionClientId set. Off = the pasted token only.
//
// zoomReadBack:    one scheduled meeting created on the person's own Zoom with nobody invited, read back by id, topic, start and a zoom.us join link
//                  (core/zoom-close.js). Undo refuses a meeting the person changed. Off = the messages flow:zoom-create / flow:zoom-undo answer connector-not-live.
// zoomOAuth:       "Sign in with Zoom" (OAuth with PKCE) through the token relay. Needs the relay deployed, ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET set in Netlify,
//                  and OAUTH_PUBLIC.zoomClientId set.
//
// dropboxReadBack: one file saved into the person's Dropbox app folder, read back by id, size and content hash (core/dropbox-close.js). Never overwrites, never
//                  renames; Undo refuses a file the person edited. Off = the messages flow:dropbox-save / flow:dropbox-undo answer connector-not-live.
// dropboxOAuth:    "Sign in with Dropbox" (OAuth with PKCE, no secret, no relay). Needs OAUTH_PUBLIC.dropboxAppKey set.
//
// docusignReadBack: READ-ONLY. The person links one envelope they already sent to one loop; Glance reads its status and counts the loop closed only when the
//                   envelope is completed (core/docusign-close.js). It never creates, sends or changes an envelope. Off = the message type answers connector-not-live.
// docusignOAuth:    "Sign in with DocuSign" through the token relay. Needs the relay deployed, DOCUSIGN_CLIENT_ID / DOCUSIGN_CLIENT_SECRET set in Netlify, and
//                   OAUTH_PUBLIC.docusignClientId set.
// docusignDemo:     use DocuSign's developer (demo) servers instead of production: for the owner's Gate before the vendor go-live review.
//
// linearReadBack: the Linear write goes through core/linear-close.js (one issue in the chosen team, created with a client id, read back, Undo read back).
//                 Off = no Linear writer exists at all (nothing is registered under the id "linear").
// linearOAuth:    "Sign in with Linear" (OAuth, PKCE) through the token relay. Needs the relay deployed, LINEAR_CLIENT_ID /
//                 LINEAR_CLIENT_SECRET set in Netlify, and OAUTH_PUBLIC.linearClientId set.
//
// jiraReadBack:  the Jira write goes through core/jira-close.js (one issue in the chosen project, read back, Undo read back).
//                Off = no Jira writer exists at all (nothing is registered under the id "jira").
// jiraOAuth:     "Sign in with Atlassian" (OAuth 2.0 3LO) through the token relay. Needs the relay deployed, JIRA_CLIENT_ID /
//                JIRA_CLIENT_SECRET set in Netlify, and OAUTH_PUBLIC.jiraClientId set.
//
// asanaReadBack: the Asana write goes through core/asana-close.js (one task in the chosen project, read back, Undo read back).
//                Off = no Asana writer exists at all (nothing is registered under the id "asana").
// asanaOAuth:    "Sign in with Asana" (OAuth with PKCE) through the token relay. Needs the relay deployed, ASANA_CLIENT_ID /
//                ASANA_CLIENT_SECRET set in Netlify, and OAUTH_PUBLIC.asanaClientId set.
export const CONNECTORS = { notionReadBack: false, notionOAuth: false, asanaReadBack: false, asanaOAuth: false, jiraReadBack: false, jiraOAuth: false, linearReadBack: false, linearOAuth: false, docusignReadBack: false, docusignOAuth: false, docusignDemo: false, dropboxReadBack: false, dropboxOAuth: false, zoomReadBack: false, zoomOAuth: false };
