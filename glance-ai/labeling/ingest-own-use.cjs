'use strict';
// Path A: turn the owner's local approve / edit / undo / Handled export into sali:action rows.
// The labelled text stays in flow-trial-extension/test/fixtures/private/ (gitignored).
// The file written for git is counts only. Nothing is sent. The 200 bar is not lowered.
//
// Usage:
//   node glance-ai/labeling/ingest-own-use.cjs [--export path] [--private path] [--aggregate path]
// Looks, in order, at --export, GLANCE_OWN_USE_EXPORT, then these gitignored names:
//   flow-trial-extension/test/fixtures/private/own-use-export.jsonl
//   flow-trial-extension/test/fixtures/private/own-use-export.json
//   flow-trial-extension/test/fixtures/private/decisions.jsonl
//   flow-trial-extension/test/fixtures/private/approve-edit-undo-handled.jsonl
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { OWN_USE, isAgentLabeler, isOwnUse, writeJsonl } = require('./lib.cjs');

const ROOT = path.join(__dirname, '..', '..');
const PRIVATE_DIR = path.join(ROOT, 'flow-trial-extension/test/fixtures/private');
const DEFAULT_PRIVATE = path.join(PRIVATE_DIR, 'own-use-labels.jsonl');
const DEFAULT_AGGREGATE = path.join(__dirname, 'own-use-aggregates.json');
const MIN_OWNER = 200;
const EXPORT_NAMES = ['own-use-export.jsonl', 'own-use-export.json', 'decisions.jsonl', 'approve-edit-undo-handled.jsonl'];
// Personal loop types Glance already names. A type with no qualifying row is uncovered.
const LOOP_TYPES = ['dated-commitment', 'confirmed-amount', 'follow-up-ask', 'calendar-hold', 'calendar-cancel', 'calendar-move', 'create-missing', 'drive-file', 'file-on-hold', 'file-on-task'];
const TEXT_KEYS = ['sentence', 'maskedSentence', 'body', 'redactedBody', 'subject', 'excerpt', 'notes', 'text', 'email', 'name', 'phrase', 'prompt', 'title'];
const DECISIONS = ['approved', 'edited', 'undone', 'handled', 'ignored'];

function fail(msg, code) {
  const err = new Error(msg);
  err.code = code || 'OWN_USE';
  throw err;
}

function readExportFile(p) {
  const raw = fs.readFileSync(p, 'utf8').trim();
  if (!raw) return [];
  if (raw[0] === '[') {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) fail('export is not a list of events');
    return parsed;
  }
  if (raw[0] === '{') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.events)) return parsed.events;
      if (Array.isArray(parsed.decisions)) return parsed.decisions;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch (e) { /* fall through to jsonl */ }
  }
  return raw.split('\n').filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); }
    catch (e) { fail('export line ' + (i + 1) + ' is not JSON'); }
  });
}

function findExport(explicit) {
  if (explicit) {
    if (!fs.existsSync(explicit)) fail('export not found');
    return explicit;
  }
  if (process.env.GLANCE_OWN_USE_EXPORT) {
    if (!fs.existsSync(process.env.GLANCE_OWN_USE_EXPORT)) fail('GLANCE_OWN_USE_EXPORT does not exist');
    return process.env.GLANCE_OWN_USE_EXPORT;
  }
  for (const name of EXPORT_NAMES) {
    const p = path.join(PRIVATE_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function decisionOf(ev) {
  let named = String(ev.decision || ev.outcome || ev.kind || '').trim().toLowerCase();
  if (named === 'approve') named = 'approved';
  else if (named === 'edit') named = 'edited';
  else if (named === 'undo') named = 'undone';
  else if (named === 'handle') named = 'handled';
  if (DECISIONS.indexOf(named) >= 0) return named;
  if (ev.undone === true) return 'undone';
  if (ev.edited === true) return 'edited';
  if (ev.handled === true) return 'handled';
  if (ev.approved === true) return 'approved';
  if (ev.ignored === true) return 'ignored';
  return named || 'other';
}

function proofOf(ev) {
  const p = ev.proof && typeof ev.proof === 'object' ? ev.proof : {};
  const system = typeof p.system === 'string' && p.system ? p.system
    : (typeof ev.destinationSystem === 'string' && ev.destinationSystem ? ev.destinationSystem
      : (typeof ev.system === 'string' ? ev.system : ''));
  const externalId = typeof p.externalId === 'string' && p.externalId ? p.externalId
    : (typeof ev.externalId === 'string' ? ev.externalId : '');
  const verifiedAt = typeof p.verifiedAt === 'string' && p.verifiedAt ? p.verifiedAt
    : (typeof ev.verifiedAt === 'string' && ev.verifiedAt ? ev.verifiedAt
      : (typeof ev.at === 'string' ? ev.at : ''));
  const fetchedBack = p.fetchedBack === true || ev.fetchedBack === true;
  return { system, externalId, fetchedBack, verifiedAt };
}

function closeTypeOf(ev) {
  const t = String(ev.closeType || ev.loopType || ev.family || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(t)) return 'unknown';
  return t;
}

function stepOfEvent(ev) {
  const raw = typeof ev.step === 'string' ? ev.step : (typeof ev.proposed === 'string' ? ev.proposed : '');
  if (!raw) return null;
  const i = raw.indexOf('|');
  return (i < 0 ? raw : raw.slice(i + 1)).slice(0, 40);
}

function langOf(ev) {
  if (ev.lang === 'he' || ev.lang === 'en') return ev.lang;
  const blob = TEXT_KEYS.map((k) => (typeof ev[k] === 'string' ? ev[k] : '')).join(' ');
  if (/[֐-׿]/.test(blob)) return 'he';
  if (blob.trim()) return 'en';
  return 'unknown';
}

function idOf(ev, decision, proof, closeType) {
  if (typeof ev.id === 'string' && ev.id.trim()) return ev.id.trim().slice(0, 80);
  const basis = [decision, closeType, proof.system, proof.externalId, proof.verifiedAt, ev.at || ''].join('|');
  return 'own-' + crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

function labelerOf(ev) {
  return String(ev.labeledBy || ev.actor || ev.by || ev.author || ev.labeled_by || '').trim();
}

// Builds rows from events. Never copies ownerVerified off the event. An agent name throws
// and writes nothing. A hand label (labeledBy sali) is left untouched.
function ingestEvents(events) {
  if (!Array.isArray(events)) fail('export is not a list of events');
  const rows = [];
  let skippedHand = 0;
  for (const ev of events) {
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) fail('export event is not an object');
    const by = labelerOf(ev);
    if (by && isAgentLabeler(by)) {
      fail('refusing to set ownerVerified: an agent labeled this event', 'NOT_OWNER');
    }
    if (by && by !== 'sali' && by !== OWN_USE) {
      fail('refusing to set ownerVerified: labeledBy is not the owner', 'NOT_OWNER');
    }
    if (by === 'sali') { skippedHand++; continue; }
    const decision = decisionOf(ev);
    const proof = proofOf(ev);
    const closeType = closeTypeOf(ev);
    const row = {
      id: idOf(ev, decision, proof, closeType),
      labeledBy: OWN_USE,
      source: 'own-use',
      decision,
      proof,
      closeType,
      step: stepOfEvent(ev),
      lang: langOf(ev),
      at: typeof ev.at === 'string' ? ev.at : (proof.verifiedAt || null),
      connector: typeof ev.connector === 'string' ? ev.connector.slice(0, 80) : null,
      ownerVerified: false
    };
    if (row.step == null) delete row.step;
    if (row.connector == null) delete row.connector;
    row.ownerVerified = isOwnUse(row) === true;
    const masked = typeof ev.maskedSentence === 'string' ? ev.maskedSentence
      : (typeof ev.sentence === 'string' ? ev.sentence : (typeof ev.text === 'string' ? ev.text : ''));
    if (masked) row.maskedSentence = masked;
    rows.push(row);
  }
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }
  markHoldOut(unique);
  return { rows: unique, skippedHand };
}

function dayOf(row) {
  const t = row.at || (row.proof && row.proof.verifiedAt) || '';
  return String(t).slice(0, 10);
}

// The newest calendar day is held out of training. It still counts toward the 200.
function markHoldOut(rows) {
  const days = rows.map(dayOf).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const newest = days.length ? days[days.length - 1] : null;
  rows.forEach((row) => {
    row.holdOutFromTraining = Boolean(newest && dayOf(row) === newest);
  });
  return newest;
}

function emptyCounts() {
  const o = {};
  DECISIONS.concat(['other']).forEach((k) => { o[k] = 0; });
  return o;
}

function buildAggregate(info) {
  const rows = info.rows || [];
  const byDecision = emptyCounts();
  const qualifyingByDecision = emptyCounts();
  const byLang = { he: 0, en: 0, unknown: 0 };
  const byLoopType = {};
  LOOP_TYPES.forEach((t) => { byLoopType[t] = 0; });
  let qualifying = 0;
  let heldOutFromTraining = 0;
  rows.forEach((row) => {
    const d = DECISIONS.indexOf(row.decision) >= 0 ? row.decision : 'other';
    byDecision[d]++;
    const lang = row.lang === 'he' || row.lang === 'en' ? row.lang : 'unknown';
    if (row.ownerVerified === true) {
      qualifying++;
      qualifyingByDecision[d]++;
      byLang[lang]++;
      if (!Object.prototype.hasOwnProperty.call(byLoopType, row.closeType)) byLoopType[row.closeType] = 0;
      byLoopType[row.closeType]++;
      if (row.holdOutFromTraining) heldOutFromTraining++;
    }
  });
  const lackingLoopTypes = LOOP_TYPES.filter((t) => !byLoopType[t]);
  return {
    asOf: info.asOf || new Date().toISOString().slice(0, 10),
    exportFound: info.exportFound === true,
    events: info.events || 0,
    skippedHandLabels: info.skippedHand || 0,
    qualifying,
    minOwner: MIN_OWNER,
    remaining: Math.max(0, MIN_OWNER - qualifying),
    byDecision,
    qualifyingByDecision,
    byLang,
    byLoopType,
    lackingLoopTypes,
    heldOutFromTraining,
    privateTextCommitted: false
  };
}

function assertNoPrivate(aggregate, events) {
  const blob = JSON.stringify(aggregate);
  for (const ev of events || []) {
    for (const k of TEXT_KEYS) {
      const v = ev && ev[k];
      if (typeof v === 'string' && v.length >= 8 && blob.indexOf(v) >= 0) {
        fail('aggregate contains private text', 'PRIVACY');
      }
    }
    const id = ev && ev.proof && ev.proof.externalId;
    if (typeof id === 'string' && id.length >= 3 && blob.indexOf(id) >= 0) {
      fail('aggregate contains a connector id', 'PRIVACY');
    }
  }
}

function assertGitignoredPrivate(dest) {
  const rel = path.relative(ROOT, path.resolve(dest)).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.indexOf('flow-trial-extension/test/fixtures/private/') !== 0) {
    fail('private labels must stay in flow-trial-extension/test/fixtures/private/', 'PRIVACY');
  }
}

function privateCopy(rows) {
  return rows.map((row) => {
    const copy = Object.assign({}, row);
    return copy;
  });
}

function run(opts) {
  const o = opts || {};
  const exportPath = o.export === undefined ? findExport(null) : (o.export || null);
  const asOf = o.asOf || new Date().toISOString().slice(0, 10);
  if (!exportPath) {
    const aggregate = buildAggregate({ rows: [], exportFound: false, events: 0, skippedHand: 0, asOf });
    return { rows: [], aggregate, exportPath: null };
  }
  const events = readExportFile(exportPath);
  const ingested = ingestEvents(events);
  const aggregate = buildAggregate({
    rows: ingested.rows,
    exportFound: true,
    events: events.length,
    skippedHand: ingested.skippedHand,
    asOf
  });
  assertNoPrivate(aggregate, events);
  return { rows: ingested.rows, aggregate, exportPath };
}

function writeResult(result, opts) {
  const o = opts || {};
  const aggregatePath = o.aggregate || DEFAULT_AGGREGATE;
  if (result.rows.length) {
    const dest = o.private || DEFAULT_PRIVATE;
    assertGitignoredPrivate(dest);
    writeJsonl(dest, privateCopy(result.rows));
  }
  assertNoPrivate(result.aggregate, []);
  fs.mkdirSync(path.dirname(aggregatePath), { recursive: true });
  fs.writeFileSync(aggregatePath, JSON.stringify(result.aggregate, null, 2) + '\n');
  return { aggregatePath, privateWritten: result.rows.length > 0 };
}

function cli(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[++i];
  }
  const exportPath = o.export ? o.export : undefined;
  const result = run({ export: exportPath, asOf: o.asOf });
  const written = writeResult(result, { private: o.private, aggregate: o.aggregate });
  const a = result.aggregate;
  console.log(JSON.stringify({
    exportFound: a.exportFound,
    events: a.events,
    qualifying: a.qualifying,
    minOwner: a.minOwner,
    remaining: a.remaining,
    lackingLoopTypes: a.lackingLoopTypes,
    privateTextCommitted: false,
    aggregate: path.relative(ROOT, written.aggregatePath)
  }));
  return result;
}

module.exports = {
  MIN_OWNER, LOOP_TYPES, EXPORT_NAMES, PRIVATE_DIR, DEFAULT_PRIVATE, DEFAULT_AGGREGATE,
  readExportFile, findExport, decisionOf, ingestEvents, buildAggregate, assertNoPrivate, assertGitignoredPrivate,
  run, writeResult, cli
};

if (require.main === module) {
  try { cli(process.argv); }
  catch (e) { console.error(e.message); process.exit(e.code === 'NOT_OWNER' ? 2 : 1); }
}
