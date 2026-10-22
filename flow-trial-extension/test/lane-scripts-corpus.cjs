// Chat lane script lists (engineBase, WhatsApp engine tail).
// Run: node test/lane-scripts-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowLaneScripts } = require('../core/lane-scripts.js');
const { FlowWhatsappEngine } = require('../core/whatsapp-engine.js');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const list = manifest.content_scripts[0].js;
const base = FlowLaneScripts.engineBase(list);
check('engineBase drops Gmail-only scripts', !base.includes('src/content-gmail.js') && base.includes('core/incoming-judge.js'));
const lean = FlowLaneScripts.whatsappLaneJs(list, false);
const full = FlowLaneScripts.whatsappLaneJs(list, true);
check('engine off keeps the lean chat stack', lean.indexOf('src/chat-lane.js') >= 0 && lean.indexOf('core/incoming-judge.js') < 0);
check('engine on loads manifest engine base plus WhatsApp tail', full.indexOf('core/incoming-judge.js') >= 0 && full.indexOf('src/content-whatsapp.js') >= 0);
check('WHATSAPP_ENGINE defaults off', FlowWhatsappEngine.SWITCH_DEFAULT === false && FlowWhatsappEngine.SWITCH === 'WHATSAPP_ENGINE');
check('background registers WhatsApp through laneScriptsFor', /async function laneScriptsFor/.test(bg) && /whatsappLaneJs/.test(bg) && /glanceSwitchOn\(W\.SWITCH\)/.test(bg));
check('enable.html loads lane-scripts for engineBase', fs.readFileSync(path.join(__dirname, '..', 'lane-chat', 'enable.html'), 'utf8').indexOf('lane-scripts.js') >= 0);

if (failures) process.exit(1);
console.log('lane-scripts-corpus: all passed');
