# Connector: Box — the file is saved into a folder you chose, read back by content hash

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Box API 2.0. Not verified live. Not deployed.** Both switches (`config/connectors.public.js`: `boxReadBack`, `boxOAuth`) are **off**. Date: 2026-11-18. Queue row 14 (`connectors-queue.md`), claimed in `integrations/QUEUE.md`. Built on the foundation from the Notion run (`core/consent-catalog.js`, `core/connector-outcome.js`, the token relay); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **The close it makes real.** One file the person approved (a document from a mail, as for the OneDrive save) is **saved into the one Box folder the person chose when connecting** (a folder link). Never the root, never another folder.
- **The read-back.** An independent `GET /files/{id}`. **Saved** only when it returns a **file** with the same id as the upload, a status of active, **parent = the chosen folder**, the same **size**, and a **`sha1` equal to the one Glance computed from the bytes itself**. `ProofOfClose = {system:"box/file", externalId: file id, fetchedBack:true, verifiedAt}` (`SYSTEM_BOX`). It proves the content, not only that a name exists.
- **Never overwrites.** Only a plain upload (`POST upload.box.com/api/2.0/files/content`) is ever sent: no new-version endpoint, no PUT, no conflict-resolution flag. A name already taken in the folder by **different** content is reported (`name-taken`) and **nothing is written**; the same content already there (an earlier upload that was not recorded) is adopted, not duplicated.
- **Undo.** Reads the file first. **Refuses a file the person edited** (a new version, so another SHA-1): `edited-by-person`, no DELETE sent. Otherwise `DELETE /files/{id}`, which **moves it to the Box trash (restorable)**, then a read that must say trashed or not found. A file already gone is "Already gone", no read-back claimed.
- **Idempotent.** A loop key maps to one file id and hash in a ledger. A second click or retry re-reads and does not upload; an unknown outcome (5xx, timeout, an answer with no entry) first looks in the folder.
- **Not a close:** the upload answering 201; a read that fails, is a folder, lacks id/size/sha1/parent/status, is in another folder, is trashed, or whose size or hash differs (`verify_failed`).
- **Size.** At most 20 MiB per file (single-request upload; chunked upload not built). Larger is refused before any call.

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Save one file (no overwrite) | `POST upload.box.com/api/2.0/files/content` | read and write all files and folders | `DELETE /files/{id}` (trash) + read | `GET /files/{id}?fields=…` + SHA-1 | **yes** |
| Read one file | `GET api.box.com/2.0/files/{id}` | same | - | - | **yes** |
| Look in the chosen folder after an unknown outcome | `GET /folders/{id}/items` | same | - | - | **yes** |
| Check the chosen folder when connecting | `GET /folders/{id}` | same | - | - | **yes** |
| Files over 20 MiB | `files/upload_sessions` | same | same | same | no |
| Shared links, collaborations, search, download, metadata | various | - | - | - | **no, and asserted unused** (only the calls above are ever made) |

## 3. Auth

OAuth 2.0 authorization code. Box apps have a **client secret**, so the code and refresh exchanges go through the token relay (`vendor: "box"`, env `BOX_CLIENT_ID` / `BOX_CLIENT_SECRET`, form body, secret never returned). The client id is public (`OAUTH_PUBLIC.boxClientId`). `state` round-trips through `runOAuthFlow`. **Box refresh tokens are single-use**: every refresh stores the new one. Tokens and the chosen folder live on the device (`boxAuth`). A 401 triggers one refresh; if that fails nothing is saved. **Disconnect** removes `boxAuth` and `boxLedger`; the revoke call needs the secret, so it is not made from the device (the person can also remove the app in Box).

**Folder choice.** The person pastes a Box folder link (`https://app.box.com/folder/<digits>`) or the digits. The root (`0`), look-alike hosts and anything else are refused before any sign-in. The folder is opened with the new token before it is stored.

**Manifest:** the calls need `https://api.box.com/*` and `https://upload.box.com/*`. **Not added** (this PR changes no permission). Going live needs them: owner «מאשר» + store re-review.

## 4. Switches (both default off)

| Switch | With it off |
|---|---|
| `boxReadBack` | `flow:box-save` / `flow:box-undo` answer `connector-not-live` and call nothing; nothing is emitted. |
| `boxOAuth` | `connectBoxOAuth` refuses and calls nothing. Also needs `OAUTH_PUBLIC.boxClientId` and the relay vendor deployed. |

## 5. Recognition and the plan

- **No new recognition.** The save is an existing close family (Glance offers to save an email's attachment, `suggest-save`, owner lock 2026-10-08, always a suggestion the person approves). Box becomes one more destination. No lexicon, weight or gate changed; no new loop type (quality bar §7: **not applicable**).
- **Appears in the steps list / the Save card: NOT YET.** The destination chooser and the code that fetches the attachment's bytes for `flow:box-save` are not built (`open-tasks.md` row 80). The message API and the engine are ready and tested.
- **Silent when:** not connected, no chosen folder, switch off, no file, no name, over 20 MiB.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"box"`, `closeType:"file"`, `destinationSystem:"box/file"`: `approved`, `handled`, `readback_failed`, `undone`. **No file name, id or content in an event** (asserted). Off with the switch.

## 7. Tests (against a mock; no real account, key or mail)

| File | Proves |
|---|---|
| `test/box-close-corpus.cjs` (23) | success with id + size + **SHA-1** + chosen parent; the **multipart body** (attributes first, exact bytes, boundary not in the bytes); **only plain upload / read / delete are ever called**; Hebrew and spaced names, separators, traversal, control characters, long names; idempotent and reload; edited, trashed, moved or removed after the save → not Handled; **name taken by different content → nothing written**; same content → adopted; Undo trashes and reads back, **refuses an edited file (no DELETE sent)**, refuses a file with no ledger record, delete that did nothing, already gone, bad ids never reach the network; not connected / root / bad folder id / empty / non-bytes / over-cap refused before any call; 401 refresh (rotating token kept) / refresh fails / no refresh token; 403, 507, 400, 404; 429 + Retry-After (and forever); 5xx that did and did not store; timeout and network down; **stored but read-back fails → not Handled**; read-back that is a folder, wrong id, no or malformed sha1, no size, no parent, no status, wrong size or hash, array, null; upload answer with no entry; **injection through the name** (JSON in the attributes cannot move the folder or add fields); no token or content in ledger/proof |
| `test/box-wiring-corpus.cjs` (37) | switches off call nothing; on: saved and read back, one upload + one read, exact bytes in the chosen folder, second click, events with no name/id/content, Undo, **edited file not trashed**, foreign sender refused, Disconnect clears, bad / huge base64 refused, no chosen folder, read-back 500; OAuth: authorize URL, the code goes to the relay with no secret, folder verified and stored, **bad folder inputs refused before any sign-in** (root, look-alike hosts, traversal), forged state, no client id, relay refusing, folder not openable, 401 → relay refresh with the rotated token kept |
| `test/consent-catalog-corpus.cjs` (+1) | `box` tick = a relay sign-in + its two API hosts; select all includes it |
| `flow-landing/netlify/functions/token-relay/token-relay.test.cjs` (+1) | box form body with client id and secret goes to the Box token url only; rotating refresh forwarded; the secret is never returned; not configured without its env vars |

## 8. Security checks (named)

Narrowest scope Box offers for upload; the one chosen folder only (root refused, link host checked); unused endpoints asserted; **never overwrite, never trash an edited file**; the file bytes go only to the person's own Box; the name is one sanitised segment inside a JSON part (no field or folder injection, tested); the multipart boundary is chosen so it is not inside the bytes; no token, name or content in events, ledger or proof; `state` checked before the code leaves; the secret exists only in Netlify env; the file cap is enforced before decoding; nothing is sent to a person.

## 9. Vendor facts I could not verify (not fetched live in this build)

Endpoint paths and the multipart contract (`attributes` first, then `file`); the **conflict answer** (409 `item_name_in_use` with `context_info.conflicts`); response fields (`type`, `id`, `sha1`, `size`, `parent`, `item_status`) and the `fields` query; that `DELETE /files/{id}` moves to the trash and that a trashed file then reads as trashed or 404; 507 for a full account; 429 `Retry-After`; the token endpoint, a form body with the secret, and **single-use rotating refresh tokens**; scope names; the folder-items listing used for adoption; app review before use beyond the owner's own enterprise. **The owner Gate must confirm each on the vendor page before go-live.**

## 10. Known limits

- 20 MiB per file (no chunked upload). Larger files are refused, not truncated.
- One folder per connection; changing it means reconnecting.
- Name-taken is reported but not resolved: no "save as another name" yet.
- Box can keep the trashed file for a while; Undo restores nothing by itself.
- The bytes of the attachment come from the caller; fetching them from Gmail/Outlook for this destination is not built.

## 11. OWNER PACK

1. **Console.** `https://app.box.com/developers/console` → Create New App → **Custom App** → **User Authentication (OAuth 2.0)**. Configuration: redirect URI `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL); scope **Read and write all files and folders**. Copy the client id into `OAUTH_PUBLIC.boxClientId` (public).
2. **Netlify env vars (relay, not deployed):** `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`. Deploy needs «מאשר».
3. **Vendor review.** Verify the current publishing requirements. Scope justification: "to save the one file the person approved into the folder they chose, read it back to confirm it arrived intact, and move it to the trash only if the person presses Undo."
4. **Chrome Web Store permission justification (DRAFT):** "Host permissions for api.box.com and upload.box.com: let Glance save one file the person approved into the Box folder they chose and read it back. Requested only when the person ticks Box."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect Box, Glance saves the file you approve into the Box folder you choose and reads it back to confirm it was saved intact. It never overwrites a file and leaves a file you edited alone. The Box access token stays on your device, and the file goes only to your own Box."
6. **Live Gate script** (owner, own Box account, switches on for the chosen build):
   1. Connect Box with a test folder link. Expect Box's consent, then the folder name shown. A link to the root or to a look-alike site: expect a refusal before any sign-in.
   2. Save a test attachment (Save card once it offers Box, or the message in the extension console). Expect Verifying…, then Saved; the file is in the chosen folder with the right name (Hebrew intact) and size.
   3. Save again / reload: still one file. Save a **different** file under the same name: expect "name already used", the first file untouched.
   4. Upload a new version in Box, then press Undo: expect Undo to **refuse** and the file to stay. With a fresh file press Undo: expect the file in Box's trash.
   5. Disconnect: expect the token gone; remove the app in Box → Account settings → Apps.
   6. Pass = 2–5 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) owner creates the Box app and puts the client id in `OAUTH_PUBLIC.boxClientId`; (b) relay env vars and deploy (`«מאשר»`); (c) `api.box.com` and `upload.box.com` hosts in the manifest + store re-review (`«מאשר»`); (d) privacy/store drafts applied; (e) the unverified vendor facts in §9, above all the conflict answer and trash-on-delete; (f) the destination chooser on the Save card and the attachment-bytes fetch (row 80).
