# Personal model

Glance closes open loops. Gmail is where it starts today.

The contract in `contract.yaml` is the source. `node personal-model/generate.cjs` writes the schemas, the types, and `DATA-DICTIONARY.md`. `node personal-model/check.cjs` fails when a field has no purpose, consent category, pii level, half-life, retention, or third-party flag.

The engine is `flow-trial-extension/core/personal-model.js`. The store is `flow-trial-extension/src/personal-model-idb.js`. Fact, alias, entity, and exemplar payloads are AES-GCM. The key is not extractable. Consents and tombstones are not mail.

## Roadmap

Slice 2 is style per audience from the person's own sent mail, including a capped example and an edit-distance number.

Slice 3 is work facts with evidence offsets, a review when two addresses share a name, and a short profile of confirmed lines.

Slice 4 is a passive bandit that stays off, a lift report of `model_assist` on against holdout, and the same confirmed facts for the Gmail add-on. Flow on a customer's server and iPhone stay on this contract and are not built in this slice.

## Cloud inference

The cloud default embedder is `Qwen/Qwen3-Embedding-0.6B` (Apache-2.0). `intfloat/multilingual-e5-small` stays the offline fallback in the extension. Hebrew NER on the cloud is `dicta-il/dictabert-joint` (CC-BY-4.0). The client switch in `flow-trial-extension/core/personal-inference.js` is off until the owner approves the host and the CTO adds the `personal-infer` action. That action must accept short spans only, use TLS, drop the raw text after the response, and not train on it unless the person opts in. Category consent still decides whether a span may be sent. Results land in the encrypted model on this computer.

There is no optional model download and no ONNX bundle. Offline, the same call uses rules and `libphonenumber-js@1.13.17`.

A third-party sentence is a candidate. It does not change a draft or a Do It until the person confirms it, or their own sent mail corroborates it. Retrieval score is normalized recency, importance, and cosine with weights 0.4, 0.3, and 0.3. Nightly consolidation closes stale rows and may add a derived row. It does not hard-delete. Forget-all destroys the key.
