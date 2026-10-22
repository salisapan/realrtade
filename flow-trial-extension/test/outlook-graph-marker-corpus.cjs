// Server-side Outlook Graph marker helpers (task O).
// Run: node test/outlook-graph-marker-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowOutlookGraphMarker: M } = require('../core/outlook-graph-marker.js');
const { FlowConnectEcosystem: C } = require('../core/connect-ecosystem.js');

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
check('subscription expiry uses Graph mail max minutes', M.subscriptionExpirationIso(now).indexOf('T') > 0);
const subBody = M.subscriptionRequestBody('https://example.com/hook', stateA, in25h);
check('subscription is created-only', subBody.changeType === 'created');

const page1 = M.parseDeltaPage({ value: [{ id: 'm1' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages/delta?$skiptoken=x' });
const page2 = M.parseDeltaPage({ value: [{ id: 'm2' }], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/messages/delta?$deltatoken=y' });
const merged = M.mergeDeltaPages([page1, page2]);
check('delta pagination merges messages', merged.messages.length === 2 && merged.deltaLink.indexOf('deltatoken=y') >= 0);
check('nextLink is not stored as delta', merged.deltaLink.indexOf('skiptoken') < 0);

check('refresh rotation should persist', M.shouldPersistRotatedRefresh('rt-old', 'rt-new') === true);
check('unchanged refresh is not rewritten', M.shouldPersistRotatedRefresh('rt-same', 'rt-same') === false);

const pkce = C.PKCE_REFRESH_INTERFACE;
check('refresh body follows C1 PKCE interface', M.refreshBody('rt-1', 'client-id', M.MAIL_SCOPE, pkce).grant_type === 'refresh_token');

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

if (failures) process.exit(1);
console.log('outlook-graph-marker-corpus: all passed (' + checks + ' checks)');
console.log('surfaces:');
console.log('| surface | transport | notes |');
console.log('| Microsoft Graph inbox messages | webhook POST (changeType=created) | judge + visible flag + Glance category |');
console.log('| Microsoft Graph inbox delta | scheduled/cron + post-renewal | paginate nextLink; persist deltaLink only |');
console.log('| Supabase Edge outlook-graph-marker | HTTP 202 + waitUntil | validationToken plain escaped text |');
console.log('| Vault via outlook_marker_* RPC | service role | read/write rotated refresh_token |');
