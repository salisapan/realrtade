// Product identity (docs/product-identity.md): Glance surfaces sell closure, not
// "AI email". This test reads the Glance-facing copy and fails on the phrases
// that make Glance sound like an AI assistant. Flow (enterprise) pages are a
// different product and are not scanned.
// Run: node test/identity-copy-corpus.cjs
const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..', '..');
const FILES = [
  'flow-landing/trial.html',
  'flow-landing/pro-welcome.html',
  'flow-trial-extension/manifest.json',
  'flow-trial-extension/popup/popup.html',
  'flow-trial-extension/popup/popup.js',
  'flow-trial-extension/src/content-gmail.js',
  'flow-trial-extension/src/follow.js',
  'flow-trial-extension/docs/chrome-web-store-submission.md'
];
// Pricing mixes Flow and Glance; only its Glance block is scanned.
function pricingGlance() {
  const s = fs.readFileSync(path.join(ROOT, 'flow-landing/pricing.html'), 'utf8');
  const a = s.indexOf('For you, in Gmail');
  const b = s.indexOf('</section>', a);
  return a > 0 ? s.slice(a, b > a ? b : undefined) : '';
}

const BANNED = [
  [/\bAI[- ](?:powered|assistant|inbox|email|mail|agent|copilot|co-?pilot|helper|that (?:reads|understands|writes))\b/i, 'AI-powered / AI assistant / AI inbox'],
  [/\b(?:smart|intelligent) (?:inbox|email|mail|assistant|repl(?:y|ies)|compose)\b/i, 'smart inbox / smart email'],
  [/\bunderstands? your (?:inbox|email|mail|messages)\b/i, 'understands your inbox'],
  [/\b(?:your )?(?:ai|email) (?:assistant|copilot)\b/i, 'assistant / copilot'],
  [/\bchat ?bot\b/i, 'chatbot']
];
// Honest mentions that are NOT marketing: privacy disclosures name "AI" features
// because a store reviewer must know. Those lines are allowed to say "AI feature(s)".
const ALLOWED_LINE = /AI[- ]assisted feature|opt-in AI features?|train any AI model|AI model/i;

function scan(label, text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (ALLOWED_LINE.test(line)) return;
    BANNED.forEach(([re, what]) => { if (re.test(line)) hits.push({ line: i + 1, what, text: line.trim().slice(0, 120) }); });
  });
  check(label + ': no "AI product" wording', hits.length === 0, hits);
}

FILES.forEach((f) => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { check(f + ' exists', false); return; }
  scan(f, fs.readFileSync(p, 'utf8'));
});
scan('flow-landing/pricing.html (Glance block)', pricingGlance());

console.log('\n--- positive: the closure language is actually there ---');
const trial = fs.readFileSync(path.join(ROOT, 'flow-landing/trial.html'), 'utf8');
check('the Glance hero leads with what stays open until it is closed', /Nothing you are waiting on should disappear/.test(trial) && /until it is closed/.test(trial));
check('the FAQ answers "Is there AI in this?" honestly: the engine, not the product', /Is there AI in this\?/.test(trial) && /engine and not the product/.test(trial));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'flow-trial-extension/manifest.json'), 'utf8'));
check('the store description is outcome-led and fits the 132-character limit', /until it is closed/.test(manifest.description) && manifest.description.length <= 132, manifest.description.length);
const js = fs.readFileSync(path.join(ROOT, 'flow-trial-extension/src/content-gmail.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'flow-trial-extension/src/chip.css'), 'utf8');
check('the card brand mark is a closed loop, not a sparkle', /function loopMark/.test(js) && /flow-chip-mark/.test(css) && !/sparkle/i.test(js + css));
const pricing = pricingGlance();
check('Pro is packaged as protection of open loops', /Every loop, until it closes/.test(pricing + fs.readFileSync(path.join(ROOT, 'flow-landing/pricing.html'), 'utf8')) && /Money on the line/.test(fs.readFileSync(path.join(ROOT, 'flow-landing/pricing.html'), 'utf8')));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
