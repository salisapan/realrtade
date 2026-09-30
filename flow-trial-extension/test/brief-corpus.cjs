// brief.js corpus — the Morning Brief panel's rendering contract.
//
// brief.js had no tests. It is pure DOM, which is exactly why it went
// untested and exactly why the one piece of real logic in it is worth
// pinning: the panel truncates. A truncation bug here does not throw, it
// just quietly shows the user less work than they have — the same class of
// silent-omission failure the storage layer's own corpus exists to prevent.
//
// The DOM stub below is deliberately the smallest thing brief.js actually
// uses (createElement / appendChild / removeChild / replaceChildren /
// textContent / className). If brief.js ever starts reaching for more, this
// fails loudly rather than pretending to have exercised it.

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
    href: '',
    disabled: false,
    children: [],
    parentNode: null,
    attrs: {},
    listeners: {},
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    replaceChildren(...cs) { this.children = cs; for (const c of cs) c.parentNode = this; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); }
  };
}
const body = makeNode('body');
const documentStub = { body, createElement: (t) => makeNode(t) };

const sandbox = { module: undefined, console, document: documentStub };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'brief.js'), 'utf8'), sandbox, { filename: 'brief.js' });
const FlowBrief = vm.runInContext('FlowBrief', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// Walk the rendered tree for nodes of a given class.
function find(node, cls, out) {
  out = out || [];
  if (String(node.className || '').split(/\s+/).includes(cls)) out.push(node);
  for (const c of node.children) find(c, cls, out);
  return out;
}
function panel() { return body.children.find((n) => n.id === 'flow-brief-panel-host'); }
function makeRows(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'm' + i, title: 'Process ' + i, subtitle: 'from someone',
    onDoIt() {}, onDismiss() {}
  }));
}

console.log('\n--- brief.js: a short list renders in full ---\n');
{
  FlowBrief.openPanel(makeRows(3), {});
  check('three pending items render three rows', find(panel(), 'flow-brief-row').length === 3);
  check('no remainder line when nothing is hidden', find(panel(), 'flow-brief-panel-more').length === 0);
  FlowBrief.closePanel();
}

console.log('\n--- brief.js: a long list is capped, and says so ---\n');
{
  // storage.js can now legitimately hand this 200+ items. A panel called a
  // Brief that renders every one of them is a backlog you scroll past.
  FlowBrief.openPanel(makeRows(60), {});
  const rows = find(panel(), 'flow-brief-row');
  check('the panel caps what it renders', rows.length === 12, rows.length);
  // Rows arrive oldest-still-open first, so the kept 12 must be 0..11 —
  // truncating from the wrong end would hide exactly the work most likely
  // to have been genuinely forgotten.
  const titles = rows.map((r) => (find(r, 'flow-chip-process-name')[0] || {}).textContent);
  check('the oldest-still-open items are the ones kept',
    titles.join('|') === makeRows(12).map((r) => r.title).join('|'), titles);
  const more = find(panel(), 'flow-brief-panel-more');
  check('and it states plainly how many are not shown', more.length === 1, more.length);
  check('the remainder count is right (60 - 12 = 48)',
    more[0] && /\b48 more still open\b/.test(more[0].textContent), more[0] && more[0].textContent);
  FlowBrief.closePanel();
}

console.log('\n--- brief.js: the boundary ---\n');
{
  FlowBrief.openPanel(makeRows(12), {});
  check('exactly 12 renders all 12 with no remainder line',
    find(panel(), 'flow-brief-row').length === 12 && find(panel(), 'flow-brief-panel-more').length === 0);
  FlowBrief.closePanel();

  FlowBrief.openPanel(makeRows(13), {});
  const more = find(panel(), 'flow-brief-panel-more');
  check('13 renders 12 and reports exactly one hidden, in the singular',
    find(panel(), 'flow-brief-row').length === 12 && more.length === 1 && /^1 more still open\b/.test(more[0].textContent),
    more[0] && more[0].textContent);
  FlowBrief.closePanel();
}

console.log('\n--- brief.js: the indicator never rounds the truth down ---\n');
{
  // The panel may show 12 of 60. The count behind it may not — that number
  // is the user's only honest picture of how much is actually open.
  FlowBrief.show(60, () => {});
  const ind = body.children.find((n) => n.id === 'flow-brief-indicator-host');
  check('the indicator shows the full pending count, not the capped one',
    ind && ind.textContent === '60 things still open', ind && ind.textContent);
  FlowBrief.show(1, () => {});
  check('and reads naturally in the singular', ind.textContent === '1 thing still open', ind.textContent);
  FlowBrief.hide();
  check('hide() removes it outright — nothing pending is silence, not an empty widget',
    !body.children.some((n) => n.id === 'flow-brief-indicator-host'));
}

console.log('\n--- brief.js: opening twice does not stack panels ---\n');
{
  FlowBrief.openPanel(makeRows(2), {});
  FlowBrief.openPanel(makeRows(2), {});
  check('only one panel is ever in the DOM',
    body.children.filter((n) => n.id === 'flow-brief-panel-host').length === 1);
  FlowBrief.closePanel();
  check('closePanel removes it', !FlowBrief.isPanelOpen());
}

console.log('\n--- brief.js: showResurface renders a single labeled row ---\n');
{
  function fire(node, evt) { (node.listeners[evt] || []).forEach((fn) => fn()); }
  function resurfaceHost() { return body.children.find((n) => n.id === 'flow-resurface-host'); }

  let didDoIt = false;
  FlowBrief.showResurface({ id: 'r1', title: 'Reply & Track', subtitle: 'Dana — re: invoice', onDoIt: () => { didDoIt = true; }, onDismiss: () => {} });
  const host = resurfaceHost();
  check('mounts exactly one resurface host', Boolean(host));
  check('carries the "still open" label', find(host, 'flow-resurface-label').length === 1);
  check('renders exactly one row', find(host, 'flow-brief-row').length === 1);
  check('the row shows the process name', find(host, 'flow-chip-process-name')[0].textContent === 'Reply & Track');

  const doIt = find(host, 'flow-brief-doit')[0];
  fire(doIt, 'click');
  check('clicking Do It on the resurfaced row calls its own onDoIt', didDoIt === true);
  FlowBrief.hideResurface();
}

console.log('\n--- brief.js: showResurface replaces, never stacks ---\n');
{
  FlowBrief.showResurface({ id: 'r1', title: 'First', onDoIt: () => {}, onDismiss: () => {} });
  FlowBrief.showResurface({ id: 'r2', title: 'Second', onDoIt: () => {}, onDismiss: () => {} });
  const hosts = body.children.filter((n) => n.id === 'flow-resurface-host');
  check('exactly one resurface card exists at a time', hosts.length === 1, hosts.length);
  check('the second call’s row is what’s actually shown', find(hosts[0], 'flow-chip-process-name')[0].textContent === 'Second');
  FlowBrief.hideResurface();
}

console.log('\n--- brief.js: hideResurface removes it outright ---\n');
{
  FlowBrief.showResurface({ id: 'r1', title: 'X', onDoIt: () => {}, onDismiss: () => {} });
  FlowBrief.hideResurface();
  check('hideResurface leaves nothing in the DOM', !body.children.some((n) => n.id === 'flow-resurface-host'));
  let threw = null;
  try { FlowBrief.hideResurface(); } catch (e) { threw = e.message; }
  check('calling it again with nothing mounted does not throw', threw === null, threw);
}

console.log('\n--- brief.js: the global hide() also clears an active resurface card ---\n');
{
  FlowBrief.show(1, () => {});
  FlowBrief.showResurface({ id: 'r1', title: 'X', onDoIt: () => {}, onDismiss: () => {} });
  FlowBrief.hide();
  check('hide() (watching stopped / nothing pending) tears down the resurface card too',
    !body.children.some((n) => n.id === 'flow-resurface-host'));
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
