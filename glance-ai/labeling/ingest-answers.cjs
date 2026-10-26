'use strict';
// Turn a small answers file into schema-valid owner-gold rows.
// ✅ take the model's action, ⚙️ take the engine's action, 🤫 silent, ❓ unsure.
// ❓ rows are excluded and are not gold. answerType context-dependent is excluded too
// and does not count toward the binary 200. ownerVerified is true only when labeledBy is sali.
// Usage: node ingest-answers.cjs --answers answers.json [--batch batch-001.json] [--out owner-gold.jsonl]
const fs = require('fs');
const path = require('path');
const { ACTION_CLOSE, isOwner, normMark, readJson, loadBatch, validateRow, writeJsonl, SCHEMA_PATH } = require('./lib.cjs');

const GOLD = path.join(__dirname, 'owner-gold.jsonl');

function fail(msg, code) {
  const err = new Error(msg);
  err.code = code || 'INGEST';
  throw err;
}

function choose(mark, item, answer) {
  if (mark === 'unsure') return null;
  if (mark === 'silent') {
    return { ownerLabel: 'SILENT', actionLabel: null, expectedAction: null, wrongDoIt: true };
  }
  // ⚙️ is the engine side. Batch-002 stores the live tip in engineTip; batch-001 stores engine 0.9.35 in engine35.
  const side = mark === 'model' ? item.v2 : (item.engineTip || item.engine35);
  const actionLabel = answer.actionLabel || side;
  if (!actionLabel || actionLabel === 'SILENT') {
    fail('item ' + item.item + ' (' + item.id + '): the ' + mark + ' side is silent; use the silence mark', 'BAD_MARK');
  }
  const expectedAction = answer.expectedAction || ACTION_CLOSE[actionLabel];
  if (!expectedAction) fail('item ' + item.item + ': no close name for action ' + actionLabel + '; pass expectedAction', 'BAD_ACTION');
  return { ownerLabel: 'ASK', actionLabel, expectedAction, wrongDoIt: false };
}

function ingest(opts) {
  const answers = opts.answers;
  const batch = opts.batch;
  if (!answers || typeof answers !== 'object') fail('answers file is missing');
  if (!answers.labeledBy || typeof answers.labeledBy !== 'string') fail('labeledBy is required');
  const labeledBy = answers.labeledBy.trim();
  if (answers.ownerVerified === true && !isOwner(labeledBy)) {
    fail('refusing to mark owner-verified: labeledBy is not the owner (sali)', 'NOT_OWNER');
  }
  if (!Array.isArray(answers.answers) || answers.answers.length === 0) fail('answers array is empty');
  const byId = new Map();
  const byItem = new Map();
  for (const r of batch) {
    if (byId.has(r.id)) fail('duplicate id in the loaded batches: ' + r.id, 'DUP');
    byId.set(r.id, r);
    const key = String(r.item);
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push(r);
  }
  const seen = new Set();
  const rows = [];
  const excluded = [];
  const labeledAt = answers.labeledAt || new Date().toISOString();
  const provisional = opts.preview === true || answers.provisional === true;
  if (answers.consent === true && !isOwner(labeledBy)) fail('refusing consent:true unless labeledBy is sali', 'NOT_OWNER');
  const consent = provisional ? false : answers.consent === true;
  const ownerVerified = !provisional && isOwner(labeledBy);
  if (answers.ownerVerified === true && !ownerVerified) {
    fail('refusing to mark owner-verified: labeledBy is not the owner (sali)', 'NOT_OWNER');
  }

  for (const a of answers.answers) {
    if (a && a.ownerVerified === true && !isOwner(labeledBy)) {
      fail('refusing to mark owner-verified: labeledBy is not the owner (sali)', 'NOT_OWNER');
    }
    const mark = normMark(a.mark);
    let item = null;
    const wantBatch = a.batch ? String(a.batch).replace(/\.json$/, '') : null;
    if (a.id) {
      const by = byId.get(a.id);
      if (!by) fail('unknown case id ' + a.id, 'UNKNOWN');
      if (wantBatch && by.batchName && by.batchName !== wantBatch) fail('id ' + a.id + ' is not in ' + wantBatch, 'MISMATCH');
      item = by;
    } else if (a.item != null) {
      const hits = (byItem.get(String(Number(a.item))) || []).filter((r) => !wantBatch || r.batchName === wantBatch);
      if (hits.length > 1) fail('item ' + a.item + ' is in more than one batch; pass id', 'AMBIGUOUS');
      item = hits[0] || null;
    }
    if (item && a.item != null && Number(a.item) !== item.item) fail('item ' + a.item + ' is not id ' + item.id, 'MISMATCH');
    if (!item) fail('answer does not match a batch case', 'UNKNOWN');
    if (seen.has(item.id)) fail('duplicate answer for ' + item.id, 'DUP');
    seen.add(item.id);
    const context = item.answerType === 'context-dependent' || mark === 'context';
    if (context) {
      const depends = a.depends_on || item.depends_on;
      if (!depends) fail('item ' + item.item + ' (' + item.id + '): context-dependent needs depends_on', 'DEPENDS');
      excluded.push({
        id: item.id, item: item.item, mark: a.mark || 'context-dependent', note: a.note || '',
        reason: 'context-dependent', answerType: 'context-dependent', depends_on: depends
      });
      continue;
    }
    const choice = choose(mark, item, a);
    if (!choice) {
      excluded.push({ id: item.id, item: item.item, mark: '❓', note: a.note || '', reason: 'unsure' });
      continue;
    }
    const notes = [];
    if (provisional) notes.push('provisional / not owner-verified');
    if (a.note) notes.push(String(a.note));
    notes.push(choice.ownerLabel === 'SILENT' ? 'action: silence' : 'action: ' + choice.actionLabel);
    const batchName = item.batchName || 'batch';
    notes.push(batchName + ' item ' + item.item);
    const row = {
      id: item.id,
      source: item.surface === 'outlook' ? 'outlook' : 'gmail',
      subject: item.subject || '',
      redactedBody: item.body,
      ownerLabel: choice.ownerLabel,
      expectedAction: choice.expectedAction,
      wrongDoIt: choice.wrongDoIt,
      notes: notes.join(' · '),
      labeledAt,
      labeledBy,
      consent,
      lang: item.lang === 'he' || item.lang === 'en' ? item.lang : undefined,
      importedFrom: 'labeling/' + (item.batchName || 'batch') + '.json#item-' + item.item,
      modelLabelPrior: item.reference && item.reference.label ? item.reference.label : null,
      ownerVerified,
      actionLabel: choice.actionLabel
    };
    if (row.lang === undefined) delete row.lang;
    const errs = validateRow(row);
    if (errs.length) fail(item.id + ': ' + errs.join('; '), 'SCHEMA');
    rows.push(row);
  }
  const missing = batch.filter((r) => !seen.has(r.id));
  if (missing.length) fail('missing answers for ' + missing.map((r) => r.item + ':' + r.id).join(', '), 'INCOMPLETE');
  const contextDependent = excluded.filter((e) => e.reason === 'context-dependent');
  return {
    rows, excluded, labeledBy,
    ownerVerifiedCount: rows.filter((r) => r.ownerVerified).length,
    binaryCount: rows.length,
    contextDependentCount: contextDependent.length,
    provisional, consent
  };
}

function cli(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--preview') o.preview = true;
    else if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[++i];
  }
  if (!o.answers) fail('pass --answers');
  const answers = readJson(o.answers);
  const batch = loadBatch(o.batch || path.join(__dirname, 'batch-001.json'));
  const result = ingest({ answers, batch, preview: o.preview === true || answers.provisional === true });
  const out = o.out || (result.provisional ? path.join(__dirname, 'preview', 'provisional-rows.jsonl') : GOLD);
  if (!result.provisional && path.resolve(out) !== path.resolve(GOLD) && o.out == null) {
    /* default */
  }
  if (path.resolve(out) === path.resolve(GOLD) && result.provisional) {
    fail('provisional answers cannot be written to owner-gold.jsonl', 'PROVISIONAL');
  }
  writeJsonl(out, result.rows);
  const unsure = out.replace(/\.jsonl$/, '') + '.unsure.jsonl';
  writeJsonl(unsure, result.excluded);
  console.log(JSON.stringify({ out, rows: result.rows.length, excluded: result.excluded.length, ownerVerified: result.ownerVerifiedCount, provisional: result.provisional }, null, 1));
  return result;
}

module.exports = { ingest, choose, GOLD, SCHEMA_PATH };

if (require.main === module) {
  try { cli(process.argv); }
  catch (e) { console.error(e.message); process.exit(e.code === 'NOT_OWNER' ? 2 : 1); }
}
