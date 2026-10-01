// Glance Pro entitlement policy — portable, no chrome.*, no DOM, no network.
//
// The extension stores one record, `proLicense`, written only by background.js
// after the server (verify-license) has confirmed a key:
//   { key, valid, status, plan, interval, renewsAt, trialEnds, checkedAt, activeUntil }
// `activeUntil` is set at verification time to checkedAt + OFFLINE_GRACE_MS, so
// a paying customer is not locked out by a flaky connection or a laptop on a
// plane, while a cancelled one loses access within a bounded time even if the
// recheck never reaches the server.
//
// What Pro is for: the two features that call a paid model through the masked
// backend (Draft-It reply drafts, attachment summaries). Everything else —
// judging emails, the Do It chip, writing to Google, Undo — stays free and
// stays on the device. The server enforces the same rule independently
// (glance-assist checks the licence), so editing this file cannot unlock them.
const FlowEntitlements = (() => {
  const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
  const RECHECK_AFTER_MS = 12 * 60 * 60 * 1000;
  const NUDGE_MIN_CLOSES = 5;
  const NUDGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
  const PRICING_URL = 'https://theflow-ai.com/pricing.html#glance-pro';

  const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const KEY_RE = new RegExp('^GLNC(-[' + KEY_ALPHABET + ']{5}){4}$');

  // Same normalisation as the server: people paste lower case, with spaces,
  // or without dashes.
  function normalizeKey(raw) {
    const compact = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (compact.length !== 24 || !compact.startsWith('GLNC')) return null;
    const body = compact.slice(4);
    const key = 'GLNC-' + [0, 5, 10, 15].map((i) => body.slice(i, i + 5)).join('-');
    return KEY_RE.test(key) ? key : null;
  }

  function isActive(record, now) {
    if (!record || !record.valid || !record.key) return false;
    const t = typeof now === 'number' ? now : Date.now();
    return typeof record.activeUntil === 'number' && t < record.activeUntil;
  }

  function needsRecheck(record, now) {
    if (!record || !record.key) return false;
    const t = typeof now === 'number' ? now : Date.now();
    return !record.checkedAt || t - record.checkedAt > RECHECK_AFTER_MS;
  }

  // Builds the stored record from a server answer.
  function recordFromVerification(key, answer, now) {
    const t = typeof now === 'number' ? now : Date.now();
    const valid = Boolean(answer && answer.valid);
    return {
      key,
      valid,
      status: (answer && answer.status) || null,
      plan: (answer && answer.plan) || null,
      interval: (answer && answer.interval) || null,
      renewsAt: (answer && answer.renewsAt) || null,
      trialEnds: (answer && answer.trialEnds) || null,
      checkedAt: t,
      activeUntil: valid ? t + OFFLINE_GRACE_MS : 0
    };
  }

  function shortDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // What the popup shows.
  //   state: 'none' (no key) | 'trial' | 'pro' | 'lapsed' (key stored, no longer valid)
  function describe(record, now) {
    if (!record || !record.key) return { state: 'none', label: 'Free', detail: '' };
    if (!isActive(record, now)) return { state: 'lapsed', label: 'Pro ended', detail: 'This key is no longer active.' };
    if (record.status === 'trialing' && record.trialEnds) {
      const d = shortDate(record.trialEnds);
      return { state: 'trial', label: 'Pro trial', detail: d ? 'Trial ends ' + d : 'Free trial' };
    }
    if (record.status === 'comp') return { state: 'pro', label: 'Pro', detail: 'Complimentary' };
    const d = record.renewsAt ? shortDate(record.renewsAt) : null;
    return { state: 'pro', label: 'Pro', detail: d ? 'Renews ' + d : 'Active' };
  }

  // One quiet nudge, in the popup only, after the person has actually closed
  // things with Glance. Never in Gmail, never as a notification — the product's
  // rule is that it only speaks when something is decided.
  function shouldNudge(snapshot, now) {
    const s = snapshot || {};
    const t = typeof now === 'number' ? now : Date.now();
    if (!s.checkoutOpen || s.pro) return false;
    if ((s.closes || 0) < NUDGE_MIN_CLOSES) return false;
    if (s.dismissedAt && t - s.dismissedAt < NUDGE_COOLDOWN_MS) return false;
    return true;
  }

  return {
    OFFLINE_GRACE_MS, RECHECK_AFTER_MS, NUDGE_MIN_CLOSES, NUDGE_COOLDOWN_MS, PRICING_URL,
    normalizeKey, isActive, needsRecheck, recordFromVerification, describe, shouldNudge
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowEntitlements };
