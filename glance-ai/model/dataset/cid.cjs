'use strict';
// A stable content id for a dataset or label row (plan 2, P1, experiment E11). Row ids like "v2syn-22856" are POSITIONAL and move when the generator changes
// (the 2026-11 incident: 301 of 500 labelled texts vanished and the rest were joined to other texts). A label should be joined by this id: the same text,
// language, surface and direction always give the same id, and a text that no longer exists simply has no match instead of a wrong one.
const crypto = require('crypto');
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function cid(row) {
  const t = norm(row.cleanBody != null && row.cleanBody !== '' ? row.cleanBody : row.body);
  const from = row.from && typeof row.from === 'object' ? row.from.email : row.from;
  return crypto.createHash('sha256').update([row.lang || '', row.surface || '', row.direction || '', String(from || '').toLowerCase(), norm(row.subject), t].join('\u0001')).digest('hex').slice(0, 16);
}
module.exports = { cid, norm };
