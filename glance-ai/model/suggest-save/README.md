# Suggest-save eligibility rule (reference for 0.9.38)

This implements `specs/suggest-save.md` §1–7 as one deterministic pure function, with identical outputs in JS and Python:
- JS: `suggest-save.js`, which registers `self.GlanceSuggestSave`;
- Python: `suggest_save.py`.

## Usage

`decide(input)` returns `{suggest, reason, target, mode, files, excluded, key, chip{count, target, names, en, he}}`. The input shape is documented in the header of `suggest-save.js`.

Adapters for the two real sources:
- `fromGraph(list)`: Graph `/attachments`;
- `fromGmailPayload(payload)`: Gmail payload parts;
- `bodyCidsOf(html)`: the `cid:` references in the HTML body.

## Reason codes

**Dima's names, used verbatim:**
- `suggest:other-card`
- `suggest:already-saved`
- `suggest:dismissed`
- `suggest:bulk`
- `suggest:no-consent`
- `suggest:attachments-unread`
- `suggest:negated`
- `suggest:too-large`

**Added here.** The spec says "quiet" for these but gives no code, so they need confirming:
- `suggest:not-inbound` (row 13);
- `suggest:no-files` (rows 3, 4, 5, 16 and 17);
- `suggest:onedrive-target-on-gmail` (row 11; the name comes from the row text);
- `suggest:drive-target-on-outlook` (the symmetric case);
- `suggest:other-target` (the mail names a shared folder or files, SharePoint, Dropbox, Box or Teams as the target).

A shown chip has reason `suggest:show`.

## Check order

The first check that fails names the reason:
1. not-inbound
2. no-consent (checked before the attachment list is fetched)
3. attachments-unread
4. bulk: List-Unsubscribe, Precedence bulk/list/junk, `quiet:noise`, or marketing
5. negated
6. wrong or other target
7. no-files
8. too-large
9. other-card (an explicit card, or an engine silence that hands the mail to the file chain or a lookup)
10. already-saved
11. dismissed

## Choices to confirm

- **Negation** is core `SAVE_NO` (0.9.36–0.9.39) **or** the v2 product-rule `NEG_SAVE`. Core `SAVE_NO` alone let 26 refusals through on the dataset layer, for example "You don't need to save the attachment…" and "אל תעלי את המצורף ל-OneDrive" (an upload verb). Under spec §5 a chip on those is a wrong suggestion.
- **An explicit save with n ≥ 2 real files** becomes this chip, with `mode: 'explicit-multi'`. An explicit save with n = 1 stays the explicit card (#103).
- **Chip wording for n = 1** follows row 1 and §3: "Save file to OneDrive?" / "לשמור את הקובץ ב-OneDrive?", with the names in `chip.names`. Row 21 writes "Save invoice.pdf to Drive?" instead. The spec contradicts itself here, so pick one.

## Tests

- `node test-corpus.cjs && python3 test_corpus.py`:
  - all 22 spec rows pass (24 cases, since rows 13 and 14 run on both surfaces);
  - 31 extra edge cases pass;
  - JS and Python outputs are byte-equal.
- `python3 check_dataset.py`: Python matches JS on all 8,191 rows of the dataset layer.
- `node build-suggest-dataset.cjs` writes `../dataset/out-v22/suggest-save.jsonl`. The attachment metadata is **synthesized** (seeded) over real dataset rows.
