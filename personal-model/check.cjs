'use strict';
// Drift check. Every field must declare purpose, consent, pii, half-life, and third_party.
// node personal-model/check.cjs
const fs = require('fs');
const path = require('path');
const { loadContract, missingMeta, generate, checkFiles, META } = require('./generate.cjs');

const plan = loadContract();
const bad = missingMeta(plan);
if (bad.length) {
  console.error('personal-model metadata failed');
  bad.forEach((line) => console.error(line));
  process.exit(1);
}
const diffs = checkFiles(generate(plan));
if (diffs.length) {
  console.error('personal-model drift: ' + diffs.join(', '));
  console.error('run: node personal-model/generate.cjs');
  process.exit(1);
}
const schemaDir = path.join(__dirname, 'schemas');
fs.readdirSync(schemaDir).filter((name) => name.endsWith('.json')).forEach((name) => {
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8'));
  if (schema.additionalProperties !== false) {
    console.error(name + ' allows extra properties');
    process.exit(1);
  }
  Object.keys(schema.properties || {}).forEach((key) => {
    const prop = schema.properties[key];
    if (prop.type === 'string' && !prop.maxLength && !prop.const && !prop.enum) {
      console.error(name + ' ' + key + ' has no maxLength');
      process.exit(1);
    }
  });
});
const mutant = { objects: [{ name: 'fact', fields: [{ name: 'mail', required: true }] }], categories: plan.categories, pii_levels: plan.pii_levels };
const mutantErrors = missingMeta(mutant);
if (mutantErrors.length < META.length) {
  console.error('metadata check did not reject a field with no purpose');
  process.exit(1);
}
const weights = plan.tie_weights || {};
const sum = Number(weights.recency) + Number(weights.frequency) + Number(weights.reciprocity);
if (Math.abs(sum - 1) > 0.001) {
  console.error('tie weights must sum to 1');
  process.exit(1);
}
if (Number(plan.holdout_percent) !== 10) {
  console.error('holdout must stay 10');
  process.exit(1);
}
if (plan.bandit_enabled !== false && plan.bandit_enabled !== 'false') {
  console.error('bandit default must stay off');
  process.exit(1);
}
console.log('personal-model contract ok');
