'use strict';
// Drift check plus FULL_TRANSITIVE. node ledger/check.cjs
const { loadPlan, generate, assertTransitive, checkFiles } = require('./generate.cjs');
const fs = require('fs');
const path = require('path');

const plan = loadPlan();
const bad = assertTransitive(plan);
if (bad.length) {
  console.error('FULL_TRANSITIVE failed');
  bad.forEach((line) => console.error(line));
  process.exit(1);
}
const diffs = checkFiles(generate(plan));
if (diffs.length) {
  console.error('ledger drift: ' + diffs.join(', '));
  console.error('run: node ledger/generate.cjs');
  process.exit(1);
}
const schemas = fs.readdirSync(path.join(__dirname, 'schemas')).filter((f) => f.endsWith('.json'));
schemas.forEach((name) => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas', name), 'utf8'));
  if (schema.additionalProperties !== false) {
    console.error(name + ' allows extra properties');
    process.exit(1);
  }
  Object.keys(schema.properties || {}).forEach((key) => {
    const prop = schema.properties[key];
    if (prop.type === 'string' && !prop.maxLength && !prop.const) {
      console.error(name + ' ' + key + ' has no maxLength');
      process.exit(1);
    }
  });
});
const mutant = { events: [{ fields: [{ name: 'mail', since: '2-0-0', required: true }] }], stage_fields: [] };
const mutantErrors = assertTransitive(mutant);
if (!mutantErrors.length) {
  console.error('FULL_TRANSITIVE did not reject a new required field');
  process.exit(1);
}
console.log('ledger contract ok');
