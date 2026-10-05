// background.js is the extension service worker (manifest "type": "module"),
// so it imports config/oauth.public.js and src/google-web-auth.js. These
// corpora evaluate it as a classic script inside vm, which cannot take
// those imports. Load both modules in the same script and drop the import
// lines. The service worker itself stays a module.

const fs = require('fs');
const path = require('path');

function stripModuleSyntax(source) {
  return source
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ');
}

function backgroundScript() {
  const root = path.join(__dirname, '..');
  const oauth = stripModuleSyntax(fs.readFileSync(path.join(root, 'config', 'oauth.public.js'), 'utf8'));
  const webAuth = stripModuleSyntax(fs.readFileSync(path.join(root, 'src', 'google-web-auth.js'), 'utf8'));
  const bg = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8').replace(/^import .*;\r?\n/gm, '');
  if (/^\s*import\s/m.test(bg)) {
    throw new Error('background.js has an import the corpus harness does not load');
  }
  return oauth + '\n' + webAuth + '\n' + bg;
}

module.exports = { backgroundScript };
