#!/usr/bin/env node
// Writes a sideload copy of manifest.xml whose SourceLocation, task pane, icon,
// and AppDomain URLs use a tester's HTTPS base (a temporary tunnel is enough).
// The committed manifest.xml is read and never written. Nothing is uploaded,
// hosted, or deployed.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..');
const SOURCE = path.join(root, 'manifest.xml');
const DEFAULT_OUT = path.join(root, 'dist', 'test-manifest.xml');
const ICON_SRC = path.join(repo, 'flow-landing', 'apple-touch-icon.png');
const ICON_DEST = path.join(root, 'dist', 'site', 'apple-touch-icon.png');
const PRODUCTION_ORIGIN = 'https://theflow-ai.com';

function normalizeBase(raw) {
  let url;
  try {
    url = new URL(String(raw || ''));
  } catch (err) {
    throw new Error('base must be an https URL, for example https://your-tunnel.example');
  }
  if (url.protocol !== 'https:') throw new Error('base must be https');
  if (url.username || url.password) throw new Error('base must not include a username or password');
  if (url.search || url.hash) throw new Error('base must not include a query or a hash');
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('base must be an origin, with no path');
  if (!url.hostname) throw new Error('base must include a host');
  const origin = url.origin;
  if (!/^https:\/\/(?:[A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\])(?::[0-9]+)?$/.test(origin)) {
    throw new Error('base host must be a plain hostname');
  }
  return origin;
}

function pointAt(origin, value) {
  if (value === PRODUCTION_ORIGIN) return origin;
  if (value.indexOf(PRODUCTION_ORIGIN + '/') === 0) return origin + value.slice(PRODUCTION_ORIGIN.length);
  throw new Error('URL is not on the production host: ' + value);
}

function rewriteManifest(xml, base) {
  const origin = normalizeBase(base);
  let nSource = 0;
  let nIcon = 0;
  let nHigh = 0;
  let nImage = 0;
  let nTask = 0;
  let nDomain = 0;

  let out = xml.replace(/(<SourceLocation\b[^>]*\bDefaultValue=")([^"]*)(")/g, function (m, a, val, c) {
    nSource += 1;
    return a + pointAt(origin, val) + c;
  });
  out = out.replace(/(<IconUrl\b[^>]*\bDefaultValue=")([^"]*)(")/g, function (m, a, val, c) {
    nIcon += 1;
    return a + pointAt(origin, val) + c;
  });
  out = out.replace(/(<HighResolutionIconUrl\b[^>]*\bDefaultValue=")([^"]*)(")/g, function (m, a, val, c) {
    nHigh += 1;
    return a + pointAt(origin, val) + c;
  });
  out = out.replace(/(<bt:Image\b[^>]*\bDefaultValue=")([^"]*)(")/g, function (m, a, val, c) {
    nImage += 1;
    return a + pointAt(origin, val) + c;
  });
  out = out.replace(/(<bt:Url\b[^>]*\bid="Taskpane\.Url"[^>]*\bDefaultValue=")([^"]*)(")/g, function (m, a, val, c) {
    nTask += 1;
    return a + pointAt(origin, val) + c;
  });
  out = out.replace(/<AppDomain>[^<]*<\/AppDomain>/g, function () {
    nDomain += 1;
    return '<AppDomain>' + origin + '</AppDomain>';
  });

  const counts = { source: nSource, icon: nIcon, high: nHigh, image: nImage, taskpane: nTask, appDomain: nDomain };
  const expected = { source: 2, icon: 1, high: 1, image: 2, taskpane: 2, appDomain: 1 };
  Object.keys(expected).forEach(function (key) {
    if (counts[key] !== expected[key]) {
      throw new Error('expected ' + expected[key] + ' ' + key + ' URL(s), found ' + counts[key]);
    }
  });

  const support = /<SupportUrl\b[^>]*\bDefaultValue="([^"]*)"/.exec(out);
  if (!support || support[1] !== PRODUCTION_ORIGIN + '/privacy') {
    throw new Error('SupportUrl must stay on the production privacy page');
  }
  if (out.replace(support[0], '').indexOf('theflow-ai.com') !== -1) {
    throw new Error('a SourceLocation, task pane, icon, or AppDomain URL still uses the production host');
  }
  const beforeId = (/<Id>([^<]+)<\/Id>/.exec(xml) || [])[1];
  const afterId = (/<Id>([^<]+)<\/Id>/.exec(out) || [])[1];
  if (!beforeId || beforeId !== afterId) throw new Error('manifest id changed');
  return out;
}

function sameFile(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  if (left === right) return true;
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch (err) {
    return false;
  }
}

function parseArgs(argv) {
  let base = null;
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base' || arg === '--out') {
      const value = argv[++i];
      if (!value) throw new Error(arg + ' needs a value');
      if (arg === '--base') base = value;
      else out = value;
    } else if (arg.startsWith('-')) {
      throw new Error('unknown flag ' + arg);
    } else if (!base) {
      base = arg;
    } else {
      throw new Error('unexpected argument ' + arg);
    }
  }
  if (!base) {
    throw new Error('usage: node glance-outlook-addin/scripts/test-manifest.js https://your-tunnel.example');
  }
  return { base: base, out: out ? path.resolve(out) : DEFAULT_OUT };
}

function writeTestManifest(options) {
  const origin = normalizeBase(options.base);
  const out = options.out || DEFAULT_OUT;
  if (sameFile(out, SOURCE)) throw new Error('refusing to write the committed manifest.xml');
  const before = fs.readFileSync(SOURCE);
  const xml = rewriteManifest(before.toString('utf8'), origin);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, xml);
  if (!fs.readFileSync(SOURCE).equals(before)) throw new Error('committed manifest.xml changed');
  fs.mkdirSync(path.dirname(ICON_DEST), { recursive: true });
  fs.copyFileSync(ICON_SRC, ICON_DEST);
  return { out: out, origin: origin, icon: ICON_DEST };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const written = writeTestManifest(args);
    console.log('wrote ' + written.out);
    console.log('AppDomain ' + written.origin);
    console.log('icon ' + written.icon);
    console.log('committed manifest.xml unchanged');
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
}

module.exports = {
  normalizeBase: normalizeBase,
  rewriteManifest: rewriteManifest,
  writeTestManifest: writeTestManifest,
  parseArgs: parseArgs,
  SOURCE: SOURCE,
  DEFAULT_OUT: DEFAULT_OUT,
  ICON_DEST: ICON_DEST,
  PRODUCTION_ORIGIN: PRODUCTION_ORIGIN
};

if (require.main === module) main();
