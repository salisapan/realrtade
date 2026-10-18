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
// asanaReadBack: the Asana write goes through core/asana-close.js (one task in the chosen project, read back, Undo read back).
//                Off = no Asana writer exists at all (nothing is registered under the id "asana").
// asanaOAuth:    "Sign in with Asana" (OAuth with PKCE) through the token relay. Needs the relay deployed, ASANA_CLIENT_ID /
//                ASANA_CLIENT_SECRET set in Netlify, and OAUTH_PUBLIC.asanaClientId set.
//
// clickupReadBack: the ClickUp write goes through core/clickup-close.js (one task in the chosen List, read back, Undo read back).
//                  Off = no ClickUp writer exists at all (nothing is registered under the id "clickup").
// clickupOAuth:    "Sign in with ClickUp" (authorization code, no PKCE: ClickUp does not document it) through the token relay.
//                  Needs the relay deployed, CLICKUP_CLIENT_ID / CLICKUP_CLIENT_SECRET set in Netlify, and
//                  OAUTH_PUBLIC.clickupClientId set.
export const CONNECTORS = { notionReadBack: false, notionOAuth: false, asanaReadBack: false, asanaOAuth: false, clickupReadBack: false, clickupOAuth: false };
