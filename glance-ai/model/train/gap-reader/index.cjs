'use strict';
// Pinned date reader for the template-intent gap labels (gap-labels-v23/v24/v25).
// The labels depend on core/extract.js parseDate: with the reader of 2026-10-19 (1fc43b3b) the v2 test split has 367 gap rows,
// with the PR #280 tip reader 450. A newer reader must never be picked up silently, so:
//   default                       the vendored copy extract-1fc43b3b.js (byte-identical to 1fc43b3b:flow-trial-extension/core/extract.js)
//   GLANCE_GAP_EXTRACT=<file>     another copy of the same reader; its sha256 must equal READER.json
//   GLANCE_GAP_READER_UNPINNED=1  allow a different reader (experiments only; recorded as pinned:false in meta.json and the log)
// The reader actually used is written to <features dir>/meta.json as gapReader and printed on stderr.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PIN = JSON.parse(fs.readFileSync(path.join(__dirname, 'READER.json'), 'utf8'));
const file = path.resolve(process.env.GLANCE_GAP_EXTRACT || path.join(__dirname, 'extract-1fc43b3b.js'));
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pinned = sha256 === PIN.sha256;
if (!pinned && process.env.GLANCE_GAP_READER_UNPINNED !== '1') {
  console.error(`gap reader ${file} has sha256 ${sha256}, the pin is ${PIN.sha256} (${PIN.commit.slice(0, 8)}). ` +
    'Unset GLANCE_GAP_EXTRACT to use the pinned copy, or set GLANCE_GAP_READER_UNPINNED=1 for an experiment.');
  process.exit(3);
}
const info = { commit: pinned ? PIN.commit : null, sha256, pinned, file: path.relative(path.join(__dirname, '..', '..'), file) };
console.error('gap reader: ' + JSON.stringify(info));
const { FlowExtract } = require(file);
// stamp the reader into a features dir's meta.json (called after the script copies meta.json)
function stamp(dir) {
  const p = path.join(dir, 'meta.json');
  const m = JSON.parse(fs.readFileSync(p, 'utf8')); m.gapReader = info;
  fs.writeFileSync(p, JSON.stringify(m));
}
module.exports = { FlowExtract, info, stamp };
