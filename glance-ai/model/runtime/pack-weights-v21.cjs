'use strict';
// Pack v2.1 int8 sparse weights (artifacts/<tag>.{gate,chooser}.weights.json) into one compact binary for the extension's
// 871 KB on-device budget: per row [bias f32][scale f32][nnz u32][idx delta-LEB128...][q int8...]; header = JSON meta.
// --prune k drops |q| <= k. Reports raw / gzip sizes and decision parity vs the unpruned JSON runtime on the v2 test.
// Usage: node runtime/pack-weights-v21.cjs [tag=v21] [prune=0]   -> artifacts/<tag>.p<k>.glw (+ .glw.json report)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const tag = process.argv[2] || 'v21', prune = Number(process.argv[3] || 0);
const A = path.join(__dirname, '..', 'artifacts');
const G = JSON.parse(fs.readFileSync(path.join(A, tag + '.gate.weights.json'), 'utf8')), C = JSON.parse(fs.readFileSync(path.join(A, tag + '.chooser.weights.json'), 'utf8'));
const parts = []; const rowsOut = { gate: [], chooser: [] };
function packRow(c) {
  const keep = c.idx.map((i, j) => [i, c.q[j]]).filter(([, q]) => Math.abs(q) > prune);
  const head = Buffer.alloc(12); head.writeFloatLE(c.bias, 0); head.writeFloatLE(c.scale, 4); head.writeUInt32LE(keep.length, 8);
  const v = []; let prev = 0; for (const [i] of keep) { let d = i - prev; prev = i; do { let b = d & 127; d >>>= 7; if (d) b |= 128; v.push(b); } while (d); }
  parts.push(head, Buffer.from(v), Buffer.from(Int8Array.from(keep.map(([, q]) => q)).buffer));
  return { label: c.label, idx: keep.map(([i]) => i), q: keep.map(([, q]) => q), bias: c.bias, scale: c.scale };
}
for (const c of G.rows) rowsOut.gate.push(packRow(c));
for (const c of C.classes) rowsOut.chooser.push(packRow(c));
const meta = { format: 'glw/1', tag, prune, dim: G.dim, tau: G.tau, tauPerLabel: G.tauPerLabel, chooserFloor: G.chooserFloor, gateRows: G.rows.map((r) => r.label), classes: C.classes.map((r) => r.label) };
const mb = Buffer.from(JSON.stringify(meta)); const lenB = Buffer.alloc(4); lenB.writeUInt32LE(mb.length, 0);
const bin = Buffer.concat([lenB, mb, ...parts]);
const out = path.join(A, `${tag}.p${prune}.glw`); fs.writeFileSync(out, bin);
// parity: rebuild the runtime from the pruned rows and compare decisions on the v2 test
const toLin = (w, rows) => ({ w, rows: rows.map((c) => { const a = new Float32Array(w.dim); c.idx.forEach((i, j) => { a[i] = c.q[j] * c.scale; }); return { label: c.label, bias: c.bias, a }; }) });
const V21 = require('./glance-close-v21.cjs');
const full = V21.make(tag), pr = V21.make(tag, { gate: toLin(G, rowsOut.gate), chooser: toLin(C, rowsOut.chooser) });
const test = fs.readFileSync(path.join(__dirname, '..', 'dataset', 'out-v2', 'test.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
let same = 0, newShows = 0, lostShows = 0;
for (const r of test) { const a = full.decide(r).label, b = pr.decide(r).label; if (a === b) same++; else if (a === 'SILENT') newShows++; else if (b === 'SILENT') lostShows++; }
const nnz = (rs) => rs.reduce((s, r) => s + r.idx.length, 0);
const rep = { out: path.relative(path.join(__dirname, '..'), out), prune, bytes: bin.length, gzipBytes: zlib.gzipSync(bin, { level: 9 }).length, jsonBytes: fs.statSync(path.join(A, tag + '.gate.weights.json')).size + fs.statSync(path.join(A, tag + '.chooser.weights.json')).size,
  nnzGate: nnz(rowsOut.gate), nnzChooser: nnz(rowsOut.chooser), parityV2Test: { n: test.length, sameDecision: same, prunedAddsShow: newShows, prunedDropsShow: lostShows } };
fs.writeFileSync(out + '.json', JSON.stringify(rep, null, 1)); console.log(JSON.stringify(rep));
