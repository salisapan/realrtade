// AST lint for the Outlook paint gate. A card mutation is legal only inside
// a paintIfCurrent callback, or inside an entry painter that still refuses
// to draw when paintDepth is 0. Resolution is bindings, not source names.
const acorn = require('./vendor/acorn');

const ENTRY = new Set([
  'paintOutlookTodoReceipt', 'paintUndoneStatus', 'paintCalendarConsent',
  'paintTodoConsent', 'paintSuggestCard', 'paintSkippedOnly', 'injectCard',
  'paintRemove', 'paintCalendarFailure', 'paintHint', 'stripDuplicateUndoHosts'
]);
const HOST_NAMES = new Set(['host', 'mount', 'pane', 'verifyMount', 'earlyMount']);
const DOM_CALLS = new Set([
  'appendChild', 'insertBefore', 'replaceChildren', 'append', 'prepend', 'insertAdjacentHTML'
]);
const DOM_PROPS = new Set(['innerHTML', 'outerHTML']);
const INVOKE = new Set(['call', 'apply', 'bind']);

function lineOf(node) {
  return node && node.loc && node.loc.start ? node.loc.start.line : 0;
}

function unwrap(node) {
  let n = node;
  while (n && n.type === 'ChainExpression') n = n.expression;
  return n;
}

function propName(member) {
  if (!member || member.type !== 'MemberExpression') return null;
  if (!member.computed && member.property && member.property.type === 'Identifier') return member.property.name;
  const key = member.property;
  if (member.computed && key && key.type === 'Literal' && typeof key.value === 'string') return key.value;
  if (member.computed && key && key.type === 'TemplateLiteral' && key.expressions.length === 0) {
    return key.quasis.map((q) => q.value.cooked || '').join('');
  }
  if (member.computed) return '*';
  return null;
}

function eachChild(node, fn) {
  if (!node || typeof node !== 'object') return;
  Object.keys(node).forEach((key) => {
    if (key === 'type' || key === 'loc' || key === 'start' || key === 'end' || key === 'range' || key === 'sourceType') return;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((item) => { if (item && item.type) fn(item); });
    else if (child && child.type) fn(child);
  });
}

function exprHasDepth(node) {
  if (!node) return false;
  if (node.type === 'BinaryExpression' && node.operator === '<=' &&
      node.left && node.left.type === 'Identifier' && node.left.name === 'paintDepth' &&
      node.right && node.right.type === 'Literal' && node.right.value === 0) return true;
  if (node.type === 'LogicalExpression') return exprHasDepth(node.left) || exprHasDepth(node.right);
  return false;
}

function hasPaintDepthGuard(body) {
  if (!body || body.type !== 'BlockStatement') return false;
  let found = false;
  function scan(node) {
    if (!node || found) return;
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return;
    if (node.type === 'IfStatement' && exprHasDepth(node.test)) { found = true; return; }
    eachChild(node, scan);
  }
  eachChild(body, scan);
  return found;
}

function callsName(body, name) {
  if (!body) return false;
  let found = false;
  function scan(node) {
    if (!node || found) return;
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return;
    if (node.type === 'CallExpression') {
      const callee = unwrap(node.callee);
      if (callee && callee.type === 'Identifier' && callee.name === name) { found = true; return; }
    }
    eachChild(node, scan);
  }
  eachChild(body, scan);
  return found;
}

function lookup(scope, name) {
  for (let s = scope; s; s = s.parent) {
    if (s.bindings.has(name)) return s.bindings.get(name);
  }
  if (name === 'FlowChipHost') return { kind: 'chip-ns' };
  if (name === 'mountPoint') return { kind: 'mount-fn' };
  if (name === 'paintIfCurrent') return { kind: 'gate' };
  if (HOST_NAMES.has(name)) return { kind: 'host' };
  return null;
}

function resolveExpr(node, scope) {
  if (!node) return null;
  node = unwrap(node);
  if (node.type === 'Identifier') return lookup(scope, node.name);
  if (node.type === 'MemberExpression') {
    const obj = resolveExpr(node.object, scope);
    const name = propName(node);
    if (!obj) return null;
    if (obj.kind === 'chip-ns') return { kind: 'chip-fn', name: name || '*' };
    if (obj.kind === 'chip-fn' && INVOKE.has(name)) return { kind: 'chip-fn', name: obj.name, via: name };
    return null;
  }
  if (node.type === 'CallExpression') {
    const callee = unwrap(node.callee);
    const fn = callee ? resolveExpr(callee, scope) : null;
    if (fn && fn.kind === 'mount-fn') return { kind: 'host' };
    if (callee && callee.type === 'MemberExpression') {
      const obj = resolveExpr(callee.object, scope);
      const name = propName(callee);
      if (obj && obj.kind === 'chip-fn' && name === 'bind') return { kind: 'chip-fn', name: obj.name, via: 'bind' };
    }
    return null;
  }
  return null;
}

function classify(resolved) {
  if (resolved && (resolved.kind === 'chip-ns' || resolved.kind === 'chip-fn' || resolved.kind === 'host' || resolved.kind === 'mount-fn' || resolved.kind === 'gate')) return resolved;
  return { kind: 'other' };
}

function bindPattern(pattern, initKind, scope, isParam) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    let kind = { kind: 'other' };
    if (initKind && initKind.kind !== 'other') kind = initKind;
    else if (isParam && HOST_NAMES.has(pattern.name)) kind = { kind: 'host' };
    scope.bindings.set(pattern.name, kind);
    return;
  }
  if (pattern.type === 'AssignmentPattern') {
    bindPattern(pattern.left, initKind, scope, isParam);
    return;
  }
  if (pattern.type === 'RestElement') {
    bindPattern(pattern.argument, { kind: 'other' }, scope, false);
    return;
  }
  if (pattern.type === 'ObjectPattern') {
    const fromChip = initKind && initKind.kind === 'chip-ns';
    pattern.properties.forEach((prop) => {
      if (!prop) return;
      if (prop.type === 'RestElement') {
        bindPattern(prop.argument, { kind: 'other' }, scope, false);
        return;
      }
      const key = !prop.computed && prop.key && prop.key.type === 'Identifier'
        ? prop.key.name
        : (prop.computed && prop.key && prop.key.type === 'Literal' ? prop.key.value : null);
      const next = fromChip && typeof key === 'string' ? { kind: 'chip-fn', name: key } : { kind: 'other' };
      bindPattern(prop.value, next, scope, false);
    });
    return;
  }
  if (pattern.type === 'ArrayPattern') {
    pattern.elements.forEach((el) => { if (el) bindPattern(el, { kind: 'other' }, scope, false); });
  }
}

function setBinding(scope, name, kind) {
  for (let s = scope; s; s = s.parent) {
    if (s.bindings.has(name)) { s.bindings.set(name, kind); return; }
  }
  scope.bindings.set(name, kind);
}

function isFn(node) {
  return node && (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression');
}

function isGateCallee(callee, scope) {
  const node = unwrap(callee);
  if (!node || node.type !== 'Identifier') return false;
  const resolved = lookup(scope, node.name);
  return Boolean(resolved && resolved.kind === 'gate');
}

function isChipCall(callee, scope) {
  const node = unwrap(callee);
  const resolved = resolveExpr(node, scope);
  return Boolean(resolved && resolved.kind === 'chip-fn');
}

function isHostDomCall(node, scope) {
  const callee = unwrap(node.callee);
  if (!callee || callee.type !== 'MemberExpression') return null;
  const name = propName(callee);
  if (!name || name === '*' || !DOM_CALLS.has(name)) return null;
  const obj = resolveExpr(callee.object, scope);
  return obj && obj.kind === 'host' ? name : null;
}

function isHostDomAssign(node, scope) {
  const left = unwrap(node.left);
  if (!left || left.type !== 'MemberExpression') return null;
  const name = propName(left);
  if (!name || name === '*' || !DOM_PROPS.has(name)) return null;
  const obj = resolveExpr(left.object, scope);
  return obj && obj.kind === 'host' ? name : null;
}

function lintPaintGate(src) {
  let ast;
  try {
    ast = acorn.parse(src, {
      ecmaVersion: 2022,
      locations: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true
    });
  } catch (e) {
    return ['parse:' + (e && e.message ? e.message : String(e))];
  }
  const violations = [];

  function walkFunction(fn, scope, covered) {
    const fnScope = { parent: scope, bindings: new Map() };
    const name = fn.id && fn.id.name;
    if (name) fnScope.bindings.set(name, { kind: 'other' });
    (fn.params || []).forEach((param) => bindPattern(param, null, fnScope, true));
    let fnCovered = covered;
    if (name && ENTRY.has(name)) {
      if (!hasPaintDepthGuard(fn.body)) violations.push(lineOf(fn) + ':entry missing paintDepth guard');
      else fnCovered = true;
    }
    if (covered) fnCovered = true;
    if (name === 'paintIfCurrent' && !callsName(fn.body, 'mailTokenLive')) {
      violations.push(lineOf(fn) + ':paintIfCurrent missing mailTokenLive guard');
    }
    walk(fn.body, fnScope, fnCovered);
  }

  function walk(node, scope, covered) {
    if (!node || !node.type) return;
    if (isFn(node)) {
      walkFunction(node, scope, covered);
      return;
    }
    if (node.type === 'VariableDeclaration') {
      node.declarations.forEach((decl) => {
        if (decl.init) walk(decl.init, scope, covered);
        bindPattern(decl.id, decl.init ? classify(resolveExpr(decl.init, scope)) : { kind: 'other' }, scope, false);
      });
      return;
    }
    if (node.type === 'AssignmentExpression') {
      walk(node.right, scope, covered);
      walk(node.left, scope, covered);
      if (!covered) {
        const dom = isHostDomAssign(node, scope);
        if (dom) violations.push(lineOf(node) + ':card ' + dom);
      }
      if (node.left && node.left.type === 'Identifier') {
        setBinding(scope, node.left.name, classify(resolveExpr(node.right, scope)));
      }
      return;
    }
    if (node.type === 'CallExpression') {
      const gate = isGateCallee(node.callee, scope);
      if (!covered && isChipCall(node.callee, scope)) violations.push(lineOf(node) + ':FlowChipHost');
      if (!covered) {
        const dom = isHostDomCall(node, scope);
        if (dom) violations.push(lineOf(node) + ':card ' + dom);
      }
      walk(node.callee, scope, covered);
      (node.arguments || []).forEach((arg) => walk(arg, scope, gate && isFn(arg) ? true : covered));
      return;
    }
    eachChild(node, (child) => walk(child, scope, covered));
  }

  walk(ast, { parent: null, bindings: new Map() }, false);
  return violations;
}

module.exports = { lintPaintGate };
