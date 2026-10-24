'use strict';
// Build-time only (not shipped). Packs artifacts/<tag>.{gate,chooser}.weights.json into the glw/1 format (identical byte layout to
// runtime/pack-weights-v21.cjs, prune 0 = lossless int8) and writes shadow-pkg/weights/<tag>.p0.glw + weights/manifest.json (sha256).
// v2.1's file is byte-compared against the already-built artifacts/v21.p0.glw. Usage: node tools/pack-glw.cjs
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const A = path.join(__dirname, '..', '..', 'artifacts'), W = path.join(__dirname, '..', 'weights');
fs.mkdirSync(W, { recursive: true });
function pack(tag) {
  const G = JSON.parse(fs.readFileSync(path.join(A, tag + '.gate.weights.json'), 'utf8')), C = JSON.parse(fs.readFileSync(path.join(A, tag + '.chooser.weights.json'), 'utf8'));
  const parts = [];
  const packRow = (c) => {
    const head = Buffer.alloc(12); head.writeFloatLE(c.bias, 0); head.writeFloatLE(c.scale, 4); head.writeUInt32LE(c.idx.length, 8);
    const v = []; let prev = 0; for (const i of c.idx) { let d = i - prev; if (d < 0) throw new Error('idx not sorted'); prev = i; do { let b = d & 127; d >>>= 7; if (d) b |= 128; v.push(b); } while (d); }
    parts.push(head, Buffer.from(v), Buffer.from(Int8Array.from(c.q).buffer));
  };
  G.rows.forEach(packRow); C.classes.forEach(packRow);
  const meta = { format: 'glw/1', tag, prune: 0, dim: G.dim, tau: G.tau, tauPerLabel: G.tauPerLabel, chooserFloor: G.chooserFloor, gateRows: G.rows.map((r) => r.label), classes: C.classes.map((r) => r.label) };
  const mb = Buffer.from(JSON.stringify(meta)); const lenB = Buffer.alloc(4); lenB.writeUInt32LE(mb.length, 0);
  const bin = Buffer.concat([lenB, mb, ...parts]);
  fs.writeFileSync(path.join(W, tag + '.p0.glw'), bin);
  return bin;
}
const man = { format: 'glw/1', builtAt: new Date().toISOString(), models: {} };
for (const [tag, kind, role] of [['v2', 'v2', 'primary'], ['v21', 'v21', 'second']]) {
  const bin = pack(tag);
  const sha = crypto.createHash('sha256').update(bin).digest('hex');
  man.models[tag] = { file: 'weights/' + tag + '.p0.glw', kind, role, bytes: bin.length, gzipBytes: zlib.gzipSync(bin, { level: 9 }).length, sha256: sha, tag: tag + '@' + sha.slice(0, 8) };
}
const ref = path.join(A, 'v21.p0.glw');
if (fs.existsSync(ref)) man.models.v21.identicalToArtifact = Buffer.compare(fs.readFileSync(ref), fs.readFileSync(path.join(W, 'v21.p0.glw'))) === 0;
const manPath = path.join(W, 'manifest.json');
try {
  const prev = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  if (JSON.stringify(Object.assign({}, prev, { builtAt: 0 })) === JSON.stringify(Object.assign({}, man, { builtAt: 0 }))) man.builtAt = prev.builtAt;
} catch (e) { /* first pack */ }
fs.writeFileSync(manPath, JSON.stringify(man, null, 1) + '\n');
console.log(JSON.stringify(man, null, 1));
