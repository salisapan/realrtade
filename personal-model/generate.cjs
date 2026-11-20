'use strict';
// Generate JSON Schemas, JSDoc, and the Hebrew/English dictionary from contract.yaml.
// node personal-model/generate.cjs
// node personal-model/generate.cjs --check
const fs = require('fs');
const path = require('path');
const { parseYaml } = require('../ledger/generate.cjs');

const ROOT = __dirname;
const META = ['purpose', 'purpose_he', 'consent_category', 'pii', 'half_life_days', 'retention_days', 'third_party'];

function unquote(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (typeof v === 'number') return v;
  return v;
}

function loadContract() {
  const plan = parseYaml(fs.readFileSync(path.join(ROOT, 'contract.yaml'), 'utf8'));
  plan.categories = (plan.categories || []).map(unquote);
  plan.pii_levels = (plan.pii_levels || []).map(unquote);
  plan.sources = (plan.sources || []).map(unquote);
  plan.predicates = (plan.predicates || []).map(unquote);
  plan.languages = (plan.languages || []).map(unquote);
  plan.audiences = (plan.audiences || []).map(unquote);
  (plan.objects || []).forEach((obj) => {
    (obj.fields || []).forEach((field) => {
      ['required', 'third_party'].forEach((key) => {
        if (field[key] === 'true') field[key] = true;
        if (field[key] === 'false') field[key] = false;
      });
      ['half_life_days', 'retention_days', 'max_length'].forEach((key) => {
        if (typeof field[key] === 'string' && /^-?\d+$/.test(field[key])) field[key] = Number(field[key]);
      });
    });
  });
  return plan;
}

function missingMeta(plan) {
  const errors = [];
  (plan.objects || []).forEach((obj) => {
    (obj.fields || []).forEach((field) => {
      META.forEach((key) => {
        if (field[key] === undefined || field[key] === '') errors.push((obj.name || '?') + '.' + (field.name || '?') + ' missing ' + key);
      });
      if (field.purpose && plan.categories.indexOf(field.consent_category) < 0) {
        errors.push(field.name + ' bad consent_category');
      }
      if (field.pii && plan.pii_levels.indexOf(field.pii) < 0) errors.push(field.name + ' bad pii');
      if (typeof field.half_life_days !== 'number') errors.push(field.name + ' half_life_days');
      if (typeof field.retention_days !== 'number') errors.push(field.name + ' retention_days');
      if (typeof field.third_party !== 'boolean') errors.push(field.name + ' third_party');
    });
  });
  return errors;
}

const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const TOKEN = '^[A-Za-z0-9\\u0590-\\u05FF][A-Za-z0-9\\u0590-\\u05FF _.:@+-]{0,253}$';

function stringField(max, pattern) {
  const s = { type: 'string', maxLength: max || 80 };
  if (pattern) s.pattern = pattern;
  return s;
}

function propFor(field, plan) {
  const max = field.max_length || 80;
  if (field.type === 'uuid') return stringField(36, UUID);
  if (field.type === 'predicate') return { type: 'string', enum: plan.predicates.slice(), maxLength: 64 };
  if (field.type === 'category') return { type: 'string', enum: plan.categories.slice(), maxLength: 16 };
  if (field.type === 'source') return { type: 'string', enum: plan.sources.slice(), maxLength: 16 };
  if (field.type === 'lang') return { type: 'string', enum: plan.languages.slice(), maxLength: 8 };
  if (field.type === 'audience') return { type: 'string', enum: plan.audiences.slice(), maxLength: 16 };
  if (field.type === 'boolean') return { type: 'boolean' };
  if (field.type === 'number') return { type: 'number', minimum: 0, maximum: 1 };
  if (field.type === 'integer') return { type: 'integer', minimum: 0, maximum: 1000000 };
  if (field.type === 'time') return stringField(40, '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{3})?Z$');
  return stringField(max, TOKEN);
}

function objectSchema(plan, obj) {
  const properties = {};
  const required = [];
  (obj.fields || []).forEach((field) => {
    properties[field.name] = propFor(field, plan);
    properties[field.name].description = field.purpose;
    if (field.required === true) required.push(field.name);
  });
  if (obj.name === 'fact') {
    properties.evidence = {
      type: 'array',
      maxItems: 8,
      description: 'Pointers only. No mail body.',
      items: { $ref: 'evidence.schema.json' }
    };
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'iglu:ai.theflow.glance/personal-' + obj.name + '/jsonschema/1-0-0',
    description: obj.purpose || obj.name,
    type: 'object',
    additionalProperties: false,
    required: required,
    properties: properties
  };
}

function dictionary(plan) {
  function lines(lang) {
    const rows = ['## ' + (lang === 'he' ? 'עברית' : 'English'), '', '| Field | Why | Category | PII | Half-life days | Third party |', '|---|---|---|---|---|---|'];
    (plan.objects || []).forEach((obj) => {
      (obj.fields || []).forEach((field) => {
        const why = lang === 'he' ? field.purpose_he : field.purpose;
        rows.push('| `' + obj.name + '.' + field.name + '` | ' + why + ' | ' + field.consent_category + ' | ' + field.pii + ' | ' + field.half_life_days + ' | ' + field.third_party + ' |');
      });
    });
    return rows.join('\n');
  }
  return [
    '# Data dictionary / מילון נתונים',
    '',
    'Glance closes open loops. Gmail is where it starts today.',
    '',
    'The personal model is on this computer. Consent is off until the person turns a category on. A user-confirmed fact has confidence 1 and does not decay.',
    '',
    'Tie strength = 0.45 recency + 0.35 frequency + 0.20 reciprocity. Recency half-life is 30 days. Frequency caps at 20 observations.',
    '',
    lines('en'),
    '',
    lines('he'),
    ''
  ].join('\n');
}

function jsdoc(plan) {
  const lines = [
    '/** @typedef {\'people\'|\'habits\'|\'style\'|\'work\'|\'places\'|\'identity\'} GlancePersonalCategory */',
    '/** @typedef {\'observed\'|\'inferred\'|\'user_stated\'} GlancePersonalSource */',
    '/**',
    ' * One bi-temporal personal-model fact. Updates insert a new id.',
    ' * @typedef {object} GlancePersonalFact',
    ' * @property {string} id',
    ' * @property {string} subject_id',
    ' * @property {string} predicate',
    ' * @property {string} object',
    ' * @property {GlancePersonalSource} source',
    ' * @property {number} confidence',
    ' * @property {string} valid_from',
    ' * @property {string} [valid_to]',
    ' * @property {string} learned_at',
    ' * @property {string} [retired_at]',
    ' * @property {GlancePersonalCategory} consent_category',
    ' * @property {string} schema_ver',
    ' */',
    '/** Predicates: ' + plan.predicates.join(', ') + ' */',
    ''
  ];
  return lines.join('\n');
}

function generate(plan) {
  const files = {};
  (plan.objects || []).forEach((obj) => {
    files['schemas/' + obj.name + '.schema.json'] = objectSchema(plan, obj);
  });
  files['types.js'] = jsdoc(plan);
  files['DATA-DICTIONARY.md'] = dictionary(plan);
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

function main() {
  const plan = loadContract();
  const bad = missingMeta(plan);
  if (bad.length) {
    console.error('personal-model contract metadata failed');
    bad.forEach((line) => console.error(line));
    process.exit(1);
  }
  const files = generate(plan);
  if (process.argv.indexOf('--check') >= 0) {
    const diffs = checkFiles(files);
    if (diffs.length) {
      console.error('personal-model drift: ' + diffs.join(', '));
      process.exit(1);
    }
    console.log('personal-model contract ok');
    return;
  }
  writeFiles(files);
  console.log('wrote ' + Object.keys(files).length + ' personal-model files');
}

module.exports = { loadContract, missingMeta, generate, checkFiles, META };

if (require.main === module) main();
