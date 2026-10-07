/* Glance shadow tier, SERVICE-WORKER side model runtime (v2.2 drop-in package).
 * Reads the packed glw/1 weights (runtime/pack-weights-v21.cjs format: [u32 metaLen][meta JSON][rows: f32 bias, f32 scale, u32 nnz,
 * LEB128 index deltas, int8 q]) into SPARSE rows (sorted Uint32Array idx + Int8Array q, binary-search lookup). Never expands to dense
 * Float32Array(2^17). No eval, no Function, no network: the caller hands in an ArrayBuffer.
 * decide(model, shadowInput) reproduces runtime/glance-close-v2.cjs (v2) and runtime/glance-close-v21.cjs (v2.1) exactly:
 * gate p >= tau(label[@shape]) -> [chooser floor, v2.1 only] -> base veto -> product veto -> cap veto -> ONE label or SILENT.
 * Registers self.GlanceShadow.model. */
(function (root) {
  'use strict';
  var NS = root.GlanceShadow || (root.GlanceShadow = {});

  function utf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return decodeURIComponent(escape(s));
  }
  function parseGlw(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var metaLen = dv.getUint32(0, true);
    var meta = JSON.parse(utf8(u8.subarray(4, 4 + metaLen)));
    if (meta.format !== 'glw/1') throw new Error('glw: bad format');
    var off = 4 + metaLen;
    function row(label) {
      var bias = dv.getFloat32(off, true), scale = dv.getFloat32(off + 4, true), nnz = dv.getUint32(off + 8, true); off += 12;
      var idx = new Uint32Array(nnz), prev = 0;
      for (var j = 0; j < nnz; j++) { var d = 0, shift = 0, b; do { b = u8[off++]; d += (b & 127) * Math.pow(2, shift); shift += 7; } while (b & 128); prev += d; idx[j] = prev; }
      var q = new Int8Array(nnz); q.set(new Int8Array(u8.buffer, u8.byteOffset + off, nnz)); off += nnz;
      return { label: label, bias: bias, scale: scale, idx: idx, q: q };
    }
    var gate = meta.gateRows.map(row), chooser = meta.classes.map(row);
    if (off !== u8.byteLength) throw new Error('glw: trailing bytes ' + (u8.byteLength - off));
    return { meta: meta, gate: gate, chooser: chooser };
  }
  // weight of feature i in row r: float32(q * scale), exactly what the dense JSON runtime stores in its Float32Array
  function w(r, i) {
    var lo = 0, hi = r.idx.length - 1;
    while (lo <= hi) { var mid = (lo + hi) >>> 1, v = r.idx[mid]; if (v === i) return Math.fround(r.q[mid] * r.scale); if (v < i) lo = mid + 1; else hi = mid - 1; }
    return 0;
  }
  function dot(r, x, inv) { var s = r.bias; for (var k = 0; k < x.length; k++) s += w(r, x[k]) * inv; return s; }

  // kind: 'v2' (tau per label, no floor) | 'v21' (tau per label@shape + chooser floor)
  function load(buf, kind, tagSha) {
    var P = parseGlw(buf), M = P.meta;
    var T = M.tauPerLabel || {}, floor = M.chooserFloor || { kind: 'none', value: 0 };
    function scores(x) {
      var inv = 1 / Math.sqrt(x.length || 1);
      var pShow = 1 / (1 + Math.exp(-dot(P.gate[0], x, inv)));
      var z = P.chooser.map(function (r) { return dot(r, x, inv); });
      var mx = Math.max.apply(null, z), sum = 0;
      var e = z.map(function (v) { var t = Math.exp(v - mx); sum += t; return t; });
      var k = 0; for (var i = 1; i < z.length; i++) if (z[i] > z[k]) k = i;
      var stp = function (l) { return l.split('|')[1]; }, pStep = 0;
      P.chooser.forEach(function (r, i) { if (stp(r.label) === stp(P.chooser[k].label)) pStep += e[i] / sum; });
      return { pShow: pShow, label: P.chooser[k].label, pLabel: e[k] / sum, pStep: pStep };
    }
    function tauFor(label, shape) {
      if (kind === 'v21') { var key = label + '@' + (shape || 'mail'); return T[key] != null ? T[key] : (T[label] != null ? T[label] : M.tau); }
      return T[label] != null ? T[label] : M.tau;
    }
    function floorOk(s) { return kind !== 'v21' || floor.kind === 'none' || (floor.kind === 'label' ? s.pLabel : s.pStep) >= floor.value; }
    var nnz = P.gate.concat(P.chooser).reduce(function (a, r) { return a + r.idx.length; }, 0);
    return { kind: kind, tag: (M.tag || kind) + (tagSha ? '@' + tagSha : ''), classes: M.classes.slice(), scores: scores, tauFor: tauFor, floorOk: floorOk, meta: M,
      residentBytes: nnz * 5 + (P.gate.length + P.chooser.length) * 64 };
  }
  function capVeto(flags, label) { if (!label || label === 'SILENT') return null; var step = label.split('|')[1]; return flags.any || flags[step] || null; }

  // si = ShadowInput from gs-prepare. Returns the spec §3 `candidate` object (+ x-free internals for tests).
  function decide(m, si) {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var x = m.kind === 'v21' ? si.x21 : si.x2;
    var s = m.scores(x);
    var tau = m.tauFor(s.label, si.shape);
    var over = s.pShow >= tau, fok = m.floorOk(s);
    var pass = over && fok;
    var V = si.veto || {};
    var cap = capVeto(V.cap || {}, s.label);
    var veto = V.base ? 'base:' + V.base : (V.product ? 'product:' + V.product : (cap || null));
    var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return { model: m.tag, label: !veto && pass ? s.label : 'SILENT', top: s.label, pShow: s.pShow, pLabel: s.pLabel, tau: tau,
      floorBlocked: over && !fok, veto: veto, scoreMs: t1 - t0, modelAlone: pass ? s.label : 'SILENT' };
  }

  var api = { parseGlw: parseGlw, load: load, decide: decide, capVeto: capVeto };
  NS.model = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
