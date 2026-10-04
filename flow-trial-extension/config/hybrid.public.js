// The switches for the hybrid execution path (docs/hybrid-execution-architecture.md). Public: nothing here is a secret.
//
// enabled:      the whole path. false = the worker never creates the offscreen page, never probes, never downloads, and executeTask() answers
//               "needs-consent". It is FALSE in this build on purpose: no feature in the extension calls executeTask() yet, so turning it on would
//               download 2.15 GB on every capable computer for nothing. Flip it when a feature uses it, and in the same commit make the privacy page
//               say it (docs/hybrid-execution-architecture.md §13); test/hybrid-copy-corpus.cjs fails if the flag is true and the page does not.
// autoDownload: start the on-device model download by itself on a computer that passes the silent capability check (the popup can still turn it off).
// serverFallback: allow a masked prompt to go to the company server when the device is unsure or has no model.
export const HYBRID = { enabled: false, autoDownload: true, serverFallback: true };
