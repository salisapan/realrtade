'use strict';
// CPU retrain dry-run. Owner-gold rows replace the machine reference y for those ids.
// Weights are written only under an explicit output directory, never model/artifacts.
// Usage: node retrain-dry-run.cjs --gold provisional-rows.jsonl [--fit] [--feat features-v2] [--out dry-run/artifacts]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJsonl, metricsOf, HERE } = require('./lib.cjs');

const ARTIFACTS = path.resolve(HERE, '..', 'model', 'artifacts');
const SHIPPED_V2 = path.join(ARTIFACTS, 'v2.test-preds.jsonl');
const TRAIN_PY = path.join(HERE, '..', 'model', 'train', 'train-v2.py');
const DEFAULT_FEAT = path.join(HERE, '..', 'model', 'train', 'features-v2');

function assertDryRunOut(outDir) {
  const out = path.resolve(outDir);
  if (out === ARTIFACTS || out.startsWith(ARTIFACTS + path.sep) || ARTIFACTS.startsWith(out + path.sep)) {
    const err = new Error('dry-run refuses to write inside model/artifacts (' + out + ')');
    err.code = 'SHIPPED_PATH';
    throw err;
  }
  return out;
}

function goldMap(rows) {
  const m = new Map();
  for (const r of rows) {
    if (r.ownerLabel !== 'ASK' && r.ownerLabel !== 'SILENT') continue;
    const y = r.ownerLabel === 'SILENT' ? 'SILENT' : r.actionLabel;
    if (r.ownerLabel === 'ASK' && !y) throw new Error('ASK row ' + r.id + ' has no actionLabel');
    m.set(r.id, y);
  }
  return m;
}

function applyOverrides(srcDir, destDir, rows) {
  const gold = goldMap(rows);
  fs.mkdirSync(destDir, { recursive: true });
  const hit = { train: 0, val: 0, test: 0 };
  for (const name of ['train', 'val', 'test', 'meta']) {
    const src = path.join(srcDir, name + (name === 'meta' ? '.json' : '.jsonl'));
    if (!fs.existsSync(src)) continue;
    if (name === 'meta') { fs.copyFileSync(src, path.join(destDir, 'meta.json')); continue; }
    const out = [];
    for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (gold.has(row.id)) {
        row.y = gold.get(row.id);
        row.unsure = false;
        row.ownerGold = true;
        hit[name]++;
      }
      out.push(JSON.stringify(row));
    }
    fs.writeFileSync(path.join(destDir, name + '.jsonl'), out.join('\n') + '\n');
  }
  return hit;
}

function heldout(predPath, rows) {
  const gold = goldMap(rows);
  const before = [];
  const after = [];
  let overridden = 0;
  for (const line of fs.readFileSync(predPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    before.push(r);
    if (gold.has(r.id)) {
      overridden++;
      after.push(Object.assign({}, r, { y: gold.get(r.id) }));
    } else after.push(r);
  }
  function pack(list, key) {
    return metricsOf(list, (r) => r.y, (r) => r[key]);
  }
  return {
    n: before.length,
    overridden,
    v2Alone: { before: pack(before, 'predAlone'), after: pack(after, 'predAlone') },
    v2Veto: { before: pack(before, 'pred'), after: pack(after, 'pred') }
  };
}

function fit(opts) {
  const out = assertDryRunOut(opts.out);
  const tag = opts.tag || 'v2-owner-dryrun';
  if (!/dryrun/.test(tag)) throw new Error('dry-run tag must contain dryrun');
  fs.mkdirSync(out, { recursive: true });
  const py = opts.python || 'python3';
  const args = [TRAIN_PY, '--feat', opts.feat, '--tag', tag, '--out', out];
  if (opts.noOof) args.push('--no-oof');
  if (opts.noExport) args.push('--no-export');
  const r = spawnSync(py, args, { encoding: 'utf8', env: Object.assign({}, process.env, { OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' }) });
  const reportPath = path.join(out, tag + '.report.json');
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, reportPath, out, tag };
}

function cli(argv) {
  const o = { fit: false, noOof: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--fit') o.fit = true;
    else if (argv[i] === '--no-oof') o.noOof = true;
    else if (argv[i] === '--no-export') o.noExport = true;
    else if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[++i];
  }
  if (!o.gold) throw new Error('pass --gold');
  const rows = readJsonl(o.gold);
  const h = heldout(o.preds || SHIPPED_V2, rows);
  const summary = { provisional: true, heldout: h };
  if (o.fit) {
    const featSrc = o.feat || DEFAULT_FEAT;
    if (!fs.existsSync(path.join(featSrc, 'train.jsonl'))) throw new Error('features not found at ' + featSrc);
    const work = o.work || path.join(HERE, 'dry-run', 'work', 'features');
    const hit = applyOverrides(featSrc, work, rows);
    const out = o.out || path.join(HERE, 'dry-run', 'artifacts');
    const ran = fit({ feat: work, out, noOof: o.noOof, noExport: o.noExport !== false, tag: 'v2-owner-dryrun' });
    summary.overrideHits = hit;
    summary.fit = { status: ran.status, reportPath: ran.reportPath, stderrTail: (ran.stderr || '').slice(-2000) };
    if (ran.status === 0 && fs.existsSync(ran.reportPath)) {
      const rep = JSON.parse(fs.readFileSync(ran.reportPath, 'utf8'));
      summary.fit.strict = rep.test && rep.test.strict;
      summary.fit.testN = rep.test && rep.test.n;
      summary.fit.tau = rep.tau;
      summary.fit.tag = rep.tag;
    } else {
      process.stderr.write(ran.stdout || '');
      process.stderr.write(ran.stderr || '');
    }
  }
  if (o.summary) {
    fs.mkdirSync(path.dirname(path.resolve(o.summary)), { recursive: true });
    fs.writeFileSync(o.summary, JSON.stringify(summary, null, 1));
  }
  console.log(JSON.stringify({ n: h.n, overridden: h.overridden, before: h.v2Veto.before.wrongDoIt, after: h.v2Veto.after.wrongDoIt, fit: summary.fit ? summary.fit.status : 'not-run' }));
  if (summary.fit && summary.fit.status) process.exit(summary.fit.status);
}

module.exports = { assertDryRunOut, applyOverrides, heldout, fit, goldMap, ARTIFACTS, SHIPPED_V2, DEFAULT_FEAT };

if (require.main === module) {
  try { cli(process.argv); }
  catch (e) { console.error(e.message); process.exit(e.code === 'SHIPPED_PATH' ? 2 : 1); }
}
