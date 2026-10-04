#!/usr/bin/env node
// Builds the PINNED manifest of an on-device model: every file with its byte size and SHA-256 at one exact commit of the Hugging Face repo.
// docs/hybrid-execution-architecture.md. Run on a machine that can reach huggingface.co (the development sandbox cannot; CI can):
//   node scripts/hybrid/build-model-manifest.cjs <repo> <modelLibFileName> <outFile>
//   node scripts/hybrid/build-model-manifest.cjs mlc-ai/Phi-3-mini-4k-instruct-q4f16_1-MLC Phi-3-mini-4k-instruct-q4f16_1_cs1k-webgpu.wasm out.json
// LFS files carry their SHA-256 in the repo's own file listing; small non-LFS files are downloaded once and hashed here. Nothing is trusted
// that was not hashed or listed at the pinned commit. The model's WASM library comes from the MLC binary-libs repo at a pinned commit.
const fs = require('fs');
const crypto = require('crypto');
const [repo, libName, out] = process.argv.slice(2);
if (!repo || !libName || !out) { console.error('usage: build-model-manifest.cjs <repo> <modelLibFileName> <outFile>'); process.exit(1); }

async function json(url) { const r = await fetch(url, { headers: { 'user-agent': 'glance-manifest-builder' } }); if (!r.ok) throw new Error(url + ' -> ' + r.status); return r.json(); }
async function sha256Of(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  const h = crypto.createHash('sha256'); let n = 0;
  for await (const chunk of r.body) { h.update(chunk); n += chunk.length; }
  return { sha256: h.digest('hex'), bytes: n };
}

(async () => {
  const info = await json('https://huggingface.co/api/models/' + repo);
  const commit = info.sha;
  const tree = await json('https://huggingface.co/api/models/' + repo + '/tree/' + commit + '?recursive=1');
  const files = [];
  for (const e of tree) {
    if (e.type !== 'file') continue;
    if (/^\.gitattributes$|^README\.md$/i.test(e.path)) continue;
    const url = 'https://huggingface.co/' + repo + '/resolve/' + commit + '/' + e.path;
    if (e.lfs && e.lfs.oid) files.push({ name: url, url, bytes: e.lfs.size, sha256: e.lfs.oid });
    else { const h = await sha256Of(url); files.push({ name: url, url, bytes: h.bytes, sha256: h.sha256 }); }
  }
  const gh = await json('https://api.github.com/repos/mlc-ai/binary-mlc-llm-libs/commits/main');
  const libUrl = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/' + gh.sha + '/web-llm-models/v0_2_84/base/' + libName;
  const lib = await sha256Of(libUrl);
  const total = files.reduce((n, f) => n + f.bytes, 0);
  const manifest = { id: repo.split('/')[1], repo, revision: commit, totalBytes: total, files, modelLib: { url: libUrl, bytes: lib.bytes, sha256: lib.sha256, libRevision: gh.sha } };
  fs.writeFileSync(out, JSON.stringify(manifest, null, 1));
  const big = files.reduce((m, f) => Math.max(m, f.bytes), 0);
  console.log('MANIFEST-SUMMARY', JSON.stringify({ repo, revision: commit, files: files.length, totalMB: Math.round(total / 1e6), largestFileMB: Math.round(big / 1e6), modelLibMB: Math.round(lib.bytes / 1e5) / 10, libRevision: gh.sha }));
  for (const f of files) console.log('MANIFEST-FILE', JSON.stringify({ p: f.url.split('/resolve/' + commit + '/')[1], b: f.bytes, s: f.sha256 }));
  console.log('MANIFEST-LIB', JSON.stringify({ u: libUrl, b: lib.bytes, s: lib.sha256 }));
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
