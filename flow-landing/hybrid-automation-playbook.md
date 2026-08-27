# The Hybrid Automation Playbook
### How Regulated Industries Eliminate Manual Data Entry with Zero Compliance Risk

---

## The Real Bottleneck Isn't the AI. It's Where the Data Has to Go.

Every regulated organization has the same problem: critical information — contracts, claims, patient records, closing documents — sits locked inside disconnected systems, and getting it out means manual re-keying, manual cross-checking, and manual routing. The cost isn't just time. It's the errors that slip through when a human has to copy the same number between four applications, and the exposure that piles up every time sensitive data changes hands to get processed.

Most automation tools "solve" this by asking you to trust a single black-box cloud. For a bank, a hospital, or a law firm, that's not a real answer — it's a non-starter dressed up as a feature.

Flow takes a different position: automation should adapt to your compliance posture, not the other way around.

---

## The Core Idea: Deployment Should Match Your Compliance Posture

Flow runs the same Action Graph engine — the same document understanding, the same workflow logic, the same human-in-the-loop approvals — regardless of where it's deployed. What changes is *where the processing happens*, and that choice belongs to your IT and compliance team, not to us.

Flow ships in three deployment models:

- **Secure Masked Cloud** — Flow's managed cloud environment, with sensitive fields (PII, account numbers, policy data) automatically detected and masked client-side *before* anything reaches the cloud. Built for speed and scale where full local infrastructure isn't the constraint.
- **Flow-Edge** — Flow runs entirely on infrastructure inside your own network. Documents are read, understood, and acted on locally; nothing crosses your network boundary. Built for environments where the data itself — not just its processing — can never leave the building.
- **On-Premises** — a fully isolated Flow installation inside your own infrastructure, with no external dependency at all. Built for the firms operating under the strictest data-residency and audit requirements in the market.

Three models, one engine. The rest of this guide shows what that looks like in practice, across three regulated sectors.

---

## Three Sectors, Three Architectures

### Finance & Insurance — Automated Claims Routing & Expense Auditing
**Deployment model: Secure Masked Cloud**

Claims and expense line items arrive faster than teams can route and audit them — every item needs to be checked against policy limits, matched to the right adjuster or cost center, and flagged the moment something breaches a threshold. Doing this by hand doesn't just slow the business down; every manual touch is another chance for a transcription error to become a payout error.

Flow ingests claims and expense reports directly from your existing systems. Account numbers, policyholder identifiers, and other sensitive fields are automatically masked *before* the document ever reaches Flow's cloud environment — the AI processes what it needs to route and audit the claim without ever seeing the raw sensitive data. Flow then routes each claim to the correct queue, and flags any expense line item that breaches policy for human review. You get cloud-grade speed and scale, with masking doing the compliance work under the hood.

### Healthcare — Local Ingestion of Patient Charts & Medical Records
**Deployment model: Flow-Edge**

Under HIPAA, PHI can't leave the hospital network — full stop. But charts and records still need to be read, summarized, and pushed into EHR workflows every single day, and "we can't automate this because of compliance" has been the default answer for too long.

Flow-Edge changes that answer. The entire pipeline — OCR, extraction, summarization, routing into the EHR — runs on infrastructure inside the hospital's own network. Patient charts and medical records are read and acted on without ever traversing an external network boundary. Flow behaves exactly like it does in the cloud model — same document understanding, same human approval checkpoints — the only difference is that the data never leaves the building to get there.

### Legal & Compliance — Cross-Checking Transactional Files & Automated Closing Milestones
**Deployment model: On-Premises**

Real-estate and M&A closings depend on cross-referencing tax records, title documents, and closing ledgers across multiple parties — and a single missed cross-reference can mean a multi-million-dollar transaction stalls, or worse, closes on bad numbers.

This is the exact workflow behind the live demo on our site: a Tax Clearance Certificate arrives for **Project Ironwood**, and Flow — running fully on-premises — automatically detects it, matches it to the active transaction by parcel ID, and cross-checks it against the pending escrow estimate. After a one-click human approval, Flow updates the Transfer Deed with the new tax receipt, recalculates the Closing Statement, and produces the final **Cash to Close** figure ($1,240,500) — then drafts the client dispatch email for a second approval before it goes out. Three human approvals, zero manual data entry, and the firm's transaction data never leaves its own infrastructure. If you've already run the demo, this is that workflow, running on-premises, for real.

---

## Choosing Your Architecture

There is no universally "right" deployment model — only the one that matches your regulatory posture and existing infrastructure.

| | **Secure Masked Cloud** | **Flow-Edge** | **On-Premises** |
|---|---|---|---|
| **Data location** | Masked data processed in Flow's managed cloud | Processed locally, inside your network | Fully isolated inside your infrastructure |
| **Best for** | High-volume workflows where speed/scale matter most | PHI-bound or network-restricted workflows | Legal, financial, and government workflows under the strictest data-residency mandates |
| **Compliance posture** | Client-side masking before any cloud transmission | No data ever crosses the network boundary | No external dependency of any kind |

The right architecture for your organization depends on specifics — your existing infrastructure, your regulator, your risk tolerance — and that's exactly what a discovery call is for. We'll walk through your environment, map it to one of these three models (or a mix, across different workflows), and show you what it looks like running on your own data.

**Ready to see which model fits your organization? Book a discovery call.**
