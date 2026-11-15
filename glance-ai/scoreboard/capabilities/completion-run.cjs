'use strict';
// Completion (2026-11-15): does the follow loop know that a loop is DONE? Gold: glance-ai/labeling/completion-gold/completion-gold-v0.cjs (hand-written, held out). Each row is an
// ask the person sent and one reply; the loop is opened by core/follow-up.js (classifyOutgoing, buildWatch), the reply is read by isAutoReply / classifyReply and applied by
// applyReply, exactly as test/follow-real-threads-corpus.cjs does. The error that matters is CLOSING a loop on a reply that did not finish the ask. Lab only.
// usage: node scoreboard/capabilities/completion-run.cjs [--list] [--json] [--dev]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..', 'flow-trial-extension');
const sb = { module: undefined, console: { log() {}, warn() {}, error() {} }, TextEncoder };
vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'day-words.js', 'file-path.js', 'lang-normalize.js', 'reply-meaning.js', 'reply-model-weights.js', 'reply-model.js', 'follow-up.js']) {
  const p = path.join(ROOT, 'core', f);
  if (fs.existsSync(p)) try { vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: f }); } catch (e) { /* optional sibling */ }
}
const F = vm.runInContext('FlowFollowUp', sb);
const NOW = new Date('2026-11-12T10:00:00+02:00').getTime();
const gold = process.argv.includes('--dev') ? require('./completion-dev-v0.cjs') : require('../../labeling/completion-gold/completion-gold-v0.cjs');
const wilson = (k, n) => { if (!n) return [0, 0]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; };
function result(lang, out, reply) {
  const ask = F.classifyOutgoing(out, { now: NOW, lang });
  if (!ask) return { got: 'no-loop' };
  const w = F.buildWatch({ ask, threadId: 't1', subject: '', counterpart: { email: 'dana@acme.io' }, now: NOW - 3 * 86400000 });
  const auto = F.isAutoReply(reply, 'dana@acme.io');
  const rep = auto ? { outcome: 'auto' } : F.classifyReply(reply, w, { now: NOW, email: 'dana@acme.io' });
  const ap = F.applyReply(w, rep, NOW, reply);
  const got = ap.none ? (auto ? 'hold' : 'open') : ap.close ? (rep.outcome === 'declined' ? 'declined' : 'close') : 'open';
  return { got, outcome: rep.outcome };
}
const detail = [];
for (const [lang, key, reply, want] of gold.ROWS) { const [, out] = gold.ASKS[key]; const r = result(lang, out, reply); detail.push([lang, key, want, r.got, r.outcome || '', reply.slice(0, 60)]); }
const noLoop = detail.filter((d) => d[3] === 'no-loop');
const scored = detail.filter((d) => d[3] !== 'no-loop');
const wrongClose = scored.filter((d) => (d[3] === 'close' || d[3] === 'declined') && d[2] !== d[3]);   // closed a loop the reply did not finish (the error that matters)
const missed = scored.filter((d) => (d[2] === 'close' || d[2] === 'declined') && d[3] !== d[2]);     // left open a loop the reply did finish (costs a chase, not trust)
const wrongHold = scored.filter((d) => d[3] === 'hold' && d[2] !== 'hold');
const right = scored.filter((d) => d[2] === d[3]).length;
if (process.argv.includes('--json')) { console.log(JSON.stringify({ n: detail.length, noLoop: noLoop.length, right, wrongClose, missed, wrongHold, detail })); process.exit(0); }
const w = wilson(right, scored.length);
console.log(`rows ${detail.length}, loop not opened ${noLoop.length}, exactly right ${right}/${scored.length} (95% ${(w[0] * 100).toFixed(0)} to ${(w[1] * 100).toFixed(0)}%)`);
console.log(`closed on a reply that did not finish the ask: ${wrongClose.length}; left open though the reply finished it: ${missed.length}; held wrongly: ${wrongHold.length}`);
if (process.argv.includes('--list')) { for (const d of detail.filter((x) => x[2] !== x[3])) console.log(d.join(' | ')); }
