// Behavioral bites on marker-core.mjs + index.ts (not the CJS mirror alone).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
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

function asyncFnBody(src, fnName) {
  const re = new RegExp('(?:export\\s+)?async function ' + fnName);
  const m = re.exec(src);
  const i = m ? m.index : -1;
  if (i < 0) return '';
  const brace = src.indexOf('{', i);
  if (brace < 0) return '';
  let depth = 0;
  for (let j = brace; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(brace + 1, j);
    }
  }
  return '';
}

function forLoopBodies(fnBody) {
  const bodies = [];
  let i = 0;
  while (i < fnBody.length) {
    const idx = fnBody.indexOf('for (', i);
    if (idx < 0) break;
    const brace = fnBody.indexOf('{', idx);
    if (brace < 0) break;
    let depth = 0;
    let closed = false;
    for (let j = brace; j < fnBody.length; j++) {
      const ch = fnBody[j];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          bodies.push(fnBody.slice(brace + 1, j));
          i = j + 1;
          closed = true;
          break;
        }
      }
    }
    if (!closed) break;
  }
  return bodies;
}

function firstLoopBudgetCondition(loopBody) {
  const m = loopBody.match(/if\s*\(\s*(maintenanceBudgetExceeded\s*\(\s*budgetStartMs\s*,\s*Date\.now\(\)\s*\))\s*\)\s*\{/);
  return m ? m[1].trim() : '';
}

function evalBudgetGuard(condSrc, maintenanceBudgetExceeded, budgetStartMs, nowMs) {
  if (!condSrc || condSrc === 'false') return false;
  const DateShim = { now: function () { return nowMs; } };
  const fn = new Function(
    'maintenanceBudgetExceeded',
    'budgetStartMs',
    'Date',
    'return !!(' + condSrc + ');',
  );
  return fn(maintenanceBudgetExceeded, budgetStartMs, DateShim);
}

function fetchHonoringAbort(url, init) {
  const signal = init && init.signal;
  return new Promise(function (resolve, reject) {
    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', function () {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }
    resolve({
      status: 200,
      ok: true,
      json: function () {
        return new Promise(function (_resolve, rejectJson) {
          if (signal && typeof signal.addEventListener === 'function') {
            signal.addEventListener('abort', function () {
              rejectJson(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          }
        });
      }
    });
  });
}

async function graphFetchBudgeted(core, budgetStartMs, nowMs) {
  if (typeof budgetStartMs === 'number' && core.maintenanceBudgetExceeded(budgetStartMs, nowMs)) {
    return { budget: true };
  }
  await core.fetchJsonWithTimeout(30, 'https://graph.microsoft.com/v1.0/me/messages/x', { method: 'GET' });
  return { budget: false };
}

async function main() {
  const watchdog = setTimeout(function () {
    console.error('FAIL: edge-corpus watchdog (main hung or produced no checks)');
    process.exit(1);
  }, 90000);

  const core = await import(pathToFileURL(MARKER_CORE).href);
  const edge = fs.readFileSync(EDGE_INDEX, 'utf8');
  const coreSrc = fs.readFileSync(MARKER_CORE, 'utf8');

  check('marker-core GRAPH_FETCH_TIMEOUT_MS is 45s', core.GRAPH_FETCH_TIMEOUT_MS === 45000);
  check('marker-core MAINTENANCE_WALL_MS under 150s', core.MAINTENANCE_WALL_MS === 149000 && core.MAINTENANCE_WALL_MS < 150000);

  let uint8Throws = false;
  try { core.assertStorageSecret(new Uint8Array([1])); } catch (e) { uint8Throws = /Uint8Array/.test(String(e.message || e)); }
  check('marker-core assertStorageSecret rejects Uint8Array', uint8Throws);

  let slowAborted = false;
  const t0 = Date.now();
  try {
    await core.graphFetchWithTimeout(80, function (signal) {
      return new Promise(function (resolve, reject) {
        if (signal && typeof signal.addEventListener === 'function') {
          signal.addEventListener('abort', function () { reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
        }
      });
    });
  } catch (e) {
    slowAborted = /abort/i.test(String(e && e.name || e));
  }
  check('marker-core graphFetchWithTimeout aborts hung fetchFn', slowAborted && Date.now() - t0 < 500);

  const originalFetch = global.fetch;
  global.fetch = fetchHonoringAbort;
  let stallOut = null;
  const stallT0 = Date.now();
  stallOut = await core.fetchJsonWithTimeout(120, 'https://graph.microsoft.com/v1.0/me/messages/stall', { method: 'GET' });
  global.fetch = originalFetch;
  const stallMs = Date.now() - stallT0;
  check('marker-core fetchJsonWithTimeout aborts stalled res.json()',
    stallMs >= 80 && stallMs < 400 && stallOut && stallOut.ok === true && stallOut.json === null);

  let sawSignal = false;
  global.fetch = function (_url, init) {
    sawSignal = Boolean(init && init.signal && typeof init.signal.addEventListener === 'function');
    return fetchHonoringAbort(_url, init);
  };
  try {
    await core.fetchJsonWithTimeout(60, 'https://example.com/signal', { method: 'GET' });
  } catch (e) { /* abort */ }
  global.fetch = originalFetch;
  check('marker-core fetchJsonWithTimeout passes AbortSignal to fetch', sawSignal);

  const fetchJsonBody = asyncFnBody(coreSrc, 'fetchJsonWithTimeout');
  check('marker-core fetchJsonWithTimeout reads JSON inside timeout callback',
    fetchJsonBody.indexOf('await res.json()') >= 0 && fetchJsonBody.indexOf('graphFetchWithTimeout') >= 0);

  const budgetStart = 1000;
  const overWall = budgetStart + core.MAINTENANCE_WALL_MS + 1;
  check('graphFetch budget guard trips when wall exceeded',
    (await graphFetchBudgeted(core, budgetStart, overWall)).budget === true);
  global.fetch = function () {
    return Promise.resolve({ status: 200, ok: true, json: function () { return Promise.resolve({}); } });
  };
  check('graphFetch budget guard allows fetch under wall',
    (await graphFetchBudgeted(core, budgetStart, budgetStart + 1)).budget === false);
  global.fetch = originalFetch;

  const graphBody = asyncFnBody(edge, 'graphFetch');
  const ensureBody = asyncFnBody(edge, 'ensureAccessToken');
  const processBody = asyncFnBody(edge, 'processMessage');
  const fetchMsgBody = asyncFnBody(edge, 'fetchMessage');
  const refreshBody = asyncFnBody(edge, 'refreshAccessToken');
  const notifBody = asyncFnBody(edge, 'handleNotifications');

  check('index graphFetch checks budget before fetchJsonWithTimeout',
    /maintenanceBudgetExceeded\(budgetStartMs,\s*Date\.now\(\)\)/.test(graphBody) &&
    graphBody.indexOf('maintenanceBudgetExceeded') < graphBody.indexOf('fetchJsonWithTimeout'));
  check('index graphFetch uses fetchJsonWithTimeout not raw fetch to GRAPH',
    graphBody.indexOf('fetchJsonWithTimeout') >= 0 && !/\bfetch\s*\(\s*GRAPH/.test(graphBody));
  check('index graphFetch passes GRAPH_FETCH_TIMEOUT_MS to fetchJsonWithTimeout',
    graphBody.indexOf('fetchJsonWithTimeout(GRAPH_FETCH_TIMEOUT_MS') >= 0);
  check('index ensureAccessToken checks budget before refresh token read and refresh',
    (ensureBody.match(/maintenanceBudgetExceeded\(budgetStartMs,\s*Date\.now\(\)\)/g) || []).length >= 2 &&
    ensureBody.indexOf('readRefreshToken') > ensureBody.indexOf('maintenanceBudgetExceeded') &&
    ensureBody.lastIndexOf('maintenanceBudgetExceeded') < ensureBody.indexOf('refreshAccessToken'));
  check('index refreshAccessToken uses fetchJsonWithTimeout for token endpoint',
    refreshBody.indexOf('fetchJsonWithTimeout') >= 0 && refreshBody.indexOf('login.microsoftonline.com') >= 0);
  check('index processMessage checks budget at entry',
    /^\s*if \(typeof budgetStartMs === "number" && maintenanceBudgetExceeded\(budgetStartMs/.test(processBody));
  check('index fetchMessage forwards budgetStartMs into graphFetch',
    /graphFetch\([\s\S]*budgetStartMs/.test(fetchMsgBody));
  check('index handleNotifications passes budgetStartMs to fetchMessage',
    /fetchMessage\(token,\s*resourceId,\s*budgetStartMs\)/.test(notifBody));

  const catchBlock = (notifBody.match(/catch \(err\) \{[\s\S]*?\n    \}/) || [])[0] || '';
  check('index notification catch records error without aborting batch',
    catchBlock.indexOf('skipped: "error"') >= 0 && !/return results/.test(catchBlock));

  check('marker-core graphFetchWithTimeout wires abort timer (kills timeout-noop mutant)',
    /const timer = setTimeout\(\(\) => ctrl\.abort\(\), ms\)/.test(coreSrc));
  global.fetch = fetchHonoringAbort;
  const abortRace = await Promise.race([
    core.fetchJsonWithTimeout(100, 'https://example.com/abort-race', { method: 'GET' }).then(function () { return 'finished'; }),
    new Promise(function (resolve) { setTimeout(function () { resolve('stalled'); }, 250); })
  ]);
  global.fetch = originalFetch;
  check('marker-core stalled json finishes before outer race loses (abort timer live)',
    abortRace === 'finished');

  check('index graphFetch has per-fetch budget guard (kills graphfetch-budget-off mutant)',
    /if \(typeof budgetStartMs === "number" && maintenanceBudgetExceeded\(budgetStartMs, Date\.now\(\)\)\)/.test(graphBody));

  const opts = core.judgeOptsForAccount({
    own_addresses: ['me@example.com'],
    user_name: 'Sali',
    own_names: ['Sali', 'סאלי']
  });
  check('judgeOptsForAccount passes own name and addresses', opts.userName === 'Sali' && opts.namesPending === false);

  check('index uses maintenanceBudgetExceeded from marker-core',
    edge.indexOf('maintenanceBudgetExceeded') >= 0 && edge.indexOf('from "./marker-core.mjs"') >= 0);

  const deltaBody = asyncFnBody(edge, 'deltaCatchUp');
  check('index deltaCatchUp checks maintenance budget in page loop',
    (deltaBody.match(/maintenanceBudgetExceeded\(budgetStart/g) || []).length >= 1 &&
    deltaBody.indexOf('graphFetch(token, path)') >= 0);
  check('index runAccountMaintenance passes budgetStartMs into deltaCatchUp',
    /deltaCatchUp\(token, current\.delta_link, Date\.now\(\), budgetStartMs\)/.test(edge));

  check('marker-core clientStateTag is base64url not hex',
    core.clientStateTagBase64('user-1', 'secret').indexOf('+') < 0 && core.clientStateTagBase64('user-1', 'secret').length > 8);
  check('marker-core resolveAccountForNotification rejects bad clientState',
    core.resolveAccountForNotification({ subscriptionId: 'sub1', clientState: 'bad' }, { sub1: { client_state: 'good:tag' } }, 'secret') === null);
  const emptyOpts = core.judgeOptsForAccount({ own_addresses: [], own_names: [], user_name: null });
  check('marker-core judgeOptsForAccount without own names is namesPending',
    emptyOpts.namesPending === true && emptyOpts.ownNames === null);
  check('index processMessage passes budgetStartMs into graphFetch patch',
    /graphFetch\(token,[\s\S]*budgetStartMs\)/.test(processBody));
  check('index runAccountMaintenance passes budgetStartMs into processMessage',
    /processMessage\(supabase,\s*token,\s*msg,\s*current,\s*budgetStartMs\)/.test(asyncFnBody(edge, 'runAccountMaintenance')));

  const schedBody = asyncFnBody(edge, 'handleScheduled');
  const notifLoops = forLoopBodies(notifBody);
  const schedLoops = forLoopBodies(schedBody);
  const maintLoops = forLoopBodies(asyncFnBody(edge, 'runAccountMaintenance'));
  const notifBudgetCond = notifLoops[0] ? firstLoopBudgetCondition(notifLoops[0]) : '';
  const schedBudgetCond = schedLoops[0] ? firstLoopBudgetCondition(schedLoops[0]) : '';
  const deltaBudgetCond = maintLoops[0] ? firstLoopBudgetCondition(maintLoops[0]) : '';
  const loopWallStart = 1_700_000_000_000;
  const loopUnderWall = loopWallStart + 1000;
  const loopOverWall = loopWallStart + core.MAINTENANCE_WALL_MS + 1;
  check('notification loop budget guard is live (under wall)',
    notifBudgetCond && !evalBudgetGuard(notifBudgetCond, core.maintenanceBudgetExceeded, loopWallStart, loopUnderWall));
  check('notification loop budget guard trips on fake clock (over wall)',
    notifBudgetCond && evalBudgetGuard(notifBudgetCond, core.maintenanceBudgetExceeded, loopWallStart, loopOverWall));
  check('scheduled account loop budget guard is live (under wall)',
    schedBudgetCond && !evalBudgetGuard(schedBudgetCond, core.maintenanceBudgetExceeded, loopWallStart, loopUnderWall));
  check('scheduled account loop budget guard trips on fake clock (over wall)',
    schedBudgetCond && evalBudgetGuard(schedBudgetCond, core.maintenanceBudgetExceeded, loopWallStart, loopOverWall));
  check('delta message loop budget guard is live (under wall)',
    deltaBudgetCond && !evalBudgetGuard(deltaBudgetCond, core.maintenanceBudgetExceeded, loopWallStart, loopUnderWall));
  check('delta message loop budget guard trips on fake clock (over wall)',
    deltaBudgetCond && evalBudgetGuard(deltaBudgetCond, core.maintenanceBudgetExceeded, loopWallStart, loopOverWall));

  const serveChunk = edge.slice(edge.indexOf('Deno.serve'), edge.indexOf('Deno.serve') + 9000);
  check('index returns 202 before awaiting notification or scheduled work',
    /const work = scheduled \? handleScheduled\(supabase\) : handleNotifications\(supabase, payload\)/.test(serveChunk) &&
    !/await\s+handleNotifications/.test(serveChunk) &&
    !/await\s+handleScheduled/.test(serveChunk) &&
    /EdgeRuntime\.waitUntil\(\s*work\.then/.test(serveChunk));

  check('index bad clientState continues batch instead of returning',
    /skipped:\s*"clientState"[\s\S]{0,120}continue/.test(notifBody) &&
    !/skipped:\s*"clientState"[\s\S]{0,120}return\s+results/.test(notifBody));

  check('index processMessage reads account.own_addresses for judge',
    /const ownAddresses = \(account && account\.own_addresses\)/.test(processBody) &&
    /judgeOutlookInboxMessage\(message,\s*ownAddresses/.test(processBody));

  const judgeBundle = path.join(ROOT, 'supabase', 'functions', 'outlook-graph-marker', 'judge.bundle.mjs');
  const judge = await import(pathToFileURL(judgeBundle).href);
  const selfSentAsk = {
    subject: 'Invoice',
    body: { contentType: 'text', content: 'Please send the invoice by Friday.' },
    from: { emailAddress: { name: 'Me', address: 'me@example.com' } },
    toRecipients: [{ emailAddress: { address: 'me@example.com' } }],
    hasAttachments: false,
  };
  const judgeOpts = { userName: 'Me', ownNames: ['Me'], namesPending: false };
  const withOwn = judge.judgeOutlookInboxMessage(selfSentAsk, ['me@example.com'], judgeOpts);
  const withoutOwn = judge.judgeOutlookInboxMessage(selfSentAsk, [], judgeOpts);
  check('own_addresses: index must pass account list into judge (not empty)',
    withOwn && withoutOwn && withOwn.show === true && withoutOwn.show === false);

  const flaggedBeforeGlance = {
    categories: ['Glance'],
    flag: { flagStatus: 'flagged' },
    singleValueExtendedProperties: [{ id: core.EXT_PROPERTY_ID, value: '1' }],
  };
  const userFlagSnap = { categories: ['Blue'], flagStatus: 'flagged', glanceWillSetFlag: false };
  const closePatch = core.unmarkPatch(flaggedBeforeGlance, userFlagSnap);
  check('close does not clear user flag when glanceWillSetFlag was false',
    !closePatch.flag || closePatch.flag.flagStatus !== 'notFlagged');
  const undoPatch = core.unmarkPatchForAction(flaggedBeforeGlance, userFlagSnap, 'undo');
  check('undo restores snapshot flagStatus when user had flagged before Glance',
    undoPatch && undoPatch.flag && undoPatch.flag.flagStatus === 'flagged');

  clearTimeout(watchdog);
  if (checks < 10) {
    console.error('FAIL: edge-corpus ran too few checks', checks);
    process.exit(1);
  }
  if (failures) process.exit(1);
  console.log('outlook-graph-marker-edge-corpus: all passed (' + checks + ' checks)');
}

const run = main().catch(function (e) {
  console.error(e);
  process.exit(1);
});

const hangGuard = setTimeout(function () {
  console.error('FAIL: edge-corpus outer watchdog');
  process.exit(1);
}, 95000);
run.finally(function () { clearTimeout(hangGuard); });
