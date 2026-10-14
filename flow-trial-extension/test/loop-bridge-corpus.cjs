// The loop bridge (core/loop-bridge.js) and the local MCP server (scripts/glance-loops-mcp.cjs): what other agents may see of the
// open loops, and the one thing they may bring back. Dormant: nothing in the extension talks to the server yet.
// The server below is the real script, started as a child process on a free loopback port; the "agent" speaks real MCP over stdio.
// Run: node test/loop-bridge-corpus.cjs
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { FlowLoopBridge: B } = require('../core/loop-bridge.js');
const { FlowPrivacyShield: Shield } = require('../core/privacyShield.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const NOW = Date.parse('2026-10-14T08:00:00Z');
const SALT = 'install-salt-1';
const watch = {
  id: 'w-1', threadId: 'thr_abc123', messageId: 'msg_zzz', subject: 'Re: NDA for Project Falcon',
  counterpart: { email: 'dana.cohen@acme-legal.com', name: 'Dana Cohen' }, kind: 'reply', direction: 'theirs',
  what: 'Please send the signed NDA to dana.cohen@acme-legal.com or call 050-123-4567 about the 3,850 retainer',
  amount: { value: 3850, currency: 'ILS', raw: '₪3,850' }, deadlineIso: '2026-10-10', chaseIso: '2026-10-15',
  createdAt: '2026-10-03T08:00:00Z', status: 'waiting', stage: 'nudged', nudges: 1, subtype: 'signature'
};
const payment = Object.assign({}, watch, { id: 'w-2', kind: 'payment', subject: 'Invoice 4411', deadlineIso: null, createdAt: '2026-10-12T08:00:00Z', stage: 'waiting', nudges: 0, subtype: undefined });
const promise = Object.assign({}, watch, { id: 'w-3', direction: 'mine', createdAt: '2026-10-13T08:00:00Z', deadlineIso: '2026-10-20', stage: 'promised' });
const closed = Object.assign({}, watch, { id: 'w-4', status: 'resolved' });
const stopped = Object.assign({}, watch, { id: 'w-5', status: 'stopped' });
const all = [watch, payment, promise, closed, stopped];

// ---- 1. what leaves: minimal carries no person, no sentence, no money ----------------------------------------------------------
const min = B.publicSnapshot(all, { level: 'minimal', salt: SALT, now: NOW, shield: Shield });
const minText = JSON.stringify(min);
check('only open loops are published (resolved and stopped are not)', min.loops.length === 3, min.loops.length);
['dana', 'cohen', 'acme', 'falcon', '@', '050', '3850', '3,850', 'thr_abc123', 'msg_zzz', 'w-1', 'Invoice 4411', 'retainer', 'NDA'].forEach((s) => {
  check('minimal level never contains "' + s + '"', minText.toLowerCase().indexOf(s.toLowerCase()) < 0);
});
check('minimal has no counterpart, no amount, no sentence', min.loops.every((l) => !('counterpart' in l) && !('amount' in l) && !('what' in l)));
check('minimal still says there is money (a flag, not a figure)', min.loops.find((l) => l.kind === 'payment').hasAmount === true);
check('ids are opaque and stable for one install', min.loops.every((l) => /^lp_[0-9a-f]{12}$/.test(l.id)) && B.opaqueId('w-1', SALT) === min.loops.find((l) => l.type === 'signature').id);
check('two installs never share an id for the same loop', B.opaqueId('w-1', 'other-salt') !== B.opaqueId('w-1', SALT));
const first = min.loops.find((l) => l.type === 'signature');
check('days open, due day, overdue and direction are right', first.daysOpen === 11 && first.dueIso === '2026-10-10' && first.overdue === true && first.direction === 'waiting_on_them' && first.stage === 'nudged', first);
check('a promise of yours reads as owed_by_you and is not overdue', min.loops.find((l) => l.direction === 'owed_by_you').overdue === false);
check('overdue loops sort first', min.loops[0].overdue === true);
check('what closes it is stated per loop, and a payment is not closed by an answer', /payment is confirmed/i.test(min.loops.find((l) => l.kind === 'payment').closesWhen));

const named = B.publicSnapshot([watch], { level: 'named', salt: SALT, now: NOW, shield: Shield });
const namedText = JSON.stringify(named);
check('named level adds a first name, the amount and one masked sentence', named.loops[0].counterpart === 'Dana' && named.loops[0].amount.value === 3850 && typeof named.loops[0].what === 'string' && named.loops[0].what.length > 0, named.loops[0]);
['@', 'acme-legal', '050-123', 'dana.cohen', 'thr_abc123', 'Falcon'].forEach((s) => check('named level still never contains "' + s + '"', namedText.indexOf(s) < 0));
check('a name that is only a domain is reduced to the domain, never an address', B.toPublicLoop(Object.assign({}, watch, { counterpart: { email: 'ops@vendor.example', name: '' } }), { level: 'named', salt: SALT, now: NOW }).counterpart === 'vendor.example');
check('a sentence that is nothing but an address is scrubbed even with no shield', !/@/.test(B.toPublicLoop(Object.assign({}, watch, { what: 'write to a@b.co' }), { level: 'named', salt: SALT, now: NOW }).what));
check('an unknown level falls back to minimal', B.publicSnapshot([watch], { level: 'everything', salt: SALT, now: NOW }).level === 'minimal');
check('a closed loop projects to nothing', B.toPublicLoop(closed, { salt: SALT, now: NOW }) === null && B.toPublicLoop(null) === null);
check('the list is capped', B.publicSnapshot(Array.from({ length: 80 }, (_, i) => Object.assign({}, watch, { id: 'm' + i })), { salt: SALT, now: NOW }).loops.length === B.MAX_LOOPS);

// ---- 2. the server never trusts a snapshot --------------------------------------------------------------------------------------
check('a snapshot with the wrong protocol or no loops list is refused', B.sanitizeSnapshot({ protocol: 9, loops: [] }) === null && B.sanitizeSnapshot({ protocol: 1 }) === null && B.sanitizeSnapshot(null) === null);
check('a loop whose id is not opaque is refused (a raw thread id cannot ride in)', B.sanitizeSnapshot({ protocol: 1, loops: [{ id: 'thr_abc123' }] }) === null);
const dirty = { protocol: 1, level: 'minimal', loops: [Object.assign({}, min.loops[0], { counterpart: 'Dana', email: 'dana@acme.com', what: 'secret text', amount: { value: 9 }, subject: 'S', threadId: 'T', closesWhen: 'Mail dana@acme.com or +972 50 123 4567' })] };
const clean = B.sanitizeSnapshot(dirty);
check('at minimal level extra fields are dropped and strings are scrubbed again', clean && !('counterpart' in clean.loops[0]) && !('what' in clean.loops[0]) && !('email' in clean.loops[0]) && !('subject' in clean.loops[0]) && !/@|972/.test(JSON.stringify(clean)), clean);

// ---- 3. the tools: read plus one proposal, nothing that acts ---------------------------------------------------------------------
const tl = B.tools();
check('exactly three tools', tl.length === 3 && tl.map((t) => t.name).join() === B.TOOL_NAMES.join(), tl.map((t) => t.name));
check('no tool name says close, release, send, nudge, create, delete, write, remind or draft', tl.every((t) => !/close|release|send|nudge|create|delete|write|remind|draft|resolve|done/i.test(t.name)));
check('the two readers are marked read-only and the proposal is marked non-destructive', tl[0].annotations.readOnlyHint && tl[1].annotations.readOnlyHint && tl[2].annotations.destructiveHint === false && tl.every((t) => t.annotations.openWorldHint === false));
check('every input schema refuses unknown fields', tl.every((t) => t.inputSchema.additionalProperties === false));
check('the instructions tell the agent it cannot close and that evidence is a claim', /cannot close/.test(B.INSTRUCTIONS) && /claim/i.test(B.INSTRUCTIONS));
const ctx = (pending) => ({ snapshot: min, pending: pending || [], now: NOW });
const list = B.callTool('glance_open_loops', {}, ctx());
check('open loops: all three, with an honest note', list.ok && list.data.total === 3 && /cannot close/.test(list.data.note));
check('open loops: filters by direction and by overdue, and honours the limit', B.callTool('glance_open_loops', { direction: 'owed_by_you' }, ctx()).data.total === 1 && B.callTool('glance_open_loops', { overdue: true }, ctx()).data.total === 1 && B.callTool('glance_open_loops', { limit: 1 }, ctx()).data.loops.length === 1);
check('nothing open says nothing is open', B.callTool('glance_open_loops', {}, { snapshot: { loops: [] } }).data.note === 'Nothing is open.');
const one = B.callTool('glance_loop', { id: first.id }, ctx());
check('one loop: what Glance needs to see before it counts as closed', one.ok && /reads the result back/.test(one.data.proofNeeded) && one.data.loop.id === first.id);
check('an unknown loop id is an honest error, not an invented loop', B.callTool('glance_loop', { id: 'lp_000000000000' }, ctx()).error.code === 'no_such_loop');
check('an unknown tool is refused', B.callTool('glance_close_loop', { id: first.id }, ctx()).error.code === 'unknown_tool');

// ---- 4. evidence is a claim, never a close --------------------------------------------------------------------------------------
const ev = { loopId: first.id, system: 'google/tasks', externalId: 'task-123', url: 'https://tasks.google.com/x', note: 'made a task, ping dana@acme.com' };
const good = B.callTool('glance_propose_evidence', ev, ctx());
check('a valid claim is recorded as a claim and the loop is not closed', good.ok && good.data.status === 'claimed' && good.data.closed === false && good.proposal.status === 'claimed' && /does not|stays open/i.test(good.data.message));
check('the claim carries no address even if the agent wrote one', !/@/.test(JSON.stringify(good.proposal)));
check('the snapshot is untouched by a claim (the loop is still open, still listed)', B.callTool('glance_open_loops', {}, ctx([good.proposal])).data.total === 3 && min.loops.some((l) => l.id === first.id));
['closed', 'fetchedBack', 'verifiedAt', 'status', 'release', 'sent', 'resolved', 'close'].forEach((k) => {
  const r = B.callTool('glance_propose_evidence', Object.assign({}, ev, { [k]: k === 'closed' || k === 'fetchedBack' || k === 'sent' ? true : 'x' }), ctx());
  check('a claim that sets "' + k + '" is refused: that is Glance\'s alone', r.ok === false && r.error.code === 'not_yours_to_set');
});
check('an unknown field is refused', B.callTool('glance_propose_evidence', Object.assign({}, ev, { extra: 1 }), ctx()).error.code === 'unknown_field');
check('a claim for a loop that is not open is refused', B.callTool('glance_propose_evidence', Object.assign({}, ev, { loopId: 'lp_ffffffffffff' }), ctx()).error.code === 'no_such_loop');
['google', 'Google Tasks', 'x/y/z/w', '../etc/passwd', 'a/b c', ''].forEach((s) => check('system "' + s + '" is refused', B.callTool('glance_propose_evidence', Object.assign({}, ev, { system: s }), ctx()).error.code === 'bad_system'));
check('an empty or oversized externalId is refused', B.callTool('glance_propose_evidence', Object.assign({}, ev, { externalId: '' }), ctx()).error.code === 'bad_external_id' && B.callTool('glance_propose_evidence', Object.assign({}, ev, { externalId: 'x'.repeat(300) }), ctx()).error.code === 'bad_external_id');
['http://tasks.example/x', 'javascript:alert(1)', 'https://user:pw@x.example/', 'not a url'].forEach((u) => check('url "' + u + '" is refused', B.callTool('glance_propose_evidence', Object.assign({}, ev, { url: u }), ctx()).error.code === 'bad_url'));
const dup = B.callTool('glance_propose_evidence', ev, ctx([good.proposal]));
check('the same claim twice is not stored twice', dup.ok && dup.proposal === null && dup.data.proposalId === good.proposal.proposalId);
const three = [1, 2, 3].map((i) => B.callTool('glance_propose_evidence', Object.assign({}, ev, { externalId: 'id-' + i }), ctx()).proposal);
check('a loop holds at most three unverified claims, then asks the agent to wait', B.callTool('glance_propose_evidence', Object.assign({}, ev, { externalId: 'id-4' }), ctx(three)).error.code === 'too_many_claims');
check('the open claims are listed on the loop, without their ids in the system', B.callTool('glance_loop', { id: first.id }, ctx([good.proposal])).data.unverifiedClaims.length === 1);

// ---- 5. the doors: loopback, token, origin ------------------------------------------------------------------------------------
check('loopback hosts only, with look-alikes refused', ['127.0.0.1', '127.0.0.1:47821', 'localhost:1', '[::1]:5'].every(B.isLoopbackHost) && ['127.0.0.1.evil.com', 'localhost.evil.com', '10.0.0.5', 'evil.com', '', undefined].every((h) => !B.isLoopbackHost(h)));
check('a web page cannot reach it: only no Origin or the extension\'s own', B.originAllowed(undefined) && B.originAllowed('chrome-extension://abcdefghijklmnopabcdefghijklmnop') && !B.originAllowed('https://evil.example') && !B.originAllowed('null') && !B.originAllowed('http://localhost:3000'));
check('token comparison: right passes; wrong, short, empty and prefix fail', B.tokenOk('a'.repeat(20), 'a'.repeat(20)) && !B.tokenOk('a'.repeat(19) + 'b', 'a'.repeat(20)) && !B.tokenOk('', 'a'.repeat(20)) && !B.tokenOk('a'.repeat(20), '') && !B.tokenOk('short', 'short') && !B.tokenOk('a'.repeat(10), 'a'.repeat(20)));
check('the bearer header is parsed strictly', B.bearer('Bearer abc') === 'abc' && B.bearer('bearer abc') === 'abc' && B.bearer('Basic abc') === '' && B.bearer('') === '');

// ---- 6. the real server, over real MCP ---------------------------------------------------------------------------------------------
function freePort() { return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }
function request(port, method, urlPath, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const body = o.body === undefined ? null : JSON.stringify(o.body);
    const headers = Object.assign({}, body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}, o.token === null ? {} : { Authorization: 'Bearer ' + (o.token || TOKEN) }, o.headers || {});
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* not json */ } resolve({ status: res.statusCode, json: j, text: s }); });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.code }));
    if (body) req.write(body);
    req.end();
  });
}
const TOKEN = 'test-token-0123456789abcdef';

(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'glance-loops-mcp.cjs')], { env: Object.assign({}, process.env, { GLANCE_LOOPS_TOKEN: TOKEN, GLANCE_LOOPS_PORT: String(port) }), stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  server.stderr.on('data', (c) => { stderr += c; });
  const pendingRpc = new Map();
  let outBuf = '';
  server.stdout.on('data', (c) => {
    outBuf += c;
    let nl;
    while ((nl = outBuf.indexOf('\n')) >= 0) {
      const line = outBuf.slice(0, nl); outBuf = outBuf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch (e) { check('stdout carries only JSON-RPC lines', false, line); continue; }
      if (pendingRpc.has(m.id)) { pendingRpc.get(m.id)(m); pendingRpc.delete(m.id); }
    }
  });
  let rid = 0;
  const rpc = (method, params) => new Promise((resolve) => { const id = ++rid; pendingRpc.set(id, resolve); server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const notify = (method) => server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
  for (let i = 0; i < 100 && stderr.indexOf('listening') < 0; i++) await new Promise((r) => setTimeout(r, 50));
  check('the server listens on loopback only', /listening on 127\.0\.0\.1:/.test(stderr), stderr);

  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  check('MCP initialize: protocol echoed, tools capability, instructions say it cannot close', init.result.protocolVersion === '2025-06-18' && init.result.capabilities.tools && init.result.serverInfo.name === 'glance-loops' && /cannot close/.test(init.result.instructions), init.result);
  notify('notifications/initialized');
  check('an old protocol version falls back to one the server speaks', (await rpc('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion === '2025-06-18');
  check('ping answers', (await rpc('ping')).result !== undefined);
  const listed = await rpc('tools/list');
  check('tools/list is the three tools', listed.result.tools.map((t) => t.name).join() === B.TOOL_NAMES.join());
  check('an unknown method is an error, not silence', (await rpc('resources/list')).error.code === -32601);
  const empty = await rpc('tools/call', { name: 'glance_open_loops', arguments: {} });
  check('before anything is published: nothing is open', empty.result.structuredContent.total === 0 && empty.result.isError === false);
  check('a tool that does not exist cannot be called', (await rpc('tools/call', { name: 'glance_close_loop', arguments: { id: 'x' } })).error.code === -32602);

  check('no token: 401', (await request(port, 'GET', '/health', { token: null })).status === 401);
  check('wrong token: 401', (await request(port, 'GET', '/health', { token: 'wrong-token-wrong-token-1' })).status === 401);
  check('the right token: health answers', (await request(port, 'GET', '/health')).json.ok === true);
  check('a rebinding Host header is refused even with the right token', (await request(port, 'GET', '/health', { headers: { Host: 'evil.example' } })).status === 403);
  check('a web page Origin is refused even with the right token', (await request(port, 'GET', '/health', { headers: { Origin: 'https://evil.example' } })).status === 403);
  check('the extension\'s own Origin is accepted', (await request(port, 'GET', '/health', { headers: { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' } })).status === 200);
  check('a snapshot that is not a snapshot is refused', (await request(port, 'POST', '/snapshot', { body: { protocol: 1, loops: [{ id: 'thr_abc123' }] } })).status === 400);
  check('a huge body is refused', (await request(port, 'POST', '/snapshot', { body: { protocol: 1, loops: [], pad: 'x'.repeat(300 * 1024) } })).status === 413);

  const pub = await request(port, 'POST', '/snapshot', { body: dirty });
  check('a snapshot is accepted and rebuilt: nothing but the allowlist survives', pub.status === 200 && pub.json.loops === 1);
  const afterPub = await rpc('tools/call', { name: 'glance_open_loops', arguments: {} });
  check('the agent now sees the published loop and no address, name or sentence', afterPub.result.structuredContent.total === 1 && !/@|972|secret text|Dana|subject|threadId/.test(afterPub.result.content[0].text), afterPub.result.content[0].text);

  const loopId = dirty.loops[0].id;
  const claim = await rpc('tools/call', { name: 'glance_propose_evidence', arguments: { loopId, system: 'google/tasks', externalId: 'task-9' } });
  check('over MCP a claim is recorded as a claim and is not a close', claim.result.isError === false && claim.result.structuredContent.status === 'claimed' && claim.result.structuredContent.closed === false);
  const tried = await rpc('tools/call', { name: 'glance_propose_evidence', arguments: { loopId, system: 'google/tasks', externalId: 'task-9', closed: true } });
  check('over MCP an agent that tries to close is told no', tried.result.isError === true && tried.result.structuredContent.error.code === 'not_yours_to_set');
  const props = await request(port, 'GET', '/proposals');
  check('Glance can collect the claim to read it back', props.status === 200 && props.json.proposals.length === 1 && props.json.proposals[0].status === 'claimed' && props.json.proposals[0].externalId === 'task-9');
  const stillOpen = await rpc('tools/call', { name: 'glance_open_loops', arguments: {} });
  check('after the claim the loop is still open', stillOpen.result.structuredContent.total === 1);
  const ack = await request(port, 'POST', '/proposals/ack', { body: { ids: [props.json.proposals[0].proposalId] } });
  check('Glance acknowledges a claim once it has handled it', ack.json.removed === 1 && (await request(port, 'GET', '/proposals')).json.proposals.length === 0);
  await request(port, 'POST', '/snapshot', { body: { protocol: 1, level: 'minimal', loops: [] } });
  const gone = await rpc('tools/call', { name: 'glance_loop', arguments: { id: loopId } });
  check('when Glance publishes that the loop closed, the agent can no longer see it', gone.result.isError === true && gone.result.structuredContent.error.code === 'no_such_loop');
  check('the server printed no token and no loop on stderr', stderr.indexOf(TOKEN) < 0 && !/task-9|lp_/.test(stderr), stderr);
  server.kill();

  // the development mode: a snapshot from a file, no listener at all
  const tmp = path.join(os.tmpdir(), 'glance-loops-fixture-' + process.pid + '.json');
  fs.writeFileSync(tmp, JSON.stringify(min));
  const dev = spawn(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'glance-loops-mcp.cjs'), '--snapshot', tmp], { stdio: ['pipe', 'pipe', 'pipe'], env: Object.assign({}, process.env, { GLANCE_LOOPS_TOKEN: '' }) });
  let devOut = '';
  dev.stdout.on('data', (c) => { devOut += c; });
  dev.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'glance_open_loops', arguments: {} } }) + '\n');
  for (let i = 0; i < 100 && devOut.indexOf('\n') < 0; i++) await new Promise((r) => setTimeout(r, 50));
  check('--snapshot serves a file with no listener', JSON.parse(devOut.split('\n')[0]).result.structuredContent.total === 3);
  dev.kill();
  fs.unlinkSync(tmp);
  const noToken = spawn(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'glance-loops-mcp.cjs')], { env: Object.assign({}, process.env, { GLANCE_LOOPS_TOKEN: 'short' }), stdio: ['pipe', 'pipe', 'pipe'] });
  const code = await new Promise((r) => noToken.on('exit', r));
  check('without a real token and without --snapshot the server refuses to start', code === 2, code);

  // ---- 7. the source: no outbound network, no way to act ----------------------------------------------------------------------
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'glance-loops-mcp.cjs'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'core', 'loop-bridge.js'), 'utf8');
  check('neither file can make an outbound request or run a command', !/\bfetch\s*\(|http\.request|https\.request|require\(['"]https['"]\)|child_process|XMLHttpRequest|WebSocket|\.connect\(/.test(src));
  const coreCode = fs.readFileSync(path.join(__dirname, '..', 'core', 'loop-bridge.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  check('the core module touches no chrome.* and no DOM', !/\bchrome\./.test(coreCode) && !/\b(document|window)\./.test(coreCode));
  check('the listener binds 127.0.0.1, never 0.0.0.0', /listen\(port, '127\.0\.0\.1'/.test(src) && !/0\.0\.0\.0/.test(src));

  // ---- 8. nothing is wired: the bridge is dormant ---------------------------------------------------------------------------------
  const ext = path.join(__dirname, '..');
  const wired = ['manifest.json', 'src/background.js', 'popup/popup.html', 'popup/popup.js', 'src/content-gmail.js'].filter((f) => /loop-bridge|glance-loops/.test(fs.readFileSync(path.join(ext, f), 'utf8')));
  check('dormant: the manifest, the worker, the popup and the Gmail script do not reference the bridge', wired.length === 0, wired);

  console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nAll loop-bridge checks passed.');
  process.exit(failures ? 1 : 0);
})();
