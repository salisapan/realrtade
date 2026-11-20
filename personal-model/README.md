# Personal model

Glance closes open loops. Gmail is where it starts today.

The contract in `contract.yaml` is the source. `node personal-model/generate.cjs` writes the schemas, the types, and `DATA-DICTIONARY.md`. `node personal-model/check.cjs` fails when a field has no purpose, consent category, pii level, half-life, retention, or third-party flag.

The engine is `flow-trial-extension/core/personal-model.js`. The store is `flow-trial-extension/src/personal-model-idb.js`. Fact, alias, entity, and exemplar payloads are AES-GCM. The key is not extractable. Consents and tombstones are not mail.

## Roadmap

Slice 2 is style per audience from the person's own sent mail, including a capped example and an edit-distance number.

Slice 3 is work facts with evidence offsets, a review when two addresses share a name, and a short profile of confirmed lines.

Slice 4 is a passive bandit that stays off, a lift report of `model_assist` on against holdout, and the same confirmed facts for the Gmail add-on. Flow on a customer's server and iPhone stay on this contract and are not built in this slice.

A later slice adds provenance so inbound mail cannot instruct the model, retrieval weights, memory spaces, and crypto-shred.
