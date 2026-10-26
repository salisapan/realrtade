// Fail-closed: attachment summaries call Gemini only when GEMINI_PAID_TIER === 'true'
// OR contentSource is on the explicit non-Google/Microsoft allowlist.

const ALLOWED_WITHOUT_PAID_TIER = new Set(['dropbox', 'box', 'local', 'computer']);

function mergedEnv(env) {
  return Object.assign({}, process.env, env || {});
}

function geminiPaidTierEnabled(env) {
  return String(mergedEnv(env).GEMINI_PAID_TIER || '') === 'true';
}

function normalizeContentSource(raw) {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim().toLowerCase();
  if (!s) return '';
  if (s === 'gmail') return 'google';
  if (s === 'outlook') return 'microsoft';
  return s;
}

function summarizeAttachmentAllowed(contentSource, env) {
  if (geminiPaidTierEnabled(env)) return true;
  const n = normalizeContentSource(contentSource);
  if (!n) return false;
  if (n === 'google' || n === 'microsoft') return false;
  return ALLOWED_WITHOUT_PAID_TIER.has(n);
}

function summarizeAttachmentGeminiBlocked(contentSource, env) {
  return !summarizeAttachmentAllowed(contentSource, env);
}

function summarizeAttachmentSilenced(contentSource, env) {
  return summarizeAttachmentGeminiBlocked(contentSource, env);
}

module.exports = {
  ALLOWED_WITHOUT_PAID_TIER,
  geminiPaidTierEnabled,
  normalizeContentSource,
  summarizeAttachmentAllowed,
  summarizeAttachmentGeminiBlocked,
  summarizeAttachmentSilenced
};
