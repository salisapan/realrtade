// Chat lane script lists (engineBase, WhatsApp lane registration).
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
const skip = FlowLaneScripts.DEFAULT_CHAT_SKIP;
const whatsappLaneJs = [
  'core/fact-reply.js', 'core/close-chains.js', 'src/chat-draft.js', 'src/chat-compose.js', 'src/chat-lane.js',
  'core/whatsapp-engine.js', 'src/whatsapp-parse.js', 'src/content-whatsapp.js', 'src/content-whatsapp-draft.js'
];
const base = FlowLaneScripts.chatLaneRegistrationJs(list, whatsappLaneJs, skip);
const engineOff = FlowLaneScripts.whatsappLaneJs(list, false, whatsappLaneJs, skip);
const engineOn = FlowLaneScripts.whatsappLaneJs(list, true, whatsappLaneJs, skip);

check('engineBase drops Gmail-only scripts', !base.includes('src/content-gmail.js') && base.includes('core/incoming-judge.js'));
check('WHATSAPP_ENGINE off list equals base lane registration', JSON.stringify(engineOff) === JSON.stringify(base));
check('WHATSAPP_ENGINE on list equals base lane registration', JSON.stringify(engineOn) === JSON.stringify(base));
check('registration includes chat-task-card and chip-host', base.includes('src/chat-task-card.js') && base.includes('src/chip-host.js'));
check('registration includes chat-compose stack', base.includes('src/chat-lane.js') && base.includes('src/content-whatsapp-draft.js'));
check('registration skips follow and chip-peek', !base.includes('src/follow.js') && !base.includes('src/chip-peek.js'));
check('WHATSAPP_ENGINE defaults off', FlowWhatsappEngine.SWITCH_DEFAULT === false && FlowWhatsappEngine.SWITCH === 'WHATSAPP_ENGINE');
check('WHATSAPP_ENGINE isOn reads glanceSwitches', FlowWhatsappEngine.isOn({}) === false && FlowWhatsappEngine.isOn({ WHATSAPP_ENGINE: true }) === true);
check('background laneScriptsFor defers to laneChatScripts', /async function laneScriptsFor/.test(bg) && /return laneChatScripts\(lane\)/.test(bg));
check('enable.html loads lane-scripts for engineBase', fs.readFileSync(path.join(__dirname, '..', 'lane-chat', 'enable.html'), 'utf8').indexOf('lane-scripts.js') >= 0);

if (failures) process.exit(1);
console.log('lane-scripts-corpus: all passed');
