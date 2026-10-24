// Scope the design-kit styles under .flow-step-card so a Gmail or Outlook
// page is not restyled. @font-face and @keyframes stay global. html[data-theme]
// becomes the card. Run: node design/step-states-v1/scope-css.cjs
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const SCOPE = '.flow-step-card';
const files = ['corner.css', 'corner-v19.css', 'corner-v20.css', 'step-states.css'];

function stash(css) {
  const held = [];
  const out = css.replace(/\/\*[\s\S]*?\*\//g, (m) => {
    held.push(m);
    return '\u0000' + (held.length - 1) + '\u0000';
  }).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) => {
    held.push(m);
    return '\u0000' + (held.length - 1) + '\u0000';
  });
  return { out: out, held: held };
}
function unstash(css, held) {
  return css.replace(/\u0000(\d+)\u0000/g, (_, n) => held[Number(n)]);
}

function scopeOne(raw) {
  let s = raw.trim();
  if (!s) return '';
  s = s.replace(/html\[data-theme=(["']?)dark\1\]/g, SCOPE + '[data-theme="dark"]');
  s = s.replace(/:root\b/g, SCOPE);
  s = s.replace(/^html:not\(\[data-theme="dark"\]\)\s+body\b/, SCOPE + ':not([data-theme="dark"])');
  if (s === 'html' || s === 'body') return SCOPE;
  if (/^(html|body)\b/.test(s) && s.indexOf(SCOPE) !== 0) s = s.replace(/^(html|body)\b/, SCOPE);
  if (s === '*') return SCOPE + ',' + SCOPE + ' *';
  if (s.indexOf(SCOPE) === 0) return s;
  return SCOPE + ' ' + s;
}

function scopeSelector(sel) {
  return sel.split(',').map(scopeOne).filter(Boolean).join(',');
}

function emitToken(text, j, result) {
  if (text[j] !== '\u0000') return { j: j, result: result };
  const end = text.indexOf('\u0000', j + 1);
  if (end < 0) return { j: text.length, result: result + text.slice(j) };
  return { j: end + 1, result: result + text.slice(j, end + 1) };
}

function scopeBlock(text) {
  let result = '';
  let j = 0;
  while (j < text.length) {
    while (j < text.length && (/\s/.test(text[j]) || text[j] === '\u0000')) {
      if (text[j] === '\u0000') {
        const step = emitToken(text, j, result);
        result = step.result;
        j = step.j;
      } else {
        result += text[j];
        j++;
      }
    }
    if (j >= text.length) break;
    if (text[j] === '@') {
      const start = j;
      let k = j;
      while (k < text.length && text[k] !== '{' && text[k] !== ';') k++;
      const prelude = text.slice(j, k).trim();
      if (text[k] === ';') {
        result += text.slice(start, k + 1);
        j = k + 1;
        continue;
      }
      if (text[k] !== '{') { result += text.slice(start); break; }
      let depth = 1;
      let p = k + 1;
      while (p < text.length && depth) {
        if (text[p] === '{') depth++;
        else if (text[p] === '}') depth--;
        p++;
      }
      const body = text.slice(k + 1, p - 1);
      const name = prelude.split(/[\s(]/)[0].toLowerCase();
      if (name === '@keyframes' || name === '@-webkit-keyframes' || name === '@font-face' || name === '@page') {
        result += prelude + '{' + body + '}';
      } else {
        result += prelude + '{' + scopeBlock(body) + '}';
      }
      j = p;
      continue;
    }
    const brace = text.indexOf('{', j);
    if (brace < 0) { result += text.slice(j); break; }
    const sel = text.slice(j, brace);
    let depth = 1;
    let p = brace + 1;
    while (p < text.length && depth) {
      if (text[p] === '{') depth++;
      else if (text[p] === '}') depth--;
      p++;
    }
    const body = text.slice(brace + 1, p - 1);
    const scoped = scopeSelector(sel);
    if (scoped) result += scoped + '{' + body + '}';
    j = p;
  }
  return result;
}

let css = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const packed = stash(css);
css = scopeBlock(packed.out).replace(/html\[data-theme=(["']?)dark\1\]/g, SCOPE + '[data-theme="dark"]');
css = unstash(css, packed.held);
css = '/* Glance step-states v1, scoped under .flow-step-card. Generated. Do not edit by hand. */\n' + css;
fs.writeFileSync(path.join(dir, 'scoped.css'), css);
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
if (/html\[data-theme/.test(code) || /^\.flow-step-card\s+\/\*/.test(css)) {
  console.error('scope check failed');
  process.exit(1);
}
console.log('scoped.css', css.length);
