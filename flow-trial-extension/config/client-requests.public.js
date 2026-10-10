// The switches for client requests (core/client-requests.js, docs/glance-ai/client-requests.md). Public: nothing here is a secret.
//
// feed: read the person's own sent mail and their clients' replies in Gmail to open requests and move items by themselves.
//       FALSE in this build on purpose: the wiring into the Gmail reader lands after the open steps-list PR (#118), and turning it
//       on is the owner's decision. With it off nothing reads mail and nothing is shown: there is no surface yet (the
//       surface is Glance's own card and steps list in the thread, built after #118 with the owner's approval).
// items: a loop in the general follow loop (core/follow-up.js) carries the things it asked for, item by item, and closes only
//        when all of them really arrived. For everyone, not a profession. FALSE: with it off the follow loop is unchanged.
export const CLIENT_REQUESTS = { feed: false, items: false };
