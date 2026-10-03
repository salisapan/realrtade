// One person, many apps. Portable: no chrome.*, no DOM, no network, no message text.
//
// The graph remembers WHO you have dealt with and how they appear in each app: names, email addresses, phone numbers and which apps
// they showed up in. That is all it keeps. It exists so that "Dana in an email" and "Dana on WhatsApp" can be the same person to the
// rest of the engine: one waiting-time model for her, and an answer from either app able to settle a loop opened in the other.
//
// The one rule that matters (docs/multi-platform.md): people are merged on HARD evidence only.
//   - the same email address or the same phone number is the same person, always;
//   - one observation that carries both (a contact card, a signature) joins an email and a phone;
//   - a shared full NAME is only a suggestion. It becomes a pending question ("Is the Dana Cole on WhatsApp the dana@acme.com
//     you email?") the person answers once, and a "no" is remembered. Two people called Dana Cole are never merged by guesswork.
//
// Local only, capped, and cleared by "Reset what Glance learned".
const FlowIdentity = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const ch = sibling(typeof FlowChannel !== 'undefined' ? FlowChannel : null, './channel.js', 'FlowChannel');

  const MAX_PEOPLE = 300;
  const MAX_PENDING = 5;
  const MAX_NAMES = 4;
  const MAX_DENIED = 200;

  function empty() { return { v: 1, n: 0, people: {}, index: {}, merged: {}, pending: [], denied: [] }; }
  function norm(g) {
    if (!g || g.v !== 1) return empty();
    return { v: 1, n: g.n || 0, people: Object.assign({}, g.people), index: Object.assign({}, g.index), merged: Object.assign({}, g.merged), pending: (g.pending || []).slice(), denied: (g.denied || []).slice() };
  }
  const clone = (g) => JSON.parse(JSON.stringify(norm(g)));
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  function rootOf(g, pid) { let p = pid; let guard = 0; while (g.merged[p] && guard++ < 50) p = g.merged[p]; return p; }

  function addUnique(list, v, max) { if (v && list.indexOf(v) < 0) { list.push(v); if (max && list.length > max) list.shift(); } }

  function trim(g) {
    const ids = Object.keys(g.people);
    if (ids.length <= MAX_PEOPLE) return;
    ids.sort((a, b) => (g.people[a].seenAt || 0) - (g.people[b].seenAt || 0));
    ids.slice(0, ids.length - MAX_PEOPLE).forEach((id) => {
      const p = g.people[id];
      (p.emails || []).forEach((e) => { if (g.index['email:' + e] === id) delete g.index['email:' + e]; });
      (p.phones || []).forEach((x) => { if (g.index['phone:' + x] === id) delete g.index['phone:' + x]; });
      delete g.people[id];
    });
    g.pending = g.pending.filter((l) => g.people[l.a] && g.people[l.b]);
  }

  function mergeInto(g, keep, drop) {
    if (keep === drop || !g.people[keep] || !g.people[drop]) return;
    const a = g.people[keep], b = g.people[drop];
    (b.names || []).forEach((n) => addUnique(a.names, n, MAX_NAMES));
    (b.emails || []).forEach((e) => { addUnique(a.emails, e); g.index['email:' + e] = keep; });
    (b.phones || []).forEach((x) => { addUnique(a.phones, x); g.index['phone:' + x] = keep; });
    Object.keys(b.channels || {}).forEach((c) => { a.channels[c] = (a.channels[c] || 0) + b.channels[c]; });
    a.seenAt = Math.max(a.seenAt || 0, b.seenAt || 0);
    delete g.people[drop];
    g.merged[drop] = keep;
    g.pending = g.pending.filter((l) => rootOf(g, l.a) !== rootOf(g, l.b) && g.people[l.a] && g.people[l.b]);
  }

  // One sighting of a person in an app -> { graph, pid, suggested: pending link or null }. `party` is core/channel.js party().
  function observe(graph, party, now) {
    const g = clone(graph);
    const p = ch.party(party);
    const k = ch.keys(p);
    const t = typeof now === 'number' ? now : Date.now();
    if (!k.hard.length && !k.soft) return { graph: g, pid: null, suggested: null };

    // Which people do the hard keys already point at?
    const hits = [];
    k.hard.forEach((key) => { const pid = g.index[key] ? rootOf(g, g.index[key]) : null; if (pid && g.people[pid] && hits.indexOf(pid) < 0) hits.push(pid); });

    let pid;
    let created = false;
    if (hits.length) {
      pid = hits[0];
      // One observation that carries keys of two people is hard evidence that they are one.
      for (let i = 1; i < hits.length; i++) mergeInto(g, pid, hits[i]);
    } else if (k.hard.length) {
      g.n += 1;
      pid = 'p' + g.n;
      g.people[pid] = { id: pid, names: [], emails: [], phones: [], channels: {}, seenAt: t };
      created = true;
    } else {
      // A name and nothing else (a chat with an unsaved contact name): find someone already known by that exact full name in
      // THIS channel, otherwise create a name-only person for the chat.
      const nameId = Object.keys(g.people).find((id) => (g.people[id].nameKeys || []).indexOf(k.soft) >= 0 && g.people[id].channels[p.channel] && !(g.people[id].emails || []).length && !(g.people[id].phones || []).length);
      if (nameId) pid = nameId;
      else { g.n += 1; pid = 'p' + g.n; g.people[pid] = { id: pid, names: [], emails: [], phones: [], channels: {}, seenAt: t }; created = true; }
    }

    const person = g.people[pid];
    person.nameKeys = person.nameKeys || [];
    if (p.name) addUnique(person.names, p.name, MAX_NAMES);
    if (k.soft) addUnique(person.nameKeys, k.soft, MAX_NAMES);
    if (p.email) { addUnique(person.emails, p.email); g.index['email:' + p.email] = pid; }
    if (p.phone) { addUnique(person.phones, p.phone); g.index['phone:' + p.phone] = pid; }
    person.channels[p.channel] = (person.channels[p.channel] || 0) + 1;
    person.seenAt = t;

    // A full name already known as someone else, in another app: suggest, never merge.
    let suggested = null;
    if (k.soft && created) {
      const others = Object.keys(g.people).filter((id) => id !== pid && (g.people[id].nameKeys || []).indexOf(k.soft) >= 0 && !g.people[id].channels[p.channel]);
      if (others.length === 1 && g.denied.indexOf(pairKey(pid, others[0])) < 0 && !g.pending.some((l) => pairKey(l.a, l.b) === pairKey(pid, others[0])) && g.pending.length < MAX_PENDING) {
        suggested = { a: others[0], b: pid, name: p.name, channels: [Object.keys(g.people[others[0]].channels)[0], p.channel] };
        g.pending.push(suggested);
      }
    }
    trim(g);
    return { graph: g, pid, suggested };
  }

  // Hard evidence only: the person these keys point at, or null.
  function resolve(graph, party) {
    const g = norm(graph);
    const k = ch.keys(party);
    for (const key of k.hard) { const pid = g.index[key]; if (pid) { const r = rootOf(g, pid); if (g.people[r]) return r; } }
    return null;
  }

  // The answer to a pending "same person?": yes merges, no is remembered for good.
  function answer(graph, a, b, same) {
    const g = clone(graph);
    const ra = rootOf(g, a), rb = rootOf(g, b);
    g.pending = g.pending.filter((l) => pairKey(rootOf(g, l.a), rootOf(g, l.b)) !== pairKey(ra, rb));
    if (same) mergeInto(g, ra, rb);
    else { const key = pairKey(ra, rb); if (g.denied.indexOf(key) < 0) { g.denied.push(key); if (g.denied.length > MAX_DENIED) g.denied.shift(); } }
    return g;
  }

  function personOf(graph, pid) { const g = norm(graph); const r = rootOf(g, pid); return g.people[r] || null; }

  // Every address and number of the person these keys belong to (always includes the party's own).
  function aliasesOf(graph, party) {
    const p = ch.party(party);
    const pid = resolve(graph, p);
    const person = pid ? personOf(graph, pid) : null;
    const emails = new Set(person ? person.emails : []);
    const phones = new Set(person ? person.phones : []);
    if (p.email) emails.add(p.email);
    if (p.phone) phones.add(p.phone);
    return { pid, emails: Array.from(emails), phones: Array.from(phones) };
  }

  // Do two parties (a watch's counterpart and the sender of a message) belong to the same person?
  function same(graph, a, b) {
    const ka = ch.keys(a).hard, kb = ch.keys(b).hard;
    if (ka.some((k) => kb.indexOf(k) >= 0)) return true;
    const pa = resolve(graph, a), pb = resolve(graph, b);
    return Boolean(pa && pb && pa === pb);
  }

  function pendingLinks(graph) { return norm(graph).pending.map((l) => Object.assign({}, l)); }

  return { MAX_PEOPLE, MAX_PENDING, empty, observe, resolve, answer, personOf, aliasesOf, same, pendingLinks };
})();

if (typeof module !== 'undefined') module.exports = { FlowIdentity };
