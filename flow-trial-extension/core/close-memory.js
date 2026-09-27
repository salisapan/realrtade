// Personal close memory. After a Trusted Do It fully writes — one of the
// three personal closes from intent.js (dated commitment, explicit
// follow-up or send ask, confirmed amount), every attempted step ok —
// Glance keeps a compact local record of that matter. The next time a
// message clearly continues the same matter, Glance stays quiet instead
// of offering another Do It.
//
// Silence, not a sharper chip. A second proposal on a matter that already
// closed is a prompt the user did not ask for, and inventing a "next
// step" from the earlier write would be a personal CRM. Execution Memory
// (execution-memory.js) already learns which process steps this account
// keeps. This module is the other axis: this particular matter, not this
// kind of process. When the match is not clear, recall returns
// { action: 'none' } and the chip decides exactly as it would with an
// empty memory.
//
// A match is clear in exactly two cases:
//   1. Both sides have a thread id and they are equal, and the personal
//      close type is the same. A later message in that thread of a
//      different close type still gets a chip.
//   2. Neither side has a thread id, both subjects normalize to the same
//      specific subject (reply/forward prefixes stripped, at least 12
//      characters), and the close type is the same.
// A subject match is not used when the thread ids disagree, or when only
// one side has a thread id. A short subject ("Invoice", "Hi") is never
// specific enough. The snippet hash is stored so the record stays a
// fingerprint of what closed, and is not a match key — the same short
// boilerplate shows up on unrelated matters.
//
// What is stored, newest first, capped at MAX_CLOSES: close type, thread
// id, subject hash, snippet hash, write targets (tasks / draft / notion),
// message id, timestamp. Never the subject or the body. Calendar is not
// a target here; a meeting is not one of the three personal closes.
// Nothing in this file is sent anywhere.
//
// Storage is an injected adapter, same seam as execution-memory.js, and
// a different key (STORAGE_KEY). Glance wires chrome.storage.local from
// src/chrome-storage-adapter.js. This file never references chrome.*.
const FlowCloseMemory = (() => {
  const STORAGE_KEY = 'glancePersonalCloseMemory';
  const MAX_CLOSES = 40;
  const MIN_SPECIFIC_SUBJECT = 12;
  const PERSONAL_CLOSE_TYPES = ['dated-commitment', 'confirmed-amount', 'follow-up-ask'];
  const TRUSTED = new Set(PERSONAL_CLOSE_TYPES);

  // Connector kinds the live chip actually writes, plus the compact names
  // a caller might already have normalized. Calendar is intentionally
  // absent — see the header.
  const TARGET_BY_KIND = {
    googleTask: 'tasks',
    gmailDraft: 'draft',
    notion: 'notion',
    tasks: 'tasks',
    draft: 'draft'
  };

  function inMemoryAdapter() {
    const store = new Map();
    return {
      async get(key) { return store.get(key); },
      async set(key, value) { store.set(key, value); }
    };
  }

  let adapter = inMemoryAdapter();

  // Same read-then-write race execution-memory.js documents. One queue so
  // two closes landing together cannot drop a record.
  let queue = Promise.resolve();

  function setStorageAdapter(next) {
    adapter = next;
    queue = Promise.resolve();
  }
  function serialize(fn) {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  }

  async function getLog() {
    try {
      const log = await adapter.get(STORAGE_KEY);
      if (!Array.isArray(log)) return [];
      return log.filter((row) => row && typeof row === 'object');
    } catch (e) {
      return [];
    }
  }

  function cleanId(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function normalizeSubject(subject) {
    let s = String(subject || '').replace(/\s+/g, ' ').trim();
    let prev;
    do {
      prev = s;
      s = s.replace(/^(?:re|fw|fwd|השב|הועבר)\s*:\s*/i, '').trim();
    } while (s !== prev);
    return s.toLowerCase();
  }

  function normalizeSnippet(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
  }

  // A short fingerprint, not a secret. Local only. Collisions are
  // acceptable because a subject hash is never used when a thread id can
  // contradict it, and the log itself is capped.
  function hashText(value) {
    let h = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function subjectHashFor(subject) {
    const normalized = normalizeSubject(subject);
    if (normalized.length < MIN_SPECIFIC_SUBJECT) return null;
    return hashText(normalized);
  }

  function snippetHashFor(text) {
    const normalized = normalizeSnippet(text);
    if (!normalized) return null;
    return hashText(normalized);
  }

  function normalizeTargets(targets) {
    const out = [];
    const seen = new Set();
    for (const kind of targets || []) {
      const name = TARGET_BY_KIND[kind];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  }

  function validIso(value) {
    if (typeof value !== 'string' || !value) return null;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    return new Date(parsed).toISOString();
  }

  // Every attempted step succeeded. An empty list, a failure, or a
  // dependency skip is not a close worth remembering.
  function fullWriteOf(results) {
    if (!Array.isArray(results) || results.length === 0) return false;
    return results.every((row) => row && row.response && row.response.ok === true && !row.response.skipped);
  }

  function buildRecord(input, messageId) {
    return {
      closeType: input.personalClose,
      threadId: cleanId(input.threadId),
      subjectHash: subjectHashFor(input.subject),
      snippetHash: snippetHashFor(input.snippet),
      targets: normalizeTargets(input.targets),
      messageId,
      timestamp: validIso(input.timestamp) || new Date().toISOString()
    };
  }

  // Returns the stored record, or null when this close does not qualify.
  // A second record for the same message replaces the first so a retry
  // cannot fill the cap with duplicates.
  function recordClose(input) {
    input = input || {};
    if (input.fullWrite !== true) return Promise.resolve(null);
    if (!TRUSTED.has(input.personalClose)) return Promise.resolve(null);
    const messageId = cleanId(input.messageId);
    if (!messageId) return Promise.resolve(null);
    const record = buildRecord(input, messageId);
    return serialize(async () => {
      try {
        const log = await getLog();
        const without = log.filter((row) => row.messageId !== messageId);
        const next = [record, ...without].slice(0, MAX_CLOSES);
        await adapter.set(STORAGE_KEY, next);
        return record;
      } catch (e) {
        return null;
      }
    });
  }

  // { action: 'silence', via: 'thread'|'subject' } or { action: 'none' }.
  function recall(query) {
    query = query || {};
    if (!TRUSTED.has(query.personalClose)) return Promise.resolve({ action: 'none' });
    const threadId = cleanId(query.threadId);
    const subjectHash = subjectHashFor(query.subject);
    return serialize(async () => {
      try {
        const log = await getLog();
        if (threadId) {
          for (const row of log) {
            if (row.closeType === query.personalClose && row.threadId && row.threadId === threadId) {
              return { action: 'silence', via: 'thread' };
            }
          }
          return { action: 'none' };
        }
        if (!subjectHash) return { action: 'none' };
        for (const row of log) {
          if (row.threadId) continue;
          if (row.closeType === query.personalClose && row.subjectHash && row.subjectHash === subjectHash) {
            return { action: 'silence', via: 'subject' };
          }
        }
        return { action: 'none' };
      } catch (e) {
        return { action: 'none' };
      }
    });
  }

  function forgetMessage(messageId) {
    const id = cleanId(messageId);
    if (!id) return Promise.resolve(false);
    return serialize(async () => {
      try {
        const log = await getLog();
        const next = log.filter((row) => row.messageId !== id);
        if (next.length === log.length) return false;
        await adapter.set(STORAGE_KEY, next);
        return true;
      } catch (e) {
        return false;
      }
    });
  }

  function clear() {
    return serialize(async () => {
      try {
        await adapter.set(STORAGE_KEY, []);
      } catch (e) {}
    });
  }

  function getAll() {
    return serialize(async () => (await getLog()).slice());
  }

  return {
    STORAGE_KEY,
    MAX_CLOSES,
    PERSONAL_CLOSE_TYPES,
    setStorageAdapter,
    fullWriteOf,
    recordClose,
    recall,
    forgetMessage,
    clear,
    getAll
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowCloseMemory };
