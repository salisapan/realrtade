// Behavioral bites on marker-core.mjs + index.ts (not the CJS mirror alone).
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const MARKER_CORE = path.join(ROOT, 'supabase', 'functions', 'outlook-graph-marker', 'marker-core.mjs');
const EDGE_INDEX = path.join(ROOT, 'supabase', 'functions', 'outlook-graph-marker', 'index.ts');

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks++;
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function main() {
  const core = await import(pathToFileURL(MARKER_CORE).href);
  const edge = fs.readFileSync(EDGE_INDEX, 'utf8');

  let slowAborted = false;
  try {
    await core.graphFetchWithTimeout(30, function (signal) {
      return new Promise(function (resolve, reject) {
        if (signal && typeof signal.addEventListener === 'function') {
          signal.addEventListener('abort', function () { reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
        }
      });
    });
  } catch (e) {
    slowAborted = /abort/i.test(String(e && e.name || e));
  }
  check('marker-core graphFetchWithTimeout aborts hung fetch', slowAborted);

  const coreSrc = fs.readFileSync(MARKER_CORE, 'utf8');
  check('marker-core fetchJsonWithTimeout reads JSON inside timeout callback', /export async function fetchJsonWithTimeout[\s\S]*?await res\.json\(\)/.test(coreSrc));

  if (typeof globalThis.fetch === 'function') {
    const original = global.fetch;
    global.fetch = function () {
      return Promise.resolve({
        status: 200,
        ok: true,
        json: function () { return Promise.resolve({ token: 'ok' }); }
      });
    };
    const tokenOut = await core.fetchJsonWithTimeout(500, 'https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST', body: 'x' });
    global.fetch = original;
    check('marker-core fetchJsonWithTimeout returns parsed JSON', tokenOut.ok === true && tokenOut.json && tokenOut.json.token === 'ok');
  } else {
    check('marker-core fetchJsonWithTimeout returns parsed JSON', typeof core.fetchJsonWithTimeout === 'function', 'skip: no fetch');
  }

  let sawSignal = false;
  try {
    await core.graphFetchWithTimeout(25, async function (signal) {
      sawSignal = Boolean(signal && typeof signal.addEventListener === 'function');
      await new Promise(function (r) { setTimeout(r, 200); });
      return { ok: true };
    });
  } catch (e) { /* timeout */ }
  check('marker-core timeout passes AbortSignal into fetchFn', sawSignal);

  const budgetStart = Date.now() - core.MAINTENANCE_WALL_MS - 5;
  check('marker-core maintenanceBudgetExceeded trips on wall', core.maintenanceBudgetExceeded(budgetStart, Date.now()));

  const opts = core.judgeOptsForAccount({
    own_addresses: ['me@example.com'],
    user_name: 'Sali',
    own_names: ['Sali', 'סאלי']
  });
  check('judgeOptsForAccount passes own name and addresses', opts.userName === 'Sali' && opts.namesPending === false);

  check('index token refresh uses fetchJsonWithTimeout', /async function refreshAccessToken[\s\S]*?fetchJsonWithTimeout/.test(edge));
  check('index graphFetch reads JSON inside fetchJsonWithTimeout', /async function graphFetch[\s\S]*?fetchJsonWithTimeout/.test(edge));
  check('index processMessage checks budget before work', /async function processMessage[\s\S]*?maintenanceBudgetExceeded\(budgetStartMs/.test(edge));
  check('index passes budgetStartMs into ensureAccessToken', /ensureAccessToken\(supabase, full, budgetStartMs\)/.test(edge));

  const notifFn = edge.slice(edge.indexOf('async function handleNotifications'));
  const catchBlock = (notifFn.match(/catch \(err\) \{[\s\S]*?\n    \}/) || [])[0] || '';
  check('notification catch records error without aborting batch', catchBlock.indexOf('skipped: "error"') >= 0 && !/return results/.test(catchBlock));

  if (failures) process.exit(1);
  console.log('outlook-graph-marker-edge-corpus: all passed (' + checks + ' checks)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
