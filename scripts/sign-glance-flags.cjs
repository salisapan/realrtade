#!/usr/bin/env node
// Re-sign flow-landing/glance-flags.json after editing chatLanes. Private PEM: GLANCE_FLAGS_SIGNING_PEM (never commit).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FLAGS = path.join(__dirname, '..', 'flow-landing', 'glance-flags.json');
const pem = process.env.GLANCE_FLAGS_SIGNING_PEM;
if (!pem) {
  console.error('Set GLANCE_FLAGS_SIGNING_PEM to the owner ECDSA P-256 PEM.');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(FLAGS, 'utf8'));
const body = { version: raw.version || 1, chatLanes: raw.chatLanes };
const payload = JSON.stringify(body);
const key = crypto.createPrivateKey(pem);
const sig = crypto.sign('sha256', Buffer.from(payload, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }).toString('base64');
raw.signature = sig;
fs.writeFileSync(FLAGS, JSON.stringify(raw, null, 2) + '\n');
console.log('Signed', FLAGS);
