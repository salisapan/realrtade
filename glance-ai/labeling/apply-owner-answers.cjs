'use strict';
// One command. Answers in, owner gold (or a preview), a strict score, a CPU retrain dry-run.
// Preview never writes owner-gold.jsonl.
//
//   node glance-ai/labeling/apply-owner-answers.cjs --answers path/to/answers.json
//   node glance-ai/labeling/apply-owner-answers.cjs --answers glance-ai/labeling/batch-001-cos-prefill.answers.json --preview
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadBatches, readJson, writeJsonl, HERE } = require('./lib.cjs');
const { ingest, GOLD } = require('./ingest-answers.cjs');
const { scoreRows } = require('./score-owner-gold.cjs');
const { heldout, applyOverrides, fit, SHIPPED_V2, DEFAULT_FEAT } = require('./retrain-dry-run.cjs');

const PREVIEW_DOC = path.join(HERE, '..', '..', 'docs', 'glance-ai', 'owner-gold-preview-2026-10-08.md');

function argmap(argv) {
  const o = { preview: false, fit: true };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--preview') o.preview = true;
    else if (argv[i] === '--no-fit') o.fit = false;
    else if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[++i];
  }
  return o;
}

function cell(s) {
  if (!s) return '';
  return s.wrongDoIt + ' | ' + s.missed + ' | ' + s.wrongAction + ' | ' + s.heWrongDoIt + ' | ' + s.enWrongDoIt + ' | ' + s.heMissed + ' | ' + s.enMissed;
}
function showLabel(s) {
  if (!s) return '—';
  return String(s).replace(/\|/g, ' / ');
}

function renderPreview(rep) {
  const b = rep.banner;
  let md = '';
  md += '# Owner-label preview, 2026-10-08\n\n';
  md += 'Glance closes open loops. Glance\'s entry point is any surface the user is on.\n\n';
  md += '**' + b + '.** Owner-verified labels are still 0. This page scores the chief of staff\'s proposed answers for batch-001. It is not owner gold.\n\n';
  md += '## Product definition\n\n';
  md += 'Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect, carry, execute, true close. Glance\'s entry point is any surface the user is on. Glance stays silent when it is uncertain, never sends, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.\n\n';
  md += '## Implementation status\n\n';
  md += 'Batch-001 is 19 synthetic cases (`v2syn-*` and two repo-test ids) where engine 0.9.35 and model v2 disagree, or where a rule needs the owner\'s call. The mail text is generated, not customer mail. Items 8 and 17 are marked unsure in this preview and are left out of every headline number. Item 17\'s note says the close is a save to OneDrive, not a task and not silence. That call is still the owner\'s.\n\n';
  const unsure = rep.excluded.filter((e) => e.reason !== 'context-dependent');
  const ctx = rep.excluded.filter((e) => e.reason === 'context-dependent');
  md += 'Scored rows: **' + rep.score.nGold + '**. Unsure, left out: **' + unsure.length + '**. Context-dependent, left out of the binary count: **' + ctx.length + '**. Owner-verified among the scored rows: **' + rep.score.ownerVerified + '**.\n\n';
  md += '### Unsure (not in the numbers)\n\n';
  for (const e of unsure) md += '- Item ' + e.item + ' `' + e.id + '`: ' + (e.note || 'unsure') + '\n';
  md += '\n### Context-dependent (not in the 200)\n\n';
  if (!ctx.length) md += 'None in this answers file.\n';
  for (const e of ctx) md += '- Item ' + e.item + ' `' + e.id + '` depends_on `' + (e.depends_on || '') + '`' + (e.note ? ': ' + e.note : '') + '\n';
  md += '\n### Strict score on the provisional labels\n\n';
  md += 'A card on a silence label is a wrong Do-It. Silence on an ask label is a missed close. A different action when both sides show a card is a wrong action. Every figure is count / denominator. Qwen is scored on the step (draft, task, calendar, file_save) and only where the cached prediction covers the case.\n\n';
  md += '| system | n | wrong-Do-It | missed close | wrong action | Hebrew wrong-Do-It | English wrong-Do-It | Hebrew missed | English missed |\n';
  md += '|---|---|---|---|---|---|---|---|---|\n';
  for (const [name, sys] of Object.entries(rep.score.systems)) {
    const s = sys.scored;
    md += '| ' + name + ' | ' + s.n + ' | ' + s.wrongDoIt + ' | ' + s.missed + ' | ' + s.wrongAction + ' | ' + s.heWrongDoIt + ' | ' + s.enWrongDoIt + ' | ' + s.heMissed + ' | ' + s.enMissed + ' |\n';
  }
  const q = rep.score.systems['gated Qwen propose-only'];
  md += '\nGated Qwen cache does not cover ' + q.notCovered.length + ' of the ' + rep.score.nGold + ' scored cases: ' + q.notCovered.map((id) => '`' + id + '`').join(', ') + '.\n';
  if (rep.score.tipDiffersFromEngine35.length) {
    md += '\nThe current engine (tip) and the stored engine 0.9.35 label differ on: ' + rep.score.tipDiffersFromEngine35.map((d) => 'item ' + d.item + ' `' + d.id + '` tip ' + showLabel(d.tip) + ', engine 0.9.35 ' + showLabel(d.engine35)).join('; ') + '.\n';
  } else {
    md += '\nThe current engine (tip) matches the stored engine 0.9.35 label on every scored case.\n';
  }
  md += '\n### Case by case\n\n';
  md += '| item | lang | provisional label | v2 alone | v2+veto | v2.1+veto | engine tip | Qwen step |\n|---|---|---|---|---|---|---|---|\n';
  for (const c of rep.score.cases) {
    md += '| ' + (c.item || '') + ' | ' + (c.lang || '') + ' | ' + showLabel(c.y === 'SILENT' ? 'SILENT' : c.y) + ' | ' + showLabel(c.v2Alone) + ' | ' + showLabel(c.v2Veto) + ' | ' + showLabel(c.v21Veto) + ' | ' + showLabel(c.engineTip) + ' | ' + (c.qwen ? showLabel(c.qwen) : 'not covered') + ' |\n';
  }
  const hv = rep.heldout.v2Veto;
  const ha = rep.heldout.v2Alone;
  md += '\n### Strict held-out wrong-Do-It, shipped v2, before and after\n\n';
  md += 'The held-out file is `model/artifacts/v2.test-preds.jsonl` (' + rep.heldout.n + ' rows). Before uses the machine reference. After replaces that reference for the ' + rep.heldout.overridden + ' provisional rows and leaves every other row as it was. These ids sit in the test split, so the change is in the eval labels. The shipped weights are untouched.\n\n';
  md += '| | n | wrong-Do-It | missed close | wrong action | Hebrew wrong-Do-It | English wrong-Do-It | Hebrew missed | English missed |\n|---|---|---|---|---|---|---|---|---|\n';
  md += '| v2+veto before | ' + hv.before.n + ' | ' + cell(hv.before).replace(/ \| /g, ' | ') + ' |\n';
  md += '| v2+veto after | ' + hv.after.n + ' | ' + cell(hv.after) + ' |\n';
  md += '| v2 alone before | ' + ha.before.n + ' | ' + cell(ha.before) + ' |\n';
  md += '| v2 alone after | ' + ha.after.n + ' | ' + cell(ha.after) + ' |\n';
  md += '\n### CPU refit\n\n';
  md += rep.fitText + '\n\n';
  md += '### Command when the owner\'s answers are in\n\n';
  md += '```\nnode glance-ai/labeling/apply-owner-answers.cjs --answers path/to/answers.json\n```\n\n';
  md += 'The answers file is keyed by batch item number or case id. Each mark is ✅, ⚙️, 🤫, or ❓, plus an optional note. `labeledBy` is `sali` for an owner-verified row. Any other `labeledBy` is stored and scored, and `ownerVerified` stays false. The command refuses a file that asks for `ownerVerified: true` under another name. ❓ rows stay out of the headline. The dry-run writes under `glance-ai/labeling/dry-run/` and does not replace `model/artifacts/v2.gate.weights.json`.\n';
  return md;
}

function batchPaths(o, answers) {
  if (o.batch) {
    return String(o.batch).split(',').map((s) => s.trim()).filter(Boolean).map((s) => (path.isAbsolute(s) ? s : path.join(HERE, s)));
  }
  if (Array.isArray(answers.batches) && answers.batches.length) {
    return answers.batches.map((b) => {
      const name = String(b).endsWith('.json') ? String(b) : String(b) + '.json';
      return path.isAbsolute(name) ? name : path.join(HERE, path.basename(name));
    });
  }
  return [path.join(HERE, 'batch-001.json')];
}

function run(argv) {
  const o = argmap(argv);
  if (!o.answers) throw new Error('pass --answers');
  const answers = readJson(o.answers);
  const preview = o.preview || answers.provisional === true;
  if (answers.provisional === true && !o.preview) {
    throw new Error('this answers file is provisional; pass --preview. It will not be written to owner-gold.jsonl');
  }
  const files = batchPaths(o, answers);
  const batch = loadBatches(files);
  const onlyBatch1 = files.length === 1 && path.basename(files[0]) === 'batch-001.json';
  const result = ingest({ answers, batch, preview });
  const goldBefore = fs.existsSync(GOLD) ? fs.readFileSync(GOLD, 'utf8') : '';
  if (preview) {
    const tag = files.map((f) => path.basename(f, '.json')).join('+');
    const rowsName = onlyBatch1 ? 'provisional-rows.jsonl' : tag + '-provisional-rows.jsonl';
    const exclName = onlyBatch1 ? 'excluded-unsure.jsonl' : tag + '-excluded-unsure.jsonl';
    writeJsonl(path.join(HERE, 'preview', rowsName), result.rows);
    writeJsonl(path.join(HERE, 'preview', exclName), result.excluded);
    if (fs.readFileSync(GOLD, 'utf8') !== goldBefore) throw new Error('preview must not change owner-gold.jsonl');
  } else {
    const prev = fs.readFileSync(GOLD, 'utf8').trim();
    const have = prev ? prev.split('\n').map((l) => JSON.parse(l)) : [];
    const map = new Map(have.map((r) => [r.id, r]));
    for (const r of result.rows) map.set(r.id, r);
    writeJsonl(GOLD, [...map.values()]);
  }
  const score = scoreRows(result.rows, { batch });
  const h = heldout(SHIPPED_V2, result.rows);
  let fitText = 'Refit skipped.';
  let fitSummary = null;
  if (o.fit && fs.existsSync(path.join(DEFAULT_FEAT, 'train.jsonl'))) {
    const work = path.join(HERE, 'dry-run', 'work', 'features');
    const hits = applyOverrides(DEFAULT_FEAT, work, result.rows);
    const out = path.join(HERE, 'dry-run', 'artifacts');
    const ran = fit({ feat: work, out, noExport: true, tag: 'v2-owner-dryrun' });
    fitSummary = { status: ran.status, hits, reportPath: path.relative(path.join(HERE, '..', '..'), ran.reportPath) };
    if (ran.status === 0 && fs.existsSync(ran.reportPath)) {
      const rep = JSON.parse(fs.readFileSync(ran.reportPath, 'utf8'));
      const st = rep.test && rep.test.strict;
      fitSummary.strict = st;
      fitSummary.tau = rep.tau;
      fitSummary.test = rep.test ? { n: rep.test.n, wrongDoIt: rep.test.wrongDoIt, wrongDoItRate: rep.test.wrongDoItRate, missed: rep.test.missed, missedRate: rep.test.missedRate, wrongAction: rep.test.wrongAction, unsureRows: rep.test.unsureRows, refSilent: rep.test.refSilent } : null;
      const den = rep.test ? rep.test.refSilent + rep.test.unsureRows : 0;
      const strictFig = st ? ((100 * st.wrongDoIt / den).toFixed(1) + '% (' + st.wrongDoIt + '/' + den + ')') : 'missing';
      const py = spawnSync('python3', ['-c', 'import sklearn; print(sklearn.__version__)'], { encoding: 'utf8' });
      const sklearnVersion = (py.stdout || '').trim() || 'unknown';
      fitText = 'train-v2.py ran with tag `v2-owner-dryrun` and wrote its report under `glance-ai/labeling/dry-run/artifacts/`. The shipped weight files were left in place. Override hits: train ' + hits.train + ', val ' + hits.val + ', test ' + hits.test + '. The refit strict wrong-Do-It on the overridden test labels is ' + strictFig + ' (tau ' + rep.tau + '). sklearn ' + sklearnVersion + '. This refit is a dry-run. It is not a candidate, and it is provisional / not owner-verified.';
      if (hits.train === 0 && hits.val === 0) {
        fitText += ' No training row changed, because every answered id is in the test split. The before/after table above is the effect of the new labels on the shipped decisions.';
      }
    } else {
      fitText = 'train-v2.py exited ' + ran.status + '. ' + ((ran.stderr || ran.stdout || '').slice(-500));
    }
  } else if (o.fit) {
    fitText = 'Feature files are not on this machine (`model/train/features-v2/train.jsonl`). The held-out before/after above still uses the shipped predictions. Build features with `node glance-ai/model/train/export-features-v2.cjs` after the v2 dataset exists, then run this command again to refit into `glance-ai/labeling/dry-run/`.';
  }
  const banner = preview ? 'provisional / not owner-verified' : (result.ownerVerifiedCount ? 'owner-verified rows: ' + result.ownerVerifiedCount : 'no owner-verified rows');
  const report = { banner, provisional: preview, labeledBy: result.labeledBy, excluded: result.excluded, score, heldout: h, fitText, fitSummary };
  fs.mkdirSync(path.join(HERE, 'preview'), { recursive: true });
  fs.mkdirSync(path.join(HERE, 'dry-run'), { recursive: true });
  const scoreOut = {
    banner, provisional: preview, nGold: score.nGold, ownerVerified: score.ownerVerified, excluded: result.excluded,
    systems: Object.fromEntries(Object.entries(score.systems).map(([k, v]) => [k, { n: v.scored.n, wrongDoIt: v.scored.wrongDoIt, missed: v.scored.missed, wrongAction: v.scored.wrongAction, heWrongDoIt: v.scored.heWrongDoIt, enWrongDoIt: v.scored.enWrongDoIt, heMissed: v.scored.heMissed, enMissed: v.scored.enMissed, notCovered: v.notCovered }])),
    tipDiffersFromEngine35: score.tipDiffersFromEngine35,
    cases: score.cases
  };
  if (preview) {
    const tag = files.map((f) => path.basename(f, '.json')).join('+');
    fs.writeFileSync(path.join(HERE, 'preview', tag + '-score.json'), JSON.stringify(scoreOut, null, 1));
    fs.writeFileSync(path.join(HERE, 'dry-run', tag + '-heldout-before-after.json'), JSON.stringify({ banner, n: h.n, overridden: h.overridden, v2Veto: h.v2Veto, v2Alone: h.v2Alone }, null, 1));
    if (fitSummary) fs.writeFileSync(path.join(HERE, 'dry-run', tag + '-fit-summary.json'), JSON.stringify(Object.assign({ banner }, fitSummary), null, 1));
    if (onlyBatch1) {
      fs.writeFileSync(path.join(HERE, 'preview', 'score.json'), JSON.stringify(scoreOut, null, 1));
      fs.writeFileSync(path.join(HERE, 'dry-run', 'heldout-before-after.json'), JSON.stringify({ banner, n: h.n, overridden: h.overridden, v2Veto: h.v2Veto, v2Alone: h.v2Alone }, null, 1));
      if (fitSummary) fs.writeFileSync(path.join(HERE, 'dry-run', 'fit-summary.json'), JSON.stringify(Object.assign({ banner }, fitSummary), null, 1));
      const md = renderPreview(report);
      fs.mkdirSync(path.dirname(PREVIEW_DOC), { recursive: true });
      fs.writeFileSync(PREVIEW_DOC, md);
      console.log('wrote ' + PREVIEW_DOC);
    } else {
      console.log('preview kept off ' + PREVIEW_DOC + ' (batch is ' + tag + ')');
    }
  } else {
    const out = o.report || path.join(HERE, 'dry-run', 'latest-report.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(scoreOut, null, 1));
    console.log('wrote ' + out);
  }
  console.log(JSON.stringify({ provisional: preview, scored: score.nGold, excluded: result.excluded.length, ownerVerified: score.ownerVerified, heldoutBefore: h.v2Veto.before.wrongDoIt, heldoutAfter: h.v2Veto.after.wrongDoIt }));
  return report;
}

module.exports = { run, renderPreview, PREVIEW_DOC };

if (require.main === module) {
  try { run(process.argv); }
  catch (e) { console.error(e.message); process.exit(1); }
}
