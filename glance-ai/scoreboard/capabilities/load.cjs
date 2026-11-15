'use strict';
// Loads the product's own recognition code the way the Gmail content script does: every core/ file the manifest lists for Gmail, in its order, into one
// sandbox (no chrome, no DOM). A kind-specific reader that is not loaded would read as "silent" and make a capability look missing when it is only unloaded,
// so the probe uses the manifest, not a hand-picked list. The date is frozen to the lab's clock.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..', 'flow-trial-extension');
function load(nowIso) {
  const NOW = new Date(nowIso || '2026-10-07T12:00:00+03:00').getTime();
  const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, TextEncoder, atob, btoa, URL, setTimeout, clearTimeout };
  vm.createContext(sb);
  vm.runInContext('(function (N) { var D = Date; function F() { var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(D, [null].concat(a)))() : new D(N); } F.prototype = D.prototype; F.now = function () { return N; }; F.UTC = D.UTC; F.parse = D.parse; Date = F; })(' + NOW + ')', sb);
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const gm = m.content_scripts.find((c) => (c.matches || []).some((x) => /mail\.google\.com/.test(x)));
  const files = (gm.js || []).filter((f) => /^core\//.test(f));
  const failed = [];
  for (const f of files) { try { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }); } catch (e) { failed.push(f + ': ' + e.message); } }
  const g = (n) => { try { return vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb); } catch (e) { return null; } };
  return { sb, g, files, failed, NOW };
}
module.exports = { load, ROOT };
