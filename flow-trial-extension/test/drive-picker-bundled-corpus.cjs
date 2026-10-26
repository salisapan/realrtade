// Drive picker is optional: core/build-stamp.js PICKER_BUNDLED is false in packaged zips.
// Run: node test/drive-picker-bundled-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.error('FAIL: jsdom is not installed. drive-picker-bundled-corpus cannot run.');
  process.exit(1);
}

const EXT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(EXT, ...p), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? detail : ''); }
}

const stamp = read('core', 'build-stamp.js');
const gmail = read('src', 'content-gmail.js');
const bg = read('src', 'background.js');

check('build-stamp exports PICKER_BUNDLED on FlowBuild', /const PICKER_BUNDLED = (true|false)/.test(stamp) && /PICKER_BUNDLED:/.test(stamp));
check('gmail renders the Drive chip only when PICKER_BUNDLED', /if\s*\(\s*typeof FlowBuild !== 'undefined' && FlowBuild\.PICKER_BUNDLED\s*\)[\s\S]{0,400}flow-chip-attach-drive/.test(gmail));
check('background gates picker on FlowBuild.PICKER_BUNDLED', /FlowBuild\.PICKER_BUNDLED/.test(bg) && /unavailable:\s*true/.test(bg));
check('background does not ship user-facing picker-unavailable copy', !/not available in this version/i.test(bg));

function extractOpenDrivePicker(source) {
  const start = source.indexOf('async function openDrivePicker');
  if (start < 0) throw new Error('openDrivePicker not found');
  const tail = source.slice(start);
  const end = tail.indexOf('\nfunction deliverDrivePickerResult');
  if (end < 0) throw new Error('deliverDrivePickerResult boundary not found');
  return tail.slice(0, end);
}

function extractBuildAttachChooser(source) {
  const start = source.indexOf('function buildAttachChooser(action, ctx)');
  if (start < 0) throw new Error('buildAttachChooser not found');
  const tail = source.slice(start);
  const end = tail.indexOf('\n  function injectNeedsYou');
  if (end < 0) throw new Error('injectNeedsYou boundary not found');
  return tail.slice(0, end);
}

function makePickerBox(pickerBundled) {
  const windows = [];
  const box = {
    FlowBuild: { PICKER_BUNDLED: pickerBundled },
    chrome: {
      runtime: { getURL: (p) => 'chrome-extension://test/' + p },
      windows: {
        create: async (opts) => {
          windows.push(opts);
          return { id: 99 };
        },
      },
    },
    pendingDrivePickers: new Map(),
    windows,
  };
  vm.createContext(box);
  vm.runInContext(extractOpenDrivePicker(bg) + '\nthis.openDrivePicker = openDrivePicker;', box);
  return box;
}

function runBuildAttachChooser(pickerBundled) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://mail.google.com/' });
  const w = dom.window;
  const sandbox = {
    document: w.document,
    FlowBuild: { PICKER_BUNDLED: pickerBundled },
    openDrivePicker: async () => null,
    console,
  };
  vm.createContext(sandbox);
  const helper = `
    function el(tag, cls, text) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }
    ${extractBuildAttachChooser(gmail)}
    this.buildAttachChooser = buildAttachChooser;
  `;
  vm.runInContext(helper, sandbox);
  const action = { params: {} };
  const ctx = { attachments: [{ filename: 'quote.pdf' }] };
  return sandbox.buildAttachChooser(action, ctx);
}

// --- apis.google.com guard (mirrors scripts/verify_trial_install.py) ---
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_RE = /^\s*\/\/[^\n]*/gm;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const APIS_GOOGLE_LOAD_RE = new RegExp(
  [
    '<\\s*script\\b[^>]*\\ssrc\\s*=\\s*[\'"]https?:\\/\\/apis\\.google\\.com[^\'"]*[\'"]',
    'importScripts\\(\\s*[\'"]https?:\\/\\/apis\\.google\\.com[^\'"]*[\'"]\\s*\\)',
    'import\\s+[^;\\n]*\\s+from\\s*[\'"]https?:\\/\\/apis\\.google\\.com[^\'"]*[\'"]',
    'import\\s*\\(\\s*[\'"]https?:\\/\\/apis\\.google\\.com[^\'"]*[\'"]\\s*\\)',
    '(?:\\.)?src\\s*=\\s*[\'"]https?:\\/\\/apis\\.google\\.com[^\'"]*[\'"]',
    '(?:\\.)?src\\s*=\\s*`https?:\\/\\/apis\\.google\\.com[^`]*`',
    "setAttribute\\s*\\(\\s*['\"]src['\"]\\s*,\\s*['\"]https?:\\/\\/apis\\.google\\.com[^'\"]*['\"]",
  ].join('|'),
  'i'
);

function stripJsHtmlComments(text) {
  let t = String(text || '');
  t = t.replace(HTML_COMMENT_RE, '');
  t = t.replace(BLOCK_COMMENT_RE, '');
  t = t.replace(LINE_COMMENT_RE, '');
  return t;
}

function entryLoadsRemoteGoogleScript(name, data) {
  if (!/\.(js|html)$/i.test(name)) return false;
  const cleaned = stripJsHtmlComments(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
  return APIS_GOOGLE_LOAD_RE.test(cleaned);
}

(async () => {
  const off = makePickerBox(false);
  const quiet = await vm.runInContext('openDrivePicker({ requestId: "dp_1" }, { tab: { id: 1 } })', off);
  check('C1: PICKER_BUNDLED false returns silent unavailable', quiet && quiet.ok === false && quiet.unavailable === true && quiet.line === undefined, quiet);
  check('C5: unavailable reply keys are exactly ok and unavailable', quiet && Object.keys(quiet).sort().join(',') === 'ok,unavailable', quiet);
  check('C2: no picker window when not bundled', off.windows.length === 0, off.windows);

  const on = makePickerBox(true);
  const open = await vm.runInContext('openDrivePicker({ requestId: "dp_2" }, { tab: { id: 2 } })', on);
  check('C3: bundled picker opens a window', open && open.ok === true && on.windows.length === 1, { open, windows: on.windows.length });

  const rowOff = runBuildAttachChooser(false);
  check('C6: buildAttachChooser false has no Drive chip', !rowOff.querySelector('.flow-chip-attach-drive'));
  check('C6: buildAttachChooser false has no Drive label text', !/Drive/.test(rowOff.textContent || ''));

  const rowOn = runBuildAttachChooser(true);
  check('C6: buildAttachChooser true renders Drive chip', !!rowOn.querySelector('.flow-chip-attach-drive'));

  check('V3: line-commented import from apis.google.com passes guard', !entryLoadsRemoteGoogleScript('x.js', "// import x from 'https://apis.google.com/js/api.js'\n"));
  check('V3: block-commented import from apis.google.com passes guard', !entryLoadsRemoteGoogleScript('x.js', "/* import x from 'https://apis.google.com/js/api.js' */"));
  check('V7: dynamic import() of apis.google.com fails guard', entryLoadsRemoteGoogleScript('dynamic.js', "import('https://apis.google.com/js/api.js');"));
  check('V4: import from apis.google.com fails guard', entryLoadsRemoteGoogleScript('x.js', "import x from 'https://apis.google.com/js/api.js';"));
  check('V5: script.src assignment to apis.google.com fails guard', entryLoadsRemoteGoogleScript('x.js', "s.src='https://apis.google.com/js/api.js';"));
  check('V5b: background.js comment does not trip guard', !entryLoadsRemoteGoogleScript('src/background.js', read('src', 'background.js')));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
