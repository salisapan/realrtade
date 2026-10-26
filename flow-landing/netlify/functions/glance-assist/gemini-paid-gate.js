// Fail-closed gate: Google- or Microsoft-sourced attachment summaries may use
// Gemini (generativelanguage.googleapis.com) only when GEMINI_PAID_TIER === 'true'.

function mergedEnv(env) {
  return Object.assign({}, process.env, env || {});
}

function geminiPaidTierEnabled(env) {
  return String(mergedEnv(env).GEMINI_PAID_TIER || '') === 'true';
}

function normalizeContentSource(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'gmail') return 'google';
  if (s === 'outlook') return 'microsoft';
  return s;
}

function isGoogleOrMicrosoftSource(contentSource) {
  const n = normalizeContentSource(contentSource);
  return n === 'google' || n === 'microsoft';
}

function summarizeAttachmentGeminiBlocked(contentSource, env) {
  return isGoogleOrMicrosoftSource(contentSource) && !geminiPaidTierEnabled(env);
}

function summarizeAttachmentSilenced(contentSource, env) {
  return summarizeAttachmentGeminiBlocked(contentSource, env);
}

module.exports = {
  geminiPaidTierEnabled,
  normalizeContentSource,
  isGoogleOrMicrosoftSource,
  summarizeAttachmentGeminiBlocked,
  summarizeAttachmentSilenced
};
