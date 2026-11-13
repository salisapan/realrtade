'use strict';
// Thread-level check on the owner's real threads (masked, private/, gitignored, eval only): his own outgoing ask opens a follow loop
// (core/follow-up.js classifyOutgoing + buildWatch), and the reply that came back does to the loop what a careful reader expects:
// close (a no, an opt-out, a delivery), hold (an auto-reply), flag (a bounce), or stay open. Prints row ids and outcomes only, never text.
// Gold: one pass by Claude in session, NOT owner-verified. usage: node scoreboard/real-mail/run-owner-threads.cjs
const fs = require('fs'), path = require('path'), vm = require('vm');
const G = path.join(__dirname, '..', '..');
const file = path.join(__dirname, 'private', 'owner-threads-2026-11-12.jsonl');
if (!fs.existsSync(file)) { console.log('no private file here (gitignored).'); process.exit(0); }
const CORE = path.join(G, '..', 'flow-trial-extension', 'core');
const sb = { module: undefined, console: { log() {}, warn() {}, error() {} }, TextEncoder };
vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'day-words.js', 'file-path.js', 'reply-meaning.js', 'reply-model-weights.js', 'reply-model.js', 'follow-up.js']) { const p = path.join(CORE, f); if (fs.existsSync(p)) try { vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: f }); } catch (e) { /* optional sibling */ } }
const F = vm.runInContext('FlowFollowUp', sb);
const NOW = new Date('2026-11-12T10:00:00+02:00').getTime();
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
let opened = 0, right = 0; const out = [];
for (const r of rows) {
  let ask = null; try { ask = F.classifyOutgoing(r.out, { now: NOW, lang: 'he' }); } catch (e) { ask = null; }
  if (!ask) { out.push([r.id, r.expect, 'NO LOOP OPENED', r.note]); continue; }
  opened++;
  const w = F.buildWatch({ ask, threadId: r.id, subject: '', counterpart: { email: r.from }, now: NOW - 3 * 86400000 });
  let got = 'open';
  if (r.reply !== null) {
    const auto = F.isAutoReply(r.reply, r.from);
    const rep = F.classifyReply(r.reply, w, { now: NOW, email: r.from });
    const ap = F.applyReply(w, rep, NOW, r.reply);
    got = ap.partial ? 'open(partial)' : ap.bounced ? 'flag(bounced)' : ap.none ? (auto || rep.outcome === 'auto' ? 'hold(auto)' : 'none') : ap.close ? 'close(' + rep.outcome + ')' : 'open(' + rep.outcome + ')';
  }
  const ok = (r.expect === 'close' && /^close/.test(got)) || (r.expect === 'hold' && /^hold/.test(got)) || (r.expect === 'open' && got === 'open') || (r.expect === 'flag' && /flag/.test(got)) || (r.expect === 'partial' && got === 'open(partial)');
  if (ok) right++;
  out.push([r.id, r.expect, got + ' kind=' + w.kind + ' dir=' + w.direction, ok ? 'ok' : 'DIFF', r.note]);
}
console.log(`threads: ${rows.length}; a loop opened on the owner's ask: ${opened}; the reply did what was expected: ${right}`);
for (const x of out) console.log(x.join(' | '));
