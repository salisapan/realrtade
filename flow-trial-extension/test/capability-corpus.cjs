// The silent capability check: reasons, which are permanent, and that it never throws. Run: node test/capability-corpus.cjs
const { FlowCapability: C } = require('../core/capability.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const GiB = 1024 * 1024 * 1024;
const gpu = (o) => ({ requestAdapter: async () => (o === null ? null : { features: new Set(o && o.f16 === false ? [] : ['shader-f16']), limits: { maxBufferSize: o && o.maxBuffer !== undefined ? o.maxBuffer : 2 * GiB } }) });
const storage = (free) => ({ estimate: async () => ({ quota: free + 1e9, usage: 1e9 }) });
(async () => {
  let r = await C.check({ navigator: {} });
  check('no WebGPU: permanent', r.ok === false && r.reason === 'no-webgpu' && r.permanent === true);
  check('no environment at all: permanent, not a throw', (await C.check(null)).permanent === true && (await C.check(undefined)).reason === 'no-webgpu');
  r = await C.check({ navigator: { gpu: gpu(null) } });
  check('no adapter: permanent', r.reason === 'no-gpu-adapter' && r.permanent === true);
  check('an adapter request that throws: permanent, not a throw', (await C.check({ navigator: { gpu: { requestAdapter: async () => { throw new Error('blocked by policy'); } } } })).reason === 'no-gpu-adapter');
  check('no shader-f16: permanent', (await C.check({ navigator: { gpu: gpu({ f16: false }) } })).permanent === true);
  r = await C.check({ navigator: { gpu: gpu({ maxBuffer: 256 * 1024 * 1024 }) } });
  check('a GPU buffer limit under 1 GiB: permanent', r.reason === 'gpu-buffer-too-small' && r.permanent === true);
  r = await C.check({ navigator: { gpu: gpu({}), deviceMemory: 2 } });
  check('2 GB of device memory: permanent', r.reason === 'low-memory' && r.permanent === true);
  check('a browser that does not report device memory is not refused for it', (await C.check({ navigator: { gpu: gpu({}) } })).ok === true);
  r = await C.check({ navigator: { gpu: gpu({}), deviceMemory: 8 }, storage: storage(1e9) });
  check('not enough free disk: NOT permanent (the person can free space)', r.reason === 'low-storage' && r.permanent === false);
  check('the permanent flag is exactly the hardware reasons', ['no-webgpu', 'no-gpu-adapter', 'software-adapter', 'no-shader-f16', 'gpu-buffer-too-small', 'low-memory'].every(C.isPermanent) && !C.isPermanent('low-storage') && !C.isPermanent('engine-failed'));
  r = await C.check({ navigator: { gpu: gpu({ maxBuffer: 4 * GiB }), deviceMemory: 8 }, storage: storage(50e9) });
  check('a capable machine passes', r.ok === true && r.maxBufferSize === 4 * GiB && r.storageFreeBytes > 49e9);
  check('an unreadable storage estimate does not block', (await C.check({ navigator: { gpu: gpu({}) }, storage: { estimate: async () => { throw new Error('x'); } } })).ok === true);
  check('a custom need (a number) is the disk need', (await C.check({ navigator: { gpu: gpu({}) }, storage: storage(3e9) }, 3e9)).reason === 'low-storage');
  console.log('\n--- diagnostics: why a machine falls back, readable in a live session ---\n');
  const full = (over) => Object.assign({ features: new Set(['shader-f16', 'timestamp-query']), limits: { maxBufferSize: 4 * GiB, maxStorageBufferBindingSize: 2 * GiB, maxComputeWorkgroupStorageSize: 32768, maxComputeInvocationsPerWorkgroup: 1024, maxComputeWorkgroupSizeX: 1024, maxTextureDimension2D: 16384 }, info: { vendor: 'nvidia', architecture: 'ampere', device: '0x2484', description: 'NVIDIA GeForce RTX 3070' } }, over || {});
  const lines = [];
  let r2 = await C.check({ navigator: { gpu: { requestAdapter: async () => full() }, deviceMemory: 8, hardwareConcurrency: 16, userAgentData: { platform: 'Windows' } }, storage: storage(50e9), log: (l) => lines.push(l) });
  check('a pass reports the adapter\'s vendor, architecture, device and description', r2.ok && r2.diagnostics.adapter.vendor === 'nvidia' && r2.diagnostics.adapter.architecture === 'ampere' && r2.diagnostics.adapter.device === '0x2484' && /RTX 3070/.test(r2.diagnostics.adapter.description), r2.diagnostics.adapter);
  check('...its features and only the limits that matter for the model', r2.diagnostics.features.indexOf('shader-f16') >= 0 && r2.diagnostics.limits.maxBufferSize === 4 * GiB && r2.diagnostics.limits.maxTextureDimension2D === undefined, r2.diagnostics);
  check('...the machine: memory, cores, platform, free disk', r2.diagnostics.device.deviceMemoryGB === 8 && r2.diagnostics.device.hardwareConcurrency === 16 && r2.diagnostics.device.platform === 'Windows' && r2.diagnostics.storage.freeBytes > 49e9);
  check('...and a trace with one line per step, each tagged, ending in the verdict', r2.trace.length >= 9 && r2.trace.every((l) => l.indexOf(C.TAG) === 0) && /verdict: ok/.test(r2.trace[r2.trace.length - 1]), r2.trace);
  check('every trace line was also written to the injected log (the page console)', lines.length === r2.trace.length && lines.every((l, i) => l === r2.trace[i]));
  r2 = await C.check({ navigator: { gpu: { requestAdapter: async () => full({ features: new Set(['timestamp-query']) }) } } });
  check('a failure says exactly which step failed and what it saw', r2.reason === 'no-shader-f16' && r2.trace.some((l) => /shader-f16: FAIL/.test(l)) && /ABSENT/.test(r2.trace.join('\n')) && r2.diagnostics.adapter.vendor === 'nvidia', r2.trace);
  r2 = await C.check({ navigator: { gpu: { requestAdapter: async () => full({ info: { vendor: 'google', architecture: 'swiftshader', description: 'SwiftShader driver', isFallbackAdapter: true } }) }, deviceMemory: 8 } });
  check('a software adapter (SwiftShader, a CPU pretending to be a GPU) is permanent, and named', r2.reason === 'software-adapter' && r2.permanent === true && /software fallback/.test(r2.trace.join('\n')), r2.trace);
  r2 = await C.check({ navigator: { gpu: { requestAdapter: async () => ({ features: new Set(['shader-f16']), limits: { maxBufferSize: 4 * GiB }, isFallbackAdapter: true }) } } });
  check('the older isFallbackAdapter property on the adapter itself counts too', r2.reason === 'software-adapter');
  r2 = await C.check({ navigator: { gpu: { requestAdapter: async () => ({ features: new Set(['shader-f16']), limits: { maxBufferSize: 4 * GiB }, requestAdapterInfo: async () => ({ vendor: 'intel', architecture: 'gen-12lp' }) }) }, deviceMemory: 8 } });
  check('an older browser that only has requestAdapterInfo() is read through it', r2.ok && r2.diagnostics.adapter.vendor === 'intel' && r2.diagnostics.adapter.architecture === 'gen-12lp');
  r2 = await C.check({ navigator: { gpu: { requestAdapter: async () => ({ features: new Set(['shader-f16']), limits: { maxBufferSize: 4 * GiB } }) }, deviceMemory: 8 } });
  check('a browser that hides the adapter details: the fields are null and the trace says so, nothing is guessed', r2.ok && r2.diagnostics.adapter.vendor === null && r2.diagnostics.adapter.infoAvailable === false && /did not expose adapter details/.test(r2.trace.join('\n')));
  r2 = await C.check({ navigator: {} });
  check('no WebGPU: the trace names it, and the device facts are still reported', r2.reason === 'no-webgpu' && /navigator\.gpu is not exposed/.test(r2.trace.join('\n')) && /device: ok/.test(r2.trace[0]));
  r2 = await C.check({ navigator: { gpu: { requestAdapter: async () => null } } });
  check('no adapter: the trace explains the usual causes (driver blocklist, acceleration off)', /driver blocklist/.test(r2.trace.join('\n')));
  r2 = await C.check({ navigator: { gpu: { requestAdapter: async () => { throw new Error('GPU process crashed') } } } });
  check('an adapter request that throws: the error text is in the trace', r2.reason === 'no-gpu-adapter' && /GPU process crashed/.test(r2.trace.join('\n')));
  r2 = await C.check({ navigator: { gpu: { requestAdapter: async () => full({ info: { vendor: 'ac\u0000me\n<script>', description: 'x'.repeat(500) } }) } } , storage: storage(50e9) });
  check('adapter strings are made printable and capped (they are logged)', !/[\u0000-\u001f]/.test(r2.diagnostics.adapter.vendor) && r2.diagnostics.adapter.description.length <= 80);
  r2 = await C.check({ navigator: { gpu: { requestAdapter: async () => full() } , userAgent: 'Mozilla/5.0 SECRET-UA', deviceMemory: 8 }, storage: storage(50e9), log: () => { throw new Error('logger broke'); } });
  check('a logger that throws does not break the check', r2.ok === true);
  check('the full user-agent string is never collected (only platform, memory and cores)', !JSON.stringify(r2.diagnostics).includes('SECRET-UA'));
  r2 = await C.check({ navigator: { get gpu() { throw new Error('policy'); } } });
  check('a navigator whose gpu getter throws: a permanent "cannot", not an exception', r2.ok === false && r2.permanent === true);

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
