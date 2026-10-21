'use strict';
// Tier 1, the device model (docs/glance-ai/ai-product.md §3, milestone M4): the model on the person's own device reads a mail that the
// rules did not settle and returns the same Understanding as Glance cloud, so nothing leaves the device for the mails it can read itself.
//
//   session   the browser binding (src/local-lm-chrome.js) hands in { prompt(text, schema) -> string }. Nothing else is assumed.
//   twice     the mail is read twice, in two wordings of the one shared prompt (core/understanding.js instructions()). An answer counts only
//             when both readings validate against the text and agree on the proposed step and the date the device reads. Anything else
//             (a disagreement, an unreadable answer, a throw) is "no answer", and Router v2 escalates to Glance cloud (or stays silent).
//   gate      the model runs only in a language where its own self-test on this device passed (the same bars as core/local-lm.js:
//             precision >= 0.97 on at least 12 proposed positives, recall >= 0.4), and only while that result is fresh (30 days).
//   floor     a device answer is a proposal: Router v2 still applies the strict gate and the veto; nothing here closes, writes or sends.
//
// Off switch: SWITCH ('aiDeviceTier1'), default off: tier1For() returns null and Router v2 has no Tier 1. Portable: no chrome.*, no DOM,
// no network; the session is injected.
const FlowUnderstandingDevice = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const U = sibling(typeof FlowUnderstanding !== 'undefined' ? FlowUnderstanding : null, './understanding.js', 'FlowUnderstanding');
  const LM = sibling(typeof FlowLocalLM !== 'undefined' ? FlowLocalLM : null, './local-lm.js', 'FlowLocalLM');

  const SWITCH = 'aiDeviceTier1';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
  const MIN_PRECISION = LM ? LM.TEST_MIN_PRECISION : 0.97;
  const MIN_POSITIVES = LM ? LM.TEST_MIN_POSITIVES : 12;
  const MIN_RECALL = LM ? LM.TEST_MIN_RECALL : 0.4;
  const MAX_AGE_MS = LM ? LM.TEST_MAX_AGE_MS : 30 * 24 * 3600 * 1000;
  const MAX_TEXT = 6000;
  const span = { type: 'string', maxLength: 400 };
  // The response constraint the browser enforces while decoding. core/understanding.js validate() still checks everything after.
  const SCHEMA = {
    type: 'object',
    properties: {
      relevant: { type: 'string', enum: ['yes', 'no', 'unknown'] },
      state: { type: 'string', enum: ['open', 'answered', 'waiting', 'released'] },
      needs: { type: 'array', items: { type: 'string', enum: ['file', 'event', 'reply', 'task', 'payment'] }, maxItems: 5 },
      intentions: { type: 'array', maxItems: 5, items: { type: 'object', properties: {
        kind: { type: 'string', enum: ['ask_of_me', 'promise_to_me', 'promise_by_me', 'ask_by_me', 'meeting', 'fyi'] },
        actor: { type: 'string', enum: ['me', 'sender', 'other', 'unknown'] },
        ask_span: span, evidence_span: span, due_span: span, amount_span: span,
        confidence: { type: 'number', minimum: 0, maximum: 1 } }, required: ['kind', 'ask_span', 'evidence_span', 'confidence'] } }
    },
    required: ['intentions']
  };
  const WORDING_B = '\nRead the message again, slowly. Quote only exact words from it. If two readings are possible, return "intentions":[].';

  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }
  function langOf(text) { return /[֐-׿]/.test(String(text || '')) ? 'he' : 'en'; }
  function fresh(status, now) { return !!(status && typeof status.checkedAt === 'number' && (now - status.checkedAt) <= MAX_AGE_MS); }
  function promptFor(text, variant) { return U.instructions() + (variant === 'B' ? WORDING_B : '') + '\n\nMessage:\n' + String(text || ''); }

  function parse(raw) {
    if (raw && typeof raw === 'object') return raw;
    try { return JSON.parse(String(raw || '')); } catch (e) { return null; }
  }
  const same = (a, b) => a.step === b.step && (a.due || null) === (b.due || null);

  // read(session, text, opts) -> { agreed:true, answer, proposal } | { agreed:false, why }
  async function read(session, text, opts) {
    opts = opts || {};
    if (!session || typeof session.prompt !== 'function' || !U) return { agreed: false, why: 'no-session' };
    const t = String(text || '');
    if (!t.trim() || t.length > MAX_TEXT) return { agreed: false, why: 'bad-text' };
    let rawA, rawB;
    try { rawA = await session.prompt(promptFor(t, 'A'), SCHEMA); rawB = await session.prompt(promptFor(t, 'B'), SCHEMA); } catch (e) { return { agreed: false, why: 'error' }; }
    const a = parse(rawA), b = parse(rawB);
    const va = a ? U.validate(a, t, { today: opts.today }) : null, vb = b ? U.validate(b, t, { today: opts.today }) : null;
    if (!va || !va.ok || !vb || !vb.ok) return { agreed: false, why: 'unreadable' };
    const pa = U.proposal(va.understanding, { attachmentCount: opts.attachmentCount || 0 });
    const pb = U.proposal(vb.understanding, { attachmentCount: opts.attachmentCount || 0 });
    if (!same(pa, pb)) return { agreed: false, why: 'disagree' };
    return { agreed: true, answer: a, proposal: pa };
  }

  // tier1For(flags, session, status, opts) -> a Router v2 deps.tier1 function, or null (switch off, no session, or no fresh self-test).
  // The returned function answers null (= escalate) for a language whose self-test did not pass, and on any disagreement.
  function tier1For(flags, session, status, opts) {
    if (!enabled(flags) || !session || typeof session.prompt !== 'function') return null;
    opts = opts || {};
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    if (!fresh(status, now)) return null;
    if (!(status.en && status.en.ok === true) && !(status.he && status.he.ok === true)) return null; // no language passed: no Tier 1 at all
    return async (text) => {
      const lang = langOf(text);
      if (!status[lang] || status[lang].ok !== true) return null;
      const r = await read(session, text, opts);
      return r.agreed ? r.answer : null;
    };
  }

  // selfTest(session, audit, opts) -> { checkedAt, en:{ok,...}, he:{ok,...} }. audit: [{ text, gold: 'SILENT'|'draft'|'task'|'calendar', lang?, today? }].
  // Precision is measured on what the device WOULD propose (agreed, non-silent): right step = true positive.
  async function selfTest(session, audit, opts) {
    opts = opts || {};
    const res = { checkedAt: typeof opts.now === 'number' ? opts.now : Date.now(), en: { ok: false }, he: { ok: false } };
    if (!session) return res;
    for (const lang of ['en', 'he']) {
      const rows = (audit || []).filter((r) => (r.lang || langOf(r.text)) === lang);
      let tp = 0, fp = 0, fn = 0;
      for (const r of rows) {
        const x = await read(session, r.text, { today: r.today || opts.today, attachmentCount: r.attachmentCount || 0 });
        const proposed = x.agreed && x.proposal.step !== 'SILENT';
        const gold = r.gold && r.gold !== 'SILENT';
        if (proposed && gold && x.proposal.step === r.gold) tp++;
        else if (proposed) fp++;
        else if (gold) fn++;
      }
      const n = tp + fp;
      const precision = n ? tp / n : null;
      const recall = tp + fn ? tp / (tp + fn) : null;
      res[lang] = { ok: precision !== null && precision >= MIN_PRECISION && n >= MIN_POSITIVES && recall !== null && recall >= MIN_RECALL, n: rows.length, tp, fp, fn,
        precision: precision === null ? null : Math.round(precision * 1000) / 1000, recall: recall === null ? null : Math.round(recall * 1000) / 1000 };
    }
    return res;
  }

  return { SWITCH, DEFAULTS, SCHEMA, MIN_PRECISION, MIN_POSITIVES, MIN_RECALL, enabled, promptFor, read, tier1For, selfTest };
})();

if (typeof module !== 'undefined') module.exports = { FlowUnderstandingDevice };
