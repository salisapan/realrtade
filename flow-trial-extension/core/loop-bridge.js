// The loop bridge: what Glance would let the person's OWN agents (Cursor, Claude, Grok, anything that speaks MCP) see of the loops
// that are open, and the one thing they may bring back: evidence. Portable: no chrome.*, no DOM, no network, no clock of its own.
//
// This is an ADDITION to Glance, not a change to it (docs/glance-ai/loops-mcp.md). Glance still detects, carries and closes;
// the bridge only lets another agent SEE what is open and REPORT what it did about it. Hard rules, enforced here and by
// test/loop-bridge-corpus.cjs:
//   - READ plus one PROPOSAL. There is no tool that closes, releases, sends, nudges, creates or deletes anything.
//   - Evidence is a CLAIM. An agent saying "done" never closes a loop: only Glance reading the result back itself does
//     (ProofOfClose: { system, externalId, fetchedBack, verifiedAt }). `fetchedBack`, `verifiedAt` and `closed` are refused
//     if an agent tries to send them.
//   - Minimal by default. Level "minimal" carries no name, no address, no sentence, no amount: only what kind of loop it is,
//     how old, how overdue. Level "named" (an explicit person's choice, later) adds a first name or a domain, an amount and one
//     masked sentence. Never an email address, a phone number, a subject, a message body, a thread id or an attachment.
//   - Opaque ids: a loop is `lp_<hash of its id and this install's salt>`, so two installs never share an id.
const FlowLoopBridge = (() => {
  const PROTOCOL = 1;
  const SERVER_NAME = 'glance-loops';
  const LEVELS = ['minimal', 'named'];
  const MAX_LOOPS = 50;
  const DEFAULT_LIST = 25;
  const MAX_WHAT = 140;
  const MAX_NOTE = 200;
  const MAX_ID = 200;
  const MAX_PENDING_PER_LOOP = 3;
  const SYSTEM_RE = /^[a-z0-9][a-z0-9-]{0,23}(?:\/[a-z0-9][a-z0-9._-]{0,47}){1,2}$/;
  const DIRECTIONS = ['waiting_on_them', 'owed_by_you'];
  const STAGES = ['waiting', 'nudged', 'promised', 'yours', 'partial'];
  const TYPE_RE = /^[a-z][a-z-]{1,23}$/;
  const FORBIDDEN_EVIDENCE = ['closed', 'close', 'fetchedBack', 'verifiedAt', 'status', 'release', 'released', 'send', 'sent', 'resolved'];
  const DAY_MS = 86400000;

  const TOOL_NAMES = ['glance_open_loops', 'glance_loop', 'glance_propose_evidence'];

  const INSTRUCTIONS = [
    'Glance closes open loops. These tools show which loops are open and let you report evidence toward one.',
    'You can read loops and propose evidence. You cannot close, release, send, nudge, create or delete anything.',
    'Evidence is a claim: the loop stays open until Glance reads the result back itself. Say so to the person; never tell them a loop is closed because you proposed evidence.',
    'If nothing is open, say nothing is open. Do not invent loops, names, amounts or dates.'
  ].join(' ');

  function clean(v) { return typeof v === 'string' ? v.trim() : ''; }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

  // FNV-1a, 32 bit, twice with different seeds: an opaque id, not a security boundary.
  function hash(str) {
    let out = '';
    [2166136261, 84696351].forEach((seed) => {
      let h = seed >>> 0;
      const s = String(str);
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      out += ('00000000' + h.toString(16)).slice(-8);
    });
    return out;
  }

  function opaqueId(rawId, salt) { return 'lp_' + hash(String(salt || '') + '|' + String(rawId)).slice(0, 12); }

  function isLoopbackHost(host) {
    const h = String(host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    return h === '127.0.0.1' || h === 'localhost' || h === '::1';
  }

  // A web page in the person's browser must never be able to talk to the bridge: no Origin (a program) or the extension's own.
  function originAllowed(origin) {
    if (origin === undefined || origin === null || origin === '') return true;
    return /^chrome-extension:\/\/[a-p]{32}$/.test(String(origin));
  }

  // Constant-time comparison, so the token cannot be guessed one character at a time.
  function tokenOk(given, expected) {
    const a = String(given || '');
    const b = String(expected || '');
    if (!b || b.length < 16) return false;
    let diff = a.length ^ b.length;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
  }

  function bearer(header) {
    const m = /^Bearer\s+(\S+)$/i.exec(String(header || '').trim());
    return m ? m[1] : '';
  }

  function maskSentence(text, shield) {
    const t = clip(text, MAX_WHAT * 2);
    if (!t) return '';
    let masked = t;
    if (shield && typeof shield.mask === 'function') {
      try { masked = shield.mask(t).maskedText; } catch (e) { return ''; }
    }
    return scrub(clip(masked, MAX_WHAT));
  }

  // Last line of defence on any string that leaves this module, whatever produced it.
  function scrub(s) {
    return String(s || '')
      .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
      .replace(/https?:\/\/\S+/gi, '[link]')
      .replace(/\+?\d[\d\s().-]{7,}\d/g, '[number]');
  }

  function firstToken(name) {
    const t = clean(name).split(/\s+/)[0] || '';
    return /^[^\s@\d]{1,30}$/.test(t) ? t : '';
  }

  function domainOf(email) {
    const m = /@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(clean(email));
    return m ? m[1].toLowerCase() : '';
  }

  function dayIso(ms) { return new Date(ms).toISOString().slice(0, 10); }

  // One open watch (core/follow-up.js) -> the public shape, or null if it is not an open loop.
  function toPublicLoop(watch, opts) {
    if (!watch || watch.status !== 'waiting' || !watch.id) return null;
    const o = opts || {};
    const level = LEVELS.indexOf(o.level) >= 0 ? o.level : 'minimal';
    const now = Number.isFinite(o.now) ? o.now : 0;
    const created = Date.parse(watch.createdAt || '');
    const due = Date.parse(watch.deadlineIso || '');
    const chase = Date.parse(watch.chaseIso || '');
    const stage = watch.stage || ((watch.nudges || 0) > 0 ? 'nudged' : 'waiting');
    const loop = {
      id: opaqueId(watch.id, o.salt),
      direction: watch.direction === 'mine' ? 'owed_by_you' : 'waiting_on_them',
      kind: watch.kind === 'payment' ? 'payment' : 'reply',
      stage: STAGES.indexOf(stage) >= 0 ? stage : 'waiting',
      daysOpen: Number.isFinite(created) && now ? Math.max(0, Math.floor((now - created) / DAY_MS)) : 0,
      dueIso: Number.isFinite(due) ? dayIso(due) : null,
      nextLookIso: Number.isFinite(chase) ? dayIso(chase) : null,
      overdue: Number.isFinite(due) && now ? due < now - DAY_MS : false,
      hasAmount: Boolean(watch.amount && Number.isFinite(Number(watch.amount.value))),
      closesWhen: watch.kind === 'payment'
        ? 'The payment is confirmed (an answer alone does not close it).'
        : (watch.direction === 'mine' ? 'You do what you promised and Glance reads the result back.' : 'A real answer arrives, or the thing asked for really arrives.')
    };
    const type = clean(watch.subtype);
    if (TYPE_RE.test(type)) loop.type = type;
    if (level === 'named') {
      const cp = watch.counterpart || {};
      const who = firstToken(cp.name) || domainOf(cp.email);
      if (who) loop.counterpart = who;
      if (loop.hasAmount) loop.amount = { value: Number(watch.amount.value), currency: clean(watch.amount.currency) || null };
      const what = maskSentence(watch.what, o.shield);
      if (what) loop.what = what;
    }
    return loop;
  }

  function publicSnapshot(watches, opts) {
    const o = opts || {};
    const level = LEVELS.indexOf(o.level) >= 0 ? o.level : 'minimal';
    const loops = (watches || []).map((w) => toPublicLoop(w, o)).filter(Boolean);
    loops.sort((a, b) => (Number(b.overdue) - Number(a.overdue)) || (b.daysOpen - a.daysOpen) || (a.id < b.id ? -1 : 1));
    return { protocol: PROTOCOL, level, generatedAt: Number.isFinite(o.now) && o.now ? new Date(o.now).toISOString() : null, loops: loops.slice(0, MAX_LOOPS) };
  }

  // The server never trusts what it is sent: it rebuilds the snapshot from an allowlist and scrubs every string again.
  function sanitizeSnapshot(input) {
    if (!input || typeof input !== 'object' || input.protocol !== PROTOCOL || !Array.isArray(input.loops)) return null;
    const level = LEVELS.indexOf(input.level) >= 0 ? input.level : 'minimal';
    const loops = [];
    for (const l of input.loops.slice(0, MAX_LOOPS)) {
      if (!l || typeof l !== 'object' || !/^lp_[0-9a-f]{12}$/.test(String(l.id))) return null;
      const out = {
        id: l.id,
        direction: DIRECTIONS.indexOf(l.direction) >= 0 ? l.direction : 'waiting_on_them',
        kind: l.kind === 'payment' ? 'payment' : 'reply',
        stage: STAGES.indexOf(l.stage) >= 0 ? l.stage : 'waiting',
        daysOpen: Math.max(0, Math.min(3650, Math.floor(Number(l.daysOpen) || 0))),
        dueIso: /^\d{4}-\d{2}-\d{2}$/.test(String(l.dueIso)) ? l.dueIso : null,
        nextLookIso: /^\d{4}-\d{2}-\d{2}$/.test(String(l.nextLookIso)) ? l.nextLookIso : null,
        overdue: l.overdue === true,
        hasAmount: l.hasAmount === true,
        closesWhen: scrub(clip(l.closesWhen, 160))
      };
      if (TYPE_RE.test(String(l.type || ''))) out.type = l.type;
      if (level === 'named') {
        if (clean(l.counterpart)) out.counterpart = scrub(clip(l.counterpart, 40));
        if (l.amount && Number.isFinite(Number(l.amount.value))) out.amount = { value: Number(l.amount.value), currency: clean(l.amount.currency).slice(0, 3).toUpperCase() || null };
        if (clean(l.what)) out.what = scrub(clip(l.what, MAX_WHAT));
      }
      loops.push(out);
    }
    return { protocol: PROTOCOL, level, generatedAt: typeof input.generatedAt === 'string' ? input.generatedAt.slice(0, 30) : null, loops };
  }

  function tools() {
    return [
      {
        name: 'glance_open_loops',
        description: 'List the loops Glance holds open for the person: things they asked someone for, and things they promised. Read only. Returns kind, stage, days open and what closes it, never message text.',
        inputSchema: {
          type: 'object',
          properties: {
            direction: { type: 'string', enum: DIRECTIONS, description: 'waiting_on_them: the person is waiting for someone. owed_by_you: the person promised something.' },
            overdue: { type: 'boolean', description: 'Only loops whose stated deadline has passed.' },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LOOPS }
          },
          additionalProperties: false
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      {
        name: 'glance_loop',
        description: 'One open loop by id, with what would close it and what Glance needs to see before it counts as closed. Read only.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      {
        name: 'glance_propose_evidence',
        description: 'Tell Glance what you did toward closing a loop (for example a task or a file you created, with its id in that system). This records a CLAIM only. The loop stays open until Glance reads the result back itself; you cannot close it.',
        inputSchema: {
          type: 'object',
          properties: {
            loopId: { type: 'string' },
            system: { type: 'string', description: 'Where the result lives, as <vendor>/<kind>, for example google/tasks or microsoft/onedrive.' },
            externalId: { type: 'string', description: 'The id of the result in that system.' },
            url: { type: 'string', description: 'Optional https link to the result.' },
            note: { type: 'string', description: 'Optional one line about what you did. No personal data.' }
          },
          required: ['loopId', 'system', 'externalId'],
          additionalProperties: false
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      }
    ];
  }

  function fail(code, message) { return { ok: false, error: { code, message } }; }

  function findLoop(snapshot, id) {
    return ((snapshot && snapshot.loops) || []).find((l) => l.id === id) || null;
  }

  function validateEvidence(args, snapshot, pending, now) {
    const a = args && typeof args === 'object' ? args : {};
    const banned = FORBIDDEN_EVIDENCE.filter((k) => Object.prototype.hasOwnProperty.call(a, k));
    if (banned.length) return fail('not_yours_to_set', 'Only Glance can close a loop or mark a result as read back. Remove: ' + banned.join(', ') + '.');
    const known = ['loopId', 'system', 'externalId', 'url', 'note'];
    const extra = Object.keys(a).filter((k) => known.indexOf(k) < 0);
    if (extra.length) return fail('unknown_field', 'Unknown field: ' + extra.join(', ') + '.');
    const loop = findLoop(snapshot, clean(a.loopId));
    if (!loop) return fail('no_such_loop', 'No open loop has that id. Read the open loops again.');
    const system = clean(a.system).toLowerCase();
    if (!SYSTEM_RE.test(system)) return fail('bad_system', 'system must look like google/tasks or microsoft/onedrive.');
    const externalId = clean(a.externalId);
    if (!externalId || externalId.length > MAX_ID) return fail('bad_external_id', 'externalId is required and at most ' + MAX_ID + ' characters.');
    let url = null;
    if (clean(a.url)) {
      try { const u = new URL(clean(a.url)); if (u.protocol !== 'https:' || u.username || u.password) throw new Error('x'); url = u.toString().slice(0, 300); } catch (e) { return fail('bad_url', 'url must be an https link without credentials.'); }
    }
    const note = clean(a.note) ? scrub(clip(a.note, MAX_NOTE)) : null;
    const open = (pending || []).filter((p) => p.loopId === loop.id && p.status === 'claimed');
    if (open.some((p) => p.system === system && p.externalId === externalId)) {
      return { ok: true, duplicate: true, proposal: open.find((p) => p.system === system && p.externalId === externalId) };
    }
    if (open.length >= MAX_PENDING_PER_LOOP) return fail('too_many_claims', 'Glance already holds ' + MAX_PENDING_PER_LOOP + ' unverified claims for this loop. Wait for it to read them back.');
    const proposal = { proposalId: 'ev_' + hash(loop.id + '|' + system + '|' + externalId).slice(0, 12), loopId: loop.id, system, externalId, url, note, proposedAt: Number.isFinite(now) && now ? new Date(now).toISOString() : null, status: 'claimed' };
    return { ok: true, duplicate: false, proposal };
  }

  // The one entry point for a tool call. Pure: the caller keeps the proposals.
  // ctx: { snapshot, pending, now } -> { ok, data } | { ok:false, error } , plus `proposal` when a new claim should be stored.
  function callTool(name, args, ctx) {
    const c = ctx || {};
    const snapshot = c.snapshot || { loops: [] };
    const a = args && typeof args === 'object' ? args : {};
    if (name === 'glance_open_loops') {
      let loops = snapshot.loops.slice();
      if (DIRECTIONS.indexOf(a.direction) >= 0) loops = loops.filter((l) => l.direction === a.direction);
      if (a.overdue === true) loops = loops.filter((l) => l.overdue);
      const limit = Math.max(1, Math.min(MAX_LOOPS, Math.floor(Number(a.limit)) || DEFAULT_LIST));
      return { ok: true, data: { level: snapshot.level || 'minimal', generatedAt: snapshot.generatedAt || null, total: loops.length, loops: loops.slice(0, limit), note: loops.length ? 'These stay open until Glance reads a result back. You cannot close them.' : 'Nothing is open.' } };
    }
    if (name === 'glance_loop') {
      const loop = findLoop(snapshot, clean(a.id));
      if (!loop) return fail('no_such_loop', 'No open loop has that id. It may have closed.');
      const claims = (c.pending || []).filter((p) => p.loopId === loop.id && p.status === 'claimed').map((p) => ({ proposalId: p.proposalId, system: p.system, proposedAt: p.proposedAt }));
      return { ok: true, data: { loop, proofNeeded: 'Glance counts this loop closed only after it reads the result back from the system that holds it (system, externalId, fetchedBack, verifiedAt). A report from an agent is a claim, not that.', unverifiedClaims: claims } };
    }
    if (name === 'glance_propose_evidence') {
      const v = validateEvidence(a, snapshot, c.pending, c.now);
      if (!v.ok) return v;
      return { ok: true, proposal: v.duplicate ? null : v.proposal, data: { recorded: true, status: 'claimed', closed: false, proposalId: v.proposal.proposalId, message: 'Recorded as a claim. The loop stays open until Glance reads the result back itself. Do not tell the person it is closed.' } };
    }
    return fail('unknown_tool', 'Unknown tool.');
  }

  return { PROTOCOL, SERVER_NAME, LEVELS, TOOL_NAMES, MAX_LOOPS, INSTRUCTIONS, FORBIDDEN_EVIDENCE, hash, opaqueId, isLoopbackHost, originAllowed, tokenOk, bearer, scrub, toPublicLoop, publicSnapshot, sanitizeSnapshot, tools, validateEvidence, callTool };
})();

if (typeof module !== 'undefined') module.exports = { FlowLoopBridge };
