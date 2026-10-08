'use strict';
// Profile + email → features and counts. Never copies a mail body or subject into the feature object.
const { addresseeOf, recipientRole } = require('../model/runtime/addressee.cjs');
const { RX, negatedOnly } = require('../model/runtime/product-rules.cjs');
const { OWN } = require('../model/teacher/engine.cjs');

const HALF_LIFE_DAYS = 30;
const TOPIC_RX = {
  onboarding: /onboarding|new hire|קליט|עובד חדש/i,
  contract: /contract|agreement|חוזה|הסכם/i,
  finance: /invoice|חשבונית|\bpo\b|budget|תקציב|הזמנה|payment|תשלום|₪|\$\s?\d/i,
  board: /board memo|דירקטוריון|תזכיר/i
};
const ROLE_RX = [
  { name: 'finance', role: /finance|cfo|כספ|חשב/i, topic: 'finance' },
  { name: 'hr', role: /human resources|\bhr\b|משאבי אנוש/i, topic: 'onboarding' },
  { name: 'legal', role: /legal|יועמ|משפט/i, topic: 'contract' },
  { name: 'ops', role: /operations|\bops\b|תפעול/i, topic: 'onboarding' }
];
const CAL = /(?:\b(?:call|meeting|schedule|calendar|zoom|meet)\b)|(?:שיחה|פגישה|ישיבה|זום|ביומן|לקבוע)/;
const WHEN = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|eod)\b|\bat\s+\d{1,2}|\d{1,2}:\d{2}|מחר|היום|בשעה|ביום|סוף היום/i;
const COMMIT = /\b(?:you agreed|you will|you promised|as promised)\b|התחייבת|סיכמנו שאת/;
const FILE_PURPOSE = /for your (?:files|records)|לתיעוד|לידיעתך|מצורף|\battached\b/i;
const MONEY = /₪\s?\d|\$\s?\d|\b\d[\d,]*\s*(?:₪|שקל|usd)\b/i;
const FAMILY = { save: 'file_save', ask: 'follow-up-ask', calendar: 'calendar', commitment: 'commitment', amount: 'confirmed-amount' };

function nowMs() {
  const raw = process.env.GLANCE_NOW || '2026-10-08T12:00:00.000Z';
  const t = Date.parse(raw);
  return Number.isNaN(t) ? Date.parse('2026-10-08T12:00:00.000Z') : t;
}

function decay(count, lastAt, now) {
  const n = Number(count || 0);
  if (!n) return 0;
  const t = lastAt ? Date.parse(lastAt) : NaN;
  if (Number.isNaN(t)) return n;
  const ageDays = Math.max(0, (now - t) / 86400000);
  return n * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function ownText(body) {
  return String(body || '').replace(/\r\n?/g, '\n').split(/\n--\n/)[0];
}

function aliasesOf(profile) {
  const id = (profile && profile.identity) || {};
  return (id.aliases || []).map((s) => String(s).trim()).filter(Boolean);
}

function topicHits(text, key) {
  return !!(TOPIC_RX[key] && TOPIC_RX[key].test(text));
}

function vocativeName(text, ownNames) {
  const kind = addresseeOf(text, ownNames);
  if (kind !== 'other' && kind !== 'own') return { kind, name: '' };
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2);
  const greetEn = /^(?:hi|hey|hello|dear|good\s+(?:morning|afternoon|evening)|morning|hiya|yo)\b[\s,!]*/i;
  const greetHe = /^(?:היי|הי|שלום\s+רב|שלום|בוקר\s+טוב|ערב\s+טוב|צהריים\s+טובים|אהלן|הלו)(?=[\s,!]|$)/;
  for (const raw of lines) {
    let line = raw.replace(greetEn, '').replace(greetHe, '').replace(/^[\s,!]+/, '');
    const m = line.match(/^([A-Za-z][A-Za-z'’-]*|[\u05D0-\u05EA][\u05D0-\u05EA'׳]{1,})/);
    if (m) return { kind, name: m[1] };
  }
  return { kind, name: '' };
}

function nameEq(name, candidates) {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  return (candidates || []).some((c) => {
    const t = String(c || '').toLowerCase().trim();
    return t && (t === n || t.split(/\s+/)[0] === n);
  });
}

function spanOf(text, email, roleTopic) {
  const own = ownText(text);
  const n = Number(email.attachmentCount || 0);
  const noReply = RX.NO_ACTION_HE.test(own) || RX.NO_ACTION_EN.test(own);
  const saveVerb = RX.SAVE_VERB.test(own) && !RX.NEG_SAVE.test(own);
  const filePurpose = n === 1 && FILE_PURPOSE.test(own) && !RX.NEG_SAVE.test(own);
  if (noReply) return (saveVerb || filePurpose) ? 'save' : null;
  if (saveVerb) return 'save';
  if (CAL.test(own) && WHEN.test(own)) return 'calendar';
  if (COMMIT.test(own)) return 'commitment';
  if (RX.ASK_CUE.test(own)) return 'ask';
  if (filePurpose) return 'save';
  if (roleTopic === 'finance' && MONEY.test(own)) return 'amount';
  return null;
}

function historyFor(profile, party, family, now) {
  const rows = (profile.decisionHistory || []).filter((h) => {
    if (!h) return false;
    if (family && h.intentFamily !== family) return false;
    return String(h.party || '').toLowerCase() === String(party || '').toLowerCase();
  });
  const sum = (k) => rows.reduce((s, h) => s + decay(h[k], h.lastAt, now), 0);
  return {
    approved: sum('approvedFetchedBack'),
    dismissed: sum('dismissed'),
    undo: sum('undo'),
    edited: sum('edited'),
    missed: sum('missedClose')
  };
}

function featurize(email, profile, opt) {
  const p = profile || {};
  const id = p.identity || {};
  const ws = p.workStyle || {};
  const text = ownText(email && email.body);
  const blob = text + '\n' + String((email && email.subject) || '');
  const ownNames = aliasesOf(p);
  const vocInfo = vocativeName(text, ownNames);
  const surface = (email && email.surface) === 'outlook' ? 'outlook' : 'gmail';
  const ownEmail = (email && email.ownEmail) || OWN[surface];
  const role = recipientRole(email || {}, ownEmail);
  const fromEmail = String((email && email.from && email.from.email) || '').toLowerCase();
  const now = (opt && opt.now) || nowMs();

  let approverKey = '';
  for (const g of id.groups || []) {
    if (!g || (g.role !== 'approver' && g.role !== 'owner')) continue;
    const addr = String(g.address || '').toLowerCase();
    const listed = [] .concat(email && email.to, email && email.cc).filter(Boolean).map((s) => String(s).toLowerCase());
    const topic = (g.topics || []).find((t) => topicHits(blob, t));
    if ((addr && listed.indexOf(addr) >= 0) || topic) approverKey = addr || topic;
  }

  let roleTopic = '';
  const roleBlob = [id.title, id.department].filter(Boolean).join(' ');
  if (roleBlob) {
    for (const row of ROLE_RX) {
      if (row.role.test(roleBlob) && topicHits(blob, row.topic)) { roleTopic = row.name; break; }
    }
  }

  const span = spanOf(email && email.body, email || {}, roleTopic);
  const family = span ? FAMILY[span] : '';
  const hist = historyFor(p, fromEmail, family, now);
  const rel = (p.relationships || []).find((r) => r && String(r.key || '').toLowerCase() === fromEmail && r.kind === 'sender');
  const groupRel = (p.relationships || []).find((r) => r && r.kind === 'group');
  let groupRate = null;
  if (typeof ws.answersGroupMailRate === 'number') groupRate = ws.answersGroupMailRate;
  else if (groupRel && typeof groupRel.replyRate === 'number') groupRate = groupRel.replyRate;

  const covered = (id.reports || []).some((r) => nameEq(vocInfo.name, [r && r.name, r && r.email]))
    || (p.relationships || []).some((r) => r && r.covers && nameEq(vocInfo.name, [r.key, r.name]));
  const named = vocInfo.kind === 'own';
  const managerEmail = id.manager && String(id.manager.email || '').toLowerCase();
  const fromManager = !!(managerEmail && fromEmail && managerEmail === fromEmail);

  const pref = {};
  for (const item of p.preferences || []) {
    if (item && item.key) pref[item.key] = item.value;
  }
  const fyiShaped = (RX.NO_ACTION_HE.test(text) || RX.NO_ACTION_EN.test(text) || FILE_PURPOSE.test(text)) && span === 'save';

  const pos = [];
  const neg = [];
  if (approverKey) pos.push('user_is_approver_for');
  if (roleTopic && vocInfo.kind !== 'other') pos.push('role_matches_topic');
  if (fromManager && span) pos.push('manager_request');
  if (named) pos.push('named_addressee');
  if (covered) pos.push('covers_addressee');
  if (hist.approved >= 1 && hist.approved > hist.dismissed + hist.undo) pos.push('history_closed');
  if (ws.savesFiles === 'always' && span === 'save') pos.push('work_style_saves');
  if (typeof groupRate === 'number' && groupRate >= 0.5 && vocInfo.kind === 'group') pos.push('answers_group_mail_rate');
  if (role === 'cc-only' && rel && typeof rel.replyRate === 'number' && rel.replyRate >= 0.5 && Number(rel.seenCount || 0) >= 1) pos.push('cc_reply_rate');
  if (span === 'save' && pref.save === 'offer') pos.push('explicit_preference');
  if (vocInfo.kind === 'group' && pref.group === 'offer') pos.push('explicit_preference');
  if (role === 'cc-only' && pref.cc === 'offer') pos.push('explicit_preference');
  if (fyiShaped && pref.fyi === 'offer') pos.push('explicit_preference');

  const knowsWho = ownNames.length > 0 || (id.reports || []).length > 0;
  if (vocInfo.kind === 'other' && knowsWho && !covered && !named) neg.push('addressed_to_other');
  if (vocInfo.kind === 'group' && !approverKey && !fromManager && !named && typeof groupRate === 'number' && groupRate < 0.5 && hist.approved < 1) neg.push('does_not_answer_group');
  if (role === 'cc-only' && !approverKey && !(hist.approved >= 1) && rel && rel.replyRate === 0 && Number(rel.seenCount || 0) >= 1) neg.push('cc_reply_rate');
  if (ws.savesFiles === 'never' && span === 'save' && hist.approved < 1) neg.push('work_style_never_saves');
  if (hist.dismissed + hist.undo >= 1 && hist.dismissed + hist.undo > hist.approved) neg.push('history_dismissed');
  if (span === 'save' && pref.save === 'silent') neg.push('explicit_preference');
  if (vocInfo.kind === 'group' && pref.group === 'silent') neg.push('explicit_preference');
  if (role === 'cc-only' && pref.cc === 'silent') neg.push('explicit_preference');
  if (fyiShaped && pref.fyi === 'silent') neg.push('explicit_preference');

  let relevance = 'unknown';
  let reasons = ['no_profile_signal'];
  const blocked = neg.indexOf('addressed_to_other') >= 0;
  const posUse = blocked ? pos.filter((r) => r === 'covers_addressee' || r === 'named_addressee') : pos;
  if (posUse.length) { relevance = 'relevant'; reasons = posUse; }
  else if (neg.length) { relevance = 'not_relevant'; reasons = neg; }

  return {
    schemaVersion: 'user-context-v0',
    user_is_approver_for: approverKey ? 1 : 0,
    role_matches_topic: roleTopic && vocInfo.kind !== 'other' ? 1 : 0,
    role_topic: roleTopic || 'none',
    answers_group_mail_rate: groupRate,
    sender_reply_rate: rel && typeof rel.replyRate === 'number' ? rel.replyRate : null,
    sender_seen: rel ? Number(rel.seenCount || 0) : 0,
    sender_latency_hours: rel && typeof rel.medianLatencyHours === 'number' ? rel.medianLatencyHours : null,
    history_approved_decayed: +hist.approved.toFixed(4),
    history_dismissed_decayed: +hist.dismissed.toFixed(4),
    history_undo_decayed: +hist.undo.toFixed(4),
    history_edited_decayed: +hist.edited.toFixed(4),
    history_missed_decayed: +hist.missed.toFixed(4),
    vocative: vocInfo.kind,
    recipient_role: role,
    saves_files: ws.savesFiles || 'unknown',
    covers_addressee: covered ? 1 : 0,
    named_addressee: named ? 1 : 0,
    from_manager: fromManager ? 1 : 0,
    intent_span: span,
    intent_family: family || 'none',
    relevance,
    relevance_reasons: reasons
  };
}

module.exports = { featurize, decay, HALF_LIFE_DAYS, spanOf, FAMILY, ownText };
