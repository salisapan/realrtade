'use strict';
// W2 WhatsApp share intake + wa.me lane. Run: node test/whatsapp-share-intake-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

const CORE = ['domains.js', 'day-words.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'incoming-judge.js', 'commitment-title.js', 'channel.js', 'draft-reply.js', 'whatsapp-export-parse.js', 'wa-me-link.js', 'whatsapp-share-intake.js'];
const FIX = path.join(__dirname, 'fixtures', 'whatsapp-share');

function loadCore(ctx) {
  for (const f of CORE) {
    const src = fs.readFileSync(path.join(ROOT, 'core', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'lane-chat', 'chat-redact.js'), 'utf8'), ctx, { filename: 'chat-redact.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'privacyShield.js'), 'utf8'), ctx, { filename: 'privacyShield.js' });
}

function world() {
  const ctx = vm.createContext({ module: undefined, exports: undefined, console, Date, Intl, RegExp, Object, Array, String, Number, Boolean, Math, JSON, parseInt, parseFloat, Set, Map });
  ctx.globalThis = ctx;
  loadCore(ctx);
  return ctx;
}

console.log('\n--- export parse ---\n');
{
  const { FlowWhatsAppExportParse: P } = require('../core/whatsapp-export-parse.js');
  const en = fs.readFileSync(path.join(FIX, 'export-en.txt'), 'utf8');
  const he = fs.readFileSync(path.join(FIX, 'export-he.txt'), 'utf8');
  const att = fs.readFileSync(path.join(FIX, 'export-attachments.txt'), 'utf8');
  const amb = fs.readFileSync(path.join(FIX, 'ambiguous.txt'), 'utf8');
  const pe = P.parse(en);
  check('English export: inbound ask found', pe.ok && pe.focusInbound && /proposal/i.test(pe.focusInbound.text), pe);
  const ph = P.parse('Chat with Dana\n+972 54-123-4567\n' + en);
  check('Israeli 05x in header normalizes via intake phone', ph.ok && ph.counterpart.phone === '972541234567', ph.counterpart);
  const ph2 = require('../core/wa-me-link.js').FlowWaMeLink.build('054-987-6543', 'Hi');
  check('wa.me uses 9725x from 054', ph2 === 'https://wa.me/972549876543?text=Hi', ph2);
  const heR = P.parse(he);
  check('Hebrew export parses', heR.ok && heR.focusInbound && /חוזה/.test(heR.focusInbound.text), heR);
  const attR = P.parse(att);
  check('attachment-only tail stays quiet', attR.ok && attR.focusInbound && !attR.focusInbound.attachmentLine, attR);
  const ambR = P.parse(amb);
  check('group export is rejected', !ambR.ok && ambR.reason === 'group', ambR);
}

console.log('\n--- judge + wa.me ---\n');
{
  const ctx = world();
  const I = ctx.FlowWhatsAppShareIntake;
  const NOW = new Date('2026-10-20T10:00:00+03:00');
  const en = fs.readFileSync(path.join(FIX, 'export-en.txt'), 'utf8');
  const r = I.analyze('Dana +972541234567\n' + en, NOW);
  check('English ask offers reply draft + wa.me', r.ok && r.hasReply && r.waUrl && r.waUrl.indexOf('wa.me/972') > 0 && r.waUrl.indexOf('text=') > 0, r);
  const vague = I.analyze('[1/1/26, 10:00] Dana: ok thanks', NOW);
  check('ambiguous thread stays silent', !vague.ok, vague);
}

console.log('\n--- redaction before model ---\n');
{
  const ctx = world();
  const R = ctx.FlowChatRedact;
  const sample = 'Dana Cohen asked for policy 883344 and ID 123456782 and 3,850 ₪';
  const masked = R.beforeModel(sample);
  check('names and amounts masked', masked.maskedText.indexOf('Dana Cohen') < 0 && masked.maskedText.indexOf('3,850') < 0 && masked.maskedText.indexOf('₪') < 0, masked.maskedText);
  check('policy number masked', masked.maskedText.indexOf('883344') < 0, masked.maskedText);
}

console.log('\n--- never auto-send ---\n');
{
  const banned = [/\.submit\s*\(/, /NumpadEnter/, /['"]Enter['"]/];
  for (const rel of ['lane-chat/share-intake.js', 'src/whatsapp-share-sw.js', 'core/wa-me-link.js']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const hits = banned.filter((re) => re.test(src)).map(String);
    check(rel + ' has no send simulation', hits.length === 0, hits);
  }
  check('wame open uses tabs.create only', /chrome\.tabs\.create/.test(fs.readFileSync(path.join(ROOT, 'src/whatsapp-share-sw.js'), 'utf8')));
}

console.log('\n--- background wiring ---\n');
{
  const bg = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  check('background handles flow:whatsapp-share-intake', /flow:whatsapp-share-intake/.test(bg));
  check('background imports whatsapp-share-sw', /whatsapp-share-sw/.test(bg));
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
