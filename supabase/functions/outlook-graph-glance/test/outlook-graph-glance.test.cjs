'use strict';
// Headless Graph mocks + bundled core judge. Run: node supabase/functions/outlook-graph-glance/test/outlook-graph-glance.test.cjs

const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');

const ROOT = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '..', '..', '..', '..');

let failures = 0;
let passes = 0;
function check(name, cond, detail) {
  if (cond) {
    passes++;
    console.log('PASS:', name);
  } else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

async function loadEsm(rel) {
  const full = path.join(repoRoot, rel);
  return await import(pathToFileURL(full).href);
}

function pathToFileURL(p) {
  const { pathToFileURL } = require('url');
  return pathToFileURL(p);
}

(async () => {
  const cryptoMod = await loadEsm('supabase/functions/outlook-graph-glance/lib/crypto.mjs');
  const graphMod = await loadEsm('supabase/functions/outlook-graph-glance/lib/graph.mjs');
  const notifyMod = await loadEsm('supabase/functions/outlook-graph-glance/lib/notify-handler.mjs');
  const notifyCore = await loadEsm('supabase/functions/outlook-graph-glance/lib/notify-handler-core.mjs');
  const jobsMod = await loadEsm('supabase/functions/outlook-graph-glance/lib/jobs.mjs');
  const loopMod = await loadEsm('supabase/functions/outlook-graph-glance/lib/loop-actions.mjs');
  const judgeMod = await loadEsm('supabase/functions/outlook-graph-glance/judge-bundle.mjs');

  const { encryptRefreshToken, decryptRefreshToken, hashClientState, constantTimeEqual } = cryptoMod;
  const {
    validationEchoResponse,
    categoriesWithGlance,
    patchForMark,
    patchForUnmark,
    subscriptionsNeedingRenewal,
    GRAPH_SUBSCRIPTION_MAX_MINUTES
  } = graphMod;

  // --- validation handshake ---
  const echo = validationEchoResponse('abc123');
  check('validationToken echo status', echo.status === 200 && echo.body === 'abc123');

  const reqEcho = new Request('https://example.com/outlook-graph-glance?validationToken=xyz', { method: 'POST' });
  const resEcho = await notifyMod.handleGraphNotificationRequest(reqEcho, {});
  check('validation handshake response', resEcho.status === 200 && (await resEcho.text()) === 'xyz');

  // --- clientState constant-time reject ---
  const pepper = 'pepper';
  const goodHash = await hashClientState('state-secret', pepper);
  const badHash = await hashClientState('wrong', pepper);
  check('clientState good hash stable', constantTimeEqual(goodHash, await hashClientState('state-secret', pepper)));
  check('clientState bad rejected', !constantTimeEqual(goodHash, badHash));

  const userId = '00000000-0000-4000-8000-000000000001';
  const marked = new Set();
  const dismissed = new Set();
  const patches = [];

  function mockDeps(overrides) {
    return {
      clientStatePepper: pepper,
      async resolveUserFromNotification(note) {
        if (note.subscriptionId !== 'sub-1') return null;
        return { user_id: userId, client_state_hash: goodHash };
      },
      async getAccessTokenForUser() {
        return { accessToken: 'mock-token' };
      },
      async isDismissed(_u, mid) {
        return dismissed.has(mid);
      },
      async isAlreadyMarked(_u, mid) {
        return marked.has(mid);
      },
      async recordMarked(_u, mid) {
        marked.add(mid);
      },
      judgeOpts: {},
      ...overrides
    };
  }

  const closableMsg = {
    id: 'msg-close',
    subject: 'Deck',
    categories: ['Work'],
    body: { contentType: 'text', content: 'Can you please sign the pilot deck and send it back by Friday? We need it for the board.' },
    from: { emailAddress: { name: 'Ann', address: 'ann@acme.com' } }
  };
  const quietMsg = {
    id: 'msg-quiet',
    subject: 'FYI',
    categories: [],
    body: { contentType: 'text', content: 'Just a heads up that the all-hands moved to 3pm. No action needed from you.' },
    from: { emailAddress: { name: 'Ann', address: 'ann@acme.com' } }
  };

  const originalFetch = global.fetch;
  function notifyFetch(url, init) {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    if (method === 'PATCH' && u.includes('/messages/')) {
      patches.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (u.includes('msg-close')) {
      return { ok: true, status: 200, json: async () => closableMsg };
    }
    if (u.includes('msg-quiet')) {
      return { ok: true, status: 200, json: async () => quietMsg };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  }
  global.fetch = notifyFetch;

  const badStateReq = new Request('https://example.com/outlook-graph-glance', {
    method: 'POST',
    body: JSON.stringify({
      value: [{ subscriptionId: 'sub-1', clientState: 'wrong', resourceData: { id: 'msg-close' } }]
    })
  });
  const badStateRes = await notifyMod.handleGraphNotificationRequest(badStateReq, mockDeps());
  check('bad clientState rejected', badStateRes.status === 403);

  const goodReq = new Request('https://example.com/outlook-graph-glance', {
    method: 'POST',
    body: JSON.stringify({
      value: [{ subscriptionId: 'sub-1', clientState: 'state-secret', resourceData: { id: 'msg-close' } }]
    })
  });
  await notifyMod.handleGraphNotificationRequest(goodReq, mockDeps());
  check('closable marked', marked.has('msg-close'));
  check('closable patch preserves Work category', patches[0] && patches[0].categories.includes('Work') && patches[0].categories.includes('Glance'));
  check('closable patch flags', patches[0] && patches[0].flag.flagStatus === 'flagged');

  const quietReq = new Request('https://example.com/outlook-graph-glance', {
    method: 'POST',
    body: JSON.stringify({
      value: [{ subscriptionId: 'sub-1', clientState: 'state-secret', resourceData: { id: 'msg-quiet' } }]
    })
  });
  const patchCountBefore = patches.length;
  await notifyMod.handleGraphNotificationRequest(quietReq, mockDeps());
  check('quiet untouched', patches.length === patchCountBefore && !marked.has('msg-quiet'));

  await notifyMod.handleGraphNotificationRequest(goodReq, mockDeps());
  check('idempotent re-notification', patches.length === 1);

  check('categories helper preserves existing', categoriesWithGlance(['A', 'B']).join() === 'A,B,Glance');

  // --- renewal under 7d ---
  const now = Date.parse('2026-10-22T12:00:00Z');
  const need = subscriptionsNeedingRenewal(
    [
      { expiration: new Date(now + 2 * 86400000).toISOString() },
      { expiration: new Date(now + 10 * 86400000).toISOString() }
    ],
    now
  );
  check('renewal under 7d picks one', need.length === 1);
  check('subscription max within Graph cap', GRAPH_SUBSCRIPTION_MAX_MINUTES === 4230);

  // --- delta catch-up (mock) ---
  let deltaCalls = 0;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/delta')) {
      deltaCalls++;
      if (deltaCalls === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            value: [{ id: 'delta-1' }],
            '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=abc'
          })
        };
      }
    }
    if (u.includes('/messages/delta-1')) {
      return { ok: true, status: 200, json: async () => closableMsg };
    }
    if (u.includes('/messages/') && u.includes('PATCH')) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const deltaStore = {
    link: null,
    async getDeltaLink() {
      return this.link;
    },
    async setDeltaLink(_u, l) {
      this.link = l;
    },
    async getAccessTokenForUser() {
      return { accessToken: 't' };
    },
    async isDismissed() {
      return false;
    },
    async isAlreadyMarked() {
      return false;
    },
    async recordMarked() {}
  };
  const deltaOut = await jobsMod.runDeltaCatchUp(deltaStore, userId, now);
  check('delta catch-up scanned', deltaOut.ok && deltaOut.scanned >= 1);
  check('delta link stored', deltaStore.link && deltaStore.link.includes('deltatoken=abc'));

  // --- token encrypt/decrypt ---
  const key = webcrypto.getRandomValues(new Uint8Array(32));
  const keyHex = Buffer.from(key).toString('hex');
  const enc = await encryptRefreshToken('refresh-token-plain', keyHex);
  const round = await decryptRefreshToken(enc.refresh_token_enc, enc.token_nonce, keyHex);
  check('token encrypt/decrypt roundtrip', round === 'refresh-token-plain');

  // --- 20-row corpus ---
  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus-20.json'), 'utf8'));
  check('corpus has 20 rows', corpus.length === 20);
  for (const row of corpus) {
    const j = judgeMod.judgeIncoming({
      text: row.body,
      subject: row.subject,
      sender: { email: 'sender@example.com', name: 'Sender' },
      inbound: true,
      surface: 'outlook'
    });
    const mark = judgeMod.shouldOfferDoIt(j);
    check('corpus ' + row.id, mark === row.expectMark, { got: mark, reason: j.reason });
  }

  // --- close / undo parity (mock) ---
  const undoSnaps = new Map();
  const loopPatches = [];
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/messages/loop-1') && (!init || init.method === 'GET' || !init.method)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'loop-1', categories: ['Glance', 'Work'], body: { contentType: 'text', content: 'x' } })
      };
    }
    if (init && init.method === 'PATCH') {
      loopPatches.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const loopDeps = {
    async getAccessTokenForUser() {
      return { accessToken: 't' };
    },
    async isAlreadyMarked() {
      return true;
    },
    async clearMarked() {},
    async recordDismissed(_u, mid) {
      dismissed.add(mid);
    },
    async clearDismissed(_u, mid) {
      dismissed.delete(mid);
    },
    async rememberPreUndo(_u, mid, wasMarked) {
      undoSnaps.set(mid, { wasMarked });
    },
    async getPreUndo(_u, mid) {
      return undoSnaps.get(mid) || { wasMarked: false };
    },
    async recordMarked(_u, mid) {
      marked.add(mid);
    }
  };
  await loopMod.closeMessage(loopDeps, userId, 'loop-1');
  check('close removes Glance category', loopPatches[0] && !loopPatches[0].categories.includes('Glance'));
  check('close dismisses id', dismissed.has('loop-1'));
  await loopMod.undoClose(loopDeps, userId, 'loop-1');
  check('undo restores Glance', loopPatches.some((p) => p.categories && p.categories.includes('Glance')));

  global.fetch = originalFetch;

  console.log('---');
  console.log('passes:', passes, 'failures:', failures);
  if (failures) process.exit(1);
})();
