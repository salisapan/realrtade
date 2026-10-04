// The measurement script itself (scripts/ai-ladder/eval.cjs), run against two scripted providers: one that is always right and one that says yes to everything.
// If this passes, the script says PASS for the first and DO NOT TURN ON for the second, so the bar it holds a real provider to is a real bar.
// Run: node test/ai-ladder-eval-corpus.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { FlowLocalLMAudit: AUDIT } = require(ROOT + '/core/local-lm-audit.js');
const { FlowExecRouter: X } = require(ROOT + '/core/exec-router.js');
const { FlowPrivacyShield: S } = require(ROOT + '/core/privacyShield.js');
const { FlowMaskIds: MI } = require(ROOT + '/core/mask-ids.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ladder-eval-'));
const gold = {};
AUDIT.forEach((r) => { const m = X.maskForServer(r.t, S, MI); if (m.ok) gold[m.text] = r.act; });
fs.writeFileSync(path.join(tmp, 'gold.json'), JSON.stringify(gold));
const shim = (mode) => `
const gold = require(${JSON.stringify(path.join(tmp, 'gold.json'))});
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const user = (body.messages && body.messages[body.messages.length - 1].content) || '';
  const sentence = (/Sentence: (".*")/.exec(user) || [])[1];
  const text = sentence ? JSON.parse(sentence) : '';
  const act = ${mode === 'perfect' ? "(gold[text] === 'ASK' || gold[text] === 'PROMISE') ? gold[text] : 'INFORM'" : "'ASK'"};
  const reading = act === 'ASK' ? { act, action: 'send', who: 'you', when: null, amount: null } : act === 'PROMISE' ? { act, action: 'send', who: 'me', when: null, amount: null } : { act: 'INFORM', action: 'none', who: 'none', when: null, amount: null };
  return { ok: true, text: async () => JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reading) }], stop_reason: 'end_turn' }) };
};`;
fs.writeFileSync(path.join(tmp, 'perfect.cjs'), shim('perfect'));
fs.writeFileSync(path.join(tmp, 'yes.cjs'), shim('yes'));
const run = (file, env) => spawnSync('node', ['-r', path.join(tmp, file), path.join(ROOT, '..', 'scripts', 'ai-ladder', 'eval.cjs')], { env: Object.assign({}, process.env, { ANTHROPIC_API_KEY: 'x', XAI_API_KEY: '' }, env || {}), encoding: 'utf8', timeout: 120000 });
const none = spawnSync('node', [path.join(ROOT, '..', 'scripts', 'ai-ladder', 'eval.cjs')], { env: Object.assign({}, process.env, { ANTHROPIC_API_KEY: '', XAI_API_KEY: '' }), encoding: 'utf8' });
check('no provider key: it says SKIPPED and exits 0, and switches nothing on', none.status === 0 && /SKIPPED/.test(none.stdout), none.stdout);
const p = run('perfect.cjs');
check('a provider that is always right: the script passes, and names the languages to put in GLANCE_AI_LADDER', p.status === 0 && /PASS for: en, he\. It is reasonable to set GLANCE_AI_LADDER=en,he/.test(p.stdout), (p.stdout || '').slice(-400) + p.stderr);
const y = run('yes.cjs');
check('a provider that says yes to everything: DO NOT TURN ON, exit 1', y.status === 1 && /DO NOT TURN ON/.test(y.stdout), (y.stdout || '').slice(-300));
check('the output holds counts, never a sentence', !/Hoping you can|Please confirm|pls transfer/i.test(p.stdout + y.stdout));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
