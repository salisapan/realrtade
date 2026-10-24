# Glance: suggested save of attachments (Sali lock 2026-10-08 01:01)

Glance offers to save an inbound email's real attached files: OneDrive on Outlook, Drive on Gmail. It does this even when the body doesn't ask.
It is a question card the user approves. There is never an automatic save.
After Do It, the same ProofOfClose/fetchedBack and Undo bar applies as for an explicit save.

## 1. When it can appear (all must hold)
- The mail is inbound: not sent by the user, not a draft, not in Sent.
- The real file list was actually read (Graph /attachments, or the Gmail payload parts).
  - Never derive the count from hasAttachments.
  - If the list can't be read, stay quiet with reason `suggest:attachments-unread`.
- There is at least one real file after filtering. Excluded:
  - isInline = true, or the part has a Content-ID referenced in the body (cid:)
  - itemAttachment (an attached email) and referenceAttachment (a cloud link)
  - .ics / .vcs / .vcf, winmail.dat, .p7s / .p7m / smime
  - Images named image\d{3}\.(png|jpe?g|gif), or any image under 20KB (signature logos, even when not inline)
- The mail isn't marketing or bulk: no List-Unsubscribe header, and the judgment did not return quiet:noise or marketing.
- The body has no refusal. The existing SAVE_NO patterns in EN and HE, e.g. "don't save" / אל תשמור / לא לשמור / אין צורך לשמור, give quiet with reason `suggest:negated`.
- The target matches the surface. The target is chosen by the host only.
  - Outlook targets OneDrive only, and Gmail targets Drive only.
  - A Gmail mail that names OneDrive as the target stays quiet. Never offer Drive in its place.
  - An Outlook mail that names Drive as the target stays quiet, including a bare "Drive" or "דרייב" (not the word inside OneDrive or וואן דרייב). Never offer OneDrive in its place. A named shared folder, SharePoint, Dropbox, Box or Teams folder stays quiet as `suggest:other-target`. Refusal in the body (`suggest:negated`) is decided before the target.

## 2. Dedupe: never suggest twice
- Key: messageId + set of attachment ids.
- No suggestion if a ProofOfClose (saved) already exists for those files.
- No suggestion if the user dismissed this message's suggestion. The dismissal is stored locally and survives reload and remount.
- Also no suggestion if the target folder already has a file with the same name and size. If that check is too costly, skip it in v1; the ProofOfClose check is mandatory.

## 3. Priority and prominence ("must not get in the way")
- The target is chosen by the host only: OneDrive when the mail is open in Outlook, Drive when it is open in Gmail. The body's storage name never switches that target. A name for the other host, including a bare "Drive" or "דרייב" on Outlook, keeps the suggestion quiet.
- An explicit ask wins: task / meeting / explicit save / reply draft.
  - When an explicit card exists, v1 doesn't show the suggestion at all and logs reason `suggest:other-card`.
- Explicit save with n=1 keeps the current behavior from #103.
- An explicit save request with n≥2 ("save the attachments") becomes this suggestion card, with the file count shown.
- v1 placement: a small, lower-priority chip on the open page only, with no Loops entry and no notification.
  - The chip is not in the primary Do It style.
  - It has two buttons: [Save] and [Not now]. [Not now] is a dismissal under section 2.
- One suggestion per mail, even with several files:
  - "Save 2 files to OneDrive?"
  - "לשמור 2 קבצים ב-OneDrive?"
  - The file names are listed in small text.

## 4. Action and proof
- Save every listed file to the same folder as an explicit save.
- Handled only after every file has fetchedBack (GET of the item by id with matching name and size).
- Partial success: show "Saved 1 of 2". Undo deletes only what was saved.
- Undo deletes all of them and clears Handled.
- Large files: per the existing explicit-save upload path. If a file can't be uploaded (e.g. over the size limit without an upload session), show the suggestion without that file. If no files are left, stay quiet with reason `suggest:too-large`.

## 5. What counts as a wrong suggestion (gate metric, target 0)
A suggestion counts as wrong if any of these is true:
- It was shown on an inline image, signature logo, .ics, attached email or smime file.
- It was shown on outbound mail, marketing, or with a refusal in the body.
- It was shown again after a save or a dismissal.
- It used the wrong target (Drive on Outlook, OneDrive on Gmail).
- It was shown alongside an explicit card.

Also measure the suggestion rate per 100 inbound mails and the dismissal rate (logged locally only). There's no cap in v1, but a dismissal rate above 60% is a signal to tighten.

## 6. Corpus rows (expected result)
| # | Surface | Files | Body | Expected |
|---|---|---|---|---|
| 1 | Outlook | 1 PDF (Q3-report.pdf, 240KB) | Hi, attached is the Q3 report. Thanks | chip "Save file to OneDrive?" |
| 2 | Outlook | 2 PDFs | Hi, attached is the Q3 report. Thanks | chip "Save 2 files to OneDrive?" |
| 3 | Outlook | image001.png inline only | Thanks, Dana | quiet |
| 4 | Outlook | image001.png 8KB non-inline | Thanks, Dana | quiet |
| 5 | Outlook | invite.ics only | See you Tuesday | quiet |
| 6 | Outlook | 1 PDF | Hi, Please don't save the attachment to OneDrive. Thanks | quiet (negated) |
| 7 | Outlook | 1 PDF | Can we meet Tuesday at 10:00 to go over it? | meeting card only, explicit-wins |
| 8 | Outlook | 1 PDF | Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks | explicit OneDrive card (unchanged) |
| 9 | Outlook | 2 PDFs | Please save the attachments to OneDrive | chip "Save 2 files to OneDrive?" |
| 10 | Gmail | 1 PDF | מצורף הדוח הרבעוני | chip "לשמור את הקובץ ב-Drive?" |
| 11 | Gmail | 1 PDF | Please save the attachment to OneDrive | quiet (onedrive-target-on-gmail) |
| 12 | Gmail | 1 PDF | אל תשמור את הקובץ המצורף | quiet (negated) |
| 13 | either | 1 PDF | (mail sent by the user) | quiet |
| 14 | either | brochure.pdf + List-Unsubscribe | Join our webinar | quiet |
| 15 | Outlook | attachments read fails | Hi, attached is the Q3 report | quiet, suggest:attachments-unread |
| 16 | Outlook | itemAttachment only | FYI see below | quiet |
| 17 | Outlook | smime.p7s only | Thanks | quiet |
| 18 | Outlook | row 1 after [Not now] + reload | | quiet, dismissed |
| 19 | Outlook | row 1 after Save + reload | | Handled receipt, no new chip |

Gate: all 19 rows pass, and the 1,015 gold utterances show 0 new explicit-card shows. Every new chip must belong to a row type above. Live Gate: rows 1, 2, 3 (a real signature logo), 6, 7, 10 and 19, plus Undo.

## 7. Reconciled with Dima's draft (2026-10-08 01:10)
Dima's reason names win: suggest:multi-file is dropped (see below), suggest:other-card, suggest:already-saved, suggest:dismissed, suggest:bulk, suggest:no-consent.
- **Files.** Dima's document allowlist is accepted (pdf/doc(x)/xls(x)/ppt(x)/csv/txt/rtf/odt/ods/odp/key/pages/numbers, ≥2KB). It is extended with images (jpg/jpeg/png/heic) only when all of these hold:
  - the image is not inline
  - it has no cid
  - it is at least 100KB
  - its name doesn't match image\d{3} or Outlook-*
  These are scans and photos of receipts.
- **Multi-file is in v1**, as CoS's guardrail requires: "Save N files". Partial success and Undo work as in section 4.
- **noreply.** A noreply sender alone does not block, because invoices and receipts come from noreply. List-Unsubscribe or Precedence bulk/list blocks with suggest:bulk.
- **Undo.** Undo on the key counts as a dismissal.
- **Consent.** No consent gives quiet with suggest:no-consent.
- **Gmail.** A Gmail mail that names OneDrive as the target stays quiet.
- **Rate limit.** No daily cap in v1 (the chip is page-only with no notification). Log the suggestion rate and the dismissal rate.
- **Extra corpus rows:**
  - 20: Outlook, scan.jpg of 1.2MB (non-inline) → chip.
  - 21: Gmail from noreply@ with invoice.pdf and no List-Unsubscribe → chip "Save invoice.pdf to Drive?".
  - 22: Outlook, 1 PDF, OneDrive box not checked → quiet with suggest:no-consent.

## 8. UI = a step in Glance's step list (Sali 01:07, agreed with Glance Design 01:08). Replaces the separate chip in sections 3 and 7.
The eligibility rules, reason codes, dedupe and ProofOfClose rules from sections 1–7 still apply. Only how the suggestion is presented changes.

**Card model**
- An intent line, then steps[]. Each step has:
  - a checkbox
  - the tool glyph
  - the action text
  - one line: "Tool · outcome"
- Then a close step, locked as "after Approve".
- The chip counts only the checked steps. The locked close step is not counted.

**A suggested step (something the mail did not ask for, e.g. saving a file)**
- Unchecked, placed after the asked steps and before the close step.
- Gray "Suggested" tag (Hebrew: מוצע), with the glyph and text slightly dimmed.
- The chip shows it separately: "… in 3 steps · tools  +1 suggested".
- Once checked, it joins the count and keeps the tag.
- An explicit save ask is a regular, checked step, as in #103.

**Only a file, no other ask**
- The chip itself is the suggestion: "Save contract.pdf to OneDrive?"
- When opened, it shows a single step, checked: pressing Do It is the consent.
- There is no locked close step.
- After Do It: one result line plus Undo.
- Never an automatic save.

**Several files**
- One step: "OneDrive/Drive · Save N attachments".
- Under it, file pills that toggle on and off. Up to 3 are shown, then "+N".
- N updates with the selection.
- ProofOfClose is per file. The step is Handled only after fetchedBack for every selected file.

**Add a step**
- A text input.
- If Glance maps it with certainty to a supported tool action, it becomes a regular step with a gray "Added" tag and is counted.
- Otherwise it is "✎ Manual · for you": no checkbox, not run, not counted.
- The receipt then says "1 manual step left for you".
- Never guess.

**When a suggested step is left unchecked and the card runs or is dismissed**
- It is treated as dismissed for that messageId + attachment key, and is never offered again for that mail and file.
- There is no visual state and it doesn't appear in the receipt.
- A file that was already saved (matching name+size hash) is not offered in another mail either.

**Row states**
1. Preparing (small spinner).
2. Verifying (gray).
3. A blue ✓ (#0071e3) plus the result line, shown only after fetchedBack.
4. "Couldn't confirm · Retry" (gray).
5. The close step shows ✓ only after Approve and fetchedBack.

**How a failed step affects Approve**
- A failed required step (asked or added) blocks Approve until it is resolved.
- A failed suggested step does NOT block Approve. It stays in "Couldn't confirm · Retry", is excluded from Handled and the receipt, and its partial files are cleaned up by Undo.

The design frames (Light, Dark, RTL) come from Glance Design.

## 9. Decisions after the v2.2 reference (2026-10-08 01:30)
- **Added reason codes.** All five use the suggest: prefix: suggest:not-inbound, suggest:no-files, suggest:onedrive-target-on-gmail, suggest:drive-target-on-outlook, suggest:other-target.
- **Single-file wording.** It always uses the file name: "Save <filename> to OneDrive?" / "Save <filename> to Drive?". This matches the F2 design and replaces the "Save file" wording in row 1.
- **SAVE_NO.** The core negations plus the product-rules list ("You don't need to save" and similar). Without it, 26 false chips appear.
- **Shadow log.** One record per message per model.
- **Reference oracle.** model/suggest-save/suggest-save.js passes rows 22/22, plus 31 extra cases.
