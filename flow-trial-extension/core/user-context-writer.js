// UserContext writer (D1 part 1): per-user profile — identity, relationships,
// writing style, business knowledge and decisions — built from Connect and
// from every action, undo and edit. Features and counts only; no mail bodies.
// Portable: no chrome.*, no DOM, no network. Host persists the profile.
const FlowUserContextWriter = (() => {
  const VERSION = 'user-context-v0';
  const SWITCH = 'USER_CONTEXT_WRITER';
  const DECAY_HALF_LIFE_DAYS = 30;

  function normId(userId) {
    const s = String(userId || '').trim();
    return s || 'local-user';
  }

  function empty(userId) {
    return {
      schemaVersion: VERSION,
      userId: normId(userId),
      trainingConsent: false,
      identity: { aliases: [], title: null, department: null, manager: null, groups: [], reports: [] },
      relationships: [],
      decisionHistory: [],
      workStyle: {
        hours: null,
        languages: [],
        preferredTools: { files: 'either', tasks: 'either' },
        savesFiles: 'unknown',
        answersGroupMailRate: null,
        writingStyleNote: null
      },
      preferences: [],
      knowledge: []
    };
  }

  function norm(profile) {
    const e = empty(profile && profile.userId);
    if (!profile || profile.schemaVersion !== VERSION) return e;
    const out = Object.assign({}, e, profile);
    out.identity = Object.assign({}, e.identity, profile.identity || {});
    out.workStyle = Object.assign({}, e.workStyle, profile.workStyle || {});
    out.relationships = Array.isArray(profile.relationships) ? profile.relationships.slice() : [];
    out.decisionHistory = Array.isArray(profile.decisionHistory) ? profile.decisionHistory.slice() : [];
    out.preferences = Array.isArray(profile.preferences) ? profile.preferences.slice() : [];
    out.knowledge = Array.isArray(profile.knowledge) ? profile.knowledge.slice() : [];
    out.trainingConsent = profile.trainingConsent === true;
    return out;
  }

  function decayWeight(atIso, nowIso) {
    const at = Date.parse(atIso || '');
    const now = Date.parse(nowIso || '') || Date.now();
    if (!Number.isFinite(at) || at > now) return 1;
    const days = (now - at) / (24 * 3600 * 1000);
    return Math.pow(0.5, days / DECAY_HALF_LIFE_DAYS);
  }

  function findDecision(rows, intentFamily, party) {
    const fam = String(intentFamily || '').trim();
    const key = String(party || '').trim().toLowerCase();
    return (rows || []).find((r) => r && r.intentFamily === fam && r.party === key) || null;
  }

  function bumpDecision(profile, intentFamily, party, field, at) {
    const p = norm(profile);
    const fam = String(intentFamily || 'unknown').trim();
    const key = String(party || 'unknown').trim().toLowerCase();
    let row = findDecision(p.decisionHistory, fam, key);
    if (!row) {
      row = { intentFamily: fam, party: key, approvedFetchedBack: 0, dismissed: 0, undo: 0, edited: 0, missedClose: 0, lastAt: null };
      p.decisionHistory.push(row);
    }
    row[field] = (Number(row[field]) || 0) + 1;
    row.lastAt = at || new Date().toISOString();
    return p;
  }

  function relKey(kind, key) {
    return String(kind || 'sender') + '\0' + String(key || '').trim().toLowerCase();
  }

  function findRel(profile, kind, key) {
    const id = relKey(kind, key);
    return (profile.relationships || []).find((r) => r && relKey(r.kind, r.key) === id) || null;
  }

  function touchRel(profile, kind, key, patch) {
    const p = norm(profile);
    const id = relKey(kind, key);
    let row = findRel(p, kind, key);
    if (!row) {
      row = { key: String(key || '').trim().toLowerCase(), kind: kind === 'group' ? 'group' : 'sender', name: null, replyCount: 0, seenCount: 0, replyRate: null, medianLatencyHours: null, answersGroupMail: null, covers: false };
      p.relationships.push(row);
    }
    Object.assign(row, patch || {});
    return p;
  }

  function fromConnect(profile, connect) {
    const c = connect || {};
    const p = norm(profile);
    const email = String(c.email || c.mail || '').trim().toLowerCase();
    const name = String(c.name || c.displayName || '').trim();
    if (name) {
      const aliases = p.identity.aliases || [];
      if (aliases.indexOf(name) === -1) aliases.push(name);
      p.identity.aliases = aliases;
    }
    if (c.title) p.identity.title = String(c.title).trim();
    if (c.department) p.identity.department = String(c.department).trim();
    if (c.manager && typeof c.manager === 'object') {
      p.identity.manager = { name: c.manager.name || null, email: c.manager.email || null };
    }
    if (email) {
      const tools = p.workStyle.preferredTools || {};
      if (c.preferDrive === true) tools.files = 'drive';
      if (c.preferOnedrive === true) tools.files = 'onedrive';
      p.workStyle.preferredTools = tools;
    }
    return p;
  }

  function fromStyleSummary(profile, summary, lang) {
    const p = norm(profile);
    if (!summary || typeof summary !== 'object') return p;
    const l = lang === 'he' ? 'he' : 'en';
    const parts = [];
    if (summary.greeting) parts.push('opens with ' + summary.greeting);
    if (summary.signoff) parts.push('closes with ' + summary.signoff);
    if (summary.length) parts.push(summary.length + ' messages');
    if (summary.exclaim) parts.push('uses exclamation marks');
    p.workStyle.writingStyleNote = parts.length ? parts.join('; ') : p.workStyle.writingStyleNote;
    const langs = p.workStyle.languages || [];
    if (langs.indexOf(l) === -1) langs.push(l);
    p.workStyle.languages = langs;
    return p;
  }

  function recordKnowledge(profile, note, source) {
    const p = norm(profile);
    const line = String(note || '').trim().slice(0, 200);
    if (!line) return p;
    const row = { at: new Date().toISOString(), note: line, source: String(source || 'user').slice(0, 40) };
    p.knowledge = (p.knowledge || []).concat([row]).slice(-40);
    return p;
  }

  // event: { type, at, intentFamily, partyKey, action, fetchedBack, surface, editedFields }
  function applyEvent(profile, event) {
    const ev = event || {};
    const type = String(ev.type || '').trim();
    const at = ev.at || new Date().toISOString();
    let p = norm(profile);
    const party = ev.partyKey || ev.party || 'unknown';
    const fam = ev.intentFamily || ev.action || 'unknown';

    if (type === 'shown') {
      p = touchRel(p, 'sender', party, { seenCount: (findRel(p, 'sender', party)?.seenCount || 0) + 1 });
      return p;
    }
    if (type === 'approved') {
      if (ev.fetchedBack === true) p = bumpDecision(p, fam, party, 'approvedFetchedBack', at);
      return p;
    }
    if (type === 'dismissed') return bumpDecision(p, fam, party, 'dismissed', at);
    if (type === 'undo') return bumpDecision(p, fam, party, 'undo', at);
    if (type === 'edited') return bumpDecision(p, fam, party, 'edited', at);
    if (type === 'manual-close-after-silence') return bumpDecision(p, fam, party, 'missedClose', at);
    return p;
  }

  function relevanceHint(profile) {
    const p = norm(profile);
    const rows = p.decisionHistory || [];
    let approved = 0;
    let dismissed = 0;
    const now = new Date().toISOString();
    for (const r of rows) {
      const w = decayWeight(r.lastAt, now);
      approved += (Number(r.approvedFetchedBack) || 0) * w;
      dismissed += (Number(r.dismissed) || 0) * w;
    }
    const relevantFloor = 2 - 1e-2;
    if (dismissed === 0 && approved >= relevantFloor) return { relevance: 'relevant', reason: 'history_closed' };
    if (dismissed >= 3 && approved === 0) return { relevance: 'not_relevant', reason: 'history_dismissed' };
    return { relevance: 'unknown', reason: 'cold_profile' };
  }

  return {
    VERSION,
    SWITCH,
    empty,
    norm,
    fromConnect,
    fromStyleSummary,
    recordKnowledge,
    applyEvent,
    relevanceHint,
    decayWeight
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowUserContextWriter };
else if (typeof globalThis !== 'undefined') globalThis.FlowUserContextWriter = FlowUserContextWriter;
