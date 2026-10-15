// Closed chat drafts. The key is a hash of the thread, the message id, and the
// text. The message text is not stored. At most 500 rows, dropped after 30 days,
// oldest first.
const FlowLaneDraftStore = (() => {
  const MAX = 500;
  const TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
    if (!row || typeof row.at !== 'number') return null;
    return {
      draft: typeof row.draft === 'string' ? row.draft : '',
      closed: row.closed === true,
      at: row.at
    };
  }

  function prune(all, now) {
    const next = {};
    const keys = Object.keys(all || {});
    for (let i = 0; i < keys.length; i++) {
      const row = rowOf(all[keys[i]]);
      if (!row || now - row.at > TTL_MS) continue;
      next[keys[i]] = row;
    }
    const live = Object.keys(next);
    if (live.length > MAX) {
      live.sort((a, b) => next[a].at - next[b].at);
      for (let i = 0; i < live.length - MAX; i++) delete next[live[i]];
    }
    return next;
  }

  function put(all, key, row, now) {
    const next = prune(all, now);
    next[key] = {
      draft: row && typeof row.draft === 'string' ? row.draft : '',
      closed: !!(row && row.closed),
      at: now
    };
    return prune(next, now);
  }

  function get(all, key, now) {
    const next = prune(all, now);
    if (!next[key]) return { all: next, row: null };
    next[key] = { draft: next[key].draft, closed: next[key].closed, at: now };
    return { all: next, row: next[key] };
  }

  return { hashKey, put, get, prune, MAX, TTL_MS };
})();

if (typeof module !== 'undefined') module.exports = { FlowLaneDraftStore };
else if (typeof globalThis !== 'undefined') globalThis.FlowLaneDraftStore = FlowLaneDraftStore;
