// The client-requests ledger on this device (core/client-requests.js decides; this file only keeps and feeds it).
// Storage: chrome.storage.local under one key, or an injected { get, set } (tests). Nothing here leaves the device:
// a reminder becomes a Gmail draft through the existing background path ('flow:follow-draft'), and the person sends it.
//
// Feeding it from Gmail by itself (a sent request opens one, a client's reply with files moves its items) is the host's job:
// ingestOutgoing() and ingestIncoming() are the two calls, and they run only when CLIENT_REQUESTS.feed is on
// (config/client-requests.public.js). Until then the clients page is fed by hand: paste a request, mark what came.
const FlowClientRequestStore = (() => {
  const KEY = 'glanceClientRequests';
  const MAX_CLOSED = 200;
  const C = typeof FlowClientRequests !== 'undefined' ? FlowClientRequests : (typeof require !== 'undefined' ? require('../core/client-requests.js').FlowClientRequests : null);

  function chromeArea() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
    return {
      get: () => new Promise((r) => chrome.storage.local.get(KEY, (v) => r(v && v[KEY]))),
      set: (val) => new Promise((r) => chrome.storage.local.set({ [KEY]: val }, () => r()))
    };
  }
  // Outside the extension (a preview, a test without a stub) the ledger lives in memory for the page's lifetime.
  function memoryArea() { let v = null; return { get: async () => v, set: async (x) => { v = JSON.parse(JSON.stringify(x)); } }; }
  function create(storage) {
    const area = storage || chromeArea() || memoryArea();
    async function load() {
      const v = area ? await area.get() : null;
      return { requests: (v && v.requests) || [], templates: (v && v.templates) || [] };
    }
    async function save(state) {
      // Keep every open request; keep the most recent closed ones.
      const open = state.requests.filter((r) => r.status === 'open');
      const closed = state.requests.filter((r) => r.status !== 'open').sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0)).slice(0, MAX_CLOSED);
      const next = { requests: open.concat(closed), templates: state.templates || [] };
      if (area) await area.set(next);
      return next;
    }
    function upsert(state, req) {
      const i = state.requests.findIndex((r) => r.id === req.id);
      if (i >= 0) state.requests[i] = req; else state.requests.push(req);
      return state;
    }
    // A request the person wrote (pasted, or read from their sent mail by the host). Returns the request or null (not a request).
    async function addFromText(a) {
      const ask = C.classifyOutgoingRequest(a.text, { now: a.now });
      if (!ask) return null;
      const st = await load();
      const req = C.buildRequest({ threadId: a.threadId || null, messageId: a.messageId || null, channel: a.channel || 'gmail', client: a.client, ask, now: a.now });
      if (!a.threadId && !a.messageId) req.id = 'manual-' + (typeof a.now === 'number' ? a.now : Date.now()) + '-' + Math.random().toString(36).slice(2, 7);
      await save(upsert(st, req));
      return req;
    }
    // A message from a client: every open request with that client may move. Returns the list of changes.
    async function ingestIncoming(msg) {
      const st = await load();
      const from = msg && msg.from && msg.from.email ? String(msg.from.email).toLowerCase() : null;
      if (!from) return [];
      const changes = [];
      for (const r of st.requests) {
        if (r.status !== 'open' || r.client.email !== from) continue;
        const res = C.applyArrival(r, msg);
        if (res.changes.length) { upsert(st, res.request); changes.push({ requestId: r.id, changes: res.changes, unmatched: res.unmatched, closed: res.closed }); }
      }
      if (changes.length) await save(st);
      return changes;
    }
    async function ingestOutgoing(m) {
      return addFromText({ text: m.text, client: m.to, threadId: m.threadId, messageId: m.messageId, channel: m.channel, now: m.now });
    }
    async function decide(requestId, key, verdict, now) {
      const st = await load();
      const r = st.requests.find((x) => x.id === requestId);
      if (!r) return null;
      const next = C.decide(r, key, verdict, now);
      await save(upsert(st, next));
      return next;
    }
    async function markNudged(requestId, now) {
      const st = await load();
      const r = st.requests.find((x) => x.id === requestId);
      if (!r) return null;
      const next = C.recordNudge(r, now);
      await save(upsert(st, next));
      return next;
    }
    async function releaseRequest(requestId, now) {
      const st = await load();
      const r = st.requests.find((x) => x.id === requestId);
      if (!r) return null;
      let next = r;
      r.items.filter((i) => !C.isDone(i)).forEach((i) => { next = C.decide(next, i.key, 'release', now); });
      await save(upsert(st, next));
      return next;
    }
    async function addTemplate(t) {
      const st = await load();
      const i = st.templates.findIndex((x) => x.id === t.id);
      if (i >= 0) st.templates[i] = t; else st.templates.push(t);
      await save(st);
      return t;
    }
    async function removeTemplate(id) {
      const st = await load();
      st.templates = st.templates.filter((t) => t.id !== id);
      await save(st);
    }
    // Open today's requests from the recurring checklists. Returns the new requests (the page then offers each reminder).
    async function openDueTemplates(now) {
      const st = await load();
      const due = C.dueTemplates(st.templates, st.requests, now);
      const made = due.map((t) => C.instantiate(t, now));
      made.forEach((r) => upsert(st, r));
      if (made.length) await save(st);
      return made;
    }
    async function remove(requestId) {
      const st = await load();
      st.requests = st.requests.filter((r) => r.id !== requestId);
      await save(st);
    }
    return { KEY, load, save, addFromText, ingestIncoming, ingestOutgoing, decide, markNudged, releaseRequest, addTemplate, removeTemplate, openDueTemplates, remove };
  }
  return { create, KEY };
})();

if (typeof module !== 'undefined') module.exports = { FlowClientRequestStore };
