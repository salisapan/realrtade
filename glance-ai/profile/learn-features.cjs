'use strict';
// Numeric features for the relevance scorer. No mail body is stored.
// This file does not decide relevance and does not change the hand rule.
const { decay } = require('./featurize.cjs');

const TOPIC = [
  { name: 'finance', role: /finance|cfo|כספ|חשב/i, text: /invoice|חשבונית|vat|budget|תקציב|payment|תשלום|payout|retainer|ריטיינר|₪|\$\s?\d/i },
  { name: 'hr', role: /human resources|\bhr\b|משאבי אנוש/i, text: /onboarding|new-hire|new hire|קליט|עובד חדש/i },
  { name: 'legal', role: /legal|יועמ|משפט/i, text: /contract|agreement|lease|הסכם|חוזה|שכירות/i },
  { name: 'ops', role: /operations|\bops\b|תפעול/i, text: /onboarding|facilities|ציוד/i }
];

function nowMs() {
  const t = Date.parse(process.env.GLANCE_NOW || '2026-10-08T12:00:00.000Z');
  return Number.isNaN(t) ? Date.parse('2026-10-08T12:00:00.000Z') : t;
}

function ownText(body) {
  return String(body || '').replace(/\r\n?/g, '\n').split(/\n--\n/)[0];
}

function namesOf(profile) {
  const id = (profile && profile.identity) || {};
  return (id.aliases || []).map((s) => String(s).trim()).filter(Boolean);
}

function eqName(name, candidates) {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  return (candidates || []).some((c) => {
    const t = String(c || '').toLowerCase().trim();
    return t && (t === n || t.split(/\s+/)[0] === n);
  });
}

function fileBlob(email) {
  return (email && email.attachments || []).map((a) => (a && a.name) || '').join('\n');
}

function roleBlob(profile) {
  const id = (profile && profile.identity) || {};
  return [id.title, id.department].filter(Boolean).join(' ');
}

function laterName(body) {
  const lines = ownText(body).split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  const first = lines[0];
  const group = /^(?:hi|hey|hello|dear)\s+(?:all|team|everyone|folks)|^(?:היי|שלום|אהלן)\s+(?:לכולם|לכולן|חברים|צוות)/i.test(first);
  if (!group) return '';
  for (const line of lines.slice(1, 4)) {
    const m = line.match(/^([A-Za-z][A-Za-z'’-]{1,}|[\u05D0-\u05EA][\u05D0-\u05EA'׳]{1,})\s*[,:–—-]/);
    if (m) return m[1];
  }
  return '';
}

function hasSignal(profile) {
  const p = profile || {};
  const id = p.identity || {};
  const ws = p.workStyle || {};
  if ((id.aliases || []).length) return true;
  if (id.title || id.department) return true;
  if (id.manager && (id.manager.email || id.manager.name)) return true;
  if ((id.groups || []).length || (id.reports || []).length) return true;
  if ((p.relationships || []).length || (p.decisionHistory || []).length || (p.preferences || []).length) return true;
  if (ws.savesFiles === 'always' || ws.savesFiles === 'never') return true;
  if (typeof ws.answersGroupMailRate === 'number') return true;
  return false;
}

const FEATURE_NAMES = [
  'approver_on_thread', 'named_other_uncovered', 'covers_named_other', 'vocative_own',
  'from_manager', 'group_rate', 'cc_only', 'sender_reply_rate', 'sender_seen',
  'history_approved', 'history_against', 'history_stale', 'other_vendor_only',
  'saves_always', 'saves_never', 'fyi_shape', 'save_span', 'ask_span', 'amount_span',
  'role_topic_body', 'role_topic_file', 'role_mismatch_amount',
  'pref_offer', 'pref_silent', 'pref_overridden'
];

function vector(email, profile, opt) {
  const p = profile || {};
  const id = p.identity || {};
  const ws = p.workStyle || {};
  const body = ownText(email && email.body);
  const blob = body + '\n' + String((email && email.subject) || '');
  const files = fileBlob(email);
  const from = String((email && email.from && email.from.email) || '').toLowerCase();
  const listed = [].concat(email && email.to, email && email.cc).filter(Boolean).map((s) => String(s).toLowerCase());
  const own = namesOf(p);
  const now = (opt && opt.now) || nowMs();
  let approver = 0;
  for (const g of id.groups || []) {
    if (!g || (g.role !== 'approver' && g.role !== 'owner')) continue;
    if (listed.indexOf(String(g.address || '').toLowerCase()) >= 0) approver = 1;
  }
  const other = laterName(body);
  const covered = !!other && ((id.reports || []).some((r) => eqName(other, [r && r.name, r && r.email]))
    || (p.relationships || []).some((r) => r && r.covers && eqName(other, [r.key, r.name])));
  const namedOther = other && !eqName(other, own) && !covered ? 1 : 0;
  const greetOwn = own.some((n) => new RegExp('(?:^|\\n)\\s*(?:hi|hey|hello|היי|שלום)\\s+' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(body));
  const managerEmail = id.manager && String(id.manager.email || '').toLowerCase();
  const fromManager = managerEmail && managerEmail === from ? 1 : 0;
  const groupRate = typeof ws.answersGroupMailRate === 'number' ? ws.answersGroupMailRate : -1;
  const ownEmail = String((email && email.ownEmail) || '').toLowerCase();
  const to = (email && email.to || []).map((s) => String(s).toLowerCase());
  const cc = (email && email.cc || []).map((s) => String(s).toLowerCase());
  const ccOnly = ownEmail && cc.indexOf(ownEmail) >= 0 && to.indexOf(ownEmail) < 0 ? 1 : 0;
  const rel = (p.relationships || []).find((r) => r && String(r.key || '').toLowerCase() === from);
  const senderRate = rel && typeof rel.replyRate === 'number' ? rel.replyRate : -1;
  const senderSeen = rel ? Number(rel.seenCount || 0) : 0;
  let approved = 0; let against = 0; let stale = 0;
  for (const h of p.decisionHistory || []) {
    if (!h || String(h.party || '').toLowerCase() !== from) continue;
    const a = decay(h.approvedFetchedBack, h.lastAt, now);
    const d = decay(h.dismissed, h.lastAt, now) + decay(h.undo, h.lastAt, now);
    approved += a; against += d;
    if ((h.approvedFetchedBack || 0) + (h.dismissed || 0) > 0 && a < 1 && d < 1) stale = 1;
  }
  const otherVendor = (p.decisionHistory || []).some((h) => h && String(h.party || '').toLowerCase() !== from && (h.approvedFetchedBack || 0) >= 3);
  const fyi = /no action required|fyi only|for your information only|nothing is required from you|לא נדרשת פעולה|לידיעה בלבד|לתיעוד בלבד|אין צורך בפעולה/i.test(body) ? 1 : 0;
  const saveSpan = /\b(?:save|file|archive|put)\b|שמור|תשמור|לשמור|תתייק|עותק/i.test(body) && !/\bdo not save\b|אל תשמור|אל תשמרי/i.test(body) ? 1 : 0;
  const askSpan = /\b(?:please|can you|could you)\b|\?|נא |בבקשה|אפשר |תוכל|תוכלי|תשלח|תשלחו|תאשר/i.test(body) ? 1 : 0;
  const amountSpan = /\$\s?\d|₪|שקל|אישרנו|we approved/i.test(blob) ? 1 : 0;
  const roles = roleBlob(p);
  let roleBody = 0; let roleFile = 0; let mismatch = 0;
  let anyRole = false;
  for (const row of TOPIC) {
    if (!row.role.test(roles)) continue;
    anyRole = true;
    if (row.text.test(blob)) roleBody = 1;
    if (row.text.test(files)) roleFile = 1;
  }
  if (anyRole && amountSpan && !roleBody && !roleFile) mismatch = 1;
  const prefs = {};
  for (const item of p.preferences || []) if (item && item.key) prefs[item.key] = item.value;
  const prefOffer = ['group', 'cc', 'fyi', 'save', 'vendor'].some((k) => prefs[k] === 'offer') ? 1 : 0;
  const prefSilent = ['group', 'cc', 'fyi', 'save', 'vendor'].some((k) => prefs[k] === 'silent') ? 1 : 0;
  const overridden = prefOffer && against > approved ? 1 : 0;
  const values = {
    approver_on_thread: approver,
    named_other_uncovered: namedOther,
    covers_named_other: covered ? 1 : 0,
    vocative_own: greetOwn ? 1 : 0,
    from_manager: fromManager,
    group_rate: groupRate,
    cc_only: ccOnly,
    sender_reply_rate: senderRate,
    sender_seen: senderSeen,
    history_approved: +approved.toFixed(4),
    history_against: +against.toFixed(4),
    history_stale: stale,
    other_vendor_only: otherVendor && approved < 1 ? 1 : 0,
    saves_always: ws.savesFiles === 'always' ? 1 : 0,
    saves_never: ws.savesFiles === 'never' ? 1 : 0,
    fyi_shape: fyi,
    save_span: saveSpan,
    ask_span: askSpan,
    amount_span: amountSpan,
    role_topic_body: roleBody,
    role_topic_file: roleFile,
    role_mismatch_amount: mismatch,
    pref_offer: prefOffer,
    pref_silent: prefSilent,
    pref_overridden: overridden
  };
  return FEATURE_NAMES.map((n) => values[n]);
}

module.exports = { FEATURE_NAMES, vector, hasSignal, nowMs };
