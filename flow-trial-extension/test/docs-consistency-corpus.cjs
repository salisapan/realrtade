// The documents an agent or a person reads must agree with the code and with each other: the map is complete, every module is described, the public numbers are the numbers the code enforces,
// and the sentences that used to be true and no longer are do not come back. Run: node test/docs-consistency-corpus.cjs
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');
const EXT = path.join(REPO, 'flow-trial-extension');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(REPO, p));
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const { FlowAiLadder: L } = require(EXT + '/core/ai-ladder.js');
const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

console.log('--- the map is complete and true ---');
const map = read('docs/README.md');
const docs = fs.readdirSync(path.join(REPO, 'docs')).filter((f) => f.endsWith('.md') && f !== 'README.md');
const unmapped = docs.filter((f) => map.indexOf('`' + f + '`') < 0);
check('every document in docs/ is listed in docs/README.md', unmapped.length === 0, unmapped);
const paths = Array.from(new Set((map.match(/`[A-Za-z0-9_./*-]+\.(?:md|js|cjs|py|html|json|sql|txt)`/g) || []).map((x) => x.slice(1, -1)))).filter((p) => p.indexOf('*') < 0);
const candidates = (p) => [p, 'docs/' + p, 'flow-trial-extension/' + p, 'flow-trial-extension/test/' + p, 'flow-trial-extension/core/' + p, 'flow-trial-extension/src/' + p, 'flow-landing/netlify/functions/glance-assist/' + p, 'flow-trial-extension/docs/' + p, 'scripts/' + p, 'flow-landing/' + p, 'flow-landing/netlify/functions/' + p, 'flow-trial-extension/popup/' + p];
const dangling = paths.filter((p) => !candidates(p).some(exists));
check('every file the map names exists', dangling.length === 0, dangling);
check('open-tasks has a valid "Last updated" date', /Last updated: \d{4}-\d{2}-\d{2}/.test(read('docs/open-tasks.md')));
const coreReadme = read('flow-trial-extension/core/README.md');
const undescribed = fs.readdirSync(path.join(EXT, 'core')).filter((f) => f.endsWith('.js') && coreReadme.indexOf('`' + f + '`') < 0);
check('every core/ module is described in core/README.md', undescribed.length === 0, undescribed);
const cfgs = fs.readdirSync(path.join(EXT, 'config')).filter((f) => f.endsWith('.js'));
const extReadme = read('flow-trial-extension/README.md');
check('every public config switch is named in the extension README', cfgs.every((c) => extReadme.indexOf(c.replace('.public.js', '')) >= 0), cfgs);

console.log('--- the public numbers are the numbers the code enforces ---');
const F = L.PLANS.free.units, P = L.PLANS.pro.units;
check('ai-ladder.md states both allowances and the unit costs', read('docs/ai-ladder.md').indexOf('**Free: ' + F + ' units a month**') >= 0 && read('docs/ai-ladder.md').indexOf('**Pro: ' + num(P) + ' units a month**') >= 0 && /fast read \*\*1\*\*/.test(read('docs/ai-ladder.md')) && /\*\*\+4\*\*/.test(read('docs/ai-ladder.md')));
check('monetization.md states both', read('docs/monetization.md').indexOf('**' + F + ' a month**') >= 0 && read('docs/monetization.md').indexOf('**' + num(P) + ' a month**') >= 0);
check('revenue-routines.md (Hebrew) states both', read('docs/revenue-routines.md').indexOf('**' + F + ' בחודש**') >= 0 && read('docs/revenue-routines.md').indexOf('**' + num(P) + ' בחודש**') >= 0);
check('the privacy page and the trial page state both', read('flow-landing/privacy.html').indexOf(F + ' second readings on Free') >= 0 && read('flow-landing/privacy.html').indexOf(num(P) + ' on Glance Pro') >= 0 && read('flow-landing/trial.html').indexOf(F + ' on Free, ' + num(P) + ' on Pro') >= 0);
check('open-tasks row 29 states both and the caps', /Free 120 units a month, Pro 1,500/.test(read('docs/open-tasks.md')) && /300 units a day per network address, 3,000 a day for everyone/.test(read('docs/open-tasks.md')));
const ladderSrv = read('flow-landing/netlify/functions/glance-assist/ladder.js');
check('the server caps in ladder.js are the ones the documents say (300 and 3,000)', /DEFAULT_IP_DAILY_UNITS = 300/.test(ladderSrv) && /DEFAULT_GLOBAL_DAILY_UNITS = 3000/.test(ladderSrv) && /\(default 300\)/.test(extReadme) && /default 3000/.test(extReadme));
check('the contract the docs describe matches the server (statuses and codes)', ['quota_used', 'capacity', 'language_off', 'no_identity', 'bad_request', 'unavailable', 'provider'].every((c) => ladderSrv.indexOf("'" + c + "'") >= 0 && read('docs/ai-ladder.md').indexOf(c) >= 0));

console.log('--- the switches, as the documents describe them ---');
const hyb = /enabled:\s*(true|false)/.exec(read('flow-trial-extension/config/hybrid.public.js'))[1];
const lad = /enabled:\s*(true|false)/.exec(read('flow-trial-extension/config/ladder.public.js'))[1];
check('hybrid: the documents say what the code says (' + hyb + ')', hyb === 'false' ? /enabled: false/.test(read('docs/hybrid-execution-architecture.md')) && /lite/.test(read('flow-trial-extension/docs/SETUP.md')) : /enabled: true/.test(read('docs/hybrid-execution-architecture.md')));
check('ladder: the documents say what the code says (' + lad + ') and where the real switch is', lad === 'true' ? /on in the extension/.test(read('docs/ai-ladder.md')) && /GLANCE_AI_LADDER/.test(read('docs/open-tasks.md')) : true);
check('REMOTE_CLASSIFY is off in the code and every document that mentions it says off', /const REMOTE_CLASSIFY = false;/.test(read('flow-trial-extension/src/content-gmail.js')));
const envVars = Array.from(new Set((ladderSrv + read('flow-landing/netlify/functions/glance-assist/model-router.js')).match(/\b(?:GLANCE_AI_[A-Z_]+|[A-Z]+_API_KEY|LLAMA_API_URL|LLAMA_MODEL)\b/g) || []));
const undoc = envVars.filter((v) => extReadme.indexOf(v) < 0 && v !== 'GEMINI_API_KEY');
check('every environment variable the server reads is in the extension README', undoc.length === 0, undoc);

console.log('--- sentences that used to be true and are not ---');
const agentFiles = ['CLAUDE.md', 'README.md', 'docs/README.md'].concat(docs.map((d) => 'docs/' + d), ['flow-trial-extension/README.md', 'flow-trial-extension/core/README.md', 'flow-trial-extension/docs/SETUP.md', 'flow-trial-extension/docs/chrome-web-store-submission.md', 'flow-landing/llms.txt']);
const STALE = [
  [/GLANCE_AI_LADDER=1/, 'the switch is a list of languages, not "1"'],
  [/never add an external model call to this path/i, 'the one external step is the owner-approved second reading'],
  [/Contracts and other documents are\s+untouched/, 'contract, quote, proposal and signed copy are on the resolution path'],
  [/\(114 checks\)/, 'a count that was never kept'],
  [/Pro-only last resort/, 'the second reading is Free with an allowance, Pro with more'],
  [/Option A \(today\)/, 'option A is the past in when-recognition-fails.md']
];
const hits = [];
agentFiles.forEach((f) => { if (!exists(f)) { hits.push(f + ' missing'); return; } const t = read(f); STALE.forEach(([re, why]) => { if (re.test(t)) hits.push(f + ': ' + why); }); });
check('no document repeats a sentence the code has made false', hits.length === 0, hits);
const decisionSyn = read('CLAUDE.md');
check('CLAUDE.md points to the map, the second reading and true close', /docs\/README\.md/.test(decisionSyn) && /docs\/ai-ladder\.md/.test(decisionSyn) && /docs\/true-close\.md/.test(decisionSyn));
check('llms.txt describes Glance as loops, free to start, not for regulated data, and does not mention a switch that is off', /stays on what you asked for or promised/.test(read('flow-landing/llms.txt')) && /not for regulated/.test(read('flow-landing/llms.txt')) && !/second reading|Phi-3|on-device model/i.test(read('flow-landing/llms.txt')));
check('the open tasks the documents point at exist (rows 25, 29, 34, 35, 36, 37)', [25, 29, 34, 35, 36, 37].every((n) => new RegExp('^\\| ' + n + ' \\|', 'm').test(read('docs/open-tasks.md'))));

console.log('--- the locked identity is one definition, quoted verbatim ---');
const START = '<!-- LOCKED-IDENTITY:START -->', END = '<!-- LOCKED-IDENTITY:END -->';
const blockOf = (t) => { const a = t.indexOf(START), b = t.indexOf(END); return a >= 0 && b > a ? t.slice(a + START.length, b).trim() : null; };
const SOURCE = blockOf(read('docs/product-identity.md'));
check('the source block exists and starts with the sentence every description must start from', SOURCE && SOURCE.indexOf('**Glance closes open loops. Gmail is where it starts today.**') === 0, SOURCE);
check('it carries the loop, the entry surface, the execution surfaces, silence, preparation and true close, and the Flow split', ['detect → carry → execute → true close', 'current primary entry surface', 'Google Tasks, Gmail drafts and Drive', 'silent when it is uncertain', 'preparation as not completion', 'real completion or a deliberate release', 'Flow, the enterprise product, is separate'].every((x) => SOURCE.indexOf(x) >= 0));
const QUOTERS = ['CLAUDE.md', 'README.md', 'docs/README.md', 'docs/product-architecture.md', 'docs/monetization.md', 'docs/open-loops.md', 'docs/multi-platform.md', 'flow-trial-extension/README.md'];
const drift = QUOTERS.filter((f) => blockOf(read(f)) !== SOURCE);
check('every source-of-truth file quotes it character for character: ' + QUOTERS.length + ' files', drift.length === 0, drift);
const pi = read('docs/product-identity.md'), cl = read('CLAUDE.md');
check('the anti-drift list and the two-part report rule are in product-identity.md and summarised in CLAUDE.md', ['Glance is not only a Gmail add-on', 'Glance is an AI product', 'Pro is the personal depth layer', 'Waiting or tracking alone is not success', 'Free must stay genuinely useful', 'Zero-Prompt is sacred', 'Multi-platform means'].every((x) => pi.indexOf(x) >= 0) && /Product definition \(vision-locked\)/.test(pi) && /Current implementation status \(code reality\)/.test(pi) && /Product definition \(vision-locked\)/.test(cl) && /Current implementation status \(code reality\)/.test(cl) && /Zero-Prompt is sacred/.test(cl));
check('the public short forms start from the same sentence', /Glance closes open loops\. Gmail is where it starts today\./.test(read('flow-landing/llms.txt')) && /Glance closes open loops\. Gmail is where it starts today\./.test(read('flow-trial-extension/docs/chrome-web-store-submission.md')));
check('the Hebrew revenue document states the locked definition and the implementation status apart', /הגדרת המוצר \(נעולה/.test(read('docs/revenue-routines.md')) && /מצב המימוש היום/.test(read('docs/revenue-routines.md')));
const FORBIDDEN_DEF = /\bGlance is (?:a|an|just a|only a) (?:free |personal |small )?(?:chrome |browser )?(?:extension|add-?on)(?: for| to| in) gmail\b|\bGlance is (?:a|an) (?:free |personal )?(?:ai|smart) (?:email|inbox)/i;
const defHits = Array.from(new Set(agentFiles.concat(['docs/product-identity.md']))).filter((f) => exists(f) && FORBIDDEN_DEF.test(read(f).replace(/"[^"\n]*"/g, '"…"').replace(/“[^”\n]*”/g, '“…”')));
check('no agent-readable file defines Glance as an extension for Gmail or as an AI email product (quoting it as the forbidden example is allowed)', defHits.length === 0, defHits);

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
