// What a conversation partner and a message look like, whatever app they were in. Portable: no chrome.*, no DOM, no network.
//
// Glance started in Gmail, but a loop is not an email: it is something someone owes you (or you owe them) that stays open until
// reality closes it, and reality closes loops in other places too (a reply on WhatsApp, a payment, a calendar entry). This file is the
// shared vocabulary every surface speaks so the rest of the engine (core/follow-up.js, core/story.js, core/person-model.js) never has
// to know which app a message came from:
//
//   party      { channel, name, email, phone }   the other person, as that app shows them
//   utterance  { channel, thread, id, ts, direction, from, text }   one message, normalised
//
// Identity is built from KEYS. A hard key (an email address, a phone number) is the same person wherever it appears. A name is only a hint
// (core/identity-graph.js never merges two people on a name alone).
const FlowChannel = (() => {
  const CHANNELS = {
    gmail: { label: 'Gmail', kind: 'mail', canDraft: true },
    outlook: { label: 'Outlook', kind: 'mail', canDraft: false },
    whatsapp: { label: 'WhatsApp', kind: 'chat', canDraft: false },
    web: { label: 'a web page', kind: 'capture', canDraft: false }
  };
  const DEFAULT_CC = '972';   // a number written with a leading 0 is read as an Israeli number unless told otherwise

  function known(channel) { return Object.prototype.hasOwnProperty.call(CHANNELS, channel) ? channel : 'web'; }
  function label(channel) { return CHANNELS[known(channel)].label; }
  function canDraft(channel) { return CHANNELS[known(channel)].canDraft; }

  // Digits only, no plus sign, country code first. Anything that cannot be a phone number is null.
  function normalizePhone(raw, cc) {
    let d = String(raw == null ? '' : raw).replace(/[^\d+]/g, '');
    if (!d) return null;
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = (cc || DEFAULT_CC) + d.slice(1);
    d = d.replace(/\D/g, '');
    return d.length >= 9 && d.length <= 15 ? d : null;
  }

  function normalizeEmail(raw) {
    const e = String(raw == null ? '' : raw).trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
  }

  function normalizeName(raw) {
    return String(raw == null ? '' : raw).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9֐-׿\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // Only a full name (two words of two letters or more) is worth comparing: "dana" is half the planet.
  function nameKey(raw) {
    const n = normalizeName(raw);
    const t = n.split(' ').filter(Boolean);
    return t.length >= 2 && t.every((x) => x.length >= 2) ? n : null;
  }

  function party(o) {
    const p = o || {};
    return {
      channel: known(p.channel),
      name: p.name ? String(p.name).replace(/\s+/g, ' ').trim().slice(0, 80) || null : null,
      email: normalizeEmail(p.email),
      phone: normalizePhone(p.phone)
    };
  }

  // { hard: ['email:a@b.c', 'phone:9725…'], soft: 'name:dana cole' | null }
  function keys(p) {
    const q = party(p);
    const hard = [];
    if (q.email) hard.push('email:' + q.email);
    if (q.phone) hard.push('phone:' + q.phone);
    const nk = nameKey(q.name);
    return { hard, soft: nk ? 'name:' + nk : null };
  }

  function utterance(raw) {
    const r = raw || {};
    return {
      channel: known(r.channel),
      thread: r.thread == null ? null : String(r.thread).slice(0, 200),
      id: r.id == null ? null : String(r.id).slice(0, 200),
      ts: Number.isFinite(r.ts) ? r.ts : null,
      direction: r.direction === 'out' ? 'out' : 'in',
      from: party(Object.assign({ channel: r.channel }, r.from || {})),
      text: String(r.text == null ? '' : r.text).slice(0, 6000)
    };
  }

  return { CHANNELS, known, label, canDraft, normalizePhone, normalizeEmail, normalizeName, nameKey, party, keys, utterance };
})();

if (typeof module !== 'undefined') module.exports = { FlowChannel };
