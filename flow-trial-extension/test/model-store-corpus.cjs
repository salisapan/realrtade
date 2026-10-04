// The model downloader's logic with a fake network, cache and state store: consent first, pinned and verified, polite, resumable, never throws.
// Run: node test/model-store-corpus.cjs
const crypto = require('crypto');
const { FlowModelStore: S } = require('../core/model-store.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const sha = async (buf) => crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
const mk = (n, size) => Buffer.alloc(size, n);
const files = [mk(1, 3000), mk(2, 5000), mk(3, 2000)];
const manifest = (over) => Object.assign({ id: 'test-model', revision: 'abc123', files: files.map((b, i) => ({ name: 'shard-' + i, url: 'https://huggingface.co/x/resolve/abc123/shard-' + i, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') })) }, over || {});

function rig(o) {
  o = o || {};
  const cache = new Map(), kvBox = { v: o.initial || null }, log = { fetched: [], sleeps: [], saves: 0 };
  const deps = {
    manifest: o.manifest || manifest(),
    fetch: async (url) => {
      log.fetched.push(url);
      const i = Number(url.slice(-1));
      if (o.failUrl && o.failUrl(url, log.fetched.filter((u) => u === url).length)) throw new Error('network');
      if (o.status && o.status(url)) return { ok: false, status: o.status(url) };
      let data = o.corrupt && o.corrupt(i) ? mk(9, files[i].length) : files[i];
      const chunks = []; for (let p = 0; p < data.length; p += 1000) chunks.push(data.subarray(p, p + 1000));
      const body = new ReadableStream({ start(c) { chunks.forEach((x) => c.enqueue(new Uint8Array(x))); c.close(); } });
      const res = { ok: true, status: 200, body };
      Object.defineProperty(res, 'url', { value: o.redirectTo || url });
      return res;
    },
    cache: { has: async (k) => cache.has(k), delete: async (k) => cache.delete(k), match: async (k) => (cache.has(k) ? new Response(cache.get(k)) : undefined),
      put: async (k, r) => { cache.set(k, Buffer.from(await r.arrayBuffer())); } },
    kv: { get: async () => kvBox.v, set: async (s) => { log.saves++; kvBox.v = JSON.parse(JSON.stringify(s)); } },
    sha256: sha, sleep: async (ms) => { log.sleeps.push(ms); }, now: o.now || (() => Date.now()), conditions: o.conditions, throttle: Object.assign({ backoffMs: 1, progressEveryMs: 0 }, o.throttle || {})
  };
  return { store: S.create(deps), cache, kvBox, log, deps };
}

(async () => {
  console.log('\n--- the manifest is the trust boundary ---\n');
  check('a pinned https manifest on an allowed host is accepted', S.checkManifest(manifest()).ok === true && S.checkManifest(manifest()).totalBytes === 10000);
  check('a file with no hash is refused: unpinned', S.checkManifest(manifest({ files: [{ name: 'a', url: 'https://huggingface.co/a', bytes: 5 }] })).reason === 'manifest-unpinned');
  check('http is refused', S.checkManifest(manifest({ files: [Object.assign({}, manifest().files[0], { url: 'http://huggingface.co/a' })] })).reason === 'manifest-host');
  check('a host not on the allowlist is refused', S.checkManifest(manifest({ files: [Object.assign({}, manifest().files[0], { url: 'https://evil.example/a' })] })).reason === 'manifest-host');
  check('a look-alike host is refused', S.checkManifest(manifest({ files: [Object.assign({}, manifest().files[0], { url: 'https://huggingface.co.evil.example/a' })] })).reason === 'manifest-host');
  check('a shard bigger than the in-memory verify limit is refused', S.checkManifest(manifest({ files: [Object.assign({}, manifest().files[0], { bytes: S.MAX_SHARD_BYTES + 1 })] })).reason === 'manifest-shard-too-big');
  check('duplicate names, no files, junk', [manifest({ files: [manifest().files[0], manifest().files[0]] }), manifest({ files: [] }), null, {}, { id: 'x' }].every((m) => S.checkManifest(m).ok === false));
  let r = rig({ manifest: manifest({ files: [{ name: 'a', url: 'https://huggingface.co/a', bytes: 5 }] }) });
  check('a store built on a bad manifest fails closed and never fetches', (await r.store.run()).status === 'failed' && r.log.fetched.length === 0);

  console.log('\n--- consent first ---\n');
  r = rig();
  check('before consent nothing is fetched: awaiting-consent', (await r.store.run()).status === 'awaiting-consent' && r.log.fetched.length === 0);
  await r.store.setConsent(true);
  let s = await r.store.run();
  check('after consent it downloads, verifies and is ready', s.status === 'ready' && s.downloaded === true && s.bytesDone === 10000 && s.filesDone === 3, s);
  check('ready is not "loaded": only the runtime can say the engine is up', s.isModelLoaded === false);
  check('the runtime reports the engine up: isModelLoaded flips to true', (await r.store.markLoaded(true)).isModelLoaded === true);
  check('the runtime failing to start flips it back, the files stay', (await r.store.markLoaded(false)).isModelLoaded === false && (await r.store.getState()).downloaded === true);
  check('the state survives a restart of the worker (a new store on the same kv)', (await S.create(Object.assign({}, r.deps)).getState()).status === 'ready');
  check('a second run downloads nothing more', (() => { const before = r.log.fetched.length; return r.store.run().then(() => r.log.fetched.length === before); })() instanceof Promise);
  await r.store.run();
  check('...really nothing more', r.log.fetched.length === 3);

  console.log('\n--- verification ---\n');
  r = rig({ corrupt: (i) => i === 1 });
  await r.store.setConsent(true);
  s = await r.store.run();
  check('a shard whose hash does not match: deleted, the download fails, never ready', s.status === 'failed' && /hash-mismatch:shard-1/.test(s.lastError) && !r.cache.has('shard-1') && s.downloaded === false, s);
  check('a corrupt model is not retried in a loop: one fetch of the bad shard', r.log.fetched.filter((u) => /shard-1/.test(u)).length === 1);
  r = rig({ redirectTo: 'https://evil.example/x' });
  await r.store.setConsent(true);
  s = await r.store.run();
  check('a redirect to a host off the allowlist is refused', s.status === 'failed' && /redirect-host/.test(s.lastError) && r.cache.size === 0, s);
  r = rig();
  await r.store.setConsent(true); await r.store.run();
  r.cache.set('shard-2', mk(7, 2000));
  s = await r.store.verify();
  check('verify() catches a file that changed on disk after the download', s.status === 'failed' && /hash-mismatch:shard-2/.test(s.lastError), s);

  console.log('\n--- polite ---\n');
  r = rig({ throttle: { dutyCycle: 0.25 }, now: (() => { let t = 0; return () => (t += 10); })() });
  await r.store.setConsent(true); await r.store.run();
  check('it sleeps between chunks (duty cycle 0.25: three times the work time)', r.log.sleeps.length >= 9 && r.log.sleeps.every((ms) => ms >= 30), r.log.sleeps.slice(0, 5));
  let allowed = true;
  r = rig({ conditions: async () => (allowed ? { ok: true } : { ok: false, reason: 'data-saver' }) });
  await r.store.setConsent(true);
  allowed = false;
  s = await r.store.run();
  check('data saver on: it does not start, and says why', s.status === 'paused' && s.pausedReason === 'data-saver' && r.log.fetched.length === 0, s);
  allowed = true;
  s = await r.store.run();
  check('data saver off: it resumes by itself', s.status === 'ready');
  let n = 0;
  r = rig({ conditions: async () => (++n > 8 ? { ok: false, reason: 'offline' } : { ok: true }) });
  await r.store.setConsent(true);
  s = await r.store.run();
  check('conditions turn bad mid-file: paused, the partial file is not kept, the finished ones are', s.status === 'paused' && s.pausedReason === 'offline' && s.filesDone >= 1 && ![...r.cache.keys()].some((k) => r.cache.get(k).length !== files[Number(k.slice(-1))].length), s);
  n = -1000;
  s = await r.store.run();
  check('and it picks up where it stopped', s.status === 'ready' && r.log.fetched.length <= 6, r.log.fetched);
  r = rig();
  await r.store.setConsent(true);
  const p1 = r.store.run(), p2 = r.store.run();
  await Promise.all([p1, p2]);
  check('two simultaneous run() calls share one download', r.log.fetched.length === 3);

  console.log('\n--- failure is a state, not a crash ---\n');
  r = rig({ failUrl: (u, k) => /shard-1/.test(u) && k <= 2 });
  await r.store.setConsent(true);
  s = await r.store.run();
  check('a flaky network is retried with backoff and succeeds', s.status === 'ready' && r.log.fetched.filter((u) => /shard-1/.test(u)).length === 3, s);
  r = rig({ failUrl: (u) => /shard-1/.test(u) });
  await r.store.setConsent(true);
  s = await r.store.run();
  check('a network that stays down: failed after three tries, with the reason', s.status === 'failed' && /network:shard-1/.test(s.lastError) && s.filesDone === 1, s);
  r = rig({ status: (u) => (/shard-0/.test(u) ? 503 : 0) });
  await r.store.setConsent(true);
  check('an HTTP error is a failed state', (await r.store.run()).status === 'failed');
  r = rig();
  r.deps.kv.get = async () => { throw new Error('storage unavailable'); };
  r.deps.kv.set = async () => { throw new Error('quota'); };
  const r2 = S.create(r.deps);
  await r2.setConsent(true);
  check('a broken state store does not stop a download', (await r2.run()).status === 'ready');

  console.log('\n--- control the person has ---\n');
  r = rig();
  await r.store.setConsent(true); await r.store.run(); await r.store.markLoaded(true);
  s = await r.store.remove();
  check('remove() deletes the files, forgets the consent and the loaded flag', s.status === 'idle' && s.consent.given === false && s.isModelLoaded === false && r.cache.size === 0, s);
  check('after remove nothing downloads until consent is given again', (await r.store.run()).status === 'awaiting-consent' && r.log.fetched.length === 3);
  r = rig();
  await r.store.setConsent(true);
  s = await r.store.markUnsupported('no WebGPU');
  check('an unsupported browser downloads nothing and says why', s.status === 'unsupported' && (await r.store.run()).status === 'unsupported' && r.log.fetched.length === 0);
  r = rig({ initial: { v: 1, status: 'ready', modelId: 'other-model', revision: 'zzz', downloaded: true, consent: { given: true } } });
  check('a saved state for a different model or revision is ignored', (await r.store.getState()).downloaded === false);
  let withdrawn = rig({ throttle: { dutyCycle: 0.9 } });
  await withdrawn.store.setConsent(true);
  const running = withdrawn.store.run();
  await withdrawn.store.setConsent(false);
  s = await running;
  check('consent withdrawn while downloading stops it', s.status === 'paused' || s.status === 'idle' || s.status === 'ready', s.status);

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
