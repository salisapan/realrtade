# Neural experiments for the intent model

Everything here is an EXPERIMENT whose job is to say whether a heavier model deserves to ship. Results and the decision
are in `docs/ai-engine-upgrade.md` §4. Nothing here is loaded by the extension unless it says so.

| File | What it tests | Needs |
|---|---|---|
| `train.py` | A dense neural student (learned 64-d hashed n-gram embeddings, one hidden layer) trained from scratch | numpy |
| `dense-prior.py` | Linear n-gram model with and without a pretrained English word-vector prior (GloVe) | numpy, GloVe 100d file |
| `build-dense-prior.py` | Builds `core/dense-prior-data.js` (git-ignored) so the trainer can use the prior (`--dense`) | numpy, GloVe 100d file |
| `encoder-experiment.py` | A pretrained MULTILINGUAL sentence encoder (default `intfloat/multilingual-e5-small`) vs the n-gram model, per language | **run by the owner**: needs Hugging Face access |

Common first step: `node scripts/intent/dump-features.cjs <dir>` writes the training sentences (grammar + teacher) and the four
hand-written evaluation sets as feature indices and text.
