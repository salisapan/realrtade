// The switches for the connectors added by the daily connector builder (docs/glance-ai/connectors-queue.md). Public: nothing here is a secret.
// Every one is FALSE in this build on purpose. With a switch off, behaviour is identical to the build before it: nothing is asked,
// nothing is read, nothing is written, no learning event is emitted. Turning one on is the owner's «מאשר».
//
// notionReadBack: the Notion write goes through core/notion-close.js: one POST, a GET back, Handled only when the read-back matches,
//              one page per loop (a retry never makes a second), Undo archives and reads the archive back. Uses the Notion
//              connection the person already made. Off = the earlier Notion write, unchanged.
// notionOAuth: "Sign in with Notion" through the token relay (flow-landing/netlify/functions/token-relay). Needs the relay deployed,
//              NOTION_CLIENT_ID / NOTION_CLIENT_SECRET set in Netlify, and OAUTH_PUBLIC.notionClientId set. Off = the pasted token only.
export const CONNECTORS = { notionReadBack: false, notionOAuth: false };
