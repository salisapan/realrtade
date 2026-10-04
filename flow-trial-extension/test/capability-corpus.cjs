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
  check('the permanent flag is exactly the hardware reasons', ['no-webgpu', 'no-gpu-adapter', 'no-shader-f16', 'gpu-buffer-too-small', 'low-memory'].every(C.isPermanent) && !C.isPermanent('low-storage') && !C.isPermanent('engine-failed'));
  r = await C.check({ navigator: { gpu: gpu({ maxBuffer: 4 * GiB }), deviceMemory: 8 }, storage: storage(50e9) });
  check('a capable machine passes', r.ok === true && r.maxBufferSize === 4 * GiB && r.storageFreeBytes > 49e9);
  check('an unreadable storage estimate does not block', (await C.check({ navigator: { gpu: gpu({}) }, storage: { estimate: async () => { throw new Error('x'); } } })).ok === true);
  check('a custom need (a number) is the disk need', (await C.check({ navigator: { gpu: gpu({}) }, storage: storage(3e9) }, 3e9)).reason === 'low-storage');
  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
