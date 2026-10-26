'use strict';
// v0 judgment. Relevance is first. Unknown falls back to today's decision unchanged.
// Group, vocative, Cc-only, and FYI are profile features, not vetoes.
// The hard floor still silences negation, noise-footer, and injection, and it
// refuses an offer that has no explicit intent span.
const { featurize, ownText } = require('./featurize.cjs');
const { RX, negatedOnly } = require('../model/runtime/product-rules.cjs');

const INJECT = /ignore (?:all |any )?(?:previous|prior) instructions|\bsystem:|new bank account|wire [^.]{0,20}(?:to|into) (?:the )?(?:new|this) account|account\s+\d{2}-\d{3}|התעלם מכל ההוראות|לחשבון הבנק החדש|חשבון בנק חדש/i;
const QUOTED_ONLY = /^\s*(?:fyi|fwd?|forwarding|להלן|מעביר)[^\n]*\n\s*\n?\s*(?:on .{0,80} wrote:|-----\s*original message|-{5,}\s*forwarded message|בתאריך .{0,80} נכתב:)/i;
const OTHER_TARGET = /\bshared\s+(?:folder|drive)\b|\bsharepoint\b|\bdropbox\b|\bbox\.com\b|\bteams\s+(?:folder|channel)\b|(?:ה)?תיקי(?:י)?ה\s+המשותפת|שרפוינט|דרופבוקס/i;

function hardFloor(email) {
  const own = ownText(email && email.body);
  const subject = String((email && email.subject) || '');
  if (INJECT.test(own) || INJECT.test(subject)) return 'injection';
  if (QUOTED_ONLY.test(String((email && email.body) || ''))) return 'noise-footer';
  if (RX.MARKETING.test(own) || RX.MARKETING.test(subject)) return 'noise-footer';
  if (negatedOnly(own) || RX.NEG_SAVE.test(own)) return 'negation';
  return null;
}

function feasible(email, span) {
  const own = ownText(email && email.body);
  const n = Number((email && email.attachmentCount) || 0);
  if (span === 'save') {
    if (n !== 1) return null;
    if (RX.NEG_SAVE.test(own)) return null;
    if ((email && email.surface) === 'gmail' && RX.ONEDRIVE.test(own)) return null;
    if (OTHER_TARGET.test(own)) return null;
    return 'drive-file|file_save';
  }
  if (span === 'calendar') {
    if ((email && email.surface) === 'outlook') return null;
    return 'event|calendar';
  }
  if (span === 'commitment') return 'commitment|task';
  if (span === 'amount') return 'confirmed-amount|task';
  if (span === 'ask') return 'follow-up-ask|draft';
  return null;
}

function judge(email, profile, today, opt) {
  const base = today && today.label ? today.label : 'SILENT';
  const features = featurize(email || {}, profile || {}, opt);
  if (features.relevance === 'unknown') {
    return {
      action: base,
      relevance: 'unknown',
      reasons: features.relevance_reasons.slice(),
      cardBecause: [],
      hardFloor: null,
      fallback: true,
      features
    };
  }
  const floor = hardFloor(email || {});
  if (floor) {
    return { action: 'SILENT', relevance: features.relevance, reasons: [floor], cardBecause: [], hardFloor: floor, fallback: false, features };
  }
  if (features.relevance === 'not_relevant') {
    return {
      action: 'SILENT',
      relevance: 'not_relevant',
      reasons: features.relevance_reasons.slice(),
      cardBecause: [],
      hardFloor: null,
      fallback: false,
      features
    };
  }
  const action = feasible(email || {}, features.intent_span);
  if (!action) {
    const why = features.intent_span ? 'close-not-feasible' : 'no-intent-span';
    return { action: 'SILENT', relevance: 'relevant', reasons: [why], cardBecause: [], hardFloor: why, fallback: false, features };
  }
  return {
    action,
    relevance: 'relevant',
    reasons: features.relevance_reasons.slice(),
    cardBecause: features.relevance_reasons.slice(),
    hardFloor: null,
    fallback: false,
    features
  };
}

module.exports = { judge, hardFloor, feasible };
