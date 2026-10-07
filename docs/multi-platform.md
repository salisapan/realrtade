# Multi-platform: loops beyond email

> Written 2026-10-03, at the owner's request ("develop the multi-platform point"). Companion to `docs/product-architecture.md`
> (§5.7 expansion rules, §5.8 decision filter), `docs/open-loops.md`, `docs/local-first-principle.md`.

## 1. The idea

<!-- LOCKED-IDENTITY:START -->
**Glance closes open loops. Gmail is where it starts today.** Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is **detect → carry → execute → true close**. It starts in Gmail, the current primary entry surface, and executes through the places a close really happens (Google Tasks, Gmail drafts and Drive today; more surfaces later, only ever in service of closure). It stays silent when it is uncertain, never sends on your behalf, treats preparation as not completion, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.
<!-- LOCKED-IDENTITY:END -->

**Multi-platform means** execution and observation across the surfaces where a loop really opens, advances and closes, in service of closure. **It does not mean** a connector marketplace, inbox-zero, or integrations for their own sake. The surfaces built or planned below are means; the close is the product.

The unit of Glance is the **loop**, not the email: something someone owes you, or you owe them, that stays open until reality
closes it. Email is where Glance first saw loops open and close. Reality also closes them in other places: an answer on WhatsApp,
a payment, a calendar entry, a shared file. So "multi-platform" is not "more inboxes". It is three things:

1. **One vocabulary every app speaks** (`core/channel.js`): a *party* (name, email, phone) and an *utterance* (one message). The
   engine (`core/follow-up.js`, `core/story.js`, `core/person-model.js`) never has to know which app a message came from.
2. **One person across apps** (`core/identity-graph.js`): the Dana who emails and the Dana on WhatsApp are one person to the
   engine, so one waiting-time model covers both and an answer in either settles a loop opened in the other.
3. **Surfaces** that feed that vocabulary, each opt-in, each at least as careful as Gmail.

## 2. The decision filter (docs/product-architecture.md §5.8)

| Question | Answer |
|---|---|
| Closer to "you intend, we execute"? | Yes: a loop is chased and closed wherever the other person answers. |
| Raises the feeling that things get closed? | Yes: today a reply on WhatsApp leaves the email loop open and Glance keeps chasing. |
| Protects precision and silence? | Only with hard rules (section 4). New surfaces are stricter than Gmail until measured. |
| Zero-Prompt? | One opt-in per app, once. The only recurring prompt is the rare, rationed "same person?" question. |
| Compounding value? | Yes: the identity graph and the per-person timing model get better with every app. |

§5.7 says not to expand horizontally before precision and stickiness clearly win. The owner decided to proceed on 2026-10-03. The
risk that rule guards against is handled by design: every new surface is **off by default, opt-in per app, labelled experimental,
stricter than Gmail, and silent when it cannot read its page**. The first measured gate to relax any of that is in section 6.

## 3. What exists, and how far it is verified

| Piece | Where | State |
|---|---|---|
| Party / utterance vocabulary, phone and name normalisation | `core/channel.js` | Built; corpus-tested. |
| Identity graph: merge on hard keys only, a shared full name is a suggestion, "same person?" asked once, a "no" remembered | `core/identity-graph.js` | Built; corpus-tested. Stores names, addresses, numbers and which apps; no message text. |
| Cross-app closing: same person AND a topical link (same reference, or same amount on a payment loop) closes; otherwise at most one question | `core/cross-channel.js`, `src/follow.js` | Built; corpus-tested; exercised in a real browser against a mock page. |
| Channel hooks in the follow-up engine (message id, "is this mine", counterpart, party) with Gmail as the unchanged default | `src/follow.js` | Built; the 112-case Gmail harness still passes. |
| WhatsApp Web, read-only, 1:1 only | `src/content-whatsapp.js`, `src/whatsapp-parse.js` | Built; parsing corpus + a browser harness on a page that **imitates** WhatsApp's structure. **Not verified on the real WhatsApp Web.** |
| One heading per person across apps in "By person", with the apps named; rows from another app say which | `core/follow-up.js` groupByPerson, popup | Built; corpus-tested. |
| Opt-in plumbing: optional host permission, scripts registered on request, re-registered after an update, removed on "off" | `src/background.js`, popup "Where Glance watches" | Built; the popup call to the browser's permission prompt is not exercised in an automated test (it needs a real browser profile). |
| "Stay on this" on any page (right-click menu, popup question, loop opens) | `core/capture.js`, `src/background.js`, popup | Built; core and popup logic tested. The right-click item and side-panel opening are not exercised in an automated test. |
| Outlook through Microsoft Graph: sign-in (PKCE), a bounded read of the last 14 days of inbox and sent, planning with the same rules as Gmail, offers and questions in the popup | `core/outlook-config.js`, `outlook-auth.js`, `graph-mail.js`, `outlook-sync.js`, `src/outlook.js`, popup | Built and tested against a **fake Microsoft** (PKCE, own-identity set, incoming asks, draft allow-list, silent renewal, honest failure, never creates a loop without a tap). Client id is set. SPA registration verified live 2026-10-05. Incoming asks + Do It (reply draft) live-verified 2026-10-05; unified Loops + receipt reconcile + draft-undo migration 0.9.5. |

## 4. The hard rules

- **People are merged on hard evidence only** (same address, same number, or one sighting carrying both). A name alone is never
  enough: it becomes a pending question, asked once, and a "no" is remembered. Two people with the same full name are never merged by guesswork.
- **Cross-app closing**: the sender must be the same person; only loops waiting on *them* are considered (never your own promises or
  clocks); a message that names the same reference, or the same amount on a payment loop, belongs to that loop; a topical
  answer closes it with a receipt and Reopen; anything without that link only asks, and only when the person has exactly one open
  loop and the message is a real sentence; two loops that fit equally mean silence; a loop asked about in the last three days is not asked again.
- **Chat wording is understood by the word lists, and measured**: `test/chat-corpus.cjs` (77 model-written chat sentences, English and Hebrew) holds strict-mode precision at 1.00 and recall at 0.90+ (it was 0.28 before chat wording such as "pls send", "can u", "תשלח לי", "שלחת כבר?", "מתי תעביר" was added). These are model-written sentences, not real chats: they show the lists can read chat register, not how real chats behave. The model-written eval sets and the human sets did not lose any precision.
- **Chats are stricter than email**: `ctx.strict` means only word-list asks create an offer. The learned model, the language-model
  tier and the single question do not act in a chat until there is a labelled set of real chats to measure them on.
- **Read-only**: Glance never types, sends, reacts to, marks or opens anything in another app. A chat has no draft folder, so a nudge is copied to the clipboard for the person to paste.
- **WhatsApp scope**: one-to-one chats only. A group, a broadcast list, a channel or a status is left alone, on purpose, and is not reported as a broken layout.
- **Honest failure**: each pass checks it can still make sense of the page; if not, it reports once (shown in the popup) and stays silent.
- **No new permission at install**: another app is an *optional* host permission, requested from a click in the popup and removable.
- **Copy and permissions move together** (`docs/design-principles.md`): the privacy page (section 5, four new bullets), the store
  permission justifications and the README changed in the same commit as the code.

## 5. Per app

### WhatsApp Web (experimental)

- Reads: the open 1:1 chat's header title, message ids (`data-id`: `true_`/`false_` = sent by you / them, and the chat's
  number for a normal contact) and the text spans. Quoted messages inside a reply are dropped.
- Risks the owner should weigh before shipping it:
  - **Page changes**: WhatsApp Web's markup is not a public interface. It can break without notice (Glance then goes quiet).
  - **Platform policy**: WhatsApp's terms restrict *automated* use of the service. This reads a page the person has open and
    never sends or interacts, which is the lowest-risk form of reading, but I have not obtained a legal opinion and the Chrome Web
    Store review may ask about it.
  - **Sensitivity**: chats are more intimate than business email. The opt-in text says exactly what is read; nothing leaves the device.
- To measure it properly: a labelled set of real chat sentences (like `docs/human-eval.md`) from consenting people, and only then relax `strict`.

### Outlook (through Microsoft Graph; built, waiting for the owner's app registration)

Reading Outlook's page would repeat WhatsApp's fragility, so the path is Microsoft's own API.

What it does: sign in with the person's own Microsoft account (OAuth code flow with PKCE, `chrome.identity.launchWebAuthFlow`), read the
last 14 days of the inbox and the sent folder (50 per page, two pages, text bodies), hand them to `core/outlook-sync.js`, and apply what it
decides: a reply closes or moves a loop exactly as in Gmail, your chase moves the day, a new ask or promise of yours is only OFFERED in
the popup ("Waiting on a reply? Stay on it"), and an incoming ask from someone else is shown **once** in the unified Loops list (source line
"From Outlook"; same silence bar as Gmail). On Do It, Glance creates a reply DRAFT in Outlook Drafts via Graph `createReply` (Mail.ReadWrite)
with an on-device body from `core/draft-reply.js (shared with Gmail)` (acknowledge the asks, fill-in placeholder, no em dash; never sends). The Loops card turns
into the receipt in place ("Reply draft ready in Outlook Drafts. Not sent." + Open draft + Undo). Undo deletes only that draft while it is
still a draft, converts the Activity row to Undone (no second HANDLED row), and does **not** count as a false close (a prepared draft is not
a trusted close). A reply that cannot be linked to a loop for sure only asks ("Does this settle it?"). An answer that arrives in Outlook can
settle a Gmail or WhatsApp loop for the same person, and the other way round. Own identity is a set (mail, UPN, otherMails, proxyAddresses
smtp:, plus learned sentitems senders, and a sole inbox toRecipient only when two or more different people wrote to it and it never wrote in).

**From address (verified vs inferred):** Graph allows PATCH `from` on a draft when the address belongs to the mailbox. Personal MSA accounts
often keep the account's primary alias on From even after PATCH; if the preferred alias does not stick, Setup shows a one-line hint to set it
as primary in the Microsoft account. Verified in code path; live MSA rewrite behaviour is account-dependent (inferred from Graph docs + live
0.9.3 observation of an `outlook_…@outlook.com` primary; 0.9.9 skips opaque CID when a human alias is known and PATCHes from+sender).

What it does not do: it never sends (never `Mail.Send`, never `/send`, `/reply`, `/replyAll`, `/forward`, `/sendMail`). Allowed non-GET
Graph calls are exactly: the token exchange, `createReply`, PATCH of a Glance-created draft (body and attempted `from`), DELETE of a
Glance-created draft. Mail is read while the panel is open (on open, every ten minutes, and "Check now") and while an Outlook-on-the-web tab
is open (at most once a minute, so the card there needs no panel); nothing is sent to Glance's servers. WhatsApp stays read-only.

**Same engine as Gmail (0.9.14).** Outlook has no judgment of its own. `core/incoming-judge.js` is Gmail's chain as one pure function (the
message's own text with quoted history cut, `FlowIntent.classify` with sender and subject, the same silence bar, the file gate, `planFor`), and
both the Graph planner (`core/outlook-sync.js`) and the in-page card (`src/content-outlook.js`) call it. Do It sends the exact payload Gmail's
`buildActionPayload` sends, and `background.js` composes both drafts with `FlowDraftReply.draftBodyText`. `test/gmail-outlook-parity-corpus.cjs`
runs the same emails through both adapters and both real writers and requires the same decision and the same draft, word for word. Two
connector gaps stay silent on Outlook rather than weaker: a close with no reply in it (a calendar event or a Task; Gmail writes those with the Google writers). A request for a file now uses the same close chain on both surfaces. Gmail and Outlook both pass Drive and this thread (`fileEvidence`: Drive account-wide, this thread when the host has names). Calendar, Sheets and Docs stay off on both until they are turned on together. When one Drive file is found, the open message's Do It posts it onto the Outlook draft with Mail.ReadWrite (`fileAttachment`). The receipt says the file is attached only after Graph returns an attachment id. If that id is missing, the draft is deleted and the silence reason is `outlook-file-found-no-attach`. When the file is missing, the Outlook card drafts a holding reply and does not send. No new permission was added for the chain. Until Drive is searched, the Outlook planner stays quiet on a file ask (`file-chain-not-run`). A search that cannot run because the Google token has no Drive read is `drive-not-granted`. Any other failed search is `drive-search-failed`. Older checks stored `file-needs-drive`; that spelling still starts the chain and is not written anymore. A new ask is shown even when the
same person has an open loop elsewhere (as in Gmail), and "me" is learned only from strong evidence (a CC'd mail no longer makes its To
person "me").

**The Do It card inside Outlook on the web.** With Outlook on and the Outlook-on-the-web permission granted, `background.js` registers the same
Glance card (`src/chip-host.js`) on outlook.live.com / outlook.office.com / outlook.office365.com. The page runs the same planner as the panel
(its Graph reads go through the worker, GET under `/me` only), matches the open message by Graph id, internet message id, or subject and
sender, and Do It writes the reply draft through the worker.

What 0.9.15 changed after the first live test showed no card: the page scan is a throttle (OWA changes the page all the
time, and a debounce that restarts on every change never fired); the message body is found by language-neutral anchors
(`div[role="document"]` in the reading pane, `allowTextSelection` / `UniqueMessageBody` classes; the English aria-label
"Message body" is only a last resort, because OWA localizes it); the address `/mail/0/inbox/id/<id>` usually carries the
CONVERSATION id (AQQk… / AAQk…), matched against the synced conversation, with ids compared in one spelling whatever base64
alphabet they use; the open message ends in a card or in a reason under "Why not shown" (`outlookPageDiag`, e.g.
`page:pane-unreadable` with the anchors seen); tabs already open when the scripts are registered get them injected; and a
debug mode logs each stage with a `Glance:` prefix (`chrome.storage.local.set({ glanceDebug: true })` from the worker
console, or `localStorage.setItem('glance-debug', '1')` on the Outlook page). `test/owa-page-harness.cjs` loads the exact
registered file list on a Hebrew reading pane whose ads keep changing and requires the card (needs jsdom; skipped without). The surface stays opt-in (optional host permission, registered at runtime), not a
static `content_scripts` entry, so installing Glance never asks for Outlook.

What 0.9.16 changed after 0.9.15 passed live: on the real page the subject sits in the reading-pane header above the
message and the message itself only shows the sender's display name (the address is in a hover card), so the parser now
takes the heading nearest the body as the sender name and the header above the message as the subject, and the
subject fallback needs the display name to agree when there is no address. The scan remembers the open message (id,
subject, sender name, a hash of the text) and does nothing while it is unchanged and its card or reason is already in place.

What 0.9.17 changed after a live re-read of the same Hebrew message: the first parse was the subject, the address and
the display name, and a later parse of that same open message had an empty address and the date/time row
(`ג 06/10/2026`, an RTL mark, then the clock) as the sender name. That changed the scan signature and matched and judged
the message again. A sender-name candidate that is a date or a time (digits with `/` `.` `:` , a Hebrew or English
weekday prefix, RTL marks stripped first) is rejected, the persona/name element is preferred, and a re-parse that loses
the address keeps the last good sender for that conversation.

What 0.9.18 changed after the Q4 pricing-sheet mail stayed on `file-needs-drive` with no card: the planner wrote that stall and never replaced it, and a Drive search that failed (including a cached token whose grant predates `drive.readonly`; only a 401 used to drop it) fell through to the same line. The stall is now three reasons. `file-chain-not-run` means the chain has not called Drive. `drive-not-granted` means Google is not connected or the token has no Drive read (one cached-token drop, then one more list). `drive-search-failed` is any other failed search. A found file and a missing file still follow the same chain. No OAuth scope was added. One host permission, `https://www.googleapis.com/oauth2/*`, lets a hand-armed trace read the scopes on the token Chrome already issued. The access token is not logged.

One file-chain trace, off until armed, and cleared after one scan. From the service worker console (`chrome://extensions`, Glance, service worker): `chrome.storage.local.set({ glanceOutlookFileTrace: 1 })`. Or from the Outlook page console: `localStorage.setItem('glance-outlook-file-trace', '1')`. Then open the mail. One console line, `Glance: file-trace`, carries what `decideFromText` decided, whether `resolveFileChain` searched, the gate, the Drive query, `flow:search-drive` ok / status / error / file count, the scopes on the token, and the final silence or show reason. The build line is `Glance: outlook content start` and the version `0.9.19`. This is not the always-on `glanceDebug` log.

What 0.9.19 changed after a live Q4 pricing-sheet mail still showed a Scheduling card while Why not shown said `drive-search-failed`: the open page trusted a stored process and skipped the file chain, and the mailbox check kept that card. The page now judges the open text every time (a receipt with no process is the exception). A file ask on either side runs the Drive chain. Silence removes the card. A conversation this check judged does not keep an older card. Same-account mail stays `note-to-self` or `own-sender`. One Drive file still prepares an attach on Do It (Undo deletes the draft, never send). Google disconnected is `drive-not-granted`, not a schedule card. Check now never calls Turn off. A reload that misses the worker is transient and does not clear the token. Connect is one screen: Select all, Mail required, and optional Calendar, OneDrive, Contacts and Teams reads only when checked. The default authorize string is still `offline_access User.Read Mail.Read Mail.ReadWrite`. Never `Mail.Send`. OneDrive is not searched from a mail. No Chrome host permission was added. The Entra app must add `Calendars.Read`, `Files.Read`, `Contacts.Read` and `Chat.Read` as delegated permissions before those boxes can succeed.

**A session that lasts (0.9.14).** A single-page-application refresh token lives 24 hours from the sign-in and does not slide. The worker keeps
the session alive on its own: an alarm every 30 minutes (and on browser start-up), refresh in the access token's last 5 minutes, silent renewal
(`launchWebAuthFlow({interactive:false})`, `prompt=none`, no window) from hour 16, a forced refresh and one retry on a Graph 401, and every
token in `chrome.storage.local` so a worker restart loses nothing. A network error, a 5xx or a failed silent attempt is transient (tried
again within 30 minutes); the row says "Sign in again" only when the refresh token is spent AND Microsoft says a person must act.
`test/outlook-session-corpus.cjs` walks 72 hours on a fake clock. Silent renewal depends on the Microsoft sign-in cookie in Chrome's web-auth
session ("Stay signed in"); if Microsoft or the account's policy refuses prompt=none, one interactive sign-in a day is the honest floor.

This is a bigger change than anything before it to "Glance reads only the message you open". It is opt-in, disclosed on the privacy
page in the same commit (a dedicated bullet), and the store justification rows for the two optional Microsoft hosts are written.

**What the owner has to do (the only manual step):**
1. Microsoft Entra admin center, App registrations, New registration. Supported account types: "Accounts in any organizational directory and
   personal Microsoft accounts".
2. Authentication, Add a platform, **Single-page application**, redirect URI = the address the Outlook row in the popup shows
   (`https://<extension id>.chromiumapp.org/`). Verified live 2026-10-05: "Mobile and desktop" fails with `invalid_request` (likely AADSTS9002326)
   because the token POST from the extension carries `Origin: chrome-extension://...`. SPA refresh tokens last 24h; silent renewal renews them.
3. API permissions, Microsoft Graph, Delegated: `Mail.Read`, `Mail.ReadWrite` (drafts only, by code), `User.Read`, `offline_access`. Never `Mail.Send`. Optional, only if those Connect boxes should work: `Calendars.Read`, `Files.Read`, `Contacts.Read`, `Chat.Read`. A mail does not search OneDrive; `Files.Read` is the grant alone.
4. Paste the Application (client) ID into `CLIENT_ID` in `flow-trial-extension/core/outlook-config.js` (it is not a secret) and rebuild the package.
5. Turn Outlook on in the popup, sign in, and watch "Last checked". Tell me what the row says if it fails.

**Honest limits (verified live 2026-10-05):** SPA registration works; "Mobile and desktop" fails with `invalid_request` (likely AADSTS9002326).
SPA refresh tokens last 24h and do not slide; silent `launchWebAuthFlow({interactive:false})` with `prompt=none` is the renewal path, now run
by the worker's keep-alive from hour 16 (acceptance test 7; the 24h live check is still owed). Personal and work accounts may need different consent, and some organisations block user consent for apps (their administrator then has
to approve it).

### Slack, Teams and others

Not built. Slack and Teams are team surfaces (`docs/product-architecture.md`: Glance has none), and their pages are as unstable as
WhatsApp's. "Stay on this" covers them in the meantime without reading anything.

### Stay on this (any page)

Right-click a selection, choose "Glance: stay on this", say who it is with and whose move it is. A loop opens exactly like any
other. It has no address or number, so it is closed by hand (or the person's own later answer once they are known by an address or number).

## 6. The gate for relaxing "experimental"

Not before: (a) a human-labelled set of real WhatsApp sentences measured at ask precision at least 0.97 with a stated recall,
(b) a week of real use with no wrong close reported (closes made across apps can be told apart afterwards: the loop keeps `viaChannel`),
(c) the owner's decision on the platform-policy question above.

## 7. Adding another app: the checklist

1. Write the pure parsing in a `*-parse.js` with a corpus (ids, who the chat is with, what to leave alone).
2. Write the adapter that builds the same `ctx` as `src/content-whatsapp.js` (`channel`, `messages`, `isOwn`, `messageId`, `counterpart`, `partyOf`, `extractSender`, `ownMessageText`, `messageText`, `threadIdFrom`, `subject`, `threadUrl`, `attachmentsOf`) with `strict: true`.
3. Add it to `SURFACES` in `src/background.js` and an optional host permission in `manifest.json`.
4. Add a copy line in the popup (`SURFACE_COPY`), a privacy-page bullet and a store-permission row, in the same commit.
5. Add a browser harness page that imitates its structure, and a health check that reports when the page is not understood.

## 8. Decisions for the owner

- **Decided 2026-10-03 (owner):** WhatsApp Web ships as an experimental opt-in (off by default, read-only, 1:1 only). The platform-policy risk in section 5 is accepted by the owner; it is still not a legal opinion.
- **Decided 2026-10-03 (owner):** Outlook through Graph is wired. It stays dormant until the Microsoft app is registered and its client id is set (section 5).
- Whether "same person?" questions are acceptable in the popup (rationed to one at a time).
