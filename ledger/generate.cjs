'use strict';
// Generate JSON Schemas, JSDoc, and the Hebrew/English dictionary from tracking-plan.yaml.
// node ledger/generate.cjs
// node ledger/generate.cjs --check
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

function parseYaml(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  let i = 0;
  function indentOf(line) { const m = /^( *)/.exec(line); return m ? m[1].length : 0; }
  function parseBlock(min) {
    const obj = {};
    let arr = null;
    while (i < lines.length) {
      const raw = lines[i];
      if (!raw.trim() || raw.trim().startsWith('#')) { i++; continue; }
      const ind = indentOf(raw);
      if (ind < min) break;
      if (ind > min) throw new Error('bad indent line ' + (i + 1));
      const line = raw.trim();
      if (line.startsWith('- ')) {
        if (!arr) arr = [];
        const rest = line.slice(2).trim();
        if (rest.startsWith('{') && rest.endsWith('}')) {
          arr.push(parseInline(rest));
          i++;
          continue;
        }
        if (rest.includes(':')) {
          const child = {};
          const idx = rest.indexOf(':');
          const k = rest.slice(0, idx).trim();
          const v = rest.slice(idx + 1).trim();
          child[k] = v === '' ? null : unquote(v);
          i++;
          if (i < lines.length && indentOf(lines[i]) > ind && lines[i].trim()) {
            const nested = parseBlock(indentOf(lines[i]));
            Object.assign(child, nested.obj || {});
          }
          arr.push(child);
          continue;
        }
        arr.push(unquote(rest));
        i++;
        continue;
      }
      const idx = line.indexOf(':');
      if (idx < 0) throw new Error('expected key line ' + (i + 1));
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      i++;
      if (val === '' || val === '|' || val === '>') {
        if (i < lines.length && lines[i].trim() && indentOf(lines[i]) > ind) {
          const nested = parseBlock(indentOf(lines[i]));
          obj[key] = nested.arr || nested.obj;
        } else obj[key] = '';
      } else if (val.startsWith('[') && val.endsWith(']')) {
        obj[key] = val.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
      } else obj[key] = unquote(val);
    }
    return { obj: obj, arr: arr };
  }
  const top = parseBlock(0);
  return top.obj;
}

function unquote(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '') return v === 'null' ? null : '';
  if (/^-?\d+$/.test(v)) return Number(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function parseInline(text) {
  const body = text.slice(1, -1);
  const out = {};
  body.split(',').forEach((part) => {
    const idx = part.indexOf(':');
    if (idx < 0) return;
    out[part.slice(0, idx).trim()] = unquote(part.slice(idx + 1).trim());
  });
  return out;
}

function tzBuckets() {
  const out = ['unknown'];
  for (let h = -12; h <= 14; h++) out.push(h < 0 ? 'UTC' + h : 'UTC+' + h);
  return out;
}

function stringField(max, pattern) {
  const s = { type: 'string', maxLength: max };
  if (pattern) s.pattern = pattern;
  return s;
}

const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const TOKEN = '^[a-z0-9][a-z0-9_.:-]{0,63}$';
const DAY = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
const HEX = '^[0-9a-f]{8,16}$';

function propFor(field, plan) {
  const max = field.max_length || 32;
  if (field.type === 'uuid') return stringField(36, UUID);
  if (field.type === 'token') return stringField(max, TOKEN);
  if (field.type === 'hex') return stringField(max, HEX);
  if (field.type === 'day') return stringField(10, DAY);
  if (field.type === 'intent') return { type: 'string', enum: plan.intent_types.slice(), maxLength: 32 };
  if (field.type === 'surface') return { type: 'string', enum: plan.surfaces.slice(), maxLength: 16 };
  if (field.type === 'target') return { type: 'string', enum: plan.target_systems.slice(), maxLength: 16 };
  if (field.type === 'confidence') return { type: 'string', enum: plan.confidence.slice(), maxLength: 8 };
  if (field.type === 'hour') return { type: 'string', enum: plan.hour_buckets.slice(), maxLength: 3 };
  if (field.type === 'weekday') return { type: 'string', enum: plan.weekdays.slice(), maxLength: 3 };
  if (field.type === 'locale') return { type: 'string', enum: plan.locales.slice(), maxLength: 5 };
  if (field.type === 'boolean') return { type: 'boolean' };
  if (field.type === 'number') return { type: 'number', minimum: 0, maximum: 1 };
  if (field.type === 'integer') return { type: 'integer', minimum: 0, maximum: 86400000 };
  return stringField(max);
}

function objectSchema(id, required, properties, description) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: id,
    description: description,
    type: 'object',
    additionalProperties: false,
    required: required,
    properties: properties
  };
}

function envelopeSchema(plan) {
  const types = plan.events.map((e) => e.type);
  return objectSchema('iglu:ai.theflow.glance/envelope/jsonschema/1-0-0', [
    'specversion', 'id', 'source', 'type', 'time', 'dataschema', 'subject', 'seq', 'data'
  ], {
    specversion: { const: '1.0' },
    id: stringField(36, UUID),
    source: stringField(80, '^urn:glance:[a-z]+:[0-9a-f-]{36}$'),
    type: { type: 'string', enum: types, maxLength: 64 },
    time: stringField(40, '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+-][0-9]{2}:[0-9]{2}$'),
    dataschema: stringField(96, '^iglu:ai\\.theflow\\.glance/[a-z]+/jsonschema/[0-9]+-[0-9]+-[0-9]+$'),
    subject: stringField(36, UUID),
    seq: { type: 'integer', minimum: 0, maximum: 1000000000 },
    data: { type: 'object' }
  }, 'CloudEvents 1.0 envelope. seq is the per-install extension.');
}

function dataSchema(plan, name, fields, id) {
  const properties = {};
  const required = [];
  fields.forEach((f) => {
    properties[f.name] = propFor(f, plan);
    if (f.required) required.push(f.name);
    else properties[f.name].description = 'Optional. Default applied on read.';
  });
  if (name === 'decision') {
    properties.candidates = {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['intent_type', 'confidence_bucket', 'raw_score_q'],
        properties: {
          intent_type: { type: 'string', enum: plan.intent_types.slice(), maxLength: 32 },
          confidence_bucket: { type: 'string', enum: plan.confidence.slice(), maxLength: 8 },
          raw_score_q: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    };
    required.push('candidates');
  }
  return objectSchema(id, required, properties, name + ' payload. Types only.');
}

function taxonomySchema(plan) {
  return objectSchema('iglu:ai.theflow.glance/taxonomy/jsonschema/1-0-0', ['id', 'domain', 'type', 'subtype', 'deprecated', 'superseded_by'], {
    id: { type: 'string', enum: plan.intent_types.slice(), maxLength: 32 },
    domain: stringField(32, '^[a-z]+$'),
    type: { type: 'string', enum: plan.intent_types.slice(), maxLength: 32 },
    subtype: stringField(32, '^[a-z_]+$'),
    deprecated: { type: 'boolean' },
    superseded_by: stringField(32, '^[a-z_]*$')
  }, 'Intent taxonomy. domain > type > subtype. superseded_by is empty when current.');
}

function assertTransitive(plan) {
  const errors = [];
  function walk(fields) {
    (fields || []).forEach((f) => {
      if (f.since && f.since !== '1-0-0' && f.required && (f.default === undefined)) {
        errors.push(f.name + ' is required without a default after 1-0-0');
      }
    });
  }
  plan.events.forEach((e) => walk(e.fields));
  walk(plan.stage_fields);
  return errors;
}

function dictionary(plan) {
  const he = {
    decision_id: 'מזהה אקראי של ההחלטה. לא נגזר מתוכן.',
    policy_id: 'גרסת המנוע והסף, כסוג בלבד.',
    chosen_intent_type: 'הסוג שנבחר, או ריק.',
    propensity: '1 כשהמדיניות דטרמיניסטית.',
    deterministic: 'אמת כל עוד אין חקירה.',
    explore_epsilon: 'שיעור חקירה. הכותב כופה 0.',
    engine_feature_hash: 'גיבוב של אסימון המדיניות, לא של דואר.',
    engine_version: 'אסימון גרסה.',
    surface: 'המשטח.',
    local_day: 'היום המקומי של האדם.',
    tz_offset_bucket: 'דלי של שעת אזור, או לא ידוע.',
    weekday: 'יום בשבוע מקומי.',
    hour_bucket: 'דלי של שש שעות.',
    locale: 'דלי שפת ממשק.',
    candidates: 'עד חמישה סוגים, עם ציון מקוונט 0.05.',
    intent_type: 'סוג כוונה מהטקסונומיה.',
    target_system: 'המערכת שקיבלה את הסגירה.',
    confidence_bucket: 'דלי ביטחון.',
    latency_ms: 'מילישניות, עם תקרה.',
    negative: 'משוב שלילי מפורש. ברירת מחדל שקר.',
    specversion: 'גרסת CloudEvents.',
    id: 'מזהה UUIDv7 אקראי.',
    source: 'מקור: משטח ומזהה התקנה אקראי.',
    type: 'שם האירוע.',
    time: 'זמן מקומי עם היסט.',
    dataschema: 'כתובת הסכמה.',
    subject: 'מזהה הכוונה האקראי.',
    seq: 'מונה עולה לכל התקנה.'
  };
  const en = {
    decision_id: 'Random decision id. Not derived from content.',
    policy_id: 'Engine version and threshold, as a token.',
    chosen_intent_type: 'The type the policy chose, or empty.',
    propensity: '1 while the policy is deterministic.',
    deterministic: 'True while exploration is off.',
    explore_epsilon: 'Exploration rate. The writer forces 0.',
    engine_feature_hash: 'Hash of the policy token, not of mail.',
    engine_version: 'Version token.',
    surface: 'Surface token.',
    local_day: 'The person\'s local calendar day.',
    tz_offset_bucket: 'Whole-hour offset bucket, or unknown.',
    weekday: 'Local weekday.',
    hour_bucket: 'Six-hour local bucket.',
    locale: 'UI language bucket.',
    candidates: 'Up to five types, with a score quantized to 0.05.',
    intent_type: 'Intent type from the taxonomy.',
    target_system: 'System that received the close.',
    confidence_bucket: 'Confidence bucket.',
    latency_ms: 'Milliseconds, capped.',
    negative: 'Explicit negative feedback. Default false.',
    specversion: 'CloudEvents version.',
    id: 'Random UUIDv7.',
    source: 'Surface plus a random install id.',
    type: 'Event name.',
    time: 'Local time with a numeric offset.',
    dataschema: 'Schema URI.',
    subject: 'Random intent id.',
    seq: 'Monotonic counter per install.'
  };
  function lines(map, title) {
    const rows = ['## ' + title, '', '| Field | Why | Never |', '|---|---|---|'];
    Object.keys(map).forEach((k) => rows.push('| `' + k + '` | ' + map[k] + ' | Mail text, names, addresses, message ids. |'));
    return rows.join('\n');
  }
  return [
    '# Data dictionary / מילון נתונים',
    '',
    'Glance closes open loops. Gmail is where it starts today.',
    '',
    'Consent is required. Retention is ' + plan.retention_days + ' days. pii: none.',
    '',
    lines(en, 'English'),
    '',
    lines(he, 'עברית'),
    ''
  ].join('\n');
}

function databaseDoc(plan) {
  return [
    '# Database definition',
    '',
    'Glance closes open loops. Gmail is where it starts today.',
    '',
    'The event log is append-only. Readers upcast old rows in memory and do not rewrite them.',
    '',
    '## Store',
    '',
    '- IndexedDB database `glance-closed-intent-ledger`, object store `events`, key `id`.',
    '- Indexes: `time`, `type`, `engine_version`, `decision_id`, `source_id` (source + id, the dedupe key).',
    '- chrome.storage.local keeps settings and cursors only: opt-in, install uuid, seq, cap, retention, rolled counts.',
    '- A future server sink is not implemented.',
    '',
    '## Envelope',
    '',
    'CloudEvents 1.0. `seq` is an extension attribute. `type` is one of:',
    '',
    plan.events.map((e) => '- `' + e.type + '`').join('\n'),
    '',
    '## Retention',
    '',
    plan.retention_days + ' days, deleted by a chrome.alarms job after the counts are folded.',
    ''
  ].join('\n');
}

function jsdoc(plan) {
  return [
    '/** @typedef {string} GlanceIntentType */',
    '/** @typedef {\'high\'|\'medium\'|\'low\'|\'unknown\'} GlanceConfidence */',
    '/**',
    ' * CloudEvents 1.0 envelope for one ledger event.',
    ' * @typedef {object} GlanceLedgerEvent',
    ' * @property {\'1.0\'} specversion',
    ' * @property {string} id UUIDv7',
    ' * @property {string} source urn:glance:<surface>:<install_uuid>',
    ' * @property {string} type',
    ' * @property {string} time RFC3339 with a numeric offset',
    ' * @property {string} dataschema',
    ' * @property {string} subject intent id',
    ' * @property {number} seq',
    ' * @property {object} data',
    ' */',
    '/** Intent types: ' + plan.intent_types.join(', ') + ' */',
    ''
  ].join('\n');
}

function generate(plan) {
  const files = {};
  files['schemas/envelope.schema.json'] = envelopeSchema(plan);
  const decision = plan.events.find((e) => e.name === 'decision');
  files['schemas/decision.schema.json'] = dataSchema(plan, 'decision', decision.fields, decision.schema);
  files['schemas/stage.schema.json'] = dataSchema(plan, 'stage', plan.stage_fields, 'iglu:ai.theflow.glance/stage/jsonschema/1-0-0');
  files['schemas/taxonomy.schema.json'] = taxonomySchema(plan);
  files['types.js'] = jsdoc(plan);
  files['DATA-DICTIONARY.md'] = dictionary(plan);
  files['DATABASE-DEFINITION.md'] = databaseDoc(plan);
  return files;
}

function writeFiles(files) {
  Object.keys(files).forEach((rel) => {
    const p = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const body = typeof files[rel] === 'string' ? files[rel] : JSON.stringify(files[rel], null, 2) + '\n';
    fs.writeFileSync(p, body);
  });
}

function checkFiles(files) {
  const diffs = [];
  Object.keys(files).forEach((rel) => {
    const p = path.join(ROOT, rel);
    const body = typeof files[rel] === 'string' ? files[rel] : JSON.stringify(files[rel], null, 2) + '\n';
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== body) diffs.push(rel);
  });
  return diffs;
}

function loadPlan() {
  return parseYaml(fs.readFileSync(path.join(ROOT, 'tracking-plan.yaml'), 'utf8'));
}

function main() {
  const plan = loadPlan();
  const bad = assertTransitive(plan);
  if (bad.length) {
    console.error('FULL_TRANSITIVE failed');
    bad.forEach((b) => console.error(b));
    process.exit(1);
  }
  const files = generate(plan);
  if (process.argv.indexOf('--check') >= 0) {
    const diffs = checkFiles(files);
    if (diffs.length) {
      console.error('ledger drift: ' + diffs.join(', '));
      process.exit(1);
    }
    console.log('ledger contract ok');
    return;
  }
  writeFiles(files);
  console.log('wrote ' + Object.keys(files).length + ' ledger files');
}

module.exports = { parseYaml, loadPlan, generate, assertTransitive, tzBuckets, checkFiles };

if (require.main === module) main();
