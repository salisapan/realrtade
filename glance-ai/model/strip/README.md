# Engine-input stripper (reference for the engine-core fix)

This is a reference implementation in two identical forms:
- JS: `glance-strip.js`, which registers `self.GlanceStrip`;
- Python: `glance_strip.py`.

It behaves exactly like the v2 model path (`runtime/normalize.cjs`), packaged on its own.

## Where to apply it

On every surface, right before `FlowIncomingJudge.judge`:
- `text = stripForEngine(text)`
- `subject = normalizeText(subject)`

## What it does

`stripForEngine` runs `normalizeText`, then cleans the text:
- `normalizeText`: CRLF → LF, nbsp → space, zero-width and bidi characters removed;
- `cleanText`: spaces collapsed, lines trimmed, at most one blank line.

Then it drops:
- everything from a signature delimiter (`--`, `__`, `_____`) or a confidentiality-disclaimer line onward;
- `[image: …]`, `[cid: …]` and `[logo]` placeholder lines;
- mobile footers, in EN and HE.

Quote headers stay in, because the engine strips quotes itself.

## Tests

**`node test-strip.cjs`** checks the engine on the 25,848 synthetic v2 rows (typo twins excluded):

| engine | format flips (raw) | flips removed | flips left | new flips |
|---|---|---|---|---|
| 0.9.35 | 767 | 767 | 0 | 0 |
| 0.9.34 | 774 | 774 | 0 | 0 |
| r35p | 754 | 754 | 0 | 0 |

The same test checks that gold decisions don't move:
- Running the stripper on the clean renders changes 0 engine decisions.
- gold22: 0 changes.
- Repo rows: 0 changes out of 3,757.
- Agreement with the reference label goes from 19,925 to 20,289 out of 22,457 (masked).
- Adversarial: 2 out of 114 change, and both are fixes:
  - `adv2-fmt-crlf-ask` gets its draft back;
  - `adv2-fmt-rlm-hedge` loses a wrong Do-It.

**`python3 test_strip.py`**: the Python output is byte-identical to the JS output on all 207,908 texts. These are every body, clean body and subject in the v2 dataset (31,618 rows), every v2.1 test body, gold22, adversarial, and 38 stress strings (U+2028, \x1c, U+0085, ideographic space, BOM, and others).
