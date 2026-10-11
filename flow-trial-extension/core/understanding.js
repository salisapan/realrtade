'use strict';
// The Understanding contract (docs/glance-ai/ai-product.md §3, milestone M1).
//
// One JSON object a model (device or Glance cloud) returns about one masked mail or page text:
//   { relevant: 'yes'|'no'|'unknown',
//     state: 'open'|'answered'|'waiting'|'released',
//     needs: ['file'|'event'|'reply'|'task'|'payment'],
//     intentions: [{ kind, actor, counterpart, counterpart_span, ask_span, evidence_span, due, due_span, amount, amount_span, confidence }] }
//
// This file is the device-side validator. Its one job: a model answer stays grounded or it is dropped.
//   - Every claim cites words that are really in the masked text. ask_span and evidence_span must be found in the text; an intention
//     without them is dropped. due, amount and counterpart are dropped unless their own span is found.
//   - The model supplies a place, never a value (same rule as core/json-enforce.js). The device reads the due date from due_span with
//     core/extract.js. If the model's own ISO date disagrees with what the words say, the device's reading wins and the correction is
//     listed (models misread Hebrew weekdays: «ביום רביעי» said on a Wednesday is next week, not tomorrow). A date in the past is dropped.
//   - Unknown keys, wrong enums, a missing or low confidence: dropped, and every drop is listed with its reason.
// proposal() turns a validated Understanding into at most ONE proposed step (calendar, task, reply, file_save) or silence. It never
// closes, writes or sends: the result carries proposalOnly and needsClick, and the strict gate and the veto still sit after it.
//
// Off switch: SWITCH ('aiUnderstandingV1'), default off. gate() returns { used:false } while the switch is off, so a host that calls it
// behaves exactly as before. Nothing in the extension calls it yet (router wiring is M2). Portable: no chrome.*, document or window.
const FlowUnderstanding = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const enforce = sibling(typeof FlowJsonEnforce !== 'undefined' ? FlowJsonEnforce : null, './json-enforce.js', 'FlowJsonEnforce');

  const SWITCH = 'aiUnderstandingV1';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
  const RELEVANT = ['yes', 'no', 'unknown'];
  const STATES = ['open', 'answered', 'waiting', 'released'];
  const NEEDS = ['file', 'event', 'reply', 'task', 'payment'];
  // ask_of_me: someone asks the person; promise_to_me: someone promises the person; promise_by_me / ask_by_me: the person's own words;
  // meeting: one concrete meeting or call; fyi: information only.
  const KINDS = ['ask_of_me', 'promise_to_me', 'promise_by_me', 'ask_by_me', 'meeting', 'fyi'];
  const ACTORS = ['me', 'sender', 'other', 'unknown'];
  const TOP_KEYS = ['relevant', 'state', 'needs', 'intentions'];
  const INT_KEYS = ['kind', 'actor', 'counterpart', 'counterpart_span', 'ask_span', 'evidence_span', 'due', 'due_span', 'amount', 'amount_span', 'confidence'];
  const MIN_CONFIDENCE = 0.7;
  const MAX_INTENTIONS = 5;
  const MIN_SPAN = 3;
  const MAX_SPAN = 400;
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  // Invisible marks and spacing must not decide whether a quote is "in the text".
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[​-‏‪-‮⁦-⁩﻿­]/g, '')
      .replace(/[‘’]/g, "'").replace(/[“”״]/g, '"')
      .replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // A span counts only when it is a real quote: a string, long enough to mean something, short enough not to be the whole mail.
  function spanIn(span, normText) {
    if (typeof span !== 'string') return { ok: false, reason: 'missing' };
    const s = norm(span);
    if (s.length < MIN_SPAN) return { ok: false, reason: 'too-short' };
    if (s.length > MAX_SPAN) return { ok: false, reason: 'too-long' };
    if (normText.indexOf(s) < 0) return { ok: false, reason: 'not-in-text' };
    return { ok: true, span: s };
  }

  function nowFrom(today) {
    if (today instanceof Date) return today;
    if (typeof today === 'string' && ISO.test(today)) return new Date(today + 'T12:00:00');
    return new Date();
  }
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // validate(raw, maskedText, opts?) -> { ok, understanding, drops:[{path, reason}] } | { ok:false, reason, drops }
  // opts: { today: 'YYYY-MM-DD'|Date, minConfidence, unmask(span) -> text the device may parse (restores [DATE_n] placeholders) }
  function validate(raw, maskedText, opts) {
    opts = opts || {};
    const drops = [];
    const drop = (path, reason) => { drops.push({ path, reason }); };
    try {
      let value = raw;
      if (typeof raw === 'string') {
        const p = enforce ? enforce.parse(raw) : (() => { try { return { ok: true, value: JSON.parse(raw) }; } catch (e) { return { ok: false, reason: 'malformed' }; } })();
        if (!p.ok) return { ok: false, reason: p.reason, drops };
        value = p.value;
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'not-an-object', drops };
      const text = norm(maskedText);
      if (!text) return { ok: false, reason: 'no-text', drops };
      const now = nowFrom(opts.today);
      const todayIso = isoOf(now);
      const minConf = typeof opts.minConfidence === 'number' ? opts.minConfidence : MIN_CONFIDENCE;
      const unmask = typeof opts.unmask === 'function' ? opts.unmask : (s) => s;

      for (const k of Object.keys(value)) if (TOP_KEYS.indexOf(k) < 0) drop(k, 'unknown-key');
      const out = { relevant: 'unknown', state: 'open', needs: [], intentions: [] };
      if (value.relevant !== undefined) { if (RELEVANT.indexOf(value.relevant) >= 0) out.relevant = value.relevant; else drop('relevant', 'bad-enum'); }
      if (value.state !== undefined) { if (STATES.indexOf(value.state) >= 0) out.state = value.state; else drop('state', 'bad-enum'); }
      if (value.needs !== undefined) {
        if (!Array.isArray(value.needs)) drop('needs', 'not-an-array');
        else value.needs.forEach((n, i) => { if (NEEDS.indexOf(n) >= 0) { if (out.needs.indexOf(n) < 0) out.needs.push(n); } else drop('needs[' + i + ']', 'bad-enum'); });
      }
      const list = value.intentions === undefined ? [] : value.intentions;
      if (!Array.isArray(list)) { drop('intentions', 'not-an-array'); return { ok: true, understanding: out, drops }; }
      if (list.length > MAX_INTENTIONS) drop('intentions', 'too-many');
      list.slice(0, MAX_INTENTIONS).forEach((it, i) => {
        const at = 'intentions[' + i + ']';
        if (!it || typeof it !== 'object' || Array.isArray(it)) { drop(at, 'not-an-object'); return; }
        for (const k of Object.keys(it)) if (INT_KEYS.indexOf(k) < 0) drop(at + '.' + k, 'unknown-key');
        if (KINDS.indexOf(it.kind) < 0) { drop(at + '.kind', 'bad-enum'); return; }
        if (typeof it.confidence !== 'number' || !(it.confidence >= 0 && it.confidence <= 1)) { drop(at + '.confidence', 'bad-confidence'); return; }
        if (it.confidence < minConf) { drop(at, 'low-confidence'); return; }
        const ask = spanIn(it.ask_span, text);
        if (!ask.ok) { drop(at + '.ask_span', ask.reason); return; }
        const ev = spanIn(it.evidence_span, text);
        if (!ev.ok) { drop(at + '.evidence_span', ev.reason); return; }
        const g = { kind: it.kind, actor: ACTORS.indexOf(it.actor) >= 0 ? it.actor : 'unknown', ask_span: ask.span, evidence_span: ev.span, confidence: it.confidence };
        if (it.actor !== undefined && ACTORS.indexOf(it.actor) < 0) drop(at + '.actor', 'bad-enum');
        if (it.counterpart !== undefined && it.counterpart !== null) {
          const c = spanIn(it.counterpart_span, text);
          if (typeof it.counterpart === 'string' && c.ok && norm(it.counterpart) && c.span.indexOf(norm(it.counterpart)) >= 0) { g.counterpart = it.counterpart; g.counterpart_span = c.span; }
          else drop(at + '.counterpart', c.ok ? 'not-in-span' : 'span-' + c.reason);
        }
        if (it.due !== undefined && it.due !== null && it.due !== '') {
          const d = spanIn(it.due_span, text);
          if (!d.ok) drop(at + '.due', 'span-' + d.reason);
          else {
            // The device reads the words; the model's ISO is only a cross-check.
            const read = extract && extract.parseDate ? extract.parseDate(String(unmask(it.due_span)), now) : null;
            if (!read || !read.iso) drop(at + '.due', 'span-has-no-date');
            else if (read.iso < todayIso) drop(at + '.due', 'past');
            else {
              if (typeof it.due !== 'string' || it.due !== read.iso) drop(at + '.due', 'model-date-corrected');
              g.due = read.iso; g.due_span = d.span;
              const t = extract && extract.parseTime ? extract.parseTime(String(unmask(it.due_span))) : null;
              if (t) g.due_time = t;
            }
          }
        }
        if (it.amount !== undefined && it.amount !== null && it.amount !== '') {
          const a = spanIn(it.amount_span, text);
          const m = a.ok && extract && extract.parseMoney ? extract.parseMoney(String(unmask(it.amount_span))) : null;
          if (!a.ok) drop(at + '.amount', 'span-' + a.reason);
          else if (!m) drop(at + '.amount', 'span-has-no-amount');
          else { g.amount = m; g.amount_span = a.span; }
        }
        out.intentions.push(g);
      });
      return { ok: true, understanding: out, drops };
    } catch (e) {
      return { ok: false, reason: 'internal', drops };
    }
  }

  // proposal(understanding, ctx?) -> { step, due, askSpan, evidence, proposalOnly, needsClick, closes:false } | { step:'SILENT', reason }
  // ctx: { attachmentCount } (a save needs a declared attachment; suggest-save still decides which file).
  // At most one Do It: two different grounded steps is silence, never a guess.
  function proposal(u, ctx) {
    ctx = ctx || {};
    const silent = (reason) => ({ step: 'SILENT', reason });
    if (!u || !Array.isArray(u.intentions)) return silent('no-understanding');
    if (u.relevant === 'no') return silent('not-relevant');
    if (u.state === 'answered' || u.state === 'released') return silent('state-' + u.state);
    const steps = [];
    for (const it of u.intentions) {
      let step = null, why = null;
      if (it.kind === 'meeting') { if (!it.due) why = 'meeting-without-date'; else if (!it.due_time) why = 'meeting-without-time'; else step = 'calendar'; }
      else if (it.kind === 'promise_to_me') { if (it.due) step = 'task'; else why = 'promise-without-date'; }
      else if (it.kind === 'ask_of_me') {
        if (u.needs.indexOf('file') >= 0 && (ctx.attachmentCount || 0) > 0) step = 'file_save';
        else if (it.due) step = 'draft'; else why = 'ask-without-date';
      }
      if (step) steps.push({ step, it });
      else if (why) steps.push({ step: null, why });
    }
    const real = steps.filter((s) => s.step);
    if (!real.length) return silent(steps.length ? steps[0].why : 'no-actionable-intention');
    const kinds = Array.from(new Set(real.map((s) => s.step)));
    if (kinds.length > 1) return silent('two-intentions');
    const best = real.sort((a, b) => b.it.confidence - a.it.confidence)[0];
    return { step: best.step, due: best.it.due || null, askSpan: best.it.ask_span, evidence: best.it.evidence_span, confidence: best.it.confidence,
      proposalOnly: true, needsClick: true, closes: false };
  }

  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }

  // gate(flags, raw, maskedText, ctx) -> { used:false } while the switch is off; else { used:true, ok, proposal, understanding, drops }.
  function gate(flags, raw, maskedText, ctx) {
    if (!enabled(flags)) return { used: false };
    ctx = ctx || {};
    const v = validate(raw, maskedText, { today: ctx.today, minConfidence: ctx.minConfidence, unmask: ctx.unmask });
    if (!v.ok) return { used: true, ok: false, reason: v.reason, proposal: { step: 'SILENT', reason: 'invalid-' + v.reason }, drops: v.drops };
    return { used: true, ok: true, understanding: v.understanding, proposal: proposal(v.understanding, ctx), drops: v.drops };
  }

  return { SWITCH, DEFAULTS, RELEVANT, STATES, NEEDS, KINDS, ACTORS, MIN_CONFIDENCE, validate, proposal, gate, enabled, norm };
})();

if (typeof module !== 'undefined') module.exports = { FlowUnderstanding };
