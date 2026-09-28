// background.js is the extension service worker (manifest "type": "module"),
// so it imports config/oauth.public.js. These corpora evaluate it as a
// classic script inside vm, which cannot take that import. Load the public
// config in the same script and drop the one import line. The service
// worker itself stays a module.

const fs = require('fs');
const path = require('path');

const IMPORT_LINE = /^import \{ OAUTH_PUBLIC, publicClientId \} from '\.\.\/config\/oauth\.public\.js';\r?\n/m;

function backgroundScript() {
  const root = path.join(__dirname, '..');
  const oauth = fs.readFileSync(path.join(root, 'config', 'oauth.public.js'), 'utf8')
    .replace(/^export const /m, 'const ')
    .replace(/^export function /m, 'function ');
  const bg = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8').replace(IMPORT_LINE, '');
  if (/^\s*import\s/m.test(bg)) {
    throw new Error('background.js has an import the corpus harness does not load');
  }
  return oauth + '\n' + bg;
}

module.exports = { backgroundScript };
