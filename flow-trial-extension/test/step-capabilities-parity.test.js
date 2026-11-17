// Parity: CAPS connectors are keys of both WRITERS and UNDOERS.
// Static parse of the two object literals. Does not load the service worker.
// Run: nice node test/step-capabilities-parity.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowStepCaps } = require('../core/step-capabilities.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function objectLiteral(src, name) {
  const re = new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\};');
  const match = src.match(re);
  return match ? match[1] : null;
}

function keysOf(block) {
  const cleaned = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const keys = [];
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  let match;
  while ((match = re.exec(cleaned))) keys.push(match[1]);
  return keys;
}

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
const writerBlock = objectLiteral(src, 'WRITERS');
const undoBlock = objectLiteral(src, 'UNDOERS');
const writerKeys = writerBlock ? keysOf(writerBlock) : [];
const undoKeys = undoBlock ? keysOf(undoBlock) : [];
const undoSet = new Set(undoKeys);
const writerSet = new Set(writerKeys);
const both = writerKeys.filter((key) => undoSet.has(key));
const writersWithoutUndo = writerKeys.filter((key) => !undoSet.has(key));
const capsMissing = FlowStepCaps.CAPS.map((row) => row.connector).filter((id) => !writerSet.has(id) || !undoSet.has(id));

console.log('PARITY writable and undoable: ' + both.join(', '));

console.log('--- 1 parity ---');
check('1 both object literals were found', writerKeys.length > 0 && undoKeys.length > 0, { writers: writerKeys.length, undoers: undoKeys.length });
check('1 every writer has an undoer', writersWithoutUndo.length === 0, writersWithoutUndo);
check('1 every cap connector is a key of both WRITERS and UNDOERS', capsMissing.length === 0, capsMissing);

if (failures) { console.log('\n' + failures + ' FAILED'); process.exit(1); }
console.log('\nstep-capabilities parity: all checks passed');
