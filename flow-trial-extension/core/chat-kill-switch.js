// Per-user and remote kill switches for chat lanes. Portable helpers; chrome.* only in async readers.
const FlowChatKillSwitch = (() => {
  const STORAGE_PREFIX = 'glanceChatOff.';
  const REMOTE_BAG_KEY = 'glanceChatKillRemote';
  const ALARM = 'glance-chat-kill-poll';
  const POLL_MINUTES = 360; // 6h
  const SURFACE_KEYS = ['whatsapp', 'messenger', 'instagram'];

  function config() {
    return globalThis.__glanceFlagsConfig || {
      URL: 'https://theflow-ai.com/glance-flags.json',
      PUBLIC_JWK: null
    };
  }

  function allOff(neverFetched) {
    const off = {};
    SURFACE_KEYS.forEach((k) => { off[k] = true; });
    return { off: off, fetchedAt: 0, neverFetched: neverFetched === true, valid: false };
  }

  function signableBody(body) {
    if (!body || typeof body !== 'object') return null;
    return { version: body.version || 1, chatLanes: body.chatLanes || {} };
  }

  function canonicalPayload(body) {
    const signable = signableBody(body);
    if (!signable) return '';
    return JSON.stringify(signable);
  }

  function verifySync(body, publicJwk) {
    if (!body || !body.signature || !publicJwk) return false;
    try {
      const crypto = require('crypto');
      const key = crypto.createPublicKey({ key: publicJwk, format: 'jwk' });
      return crypto.verify(
        'sha256',
        Buffer.from(canonicalPayload(body), 'utf8'),
        { key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(body.signature, 'base64')
      );
    } catch (e) {
      return false;
    }
  }

  async function verifyAsync(body, publicJwk) {
    if (!body || !body.signature || !publicJwk || !globalThis.crypto || !globalThis.crypto.subtle) {
      return verifySync(body, publicJwk);
    }
    try {
      const key = await globalThis.crypto.subtle.importKey(
        'jwk',
        publicJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const raw = Uint8Array.from(atob(body.signature), (c) => c.charCodeAt(0));
      return await globalThis.crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        raw,
        new TextEncoder().encode(canonicalPayload(body))
      );
    } catch (e) {
      return false;
    }
  }

  function lanesFromChatFlags(chatLanes) {
    const lanes = chatLanes || {};
    const off = {};
    const allOn = lanes.all && lanes.all.enabled === true;
    if (!allOn) {
      SURFACE_KEYS.forEach((k) => { off[k] = true; });
      return off;
    }
    SURFACE_KEYS.forEach((k) => {
      if (!(lanes[k] && lanes[k].enabled === true)) off[k] = true;
    });
    return off;
  }

  function parseRemoteBody(body, opts) {
    const o = opts || {};
    const jwk = o.publicJwk || (config().PUBLIC_JWK);
    const verified = o.skipVerify === true ? true : (o.verifySync === true ? verifySync(body, jwk) : false);
    if (!verified && o.skipVerify !== true) return null;
    const signable = signableBody(body);
    if (!signable) return null;
    const off = lanesFromChatFlags(signable.chatLanes);
    return { off: off, fetchedAt: Date.now(), neverFetched: false, valid: true };
  }

  function userKey(surface) {
    return STORAGE_PREFIX + String(surface || '');
  }

  function isSurfaceOff(surface, userOff, remoteBag) {
    const key = String(surface || '');
    if (userOff && userOff[key] === true) return { off: true, reason: 'user-off' };
    const remote = remoteBag || allOff(true);
    if (remote.neverFetched === true || !remote.valid) return { off: true, reason: 'remote-never-fetched' };
    if (remote.off && remote.off[key] === true) return { off: true, reason: 'remote-off' };
    return { off: false };
  }

  async function readUserOff(chromeApi, surface) {
    const api = chromeApi || globalThis.chrome;
    if (!api || !api.storage || !api.storage.local) return false;
    try {
      const bag = await api.storage.local.get(userKey(surface));
      return bag[userKey(surface)] === true;
    } catch (e) {
      return false;
    }
  }

  async function setUserOff(chromeApi, surface, off) {
    const api = chromeApi || globalThis.chrome;
    if (!api || !api.storage || !api.storage.local) return false;
    try {
      await api.storage.local.set({ [userKey(surface)]: off === true });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function readRemoteBag(chromeApi) {
    const api = chromeApi || globalThis.chrome;
    if (!api || !api.storage || !api.storage.local) return allOff(true);
    try {
      const bag = await api.storage.local.get(REMOTE_BAG_KEY);
      const row = bag[REMOTE_BAG_KEY];
      if (row && row.off && row.valid === true && row.neverFetched !== true) return row;
    } catch (e) { /* fall through */ }
    return allOff(true);
  }

  async function storeRemoteBag(chromeApi, row) {
    const api = chromeApi || globalThis.chrome;
    if (!api || !api.storage || !api.storage.local) return;
    try { await api.storage.local.set({ [REMOTE_BAG_KEY]: row }); } catch (e) { /* next fetch */ }
  }

  async function applyTriggers(chromeApi) {
    const api = chromeApi || globalThis.chrome;
    if (typeof FlowChatOnDemand !== 'undefined' && FlowChatOnDemand.registerTriggerScripts) {
      try { await FlowChatOnDemand.registerTriggerScripts(api); } catch (e) { /* host not granted */ }
    }
  }

  async function fetchRemote(chromeApi) {
    const api = chromeApi || globalThis.chrome;
    const url = config().URL;
    const jwk = config().PUBLIC_JWK;
    let parsed = null;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const body = await res.json();
        const verified = await verifyAsync(body, jwk);
        if (verified) parsed = parseRemoteBody(body, { publicJwk: jwk, skipVerify: true });
      }
    } catch (e) { parsed = null; }
    if (!parsed) {
      const bag = await readRemoteBag(api);
      await applyTriggers(api);
      return bag;
    }
    await storeRemoteBag(api, parsed);
    await applyTriggers(api);
    return parsed;
  }

  function schedulePoll(chromeApi) {
    const api = chromeApi || globalThis.chrome;
    if (!api || !api.alarms) return;
    try {
      api.alarms.create(ALARM, { periodInMinutes: POLL_MINUTES });
    } catch (e) { /* 6h poll is best-effort */ }
  }

  function wireAlarm(chromeApi) {
    const api = chromeApi || globalThis.chrome;
    if (!api || !api.alarms || !api.alarms.onAlarm) return;
    api.alarms.onAlarm.addListener((alarm) => {
      if (!alarm || alarm.name !== ALARM) return;
      fetchRemote(api).catch(() => {});
    });
  }

  async function isOff(chromeApi, surface) {
    const api = chromeApi || globalThis.chrome;
    const user = await readUserOff(api, surface);
    const remote = await readRemoteBag(api);
    const userOff = user ? { [surface]: true } : {};
    return isSurfaceOff(surface, userOff, remote);
  }

  async function isAllowed(chromeApi, surface) {
    const row = await isOff(api, surface);
    return !(row && row.off);
  }

  return {
    STORAGE_PREFIX: STORAGE_PREFIX,
    REMOTE_BAG_KEY: REMOTE_BAG_KEY,
    ALARM: ALARM,
    POLL_MINUTES: POLL_MINUTES,
    SURFACE_KEYS: SURFACE_KEYS,
    userKey: userKey,
    allOff: allOff,
    canonicalPayload: canonicalPayload,
    verifySync: verifySync,
    verifyAsync: verifyAsync,
    parseRemoteBody: parseRemoteBody,
    lanesFromChatFlags: lanesFromChatFlags,
    isSurfaceOff: isSurfaceOff,
    readUserOff: readUserOff,
    setUserOff: setUserOff,
    readRemoteBag: readRemoteBag,
    fetchRemote: fetchRemote,
    schedulePoll: schedulePoll,
    wireAlarm: wireAlarm,
    isOff: isOff,
    isAllowed: isAllowed,
    applyTriggers: applyTriggers
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatKillSwitch };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatKillSwitch = FlowChatKillSwitch;
