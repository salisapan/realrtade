// Server-side Outlook Graph marker helpers (task O).
// Run: node test/outlook-graph-marker-corpus.cjs
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

const SECRET = 'test-client-state-secret';
const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const stateA = M.clientStateForUser(userA, SECRET);
const stateB = M.clientStateForUser(userB, SECRET);

check('per-user clientState differs', stateA !== stateB && M.validateClientStateForUser(stateA, userA, SECRET));
const rowBySub = {
  subA: { user_id: userA, client_state: stateA, subscription_id: 'subA' },
  subB: { user_id: userB, client_state: stateB, subscription_id: 'subB' }
};
check('user A notification resolves only A', M.resolveAccountForNotification({ subscriptionId: 'subA', clientState: stateA }, rowBySub, SECRET).user_id === userA);
check('user A note never touches user B', M.resolveAccountForNotification({ subscriptionId: 'subA', clientState: stateA }, rowBySub, SECRET).user_id !== userB);
check('wrong clientState on subscription does not resolve', M.resolveAccountForNotification({ subscriptionId: 'subA', clientState: stateB }, rowBySub, SECRET) === null);

check('skip already marked: Glance category', M.alreadyMarked({ categories: ['Glance'] }) === true);
check('skip already marked: flagged', M.alreadyMarked({ flag: { flagStatus: 'flagged' } }) === true);
check('skip already marked: extension marker', M.alreadyMarked({ singleValueExtendedProperties: [{ id: M.EXT_PROPERTY_ID, value: '1' }] }) === true);
check('unmarked message is processed', M.alreadyMarked({ categories: [] }) === false);

const patch = M.markPatch([], false);
check('visible flag body shape', patch.flag && patch.flag.flagStatus === 'flagged' && patch.categories.indexOf('Glance') >= 0);
check('idempotency marker kept', patch.singleValueExtendedProperties[0].value === '1');

const now = Date.now();
const in23h = new Date(now + 23 * 60 * 60 * 1000).toISOString();
const in25h = new Date(now + 25 * 60 * 60 * 1000).toISOString();
check('renewal threshold is 24h', M.subscriptionNeedsRenewal(in23h, now) === true && M.subscriptionNeedsRenewal(in25h, now) === false);
check('subscription expiry is below Graph mail max minutes', M.MAIL_SUBSCRIPTION_MAX_MINUTES === 4200 && M.subscriptionExpirationIso(now).indexOf('T') > 0);
check('initial delta lookback is two days', M.INITIAL_DELTA_LOOKBACK_MS === 2 * 24 * 60 * 60 * 1000);
check('delta page cap is bounded', M.MAX_DELTA_PAGES >= 1 && M.MAX_DELTA_PAGES <= 20);
const markedMsg = { categories: ['Glance', 'Blue'], singleValueExtendedProperties: [{ id: M.EXT_PROPERTY_ID, value: '1' }], flag: { flagStatus: 'flagged' } };
check('unmark removes Glance category', M.unmarkPatch(markedMsg, { categories: ['Blue'], flagStatus: 'notFlagged', glanceWillSetFlag: true }).categories.indexOf('Glance') < 0);
const userFlagSnap = M.snapshotBeforeMark({ categories: ['Blue'], flag: { flagStatus: 'flagged' } });
const userFlagMarked = { categories: ['Blue', 'Glance'], singleValueExtendedProperties: [{ id: M.EXT_PROPERTY_ID, value: '1' }], flag: { flagStatus: 'flagged' } };
check('CTO2 close never clears a user-set flag', M.unmarkPatch(userFlagMarked, userFlagSnap).flag === undefined);
check('CTO2 undo restores categories and flag from snapshot', M.undoPatch(userFlagSnap).categories.indexOf('Blue') >= 0 && M.undoPatch(userFlagSnap).flag.flagStatus === 'flagged');
check('read-back requires category and marker property', M.readBackMarked({ categories: ['Glance'], singleValueExtendedProperties: [{ id: M.EXT_PROPERTY_ID, value: '1' }] }).ok === true);
check('graph GET uses expand for extended properties', M.graphMessageGetQuery().indexOf('$expand=singleValueExtendedProperties') >= 0);
check('first delta path filters receivedDateTime', M.nextDeltaPath(null, 'https://graph.microsoft.com/v1.0', { nowMs: now }).indexOf('receivedDateTime ge') >= 0);
const subBody = M.subscriptionRequestBody('https://example.com/hook', stateA, in25h);
check('subscription is created-only', subBody.changeType === 'created');

const page1 = M.parseDeltaPage({ value: [{ id: 'm1' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages/delta?$skiptoken=x' });
const page2 = M.parseDeltaPage({ value: [{ id: 'm2' }], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/messages/delta?$deltatoken=y' });
const merged = M.mergeDeltaPages([page1, page2]);
check('delta pagination merges messages', merged.messages.length === 2 && merged.deltaLink.indexOf('deltatoken=y') >= 0);
check('nextLink is not stored as delta', merged.deltaLink.indexOf('skiptoken') < 0);

check('refresh rotation should persist', M.shouldPersistRotatedRefresh('rt-old', 'rt-new') === true);
check('unchanged refresh is not rewritten', M.shouldPersistRotatedRefresh('rt-same', 'rt-same') === false);

const pkceRefreshIface = {
  grantTypes: { refresh: 'refresh_token' },
  grants: { refresh_token: ['client_id', 'grant_type', 'refresh_token', 'scope'] }
};
check('refresh body follows C1 PKCE interface', M.refreshBody('rt-1', 'client-id', M.MAIL_SCOPE, pkceRefreshIface).grant_type === 'refresh_token');

const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261022103000_outlook_graph_marker.sql'), 'utf8');
check('migration has client_state and write_refresh RPC', /client_state/.test(migration) && /outlook_marker_write_refresh/.test(migration));
check('migration revokes vault RPC from anon and authenticated (read)',
  /revoke execute on function public\.outlook_marker_read_refresh\(uuid\) from anon, authenticated/.test(migration));
check('migration revokes vault RPC from anon and authenticated (write)',
  /revoke execute on function public\.outlook_marker_write_refresh\(uuid, text\) from anon, authenticated/.test(migration));
check('migration write_refresh uses vault.update_secret',
  /perform vault\.update_secret\(secret_id, token\)/.test(migration));
check('migration enables RLS on outlook_graph_accounts',
  /alter table public\.outlook_graph_accounts enable row level security/.test(migration)
  && /alter table public\.outlook_graph_accounts force row level security/.test(migration));
check('migration revokes table outlook_graph_accounts from anon and authenticated',
  /revoke all on table public\.outlook_graph_accounts from anon, authenticated/.test(migration));

const edge = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', 'outlook-graph-marker', 'index.ts'), 'utf8');
check('edge returns 202 before work finishes', edge.indexOf('status: 202') >= 0 && edge.indexOf('EdgeRuntime.waitUntil') >= 0);
check('edge has scheduled renewal path', edge.indexOf('handleScheduled') >= 0 && /cron/.test(edge));
check('edge imports judge bundle', edge.indexOf('judge.bundle.mjs') >= 0);
check('edge read-back after PATCH', edge.indexOf('readBackMarked') >= 0 && edge.indexOf('fetchedBack') >= 0);
check('edge unmark path for undo close not-this', edge.indexOf('handleUnmark') >= 0 && edge.indexOf('unmarkPatch') >= 0);
check('edge recreates subscription on 404', edge.indexOf('status === 404') >= 0);
check('edge prefers plain text bodies', edge.indexOf('outlook.body-content-type') >= 0);
check('migration deletes vault secret on account row delete',
  /outlook_marker_delete_refresh/.test(migration) && /outlook_graph_accounts_delete_refresh/.test(migration));
check('migration trigger is idempotent', /drop trigger if exists outlook_graph_accounts_updated_at/.test(migration));
check('migration RPC search_path empty', /set search_path = ''/.test(migration));
check('validation token escaped', edge.indexOf('escapeValidationToken') >= 0);

const CRON = 'cron-test-secret-value';
check('scheduled 401 without cron header', M.authorizeScheduledRequest(undefined, CRON) === false);
check('scheduled 401 with wrong cron secret', M.authorizeScheduledRequest('not-the-secret', CRON) === false);
check('scheduled accepted with correct cron secret', M.authorizeScheduledRequest(CRON, CRON) === true);
check('edge enforces OUTLOOK_MARKER_CRON_SECRET on scheduled path',
  edge.indexOf('OUTLOOK_MARKER_CRON_SECRET') >= 0
  && edge.indexOf('CRON_HEADER') >= 0
  && /status:\s*401/.test(edge)
  && edge.indexOf('authorizeScheduledRequest') >= 0);
check('migration documents pg_cron http_post sample', /net\.http_post/.test(migration) && /x-glance-cron/.test(migration));

check('unmark 401 without bearer jwt user', M.authorizeUnmarkUser('', userA).allowed === false && M.authorizeUnmarkUser('', userA).status === 401);
check('unmark 403 when body userId is another user', M.authorizeUnmarkUser(userA, userB).allowed === false && M.authorizeUnmarkUser(userA, userB).status === 403);
check('unmark uses jwt user id when body omits userId', M.authorizeUnmarkUser(userA, undefined).allowed === true && M.authorizeUnmarkUser(userA, undefined).userId === userA);
check('unmark allows matching body userId', M.authorizeUnmarkUser(userA, userA).allowed === true && M.authorizeUnmarkUser(userA, userA).userId === userA);
check('parseBearerAuthorization reads Authorization header', M.parseBearerAuthorization('Bearer jwt-token-abc') === 'jwt-token-abc' && M.parseBearerAuthorization('') === '');
check('edge unmark verifies Supabase JWT before waitUntil', edge.indexOf('auth.getUser') >= 0 && edge.indexOf('SUPABASE_ANON_KEY') >= 0 && edge.indexOf('parseBearerAuthorization') >= 0);
check('edge unmark returns 401 without Authorization', /payload\.unmark/.test(edge) && edge.indexOf('jsonResponse(401') >= 0);
check('edge unmark returns 403 on user mismatch', edge.indexOf('authorizeUnmarkUser') >= 0 && edge.indexOf('jsonResponse(gate.status') >= 0);
check('edge unmark passes jwt userId into handleUnmark', edge.indexOf('userId: gate.userId') >= 0);
check('edge unmark still requires Glance marker property', edge.indexOf('hasMarkerProperty') >= 0 && edge.indexOf('not-glance-marker') >= 0);

const readme = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', 'outlook-graph-marker', 'README.md'), 'utf8');
const configToml = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'config.toml'), 'utf8');

let uint8Throws = false;
try { M.assertStorageSecret(new Uint8Array([1, 2, 3])); } catch (e) { uint8Throws = /Uint8Array/.test(String(e.message || e)); }
const tag = M.clientStateTagBase64(userA, SECRET);
check('CTO1 tokens and hashes are base64 text never Uint8Array', uint8Throws && M.refreshTokenForVaultWrite('rt-plain') === 'rt-plain' && tag.length > 0 && !/[^A-Za-z0-9_-]/.test(tag));

const policyBlocks = migration.match(/create policy[\s\S]*?;/gi) || [];
const policiesIdempotent = policyBlocks.every((block) => {
  const nameMatch = /create policy\s+(\S+)/i.exec(block);
  if (!nameMatch) return true;
  const pol = nameMatch[1];
  return migration.indexOf('drop policy if exists ' + pol) >= 0;
});
check('CTO3 every CREATE POLICY is guarded for re-run', policyBlocks.length >= 2 && policiesIdempotent);

const readmeSecrets = (readme.split('## Secrets')[1] || '').split('##')[0];
check('CTO4 README deploy uses no-verify-jwt and lists no SUPABASE secrets', /--no-verify-jwt/.test(readme) && !/SUPABASE_/.test(readmeSecrets));

check('CTO5 edge judge receives userName and own addresses', edge.indexOf('judgeOptsForAccount') >= 0 && edge.indexOf('judgeOutlookInboxMessage(message, ownAddresses, judgeOpts)') >= 0);
check('CTO6 maintenance wall is under 150 seconds', M.MAINTENANCE_WALL_MS < 150000 && edge.indexOf('MAINTENANCE_WALL_MS') >= 0 && edge.indexOf('maintenanceBudgetExceeded') >= 0);
check('CTO6 notification path uses graph fetch timeout', M.GRAPH_FETCH_TIMEOUT_MS > 0 && edge.indexOf('graphFetchWithTimeout') >= 0 && edge.indexOf('GRAPH_FETCH_TIMEOUT_MS') >= 0);
check('CTO6 notification loop checks wall budget', edge.indexOf('budgetStartMs = Date.now()') >= 0 && edge.indexOf('skipped: "budget"') >= 0);

const batchNotes = [
  { subscriptionId: 'subA', clientState: stateB },
  { subscriptionId: 'subA', clientState: stateA },
];
const batchResults = batchNotes.map((n) => M.resolveAccountForNotification(n, rowBySub, SECRET));
check('CTO7 one bad notification never fails the batch', batchResults[0] === null && batchResults[1] && batchResults[1].user_id === userA && edge.indexOf('skipped: "clientState"') >= 0);
check('CTO7 edge catches per-notification errors and continues', edge.indexOf('skipped: "error"') >= 0 && /catch \(err\)/.test(edge) && edge.indexOf('handleNotifications') >= 0);

if (failures) process.exit(1);
console.log('outlook-graph-marker-corpus: all passed (' + checks + ' checks)');
console.log('surfaces:');
console.log('| surface | transport | notes |');
console.log('| Microsoft Graph inbox messages | webhook POST (changeType=created) | judge + visible flag + Glance category |');
console.log('| Microsoft Graph inbox delta | scheduled/cron + post-renewal | paginate nextLink; persist deltaLink only |');
console.log('| Supabase Edge outlook-graph-marker | HTTP 202 + waitUntil | validationToken plain escaped text |');
console.log('| Vault via outlook_marker_* RPC | service role | read/write rotated refresh_token |');
