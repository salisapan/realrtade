// A core file imported by the service worker is an ES module. Its const stays
// inside that module. Handlers read globalThis. This boots the real worker
// and requires every Flow binding the worker graph defines, because that is
// the set its handlers read. A read with no imported module (FlowIntent and
// the other || null plugs) is not this set.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');

const ROOT = path.join(__dirname, '..');
const ENTRY = path.join(ROOT, 'src', 'background.js');

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  let next = path.resolve(path.dirname(fromFile), spec);
  if (!next.endsWith('.js')) next += '.js';
  return next;
}

function workerFlowGlobals() {
  const seen = new Set();
  const graph = [];
  const stack = [ENTRY];
  while (stack.length) {
    const file = stack.pop();
    if (!file || seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    graph.push(file);
    const src = fs.readFileSync(file, 'utf8');
    const re = /import\s+(?:[^'"]+\s+from\s+)?['"](\.[^'"]+)['"]/g;
    let match;
    while ((match = re.exec(src))) {
      const next = resolveImport(file, match[1]);
      if (next) stack.push(next);
    }
  }
  const names = new Set();
  for (const file of graph) {
    const src = fs.readFileSync(file, 'utf8');
    for (const match of src.matchAll(/(?:const|let|var)\s+(Flow[A-Za-z0-9]+)\s*=/g)) names.add(match[1]);
    for (const match of src.matchAll(/globalThis\.(Flow[A-Za-z0-9]+)\s*=/g)) names.add(match[1]);
  }
  return Array.from(names).sort();
}

test('the worker exposes every global its handlers read', async ({ glance }) => {
  const names = workerFlowGlobals();
  expect(names).toEqual(expect.arrayContaining([
    'FlowGoogleCloses',
    'FlowStyle',
    'FlowGraphMail',
    'FlowOutlook',
    'FlowOutlookSync',
    'FlowFullDocumentClose'
  ]));
  const missing = await glance.evaluateWorker((list) => {
    return list.filter((name) => globalThis[name] == null);
  }, names);
  expect(missing).toEqual([]);
});
