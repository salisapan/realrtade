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
check('background quiet line when picker is not bundled', /FlowBuild\.PICKER_BUNDLED[\s\S]{0,240}not available in this version/i.test(bg));
check('background still opens a window when picker is bundled', /FlowBuild\.PICKER_BUNDLED[\s\S]{0,200}chrome\.windows\.create/.test(bg));

(async () => {
  const guardSrc = `
    async function openDrivePicker(payload, sender) {
      const requestId = payload && payload.requestId;
      const tabId = sender && sender.tab && sender.tab.id;
      if (!requestId || !tabId) return { ok: false, error: 'Missing request context.' };
      if (!(typeof FlowBuild !== 'undefined' && FlowBuild.PICKER_BUNDLED)) {
        return { ok: false, unavailable: true, line: 'Drive picker is not available in this version.' };
      }
      return { ok: true, opened: true };
    }
  `;
  const offBox = { FlowBuild: { PICKER_BUNDLED: false } };
  vm.createContext(offBox);
  vm.runInContext(guardSrc, offBox);
  const quiet = await vm.runInContext('openDrivePicker({ requestId: "dp_1" }, { tab: { id: 1 } })', offBox);
  check('PICKER_BUNDLED false: handler returns the quiet line', quiet && quiet.unavailable && /not available in this version/i.test(quiet.line), quiet);

  const onBox = { FlowBuild: { PICKER_BUNDLED: true } };
  vm.createContext(onBox);
  vm.runInContext(guardSrc, onBox);
  const open = await vm.runInContext('openDrivePicker({ requestId: "dp_2" }, { tab: { id: 1 } })', onBox);
  check('PICKER_BUNDLED true: handler proceeds (no quiet line)', open && open.ok && open.opened && !open.unavailable, open);

  check('gmail does not append drive chip without the flag', !/appendChild\(driveChip\)[\s\S]{0,200}flow-chip-attach-drive/.test(gmail) || /FlowBuild\.PICKER_BUNDLED/.test(gmail));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
