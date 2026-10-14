#!/usr/bin/env node
// Glance loops, as a local MCP server (docs/glance-ai/loops-mcp.md). DORMANT: nothing in the extension talks to it yet.
//
//   stdout  = the MCP channel (newline-delimited JSON-RPC 2.0). Nothing else is ever written there.
//   stderr  = logs, never a token, never a loop.
//   network = it LISTENS on 127.0.0.1 only (so the extension can publish a snapshot and collect claims) and makes NO outbound
//             request of any kind.
//
// Usage:
//   GLANCE_LOOPS_TOKEN=<16+ random chars> [GLANCE_LOOPS_PORT=47821] node scripts/glance-loops-mcp.cjs
//   node scripts/glance-loops-mcp.cjs --snapshot fixture.json        (development: serve a snapshot from a file, no listener)
//
// The loopback listener (all of it requires `Authorization: Bearer <token>`, a loopback Host, and no web-page Origin):
//   POST /snapshot       publish the public snapshot (rebuilt from an allowlist and scrubbed again here)
//   GET  /proposals      the claims agents have proposed and Glance has not read back yet
//   POST /proposals/ack  { ids: [...] }  Glance has handled them (verified, refused or expired)
//   GET  /health
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { FlowLoopBridge: B } = require(path.join(__dirname, '..', 'flow-trial-extension', 'core', 'loop-bridge.js'));

const VERSION = '0.1.0';
const MAX_BODY = 256 * 1024;
const MAX_PENDING_TOTAL = 200;
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const state = { snapshot: { protocol: B.PROTOCOL, level: 'minimal', generatedAt: null, loops: [] }, pending: [] };

function log(msg) { process.stderr.write('[glance-loops] ' + msg + '\n'); }

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } }; }

function toolContent(r) {
  const body = r.ok ? r.data : { error: r.error };
  return { content: [{ type: 'text', text: JSON.stringify(body) }], structuredContent: body, isError: !r.ok };
}

function handleRpc(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Invalid request.');
  const id = msg.id;
  const isNotification = id === undefined || id === null;
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params && msg.params.protocolVersion;
      return rpcResult(id, {
        protocolVersion: PROTOCOLS.indexOf(asked) >= 0 ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: B.SERVER_NAME, version: VERSION },
        instructions: B.INSTRUCTIONS
      });
    }
    case 'ping': return rpcResult(id, {});
    case 'tools/list': return rpcResult(id, { tools: B.tools() });
    case 'tools/call': {
      const p = msg.params || {};
      if (B.TOOL_NAMES.indexOf(p.name) < 0) return rpcError(id, -32602, 'Unknown tool.');
      const r = B.callTool(p.name, p.arguments, { snapshot: state.snapshot, pending: state.pending, now: Date.now() });
      if (r.ok && r.proposal && state.pending.length < MAX_PENDING_TOTAL) state.pending.push(r.proposal);
      return rpcResult(id, toolContent(r));
    }
    default:
      if (isNotification) return null;
      return rpcError(id, -32601, 'Method not found.');
  }
}

function startStdio() {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let out;
      try { out = handleRpc(JSON.parse(line)); } catch (e) { out = rpcError(null, -32700, 'Parse error.'); }
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

function send(res, status, body) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (status === 413) headers.Connection = 'close';
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req, cb) {
  let size = 0;
  const chunks = [];
  let dead = false;
  req.on('data', (c) => {
    if (dead) return;
    size += c.length;
    if (size > MAX_BODY) { dead = true; chunks.length = 0; cb(new Error('too_large')); return; }
    chunks.push(c);
  });
  req.on('end', () => { if (dead) return; try { cb(null, chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { cb(new Error('bad_json')); } });
}

function startListener(token, port) {
  const server = http.createServer((req, res) => {
    if (!B.isLoopbackHost(req.headers.host)) return send(res, 403, { error: 'loopback_only' });
    if (!B.originAllowed(req.headers.origin)) return send(res, 403, { error: 'origin_refused' });
    if (!B.tokenOk(B.bearer(req.headers.authorization), token)) return send(res, 401, { error: 'unauthorized' });
    const url = (req.url || '').split('?')[0];
    if (req.method === 'GET' && url === '/health') return send(res, 200, { ok: true, protocol: B.PROTOCOL });
    if (req.method === 'GET' && url === '/proposals') return send(res, 200, { proposals: state.pending.filter((p) => p.status === 'claimed') });
    if (req.method === 'POST' && url === '/snapshot') {
      return readBody(req, (err, body) => {
        if (err) return send(res, err.message === 'too_large' ? 413 : 400, { error: err.message });
        const snap = B.sanitizeSnapshot(body);
        if (!snap) return send(res, 400, { error: 'bad_snapshot' });
        state.snapshot = snap;
        const open = new Set(snap.loops.map((l) => l.id));
        state.pending = state.pending.filter((p) => open.has(p.loopId));
        send(res, 200, { ok: true, loops: snap.loops.length });
      });
    }
    if (req.method === 'POST' && url === '/proposals/ack') {
      return readBody(req, (err, body) => {
        if (err) return send(res, 400, { error: err.message });
        const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : []);
        const before = state.pending.length;
        state.pending = state.pending.filter((p) => !ids.has(p.proposalId));
        send(res, 200, { ok: true, removed: before - state.pending.length });
      });
    }
    return send(res, 404, { error: 'not_found' });
  });
  server.listen(port, '127.0.0.1', () => log('listening on 127.0.0.1:' + server.address().port));
  return server;
}

function main() {
  const file = argValue('--snapshot');
  if (file) {
    const snap = B.sanitizeSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (!snap) { log('the snapshot file is not a valid public snapshot'); process.exit(2); }
    state.snapshot = snap;
  } else {
    const token = process.env.GLANCE_LOOPS_TOKEN || '';
    if (token.length < 16) { log('set GLANCE_LOOPS_TOKEN (16+ characters) or pass --snapshot <file>'); process.exit(2); }
    const port = Number(process.env.GLANCE_LOOPS_PORT || 47821);
    startListener(token, port);
  }
  startStdio();
}

main();
