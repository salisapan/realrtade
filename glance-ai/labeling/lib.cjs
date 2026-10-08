'use strict';
// Shared pieces for the owner-label path. Silence beats a wrong Do It.
const fs = require('fs');
const path = require('path');

const OWNER = 'sali';
const HERE = __dirname;
const SCHEMA_PATH = path.join(HERE, 'schema.json');

// Canonical family|step -> the close that action serves. A draft is the step; the close is the reply.
const ACTION_CLOSE = {
  'follow-up-ask|draft': 'reply that answers the ask',
  'commitment|task': 'task for the open commitment',
  'dated-commitment|task': 'task with the stated due date',
  'confirmed-amount|task': 'payment task for the confirmed amount',
  'decision|task': 'task for the decision',
  'calendar-hold|calendar': 'hold the time on the calendar',
  'event|calendar': 'add the event to the calendar',
  'drive-file|file_save': 'save the attachment to Drive or OneDrive',
  'calendar-cancel|calendar': 'cancel the calendar event'
};

const MARK = {
  '✅': 'model',
  '✔': 'model',
  '⚙': 'engine',
  '🤫': 'silent',
  '❓': 'unsure',
  '?': 'unsure',
  model: 'model',
  engine: 'engine',
  silent: 'silent',
  unsure: 'unsure'
};

function isOwner(labeledBy) {
  return String(labeledBy || '').trim() === OWNER;
}

function normMark(mark) {
  const s = String(mark || '').trim().replace(/\uFE0F/g, '');
  const m = MARK[s];
  if (!m) {
    const err = new Error('unknown mark: ' + mark);
    err.code = 'BAD_MARK';
    throw err;
  }
  return m;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  const t = fs.readFileSync(p, 'utf8').trim();
  if (!t) return [];
  return t.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function writeJsonl(p, rows) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, rows.length ? rows.map((r) => JSON.stringify(r)).join('\n') + '\n' : '');
}

function loadBatch(p) {
  const items = readJson(p);
  if (!Array.isArray(items) || !items.length) throw new Error('batch file is empty: ' + p);
  return items.map((r, i) => Object.assign({ item: i + 1 }, r));
}

function rate(n, d) {
  const den = d || 0;
  if (!den) return '— (0/' + den + ')';
  return (100 * n / den).toFixed(1) + '% (' + n + '/' + den + ')';
}

function stepOf(label) {
  if (!label || label === 'SILENT') return 'SILENT';
  const i = String(label).indexOf('|');
  return i < 0 ? String(label) : String(label).slice(i + 1);
}

// Strict counts. No unsure rows are dropped: the caller has already replaced y.
function metricsOf(rows, yOf, predOf) {
  const m = {
    n: 0, silent: 0, show: 0, wdi: 0, miss: 0, wact: 0,
    he: { silent: 0, show: 0, wdi: 0, miss: 0 },
    en: { silent: 0, show: 0, wdi: 0, miss: 0 }
  };
  for (const r of rows) {
    const y = yOf(r);
    const p = predOf(r);
    if (p == null) continue;
    const L = r.lang === 'he' ? 'he' : 'en';
    m.n++;
    const ySil = y === 'SILENT';
    const pShow = p !== 'SILENT';
    if (ySil) {
      m.silent++; m[L].silent++;
      if (pShow) { m.wdi++; m[L].wdi++; }
    } else {
      m.show++; m[L].show++;
      if (!pShow) { m.miss++; m[L].miss++; }
      else if (p !== y) m.wact++;
    }
  }
  return {
    n: m.n,
    wrongDoIt: rate(m.wdi, m.silent),
    missed: rate(m.miss, m.show),
    wrongAction: rate(m.wact, m.show),
    heWrongDoIt: rate(m.he.wdi, m.he.silent),
    enWrongDoIt: rate(m.en.wdi, m.en.silent),
    heMissed: rate(m.he.miss, m.he.show),
    enMissed: rate(m.en.miss, m.en.show),
    raw: m
  };
}

function validateRow(row, schema) {
  schema = schema || readJson(SCHEMA_PATH);
  const errors = [];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ['row is not an object'];
  for (const k of Object.keys(row)) {
    if (!schema.properties[k]) errors.push('unknown field ' + k);
  }
  for (const k of schema.required) {
    if (row[k] === undefined) errors.push('missing ' + k);
  }
  const hasBody = typeof row.redactedBody === 'string';
  const hasHash = typeof row.bodyHash === 'string' && typeof row.excerpt === 'string';
  if (!hasBody && !hasHash) errors.push('need redactedBody or bodyHash+excerpt');
  const props = schema.properties;
  for (const [k, spec] of Object.entries(props)) {
    if (row[k] === undefined) continue;
    const v = row[k];
    const types = [].concat(spec.type);
    const okType = types.some((t) => (t === 'null' ? v === null : t === 'boolean' ? typeof v === 'boolean' : t === 'string' ? typeof v === 'string' : t === 'integer' || t === 'number' ? typeof v === 'number' : false));
    if (!okType) errors.push(k + ' has the wrong type');
    if (spec.enum && v != null && spec.enum.indexOf(v) < 0) errors.push(k + ' not in enum');
    if (spec.minLength && typeof v === 'string' && v.length < spec.minLength) errors.push(k + ' too short');
    if (spec.pattern && typeof v === 'string' && !(new RegExp(spec.pattern).test(v))) errors.push(k + ' pattern');
    if (k === 'labeledAt' && typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) errors.push('labeledAt is not a date-time');
  }
  if (row.ownerLabel === 'SILENT' && row.expectedAction != null) errors.push('SILENT requires expectedAction null');
  if (row.ownerLabel === 'ASK' && (typeof row.expectedAction !== 'string' || !row.expectedAction)) errors.push('ASK requires expectedAction');
  if (row.ownerVerified === true && !isOwner(row.labeledBy)) errors.push('ownerVerified true but labeledBy is not the owner');
  return errors;
}

// Header lines of batch-001.md, keyed by id. Bodies stay in the json.
function parseSheet(md) {
  const blocks = String(md).split(/\n## /).slice(1);
  const out = new Map();
  for (const b of blocks) {
    const head = b.split('\n')[0];
    const hm = head.match(/^(\d+)\.\s+\S+\s+·\s+(Gmail|Outlook)\s+·\s+(.+)$/);
    if (!hm) continue;
    const idm = b.match(/id:\s*(\S+)/);
    if (!idm) continue;
    const who = b.match(/\*\*מאת:\*\*\s*(.*?)\s*·\s*\*\*אל:\*\*\s*([^\n]+)/);
    let toRaw = who ? who[2].trim() : '';
    let cc = [];
    const ccAt = toRaw.search(/\s·\s*Cc:\s*/i);
    if (ccAt >= 0) {
      cc = toRaw.slice(ccAt).replace(/^\s·\s*Cc:\s*/i, '').split(',').map((s) => s.trim()).filter(Boolean);
      toRaw = toRaw.slice(0, ccAt).trim();
    }
    const dirText = hm[3];
    const att = dirText.match(/📎\s*(\d+)/);
    let direction = 'inbound';
    if (dirText.indexOf('ממך אליך') >= 0) direction = 'self';
    else if (dirText.indexOf('יוצא') >= 0) direction = 'outbound';
    out.set(idm[1], {
      item: Number(hm[1]),
      surface: hm[2].toLowerCase(),
      direction,
      attachmentCount: att ? Number(att[1]) : 0,
      fromName: who ? who[1].trim() : '',
      to: toRaw.split(',').map((s) => s.trim()).filter(Boolean),
      cc
    });
  }
  return out;
}

module.exports = {
  OWNER, HERE, SCHEMA_PATH, ACTION_CLOSE,
  isOwner, normMark, readJson, readJsonl, writeJsonl, loadBatch, rate, stepOf, metricsOf, validateRow, parseSheet
};
