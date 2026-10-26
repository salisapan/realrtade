# Connector: Dropbox — the file is saved, read back by content hash

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Dropbox API v2. Not verified live. Not deployed.** Both switches (`config/connectors.public.js`: `dropboxReadBack`, `dropboxOAuth`) are **off**. Date: 2026-10-21. Queue row 6 (`connectors-queue.md`), claimed in `integrations/QUEUE.md`. Built on the foundation from the Notion run (`core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **The close it makes real.** One file the person approved (a document from a mail, as for the OneDrive save) is **saved into their Dropbox app folder** (`/Apps/<the Glance app>/<name>`).
- **The read-back.** An independent `files/get_metadata` call. **Saved** only when it returns a **file** (not a folder) with the same id as the upload, the same **size**, and a **`content_hash` equal to the one Glance computed from the bytes itself**. `ProofOfClose = {system:"dropbox/file", externalId: file id, fetchedBack:true, verifiedAt}` (`SYSTEM_DROPBOX`). This is the strongest read-back of any connector so far: it proves the content, not only that a name exists.
- **Never overwrites, never renames.** Upload is `mode: add`, `autorename: false`, `strict_conflict: true`. A name already taken by **different** content is reported (`name-taken`) and **nothing is written**; the same content already there (an earlier upload that was not recorded) is adopted, not duplicated.
- **Undo.** `delete_v2` by file id, then a read that must answer "not found". **Undo refuses a file the person edited since**: if the file's content hash no longer equals what Glance saved it is not deleted (`edited-by-person`) — "never clobber a user edit". A file already gone is "Already gone", no read-back claimed.
- **Idempotent.** A loop key maps to one saved path and hash in a ledger. A second click or retry re-reads and does not upload; an unknown outcome (5xx, timeout, conflict) first looks at the path.
- **Not a close:** the upload answering 200; a read that fails, is a folder, lacks an id/size/hash, or whose size or hash differs (`verify_failed`).
- **Size.** At most 20 MB per file in this slice (a single-request upload; larger files need upload sessions, not built). Larger is refused before any call.

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Save one file (add, no overwrite) | `POST content.dropboxapi.com/2/files/upload` | `files.content.write` | `delete_v2` + `get_metadata` → not found | `get_metadata` + content hash | **yes** |
| Read one file's metadata | `POST api.dropboxapi.com/2/files/get_metadata` | `files.metadata.read` | - | - | **yes** |
| Delete the file Glance saved | `POST api.dropboxapi.com/2/files/delete_v2` | `files.content.write` | (Dropbox keeps it recoverable for a while: unverified) | `get_metadata` | **yes** |
| Revoke the token on Disconnect | `POST api.dropboxapi.com/2/auth/token/revoke` | (the token) | - | - | **yes** (best effort) |
| Files over 20 MB | `files/upload_session/*` | `files.content.write` | same | same | no |
| Share link, list folder, search, download | various | - | - | - | **no, and asserted unused** (only the three file endpoints above are ever called) |
| Account info | `users/get_current_account` | `account_info.read` | - | - | no (not requested) |

The Dropbox app is created with **"App folder"** access, so Glance can only see its own folder, never the rest of the person's Dropbox. The two scopes are the narrowest that do upload, read-back and delete (scope names unverified, §9).

## 3. Auth

OAuth 2.0 authorization code with **PKCE (S256)** and `token_access_type=offline` (refresh token). Dropbox accepts PKCE for a public client **without a client secret** (unverified), so **there is no secret and no relay**: the app key is public (`OAUTH_PUBLIC.dropboxAppKey`), and the extension exchanges the code (and refreshes) directly with `api.dropboxapi.com/oauth2/token`. `state` round-trips through `runOAuthFlow`. Tokens live on the device (`dropboxAuth`). A 401 triggers one refresh; if that fails nothing is saved. **Disconnect** asks Dropbox to revoke the token (best effort), then removes `dropboxAuth` and `dropboxLedger`.

**Manifest:** the calls need `https://api.dropboxapi.com/*` and `https://content.dropboxapi.com/*`. **Not added** (this PR changes no permission). Going live needs them: owner «מאשר» + store re-review.

## 4. Switches (both default off)

| Switch | With it off |
|---|---|
| `dropboxReadBack` | `flow:dropbox-save` / `flow:dropbox-undo` answer `connector-not-live` and call nothing; nothing is emitted. |
| `dropboxOAuth` | `connectDropboxOAuth` refuses and calls nothing. Also needs `OAUTH_PUBLIC.dropboxAppKey`. |

## 5. Recognition and the plan

- **No new recognition.** The save is an existing close family (Glance already offers to save an email's attachment to OneDrive or Drive, `suggest-save`, owner lock 2026-10-08, always a suggestion the person approves). Dropbox becomes one more destination for it. No lexicon, weight or gate changed; no new loop type (quality bar §7: **not applicable**).
- **Appears in the steps list / the Save card: NOT YET.** The Save card chooses OneDrive or Drive; a destination chooser (using `FlowConnectorOutcome.destinationOrder` over the connected, switched-on destinations) and the code that fetches the attachment's bytes for `flow:dropbox-save` are not built (`open-tasks.md` row 80). The message API and the engine are ready and tested.
- **Silent when:** not connected, switch off, no file, no name, over 20 MB.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"dropbox"`, `closeType:"file"`, `destinationSystem:"dropbox/file"`: `approved`, `handled`, `readback_failed`, `undone`. `offered`, `edited`, `ignored` have no emitter yet. **No file name, id or content in an event** (asserted). Off with the switch.

## 7. Tests (against a mock; no real account, key or mail)

| File | Proves |
|---|---|
| `test/dropbox-close-corpus.cjs` (32) | success with id + size + **content hash**; exact bytes; **add / autorename off**; **Hebrew names (ASCII-escaped header)**; idempotent; reload; edited after the save → not Handled; **name taken by different content → nothing written**; same content already there → adopted; Undo by id with read-back, **Undo refuses an edited file (no delete call at all)**, delete that did nothing, already gone, non-file ids; 401 refresh / fails; 403; 400 and out of space; 429 + Retry-After (and forever); 5xx did/did not store; timeout; network; **stored but read-back fails → not Handled**; folder / empty / no hash / no id; **wrong size or wrong hash**; over-cap, empty, non-bytes refused before any call; multi-block content hash; **injection through the name** (separators, traversal, quotes, CR/LF, NUL); name cleaning; no token or content in ledger/proof; not connected |
| `test/dropbox-wiring-corpus.cjs` (28) | switches off call nothing; on: saved and read back, one upload + one metadata read, exact bytes, second click, events with no name/id/content, Undo, **edited file not deleted**, foreign sender refused, Disconnect revokes and clears, bad / huge / invalid base64 refused before any call, read-back 500; OAuth: authorize URL and scopes, **PKCE verifier hashes to the challenge**, **no secret and no relay**, forged state, no app key, Dropbox refusing the code |
| `test/consent-catalog-corpus.cjs` (+1) | `dropbox` tick = a PKCE sign-in (no relay) + its two API hosts |

## 8. Security checks (named)

Narrowest scopes and an **App-folder** app, unused endpoints asserted (only the three file endpoints are ever called); **never overwrite, never rename, never delete an edited file**; the file bytes go only to the person's own Dropbox; the name is a single sanitised segment and the API-argument header is ASCII-escaped JSON (no header injection, tested with CR/LF/NUL and quote tricks); no token, name or content in events, ledger or proof; `state` and PKCE checked before the code leaves; no secret exists to leak; the file cap is enforced before decoding; nothing is sent to a person.

## 9. Vendor facts I could not verify (the docs host `dropbox.com/developers` was blocked from the build sandbox)

Endpoint paths, the `Dropbox-API-Arg` header contract, `mode`/`autorename`/`strict_conflict`/`mute` argument names; the **content-hash algorithm** (SHA-256 of the concatenated SHA-256 of each 4 MiB block: the tests check it against the same algorithm written independently with Node, which proves consistency, not that Dropbox computes it this way); response fields (`id`, `size`, `content_hash`, `.tag`); error summaries for conflict / not found / insufficient space / missing scope; that `delete_v2` accepts a file id as the path and that a deleted file then reads as "not found"; the 429 `Retry-After`; PKCE without a secret and `token_access_type=offline`; scope names; refresh-token behaviour; the revoke endpoint; recoverability of deleted files; app review for distribution beyond development users. **The owner Gate must confirm each on the vendor page before go-live.**

## 10. Known limits

- 20 MB per file (no upload sessions). Larger files are refused, not truncated.
- App-folder only: Glance cannot save into a folder the person names. A "choose a folder" slice would need full-Dropbox access (a bigger scope), which the owner would have to approve.
- Case-insensitive names: `A.pdf` and `a.pdf` are the same path; a different-content file with that name is `name-taken`.
- Name-taken is reported but not resolved: Glance does not offer "save as another name" yet (it would need the person's click).
- The bytes of the attachment come from the caller; fetching them from Gmail/Outlook for this destination is not built.

## 11. OWNER PACK

1. **Console.** `https://www.dropbox.com/developers/apps` → Create app → **Scoped access** → **App folder** → name it (the folder name is the app name; e.g. "Glance"). Permissions tab: tick `files.content.write` and `files.metadata.read` and Submit. Settings: add the redirect URI `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL). Copy the **App key** into `OAUTH_PUBLIC.dropboxAppKey` (public; there is no secret to set anywhere).
2. **Netlify env vars:** none (no relay).
3. **Vendor review.** An app can be used by up to a small number of development users without review; to be used by everyone it needs Dropbox's production approval (verify the current requirements: app description, screenshots/demo, privacy policy URL, data-handling answers). Scope justification: *files.content.write*: "to save the one file the person approved into the Glance app folder, and to remove it only if the person presses Undo." *files.metadata.read*: "to read that file's id, size and content hash back and confirm it was saved intact before showing it as done."
4. **Chrome Web Store permission justification (DRAFT):** "Host permissions for api.dropboxapi.com and content.dropboxapi.com: let Glance save one file the person approved into their Dropbox app folder and read it back. Requested only when the person ticks Dropbox."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect Dropbox, Glance saves the file you approve into a Glance folder in your Dropbox and reads it back to confirm it was saved intact. It never overwrites or renames a file and leaves a file you edited alone. The Dropbox access token stays on your device, and the file goes only to your own Dropbox."
6. **Live Gate script** (owner, own Dropbox account, switches on for the chosen build):
   1. Connect Dropbox in the popup. Expect a Dropbox consent that names only the Glance app folder.
   2. Save a test attachment (via the Save card once it offers Dropbox, or the engine's message in the extension console). Expect Verifying…, then Saved; the file appears in `Apps/Glance` with the right name, a Hebrew name intact, and the right size.
   3. Save it again / reload: still one file. Save a **different** file under the same name: expect "name already used", the first file untouched.
   4. Edit the saved file in Dropbox, then press Undo: expect Undo to **refuse** and the file to stay. Revert the edit (or use a fresh file) and press Undo: expect the file gone (in Dropbox's deleted files).
   5. Disconnect: expect the token gone and, in Dropbox → Settings → Connected apps, the app removed.
   6. Pass = 2–5 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) owner creates the Dropbox app (App folder, two scopes) and puts the app key in `OAUTH_PUBLIC.dropboxAppKey`; (b) `api.dropboxapi.com` and `content.dropboxapi.com` hosts in the manifest + store re-review (`«מאשר»`); (c) privacy/store drafts applied; (d) the unverified vendor facts in §9, above all the content-hash algorithm and delete-by-id; (e) the destination chooser on the Save card and the code that fetches the attachment bytes (row 80); (f) production approval from Dropbox before it is used beyond development users.
