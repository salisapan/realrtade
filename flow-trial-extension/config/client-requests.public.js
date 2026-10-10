// The switches for client requests (core/client-requests.js, docs/glance-ai/client-requests.md). Public: nothing here is a secret.
//
// feed: read the person's own sent mail and their clients' replies in Gmail to open requests and move items by themselves.
//       FALSE in this build on purpose: the wiring into the Gmail reader lands after the open steps-list PR (#118), and turning it
//       on is the owner's decision. With it off, the clients page (clients/clients.html) works by hand: paste a request, the
//       page reads it, and drafts the reminder; nothing reads mail by itself.
export const CLIENT_REQUESTS = { feed: false };
