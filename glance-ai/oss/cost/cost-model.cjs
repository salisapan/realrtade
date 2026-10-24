'use strict';
// M6 cost model for Glance cloud (docs/glance-ai/ai-product.md §5, owner decisions 2 and 5). No model is called.
// Measured: the share of mail that reaches Tier 2 (router-results.json, Router v2 end to end) and the judge prompt size.
// Assumed, and named as such: the length of a real mail, characters per token, and the size of an Understanding answer.
// Prices: list prices found by web search on 2026-10-12, NOT checked on the providers' own pages (unreachable from the lab). Check before signing.
// usage: node glance-ai/oss/cost/cost-model.cjs   (writes cost-tables.md beside this file)
const fs = require('fs'), path = require('path');
const LAB = path.join(__dirname, '..', '..');
const router = JSON.parse(fs.readFileSync(path.join(LAB, 'oss/shadow-combined/gated/router-results.json'), 'utf8'));
const pooled = router.sets['ALL pooled 786'];
const tier2Share = pooled.t2 / pooled.all; // measured on the lab mix
const sysChars = JSON.parse(fs.readFileSync(path.join(LAB, 'eval-data/sft-v2-val.jsonl'), 'utf8').split('\n')[0]).messages[0].content.length;

const A = {
  charsPerToken: 3,      // assumed: English about 4, Hebrew about 2 to 2.5; mixed mail
  mailChars: 1500,       // assumed: a real business mail after quotes and signatures are cut (lab mails average 74)
  outTokens: 250,        // assumed: one Understanding JSON with spans
  callSecondsOnL4: 1.0,  // assumed: a 4B model on one L4 for ~1,800 tokens in, 250 out
};
const inTokens = Math.round(sysChars / A.charsPerToken + A.mailChars / A.charsPerToken);

const PRICES = [
  { host: 'Managed endpoint, pay per token (DeepInfra list price for Qwen3.5-4B)', inPerM: 0.03, outPerM: 0.15, src: 'deepinfra.com/blog/qwen3-5-4b-deepinfra-benchmarks; artificialanalysis.ai/models/qwen3-5-4b/providers' },
  { host: 'Managed endpoint, pay per token (Fireworks list price, non-reasoning 4B)', inPerM: 0.20, outPerM: 0.20, src: 'pricepertoken.com/pricing-page/model/qwen-qwen3.5-4b' },
  { host: 'Serverless GPU, pay per second (Modal L4 ~$0.80/h)', perSecond: 0.000222, src: 'computeprices.com/providers/modal/gpus/l4' },
  { host: 'Serverless GPU, pay per second (Runpod L4 ~$0.39/h)', perSecond: 0.000108, src: 'cerebrium.ai/blog/2026-gpu-buyers-guide' },
  { host: 'Dedicated L4 always on (Runpod ~$0.39/h)', monthlyFixed: 0.39 * 24 * 30, src: 'runpod.io/gpu-cloud/pricing (tracker figure)' },
];
const perCall = (p) => p.perSecond ? p.perSecond * A.callSecondsOnL4 : p.monthlyFixed ? null : (inTokens * p.inPerM + A.outTokens * p.outPerM) / 1e6;
const usd = (x) => (x < 0.01 ? '$' + x.toFixed(4) : '$' + x.toFixed(2));
const MAILS = [30, 100, 300]; // inbound mails per person per day
let md = `# Glance cloud: cost per person (M6 model, no model called)\n\n`;
md += `Measured: **${(100 * tier2Share).toFixed(0)}%** of mail reaches Tier 2 (${pooled.t2}/${pooled.all}, Router v2 on the lab mix). Judge prompt ${sysChars} characters.\n`;
md += `Assumed: a real mail of ${A.mailChars} characters, ${A.charsPerToken} characters per token, ${A.outTokens} output tokens, ${A.callSecondsOnL4}s per call on one L4. So about ${inTokens} input tokens per call.\n`;
md += `Prices: search results of 2026-10-12, not verified on the providers' pages.\n\n`;
md += `| host | per 1,000 cloud calls | per person per month at ${MAILS.join(' / ')} mails a day |\n|---|---|---|\n`;
const rows = [];
for (const p of PRICES) {
  const c = perCall(p);
  if (c === null) { md += `| ${p.host} | fixed ${usd(p.monthlyFixed)} a month | the same fixed cost shared by every user (one L4 serves many people) |\n`; rows.push({ host: p.host, monthlyFixed: p.monthlyFixed }); continue; }
  const monthly = MAILS.map((m) => c * m * tier2Share * 30);
  md += `| ${p.host} | ${usd(c * 1000)} | ${monthly.map(usd).join(' / ')} |\n`;
  rows.push({ host: p.host, perCall: c, monthly });
}
md += `\nSources: ${PRICES.map((p) => p.src).join('; ')}.\n\nNot in these numbers: cold starts on serverless GPU, retries, the allowance re-check on the server, and the device model (Tier 1), which takes calls off the cloud when present.\n`;
fs.writeFileSync(path.join(__dirname, 'cost-tables.md'), md);
fs.writeFileSync(path.join(__dirname, 'cost-results.json'), JSON.stringify({ tier2Share, sysChars, inTokens, assumptions: A, rows }, null, 1) + '\n');
console.log(md);
