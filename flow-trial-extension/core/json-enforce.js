// Strict JSON for model output, shared by every tier that asks a model for a structured answer (the on-device model, the company server).
// Portable: no chrome.*, no DOM, no network. docs/hybrid-execution-architecture.md.
//
// Two jobs, both deterministic:
//   1. instructions(schema): the same words, to every tier, saying "answer with ONE JSON object, nothing else, and here is its shape".
//   2. parse(raw, schema): read what came back WITHOUT ever throwing. Anything that is not a valid object of the schema is a refusal
//      ({ ok:false, reason }), never a guess. The only repairs are ones that cannot change a value: a code fence, prose around the object,
//      a trailing comma. A truncated answer is NOT repaired (closing the brackets would invent the end of the sentence).
//
// A parsed answer is a PROPOSAL. It never writes, closes or sends anything by itself (docs/local-first-principle.md).
const FlowJsonEnforce = (() => {
  const MAX_RAW_CHARS = 40000;      // anything longer is not an action; refuse it rather than scan it
  const MAX_DEPTH = 8;
  const MAX_KEYS = 40;

  // The closed vocabulary of what a Glance "Do It" proposal may be. It mirrors what Glance can actually do today (core/actions.js: a Gmail
  // draft, a Google Task, a Calendar event) plus "none". There is deliberately no "fill a field on a web page" action: Glance has no such
  // capability, and adding one is a product and permissions decision, not a schema line.
  const ACTION_SCHEMA = {
    discriminator: 'action',
    variants: {
      draft_reply: { type: 'object', additionalProperties: false, required: ['action', 'body'], properties: {
        action: { type: 'string', enum: ['draft_reply'] }, body: { type: 'string', maxLength: 4000 } } },
      // Dates are never asked for as dates. The model points at the words ("by Friday", "[DATE_1]"); the device reads them with its own
      // parsers (core/extract.js), after any placeholder has been restored. The model supplies a place, never a value.
      create_task: { type: 'object', additionalProperties: false, required: ['action', 'title', 'dueText'], properties: {
        action: { type: 'string', enum: ['create_task'] }, title: { type: 'string', maxLength: 200 }, dueText: { type: ['string', 'null'], maxLength: 80 } } },
      create_event: { type: 'object', additionalProperties: false, required: ['action', 'title', 'whenText'], properties: {
        action: { type: 'string', enum: ['create_event'] }, title: { type: 'string', maxLength: 200 }, whenText: { type: 'string', maxLength: 80 } } },
      none: { type: 'object', additionalProperties: false, required: ['action', 'reason'], properties: {
        action: { type: 'string', enum: ['none'] }, reason: { type: 'string', maxLength: 200 } } }
    }
  };

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function typeOk(v, t) {
    const want = Array.isArray(t) ? t : [t];
    const got = typeOf(v);
    return want.some((w) => w === got || (w === 'integer' && got === 'number' && Number.isInteger(v)));
  }

  // A small, closed subset of JSON Schema: type, enum, required, properties, additionalProperties:false, maxLength, minimum, maximum, pattern, items.
  // Plus { discriminator, variants } to pick one object schema by the value of one key.
  function check(value, schema, path, issues, depth) {
    if (depth > MAX_DEPTH) { issues.push(path + ': too deep'); return; }
    if (!schema) return;
    if (schema.discriminator) {
      const key = schema.discriminator;
      const tag = value && typeof value === 'object' ? value[key] : undefined;
      const variant = typeof tag === 'string' && Object.prototype.hasOwnProperty.call(schema.variants, tag) ? schema.variants[tag] : null;
      if (!variant) { issues.push(path + key + ': not one of ' + Object.keys(schema.variants).join('|')); return; }
      check(value, variant, path, issues, depth + 1);
      return;
    }
    if (schema.type && !typeOk(value, schema.type)) { issues.push((path || '$') + ': expected ' + [].concat(schema.type).join('|') + ', got ' + typeOf(value)); return; }
    if (schema.enum && schema.enum.indexOf(value) < 0) issues.push((path || '$') + ': not in the allowed values');
    if (typeof value === 'string') {
      if (schema.maxLength != null && value.length > schema.maxLength) issues.push((path || '$') + ': longer than ' + schema.maxLength);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) issues.push((path || '$') + ': wrong format');
    }
    if (typeof value === 'number') {
      if (schema.minimum != null && value < schema.minimum) issues.push((path || '$') + ': below ' + schema.minimum);
      if (schema.maximum != null && value > schema.maximum) issues.push((path || '$') + ': above ' + schema.maximum);
    }
    if (Array.isArray(value) && schema.items) value.forEach((item, i) => check(item, schema.items, (path || '$') + '[' + i + ']', issues, depth + 1));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length > MAX_KEYS) { issues.push((path || '$') + ': too many keys'); return; }
      (schema.required || []).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(value, k)) issues.push((path ? path + '.' : '') + k + ': missing'); });
      const props = schema.properties || {};
      keys.forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(props, k)) check(value[k], props[k], (path ? path + '.' : '') + k, issues, depth + 1);
        else if (schema.additionalProperties === false) issues.push((path ? path + '.' : '') + k + ': not allowed');
      });
    }
  }

  function validate(value, schema) {
    const issues = [];
    try { check(value, schema, '', issues, 0); } catch (e) { issues.push('validator failed closed'); }
    return { ok: issues.length === 0, issues };
  }

  // The first balanced {...} in the text, ignoring braces inside strings. Returns the substring or null.
  function firstObject(text) {
    const s = String(text);
    for (let start = s.indexOf('{'); start >= 0; start = s.indexOf('{', start + 1)) {
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
      }
      // never closed from this start: a truncated answer. Try the next '{' only if it is plausible; otherwise give up (no repair).
      return null;
    }
    return null;
  }

  // A trailing comma before } or ] outside strings. The only structural repair allowed.
  function dropTrailingCommas(text) {
    let out = '', inStr = false, esc = false, changed = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') { inStr = true; out += c; continue; }
      if (c === ',') {
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text[j] === '}' || text[j] === ']') { changed = true; continue; }
      }
      out += c;
    }
    return { text: out, changed };
  }

  // parse(raw, schema?) -> { ok:true, value, repaired:[...] } | { ok:false, reason, issues? }. Never throws.
  function parse(raw, schema) {
    try {
      if (raw === null || raw === undefined) return { ok: false, reason: 'empty' };
      let text = typeof raw === 'string' ? raw : (typeof raw === 'object' ? JSON.stringify(raw) : String(raw));
      if (text.length > MAX_RAW_CHARS) return { ok: false, reason: 'too-long' };
      text = text.replace(/^﻿/, '').trim();
      if (!text) return { ok: false, reason: 'empty' };
      const repaired = [];
      let candidate = text;
      const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
      if (fence) { candidate = fence[1].trim(); repaired.push('code-fence'); }
      let value;
      try { value = JSON.parse(candidate); } catch (e) { value = undefined; }
      if (value === undefined) {
        const obj = firstObject(candidate);
        if (!obj) return { ok: false, reason: candidate.indexOf('{') >= 0 ? 'truncated' : 'no-object' };
        if (obj !== candidate) repaired.push('surrounding-text');
        try { value = JSON.parse(obj); } catch (e) {
          const d = dropTrailingCommas(obj);
          if (!d.changed) return { ok: false, reason: 'malformed' };
          try { value = JSON.parse(d.text); repaired.push('trailing-comma'); } catch (e2) { return { ok: false, reason: 'malformed' }; }
        }
      }
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'not-an-object' };
      if (schema) {
        const v = validate(value, schema);
        if (!v.ok) return { ok: false, reason: 'schema', issues: v.issues.slice(0, 8) };
      }
      return { ok: true, value, repaired };
    } catch (e) {
      return { ok: false, reason: 'internal' };
    }
  }

  // Describe a schema to a model in plain words (one line per action), so the instruction does not depend on the model reading JSON Schema.
  function describe(schema) {
    if (schema && schema.discriminator) {
      return Object.keys(schema.variants).map((name) => {
        const v = schema.variants[name];
        const fields = Object.keys(v.properties).filter((k) => k !== schema.discriminator).map((k) => {
          const p = v.properties[k];
          return k + ' (' + [].concat(p.type).join(' or ') + ((v.required || []).indexOf(k) >= 0 ? '' : ', optional') + ')';
        });
        return '{"' + schema.discriminator + '": "' + name + '"' + (fields.length ? ', ' + fields.join(', ') : '') + '}';
      }).join('\n');
    }
    return JSON.stringify(schema);
  }

  // The instruction every tier gets. Same words on the device and on the server, so a disagreement between them is about the model, not the prompt.
  function instructions(schema, variant) {
    const shape = describe(schema);
    const head = variant === 'B'
      ? 'Reply with a single JSON object and nothing else: no explanation, no markdown, no code fence. Pick exactly one of these shapes.'
      : 'Return ONLY valid JSON: one object, no other text, no markdown, no code fence. It must have exactly one of these shapes.';
    return head + '\n' + shape + '\nIf you cannot do it with certainty, use {"action": "none", "reason": "<short reason>"}. Never invent names, amounts, dates, e-mail addresses or phone numbers; keep any [PLACEHOLDER] tokens exactly as given.';
  }

  // The same schema as plain JSON Schema (oneOf for the discriminated union), for a runtime that can constrain decoding to it (WebLLM's
  // response_format, Ollama's format, a provider's structured output). Constrained decoding makes the shape valid; parse() still checks it.
  function toJsonSchema(schema) {
    if (schema && schema.discriminator) return { oneOf: Object.keys(schema.variants).map((k) => toJsonSchema(schema.variants[k])) };
    return JSON.parse(JSON.stringify(schema));
  }

  return { ACTION_SCHEMA, validate, parse, instructions, describe, toJsonSchema, MAX_RAW_CHARS };
})();

if (typeof module !== 'undefined') module.exports = { FlowJsonEnforce };
