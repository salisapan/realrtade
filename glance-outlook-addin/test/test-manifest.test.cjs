#!/usr/bin/env node
// The test-manifest script rewrites a copy. The committed manifest stays put.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const script = require('../scripts/test-manifest.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

const sourceBefore = fs.readFileSync(script.SOURCE);
const sourceText = sourceBefore.toString('utf8');
const base = 'https://tunnel.example';
const rewritten = script.rewriteManifest(sourceText, base);

function values(xml, re) {
  const found = [];
  xml.replace(re, function (m, val) { found.push(val); return m; });
  return found;
}

const sources = values(rewritten, /<SourceLocation\b[^>]*\bDefaultValue="([^"]*)"/g);
const taskpanes = values(rewritten, /<bt:Url\b[^>]*\bid="Taskpane\.Url"[^>]*\bDefaultValue="([^"]*)"/g);
const icons = values(rewritten, /<(?:IconUrl|HighResolutionIconUrl)\b[^>]*\bDefaultValue="([^"]*)"/g)
  .concat(values(rewritten, /<bt:Image\b[^>]*\bDefaultValue="([^"]*)"/g));
const domains = values(rewritten, /<AppDomain>([^<]*)<\/AppDomain>/g);

check('source locations use the tunnel and keep the add-in path',
  sources.length === 2 && sources.every((u) => u === base + '/glance-outlook-addin/src/taskpane.html'), sources);
check('task pane URLs use the tunnel',
  taskpanes.length === 2 && taskpanes.every((u) => u === base + '/glance-outlook-addin/src/taskpane.html'), taskpanes);
check('icon URLs use the tunnel apple-touch-icon',
  icons.length === 4 && icons.every((u) => u === base + '/apple-touch-icon.png'), icons);
check('AppDomain is the tunnel origin', domains.length === 1 && domains[0] === base, domains);
check('SupportUrl stays on the production privacy page',
  /<SupportUrl\b[^>]*DefaultValue="https:\/\/theflow-ai\.com\/privacy"/.test(rewritten));
check('manifest id is unchanged', rewritten.indexOf('<Id>87851e39-e51b-439a-bbf5-459ab69b3615</Id>') !== -1);
check('committed manifest bytes are unchanged after rewrite', fs.readFileSync(script.SOURCE).equals(sourceBefore));

const ported = script.rewriteManifest(sourceText, 'https://tunnel.example:8443/');
check('a port is kept on every rewritten URL and on AppDomain',
  ported.indexOf('https://tunnel.example:8443/glance-outlook-addin/src/taskpane.html') !== -1
  && ported.indexOf('<AppDomain>https://tunnel.example:8443</AppDomain>') !== -1
  && ported.indexOf('https://tunnel.example:8443/apple-touch-icon.png') !== -1);

function throws(fn) {
  try { fn(); return null; } catch (err) { return err.message || String(err); }
}
check('http is refused', /https/.test(throws(() => script.normalizeBase('http://tunnel.example')) || ''));
check('a path is refused', /path/.test(throws(() => script.normalizeBase('https://tunnel.example/preview')) || ''));
check('a query is refused', /query/.test(throws(() => script.normalizeBase('https://tunnel.example/?x=1')) || ''));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-test-manifest-'));
const out = path.join(tmp, 'sideload.xml');
const cli = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'test-manifest.js'), '--base', base, '--out', out], {
  encoding: 'utf8'
});
check('cli writes the sideload copy and leaves the committed manifest',
  cli.status === 0 && fs.existsSync(out) && fs.readFileSync(out, 'utf8') === rewritten && fs.readFileSync(script.SOURCE).equals(sourceBefore),
  cli.stderr);
const icon = fs.readFileSync(script.ICON_DEST);
const iconSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'flow-landing', 'apple-touch-icon.png'));
check('cli copies the icon next to the served site root', icon.equals(iconSrc));

const refused = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'test-manifest.js'), base, '--out', script.SOURCE], {
  encoding: 'utf8'
});
check('cli refuses to overwrite the committed manifest',
  refused.status !== 0 && /refusing/.test(refused.stderr) && fs.readFileSync(script.SOURCE).equals(sourceBefore),
  refused.stderr);

const noBase = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'test-manifest.js')], { encoding: 'utf8' });
check('cli requires a base URL', noBase.status !== 0 && /usage/.test(noBase.stderr));

const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
check('readme documents web and iOS sideload and marks them unverified',
  /Outlook on the web/.test(readme) && /Outlook on iOS/.test(readme) && /Unverified from this commit/.test(readme)
  && /aka\.ms\/olksideload/.test(readme) && /test-manifest\.js/.test(readme));
check('readme keeps the production manifest on the production host',
  /manifest\.xml/.test(readme) && /theflow-ai\.com/.test(readme) && /does not edit `manifest\.xml`/.test(readme));

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll test-manifest checks passed');
