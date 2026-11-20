# Database definition

Glance closes open loops. Gmail is where it starts today.

This note follows the shape of a database definition under Israel's Privacy Protection Law, Amendment 13. The database is the browser profile on the person's own computer. Glance does not hold a copy on a server in this slice.

## Controller and holder

The person is the holder. The database is IndexedDB `glance-personal-model` on the extension origin. There is no processor and no transfer abroad, because nothing is sent.

## Purposes

One purpose: help close a loop the person already has, by ranking a person or a meeting hour, or by matching how the person writes. Preparation is not completion. The model never sends mail.

## Categories

| Category | Default | What it may hold | PII |
|---|---|---|---|
| people | off | alias, address, relation, tie, channel, language, reply-latency bucket | direct for the address and alias |
| habits | off | weekday hour, duration, tool, working-hours band | indirect |
| style | off | greeting, sign-off, length, formality, a short scrubbed example | indirect |
| work | off | organization, project, client, commitment, with offsets | indirect |
| places | off | city only | indirect |
| identity | off | the person's own name, role, and organization from mail they sent | direct |

Sensitive matters are not a category. Health, religion, politics, sexuality, ethnicity, a union, a criminal matter, and a precise location are dropped before a write.

## Legal basis

Consent. Each category has its own switch and a one-screen disclosure. Consent is not bundled.

## Retention

Observed facts decay by the half-life on the field, recorded in `DATA-DICTIONARY.md`. A fact the person confirmed stays at confidence 1 and does not decay. Tombstones are kept so a deleted fact is not learned again. Forget-all deletes the rows and writes tombstones.

## Rights

The person can see every fact, confirm it, edit it, forget it, or mark never-learn. Export writes a JSON file on this computer. Delete removes the rows from IndexedDB.

## Security

Fact, alias, entity, and exemplar payloads use AES-GCM and a key WebCrypto will not export. Evidence stored with a fact is an id and a time, not the mail. Indexes for the closed-intent ledger stay a separate database.

## What is not stored

Mail bodies, subjects, street addresses, map pins, and personality scores. A third party does not get a role, an organization, a habit, or a place. An inbound instruction is a candidate and is not used.

## Glance cloud

Glance has its own cloud. Unlike Flow, this personal model is not the on-prem product. The cloud embedder is `Qwen/Qwen3-Embedding-0.6B` (Apache-2.0). `multilingual-e5-small` is the offline fallback and is not a download. Hebrew NER is `dicta-il/dictabert-joint` (CC-BY-4.0). The catalog is `infra/models.yaml`. See `NOTICE.md`. The client flag is off until the owner approves the host.

The client switch is off. The only host, when a CTO turns the action on, is `https://theflow-ai.com/.netlify/functions/glance-assist`. No new host permission is added. A call sends a few spans of at most 400 characters, over TLS, and the service must not keep the raw text and must not train on it unless the person opts in. Consent for the category is required before a span is sent. The result is stored in the encrypted model on this computer. Offline, rules and libphonenumber answer instead.

## Spaces and shredding

A fact belongs to work, personal, or one client. Using it in another space needs an explicit approval. A thread can run with memory off. Crypto-shred deletes the key, which makes the ciphertext unreadable.
