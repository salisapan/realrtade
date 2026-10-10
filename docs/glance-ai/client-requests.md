# Client requests: what a firm asked its clients for, item by item, until it really arrived

Glance closes open loops. Gmail is where it starts today.

## Product definition (vision-locked)

The locked block in `CLAUDE.md` and `docs/product-identity.md` is the definition. This page is the first focused use of it: the loops between a professional (an accountant, a bookkeeper, a lawyer) and their clients. The owner chose this wedge on 2026-10-10 («רואי חשבון ועורכי דין»). Later the same day the owner widened it: no narrow audience. What matters is carry until closed for everyone, so this engine folds into the general follow loop (`core/follow-up.js`); accountants and lawyers are the hardest test case, not the market (open-tasks row 68). The firm asks for documents, signatures and payments, and the requests come back one by one, late, partial, sometimes for the wrong month. Glance keeps every item open until it really arrived, prepares the reminder that lists only what is missing, and never sends it: the person does.

## Current implementation status (code reality, 2026-10-10)

| Piece | File | State |
|---|---|---|
| Engine: document types (bank and card statements, invoices, receipts, payslips, Form 106/867, annual savings statements, ID copy, power of attorney, fee agreement, signed agreement, affidavit, land registry extract, tax assessment, payment), periods (months, ranges, quarters, tax years, "last month"), multi-item requests, arrivals with proof, partial arrivals by month, "check", "claimed", "none", reminders (three levels, Hebrew and English), Israeli business days, recurring checklists (bi-monthly VAT, monthly bookkeeping, payroll, annual report, a law firm's new-client file), the board | `flow-trial-extension/core/client-requests.js` | built, 85 corpus checks |
| The ledger on the device (chrome.storage.local, or a stub in tests) | `flow-trial-extension/src/client-requests-store.js` | built, store corpus |
| Surface | none | **removed 2026-10-10**: a standalone page with forms was built and the owner rejected it as far from Glance (against Zero-Prompt and the card/steps-list design). The surface is Glance's own card in the thread ("tracking: …", what arrived, one Do It for the reminder) and the side panel's open loops. Built after #118, shown to the owner as a mock first, nothing enters without the owner's approval |
| Switch | `config/client-requests.public.js` `CLIENT_REQUESTS.feed` | **off**: nothing reads mail by itself yet |
| Reading Gmail by itself (a sent request opens one; a client's reply with files moves its items) | `src/follow.js` + `manifest.json` | **not wired**: both files are inside the open steps-list PR #118. Wired right after it merges |

## The rules (why it can be trusted)

- An item is **received** only on a file from that client, read back by the host (`fetchedBack`), whose name or covering text names that document and fits the period. Proof: `{system, externalId: messageId:file, fetchedBack, verifiedAt}`.
- Anything unsure is **check** (one click by the person): a file with no period for a dated item, one unnamed file for the only open item, a file the host did not read back.
- "I sent it on WhatsApp" with no file is **claimed**, never received. "No invoices this month" is **none** (an answer). "Not yet" is neither.
- A payment closes on the client's own words that it was paid (close map Y3), never on a promise to pay.
- A signed document closes on the file; the signature itself is for the person to look at, and the card says so.
- The request closes only when every item is received, none or released. A reminder never closes anything. Glance never sends.

## What it needs to work by itself (owner decisions and the order)

1. **Merge #118, then wire** (`CLIENT_REQUESTS.feed`): the Gmail reader already sees the threads the person opens. With the feed on, a sent request opens a request and a client's reply moves its items, in the threads the person opens.
2. **Without opening threads** (a true background run over the inbox) needs reading mail through the Gmail API (`gmail.readonly`). That is a new scope: a consent-screen line, the privacy page and the store listing change in the same commit. Owner decision.
3. **Sending the reminder in one click** needs `Mail.Send` (approved as preview + one click, not built; open-tasks row 53). Until then the reminder is a draft in the thread.
4. **WhatsApp**: clients send documents there. Today the WhatsApp surface reads only; matching files that arrive there is a later slice.

## Tests

`flow-trial-extension/test/client-requests-corpus.cjs` (requests in Hebrew and English, silence, periods, file names, arrivals and every trap above, reminders, recurrence, the board) and `test/client-requests-store-corpus.cjs` (the ledger).
