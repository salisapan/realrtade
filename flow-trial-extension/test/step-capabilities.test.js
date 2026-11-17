// FlowStepCaps: schema, refusal copy, and the corpus the registry must cover.
// Does not load the service worker. Run: nice node test/step-capabilities.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowStepCaps } = require('../core/step-capabilities.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const BANNED_ACTION = /send|forward|delete/;

function objectGaps(node, at, gaps) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => objectGaps(child, at + '/' + i, gaps));
    return;
  }
  const types = Array.isArray(node.type) ? node.type : (node.type ? [node.type] : []);
  if (types.indexOf('object') >= 0 && node.additionalProperties !== false) gaps.push(at || '#');
  Object.keys(node).forEach((key) => objectGaps(node[key], at + '/' + key, gaps));
}

const DRAFT07 = {
  type: 1, additionalProperties: 1, required: 1, properties: 1, enum: 1,
  maxLength: 1, items: 1, maxItems: 1, minimum: 1, anyOf: 1
};

function structuralDraft07(schema) {
  const problems = [];
  function walk(node, at) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, i) => walk(child, at + '/' + i)); return; }
    const keys = Object.keys(node);
    const isSchema = keys.some((key) => DRAFT07[key]);
    if (!isSchema) return;
    keys.forEach((key) => { if (!DRAFT07[key]) problems.push(at + ' unknown keyword ' + key); });
    if (node.type && typeof node.type === 'string' && ['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'].indexOf(node.type) < 0) {
      problems.push(at + ' bad type');
    }
    if (node.enum && (!Array.isArray(node.enum) || node.enum.length < 1)) problems.push(at + ' empty enum');
    if (node.required && node.properties) {
      node.required.forEach((name) => {
        if (!Object.prototype.hasOwnProperty.call(node.properties, name)) problems.push(at + ' required ' + name);
      });
    }
    keys.forEach((key) => walk(node[key], at + '/' + key));
  }
  let serial = null;
  try { serial = JSON.parse(JSON.stringify(schema)); } catch (e) { problems.push('not JSON'); }
  walk(serial, '#');
  return problems;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log('--- 2 no send ---');
const actions = FlowStepCaps.CAPS.map((row) => row.action);
check('2 no cap action matches /send|forward|delete/', actions.every((action) => !BANNED_ACTION.test(action)), actions);
check('2 every cap has undo === true', FlowStepCaps.CAPS.every((row) => row.undo === true));
check('2 registry is frozen', Object.isFrozen(FlowStepCaps.CAPS) && FlowStepCaps.CAPS.every((row) => Object.isFrozen(row) && Object.isFrozen(row.scopes) && Object.isFrozen(row.args)));
check('2 find does not invent a send', FlowStepCaps.find('gmailDraft', 'send') === null && FlowStepCaps.find('outlookDraft', 'forward') === null && FlowStepCaps.find('driveFile', 'delete') === null);

console.log('--- 3 schema ---');
const one = FlowStepCaps.jsonSchema(['outlookTask']);
const connectorEnum = one.properties.ops.items.properties.connector.enum;
const actionEnum = one.properties.ops.items.properties.action.enum;
check('3 connector enum is only outlookTask', same(connectorEnum, ['outlookTask']), connectorEnum);
check('3 action enum is only that cap', same(actionEnum, ['create']), actionEnum);
const gaps = [];
objectGaps(one, '#', gaps);
check('3 additionalProperties false at every object level', gaps.length === 0, gaps);
let schemaHow = 'structural';
let schemaProblems = [];
try {
  const Ajv = require('ajv');
  const ajv = new (Ajv.default || Ajv)({ strict: false, allErrors: true });
  ajv.compile(one);
  schemaHow = 'ajv';
} catch (e) {
  if (e && e.code === 'MODULE_NOT_FOUND') schemaProblems = structuralDraft07(one);
  else schemaProblems = [String(e && e.message || e)];
}
check('3 schema is valid JSON Schema (' + schemaHow + ')', schemaProblems.length === 0, schemaProblems);
check('3 args for the granted cap only', same(Object.keys(one.properties.ops.items.properties.args.properties), ['title', 'due']));

console.log('--- 4 schema vs corpus ---');
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'corpus.json'), 'utf8'));
const missed = [];
const badMissing = [];
(corpus.items || []).forEach((item) => {
  const expected = item.expected || {};
  (expected.ops || []).forEach((op) => {
    if (!op || !op.connector || !op.action) return;
    if (!FlowStepCaps.find(op.connector, op.action)) missed.push(item.id + ' ' + op.connector + '/' + op.action);
  });
  if (expected.missing && !Object.prototype.hasOwnProperty.call(FlowStepCaps.NOT_AVAILABLE, expected.missing)) {
    badMissing.push(item.id + ' ' + expected.missing);
  }
});
check('4 every corpus op connector/action is in the registry', missed.length === 0, missed);
check('4 every corpus missing id is a NOT_AVAILABLE key', badMissing.length === 0, badMissing);
check('4 corpus has the 74 items', (corpus.items || []).length === 74);

console.log('--- 5 determinism ---');
const grant = ['gmailDraft', 'outlookTask', 'driveFile', 'calendar'];
const forward = FlowStepCaps.jsonSchema(grant);
const reverse = FlowStepCaps.jsonSchema(grant.slice().reverse());
const again = FlowStepCaps.jsonSchema(grant.slice());
check('5 jsonSchema is deep-equal across two calls', same(forward, again));
check('5 jsonSchema is independent of input order', same(forward, reverse));
const grantedForward = FlowStepCaps.forGranted(grant).map((row) => row.connector);
const grantedReverse = FlowStepCaps.forGranted(grant.slice().reverse()).map((row) => row.connector);
check('5 forGranted is independent of input order', same(grantedForward, grantedReverse) && same(grantedForward, ['outlookTask', 'calendar', 'gmailDraft', 'driveFile']));
check('5 forGranted drops ids that are not caps', same(FlowStepCaps.forGranted(['outlookTask', 'slack', 'outlookTask']).map((row) => row.connector), ['outlookTask']));
check('5 an empty grant describes no caps', FlowStepCaps.forGranted([]).length === 0 && FlowStepCaps.jsonSchema([]).properties.ops.items.properties.connector.enum.length === 0);

console.log('--- 6 he/en copy ---');
const copyProblems = [];
Object.keys(FlowStepCaps.NOT_AVAILABLE).forEach((id) => {
  const row = FlowStepCaps.NOT_AVAILABLE[id];
  ['en', 'he'].forEach((lang) => {
    const text = row && row[lang];
    if (typeof text !== 'string' || text.length < 1 || text.length > 90) copyProblems.push(id + ' ' + lang + ' ' + (text ? text.length : 0));
    if (FlowStepCaps.refusal(id, lang) !== text) copyProblems.push(id + ' refusal ' + lang);
  });
});
check('6 every NOT_AVAILABLE entry has non-empty he and en, each ≤ 90 chars', copyProblems.length === 0, copyProblems);
check('6 an unknown refusal id is null', FlowStepCaps.refusal('not-a-capability', 'en') === null && FlowStepCaps.refusal('not-a-capability', 'he') === null);
check('6 the map is frozen', Object.isFrozen(FlowStepCaps.NOT_AVAILABLE));

if (failures) { console.log('\n' + failures + ' FAILED'); process.exit(1); }
console.log('\nstep-capabilities: all checks passed');
