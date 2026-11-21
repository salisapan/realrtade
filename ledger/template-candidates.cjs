'use strict';
// Types and frequencies only. No network.
// node ledger/template-candidates.cjs path/to/export.json
const fs = require('fs');
const { FlowClosedIntentLedger: L } = require('../flow-trial-extension/core/closed-intent-ledger.js');

const file = process.argv[2];
if (!file) {
  console.error('usage: node ledger/template-candidates.cjs <export.json>');
  process.exit(1);
}
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const events = Array.isArray(doc) ? doc : (doc.events || []);
const candidates = L.templateCandidates(events);
process.stdout.write(JSON.stringify({ model: L.MODEL, candidates: candidates }, null, 2) + '\n');
