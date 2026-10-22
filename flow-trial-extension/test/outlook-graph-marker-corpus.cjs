// Server-side Outlook Graph marker helpers (task O).
// Run: node test/outlook-graph-marker-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowOutlookGraphMarker: M } = require('../core/outlook-graph-marker.js');
const { FlowConnectEcosystem: C } = require('../core/connect-ecosystem.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

check('clientState must match exactly', M.validateClientState('user:abcdef12', 'user:abcdef12') === true && M.validateClientState('user:abcdef12', 'wrong') === false);
const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const later = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
check('subscription renews under 7 days', M.subscriptionNeedsRenewal(soon, Date.now()) === true && M.subscriptionNeedsRenewal(later, Date.now()) === false);
check('Do It lane detects outlook draft/task', M.doItLane({ show: true, process: { steps: [{ kind: 'outlookDraft' }] } }) === true);
check('non-offer is not marked', M.doItLane({ show: false }) === false);
const patch = M.categoryPatch(['Blue category']);
check('category patch adds Glance', patch.categories.indexOf('Glance') >= 0 && patch.singleValueExtendedProperties[0].value === '1');
const pkce = C.PKCE_REFRESH_INTERFACE;
const body = M.refreshBody('rt-1', 'client-id', M.MAIL_SCOPE, pkce);
check('refresh body follows C1 PKCE interface', body.client_id === 'client-id' && body.grant_type === 'refresh_token' && body.refresh_token === 'rt-1');

const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261022103000_outlook_graph_marker.sql'), 'utf8');
check('migration targets outlook_graph_accounts and vault read', /outlook_graph_accounts/.test(migration) && /outlook_marker_read_refresh/.test(migration));
const edge = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', 'outlook-graph-marker', 'index.ts'), 'utf8');
check('edge function rejects wrong project ref', edge.indexOf('nlvljclvoguvrnntwufu') >= 0 && edge.indexOf('zjquktirlrhbqcnkfaok') >= 0);
check('edge imports judge bundle', edge.indexOf('judge.bundle.mjs') >= 0);

if (failures) process.exit(1);
console.log('outlook-graph-marker-corpus: all passed');
