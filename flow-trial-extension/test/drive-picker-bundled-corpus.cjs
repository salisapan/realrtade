// Drive picker is optional: core/build-stamp.js PICKER_BUNDLED is false in packaged zips.
// Run: node test/drive-picker-bundled-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

(async () => {
  const off = makePickerBox(false);
  const quiet = await vm.runInContext('openDrivePicker({ requestId: "dp_1" }, { tab: { id: 1 } })', off);
  check('C1: PICKER_BUNDLED false returns silent unavailable', quiet && quiet.ok === false && quiet.unavailable === true && quiet.line === undefined, quiet);
  check('C2: no picker window when not bundled', off.windows.length === 0, off.windows);

  const on = makePickerBox(true);
  const open = await vm.runInContext('openDrivePicker({ requestId: "dp_2" }, { tab: { id: 2 } })', on);
  check('C3: bundled picker opens a window', open && open.ok === true && on.windows.length === 1, { open, windows: on.windows.length });
  check('gmail does not append drive chip without the flag', !/appendChild\(driveChip\)[\s\S]{0,200}flow-chip-attach-drive/.test(gmail) || /FlowBuild\.PICKER_BUNDLED/.test(gmail));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
