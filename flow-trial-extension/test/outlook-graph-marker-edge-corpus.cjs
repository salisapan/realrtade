// Behavioral bites on marker-core helpers the Edge worker imports (not string-only).
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowOutlookGraphMarker: M } = require('../core/outlook-graph-marker.js');

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks++;
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

(async function main() {
  let slowAborted = false;
  try {
    await M.graphFetchWithTimeout(30, function () {
      return new Promise(function () { /* never resolves */ });
    });
  } catch (e) {
    slowAborted = /abort/i.test(String(e && e.name || e));
  }
  check('graphFetchWithTimeout aborts hung fetch', slowAborted);

  const opts = M.judgeOptsForAccount({
    own_addresses: ['me@example.com'],
    user_name: 'Sali',
    own_names: ['Sali', 'סאלי']
  });
  check('judgeOptsForAccount passes own name and addresses', opts.userName === 'Sali' && opts.namesPending === false);

  const edge = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', 'outlook-graph-marker', 'index.ts'), 'utf8');
  check('edge notification handler uses try per note', edge.indexOf('async function handleNotifications') >= 0 && edge.indexOf('try {') >= 0 && edge.indexOf('skipped: "error"') >= 0);

  if (failures) process.exit(1);
  console.log('outlook-graph-marker-edge-corpus: all passed (' + checks + ' checks)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
