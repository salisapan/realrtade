// The popup's state manager for the hybrid path: raw worker status in, one plain line out. Run: node test/hybrid-status-corpus.cjs
const { FlowHybridStatus: S } = require('../core/hybrid-status.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const base = { enabled: true, consent: { localModel: true, server: true }, flags: { disabled: null, attempts: 0 }, state: null, isModelLoaded: false, serverConsent: true };
const d = (o) => S.describe(Object.assign({}, base, o));
check('not enabled: hidden, nothing offered', S.describe({ enabled: false }).visible === false && S.describe(undefined).visible === false && S.describe(null).mode === 'hidden');
check('loaded: exactly "Ready for local processing"', d({ isModelLoaded: true }).label === 'Ready for local processing' && d({ isModelLoaded: true }).mode === 'local-ready' && d({ isModelLoaded: true }).canRemove);
check('the server on, the model off: exactly "Server-backed mode"', d({ consent: { localModel: false, server: true } }).label === 'Server-backed mode' && d({ consent: { localModel: false, server: true } }).canEnable === true);
check('both off: "Local rules only"', d({ consent: { localModel: false, server: false }, serverConsent: false }).label === 'Local rules only');
const dl = d({ state: { status: 'downloading', bytesDone: 5e8, bytesTotal: 2e9 } });
check('downloading: progress as a number between 0 and 1 and the sizes in GB', dl.mode === 'preparing' && Math.abs(dl.progress - 0.25) < 1e-9 && /0\.5 GB of 2\.0 GB/.test(dl.detail), dl);
check('paused: the reason in plain words, still "uses our server meanwhile"', /metered/.test(d({ state: { status: 'paused', pausedReason: 'metered', bytesDone: 1, bytesTotal: 2 } }).detail) && /our server/.test(d({ state: { status: 'paused', pausedReason: 'offline' } }).detail));
check('failed once: says it will try again, with the attempt number', /attempt 2 of 3/.test(d({ state: { status: 'failed', lastError: 'network:x' }, flags: { disabled: null, attempts: 1 } }).detail));
check('incapable machine: server-backed, the reason, a way to check again, no offer to turn it on', (() => { const v = d({ flags: { disabled: { kind: 'incapable', reason: 'no-shader-f16' } } }); return v.label === 'Server-backed mode' && /lacks a feature/.test(v.detail) && v.canRetry && !v.canEnable; })());
check('gave up: says after 3 tries', /after 3 tries/.test(d({ flags: { disabled: { kind: 'gave-up', reason: 'x' } } }).detail));
check('no server fallback and disabled: honest label, not "Server-backed"', d({ serverConsent: false, flags: { disabled: { kind: 'incapable', reason: 'no-webgpu' } } }).label === 'On-device model unavailable');
check('every capability reason has plain words', ['no-webgpu', 'no-gpu-adapter', 'no-shader-f16', 'gpu-buffer-too-small', 'low-memory', 'low-storage', 'offline', 'data-saver', 'metered', 'slow-network'].every((r) => S.reasonText(r).length > 8));
check('engine and verification failures are explained without jargon', /could not start/.test(S.reasonText('engine-failed:out of memory')) && /did not verify/.test(S.reasonText('hash-mismatch:shard-1')));
check('no label or detail uses "AI" wording (product identity)', ['no-webgpu', 'metered'].every(() => !/\bAI\b|smart|intelligent/i.test(JSON.stringify([d({ isModelLoaded: true }), d({}), d({ flags: { disabled: { kind: 'gave-up' } } })]))));
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
