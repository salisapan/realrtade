// weekly.js corpus — the Weekly Closing Summary banner's rendering contract.
//
// Same reasoning as brief-corpus.cjs: this is pure DOM, which is exactly
// what tends to go untested, and the one piece of real logic worth pinning
// here is that the banner honestly reflects whatever { closed, open } it's
// handed — including the cases where one of the two is zero, which must
// drop that line and (for `open`) its action button entirely rather than
// rendering "0 things are still open."
//
// Uses the identical minimal DOM stub as brief-corpus.cjs.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeNode(tag) {
  return {
    tagName: tag,
    className: '',
    id: '',
    type: '',
    textContent: '',
    children: [],
    parentNode: null,
    attrs: {},
    listeners: {},
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); }
  };
}
const body = makeNode('body');
const documentStub = { body, createElement: (t) => makeNode(t) };

const sandbox = { module: undefined, console, document: documentStub };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'weekly.js'), 'utf8'), sandbox, { filename: 'weekly.js' });
const FlowWeekly = vm.runInContext('FlowWeekly', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function find(node, cls, out) {
  out = out || [];
  if (String(node.className || '').split(/\s+/).includes(cls)) out.push(node);
  for (const c of node.children) find(c, cls, out);
  return out;
}
function banner() { return body.children.find((n) => n.id === 'flow-weekly-host'); }
function fire(node, evt) { (node.listeners[evt] || []).forEach((fn) => fn()); }

console.log('--- weekly.js: both numbers present ---\n');
{
  let openedList = false;
  FlowWeekly.showSummary({ closed: 3, open: 2 }, { onOpenList: () => { openedList = true; } });
  const lines = find(body, 'flow-weekly-line').map((n) => n.textContent);
  check('renders the closed line with the right count', lines.includes('Glance closed 3 things for you this week.'), lines);
  check('renders the open line with the right count', lines.includes('2 things are still open.'), lines);
  const openBtn = find(body, 'flow-weekly-link')[0];
  check('an open count > 0 shows the "See what’s open" action', Boolean(openBtn), openBtn);
  fire(openBtn, 'click');
  check('clicking it calls onOpenList', openedList === true);
  check('...and removes the banner', banner() === undefined);
}

console.log('\n--- weekly.js: singular phrasing ---\n');
{
  FlowWeekly.showSummary({ closed: 1, open: 1 }, {});
  const lines = find(body, 'flow-weekly-line').map((n) => n.textContent);
  check('one closed thing is singular, not "1 things"', lines.includes('Glance closed 1 thing for you this week.'), lines);
  check('one open thing uses "is", not "are"', lines.includes('1 thing is still open.'), lines);
  FlowWeekly.hide();
}

console.log('\n--- weekly.js: closed-only (nothing still open) ---\n');
{
  FlowWeekly.showSummary({ closed: 4, open: 0 }, {});
  const lines = find(body, 'flow-weekly-line').map((n) => n.textContent);
  check('shows the closed line', lines.some((l) => l.indexOf('closed 4') !== -1), lines);
  check('does not render a false "0 things are still open" line', !lines.some((l) => l.indexOf('still open') !== -1), lines);
  check('with nothing open, there is no "See what’s open" button', find(body, 'flow-weekly-link').length === 0);
  FlowWeekly.hide();
}

console.log('\n--- weekly.js: open-only (nothing closed this week) ---\n');
{
  FlowWeekly.showSummary({ closed: 0, open: 5 }, {});
  const lines = find(body, 'flow-weekly-line').map((n) => n.textContent);
  check('does not render a false "closed 0 things" line', !lines.some((l) => l.indexOf('closed') !== -1), lines);
  check('shows the open line', lines.some((l) => l.indexOf('5 things') !== -1), lines);
  check('an open count > 0 still shows the action button', find(body, 'flow-weekly-link').length === 1);
  FlowWeekly.hide();
}

console.log('\n--- weekly.js: dismiss removes the banner and calls back ---\n');
{
  let dismissed = false;
  FlowWeekly.showSummary({ closed: 2, open: 1 }, { onDismiss: () => { dismissed = true; } });
  const x = find(body, 'flow-weekly-x')[0];
  fire(x, 'click');
  check('dismiss calls onDismiss', dismissed === true);
  check('...and removes the banner', banner() === undefined);
}

console.log('\n--- weekly.js: showing a second summary replaces the first, not stacks ---\n');
{
  FlowWeekly.showSummary({ closed: 1, open: 0 }, {});
  FlowWeekly.showSummary({ closed: 2, open: 0 }, {});
  const hosts = body.children.filter((n) => n.id === 'flow-weekly-host');
  check('exactly one banner exists at a time', hosts.length === 1, hosts.length);
  const lines = find(body, 'flow-weekly-line').map((n) => n.textContent);
  check('the second call’s numbers are what’s actually shown', lines.includes('Glance closed 2 things for you this week.'), lines);
  FlowWeekly.hide();
}

console.log('\n--- weekly.js: hide() is safe with nothing mounted ---\n');
{
  let threw = null;
  try { FlowWeekly.hide(); FlowWeekly.hide(); } catch (e) { threw = e.message; }
  check('calling hide() with nothing mounted does not throw', threw === null, threw);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
