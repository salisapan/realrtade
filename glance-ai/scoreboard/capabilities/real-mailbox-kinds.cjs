'use strict';
// Which KIND of close the product's recognition union routes the owner's real mailbox to (the masked rows of 2026-11-12, private, gitignored, never committed).
// Prints COUNTS only: no text, no sender, no subject, so the output may be quoted. Lab only. usage: node scoreboard/capabilities/real-mailbox-kinds.cjs
const fs = require('fs'), path = require('path');
const { recognize } = require('./union.cjs');
const file = path.join(__dirname, '..', 'real-mail', 'private', 'owner-mailbox-2026-11-12.jsonl');
if (!fs.existsSync(file)) { console.log('no private mailbox file here (it is gitignored); nothing to count'); process.exit(0); }
const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const byKind = {}, byBucket = {};
for (const r of rows) {
  const surface = r.surface === 'outlook' ? 'outlook' : 'gmail';
  const rec = recognize({ surface, sender: r.from, to: r.to, cc: r.cc || [], subject: r.subject || '', attachmentCount: r.attachmentCount || 0, hasThreadAttachment: (r.attachmentCount || 0) > 0, direction: r.direction || 'inbound', inbound: (r.direction || 'inbound') !== 'outbound' }, r.body);
  byKind[rec.family + '/' + rec.via] = (byKind[rec.family + '/' + rec.via] || 0) + 1;
  const b = byBucket[r.bucket] = byBucket[r.bucket] || { n: 0, offered: 0, fam: {} };
  b.n++; if (rec.family !== 'none') { b.offered++; b.fam[rec.family] = (b.fam[rec.family] || 0) + 1; }
}
console.log('rows', rows.length, '\nroute:', JSON.stringify(byKind), '\nbucket -> {n, offered, kinds}:'); for (const [k, v] of Object.entries(byBucket).sort()) console.log(' ', k.padEnd(18), JSON.stringify(v));
