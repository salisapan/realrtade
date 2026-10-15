// Closed chat drafts. The key and the row hash are hashes. The row stores
// only that hash, a state (open or closed), and a timestamp. No message text
// and no draft text. At most 500 rows, dropped after 30 days. Closed rows are
// kept for 14 days; open rows are evicted first, then the least recently used.
const FlowLaneDraftStore = (() => {
  const MAX = 500;
  const TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const CLOSED_KEEP_MS = 14 * 24 * 60 * 60 * 1000;

  function hashKey(threadId, messageId, text) {
    const raw = String(threadId) + '\n' + String(messageId) + '\n' + String(text);
    let h = 2166136261;
    let g = 5381;
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i);
      h ^= code;
      h = Math.imul(h, 16777619);
      g = Math.imul(g, 33) ^ code;
    }
    return (h >>> 0).toString(16) + (g >>> 0).toString(16);
  }

  function rowOf(row) {
    if (!row || typeof row.ts !== 'number' || !Number.isFinite(row.ts)) return null;
    if (row.state !== 'open' && row.state !== 'closed') return null;
    if (typeof row.hash !== 'string' || !/^[0-9a-f]+$/.test(row.hash)) return null;
    return { hash: row.hash, state: row.state, ts: row.ts };
  }

  function prune(all, now) {
    const next = {};
    const keys = Object.keys(all || {});
    for (let i = 0; i < keys.length; i++) {
      const row = rowOf(all[keys[i]]);
      if (!row || now - row.ts > TTL_MS) continue;
      next[keys[i]] = row;
    }
    function size() { return Object.keys(next).length; }
    function dropOldest(list) {
      list.sort((a, b) => next[a].ts - next[b].ts);
      for (let i = 0; i < list.length && size() > MAX; i++) delete next[list[i]];
    }
    if (size() > MAX) dropOldest(Object.keys(next).filter((key) => next[key].state !== 'closed'));
    if (size() > MAX) {
      dropOldest(Object.keys(next).filter((key) => next[key].state === 'closed' && now - next[key].ts >= CLOSED_KEEP_MS));
    }
    return next;
  }

  function put(all, key, row, now) {
    const next = prune(all, now);
    const clean = rowOf({
      hash: row && row.hash,
      state: row && row.state,
      ts: now
    });
    if (clean) next[key] = clean;
    return prune(next, now);
  }

  function get(all, key, now) {
    const next = prune(all, now);
    if (!next[key]) return { all: next, row: null };
    next[key] = { hash: next[key].hash, state: next[key].state, ts: now };
    return { all: next, row: next[key] };
  }

  return { hashKey, put, get, prune, MAX, TTL_MS, CLOSED_KEEP_MS };
})();

if (typeof module !== 'undefined') module.exports = { FlowLaneDraftStore };
else if (typeof globalThis !== 'undefined') globalThis.FlowLaneDraftStore = FlowLaneDraftStore;
