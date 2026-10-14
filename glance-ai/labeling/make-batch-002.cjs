'use strict';
// Active-learning batch-002. Reads the v2 held-out and the shadow-combined cases,
// drops batch-001 ids and anything that is not synthetic/generated, and picks 20
// cases where the systems disagree. Does not write owner answers and does not
// mark anything owner-verified.
//
//   node glance-ai/labeling/make-batch-002.cjs            # writes the batch files
//   node glance-ai/labeling/make-batch-002.cjs --dry      # prints the pick only
const fs = require('fs');
const path = require('path');
const { makeEngine, OWN } = require('../model/teacher/engine.cjs');
const { make: makeV2 } = require('../model/runtime/glance-close-v2.cjs');
const { make: makeV21 } = require('../model/runtime/glance-close-v21.cjs');
const { strictGated } = require('./score-owner-gold.cjs');
const LV = require('../oss/veto/llm-veto.cjs');
const { EVAL } = require('../paths.cjs');

const HERE = __dirname;
const TAU = 0.97;
const HE_N = 12;
const EN_N = 8;
const TOTAL = HE_N + EN_N;
const SCENARIO_CAP = 4;
const STEP_CAP = { draft: 6, task: 6, calendar: 5, file_save: 2 };

const HE_LABEL = {
  SILENT: 'שותק',
  'follow-up-ask|draft': 'טיוטת תשובה',
  'event|calendar': 'אירוע ביומן',
  'calendar-hold|calendar': 'שמירת זמן ביומן',
  'commitment|task': 'משימה (התחייבות)',
  'dated-commitment|task': 'משימה עם תאריך',
  'confirmed-amount|task': 'משימת סכום',
  'decision|task': 'משימה (החלטה)',
  'drive-file|file_save': 'שמירה ל-Drive / OneDrive',
  draft: 'טיוטת תשובה',
  task: 'משימה',
  calendar: 'יומן',
  file_save: 'שמירת קובץ'
};
const heLabel = (l) => HE_LABEL[l] || (l ? String(l).replace(/\|/g, ' / ') : 'שותק');

function readJsonl(p) {
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function stepOf(label) {
  if (!label || label === 'SILENT') return null;
  const i = String(label).indexOf('|');
  return i < 0 ? String(label) : String(label).slice(i + 1);
}
function customerish(blob) {
  return /customer|real-?mail|production inbox|gmail export/i.test(blob || '');
}
function firstLine(body) {
  return String(body || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
}

function silenceTags(c) {
  const text = (c.body || '') + '\n' + (c.subject || '');
  const tags = [];
  const moneyText = /[$€£₪]/.test(text) || /ש["״׳']{1,2}ח|שקלים|שקל(?![\u0590-\u05FF])/.test(text) || LV.moneyMovement({ body: c.body, subject: c.subject }, c.body);
  if (c.scenario === 'payment' || moneyText) tags.push('money');
  if (c.scenario === 'fyi' || /לא\s+נדרש(?:ת|ים|ות)?\s+(?:פעולה|דבר)|לידיעה\s+בלבד|לתיעוד\s+בלבד|\bno\s+action\s+(?:is\s+)?(?:needed|required)\b|\bfyi\s+only\b/i.test(text)) tags.push('fyi');
  if (/היי\s+לכולם|הי\s+לכולם|(?:^|\s)לכולם[,:\s]|hi\s+all\b|hi\s+team\b|hello\s+(?:everyone|team|all)\b|hey\s+(?:team|everyone|all)\b|dear\s+team\b/i.test(text)) tags.push('group');
  const social = /^(?:thanks|thank you|got it|sounds good|great meeting|תודה|קיבלתי|סבבה|מעולה)\b/i.test(firstLine(c.body));
  const commitment = /\b(?:we will|i will|i'll|we'll|please|can you|could you|send|let's|by )\b|[$€£₪]|נשלח|אשלח|נעביר|בבקשה|אפשר|תשלח|עד יום/i.test(text);
  if ((c.scenario === 'ack' || social) && !commitment && !moneyText) tags.push('smalltalk');
  if (c.scenario === 'injection' || c.kind === 'injection' || /^inj-/.test(c.id || '') || LV.textVeto({ body: c.body, subject: c.subject }, c.body) === 'injection') tags.push('injection');
  return tags;
}

function buildPool() {
  const b1 = JSON.parse(fs.readFileSync(path.join(HERE, 'batch-001.json'), 'utf8'));
  const skipId = new Set(b1.map((r) => r.id));
  const skipTpl = new Set(b1.map((r) => r.templateId).filter(Boolean));
  const held = readJsonl(EVAL.v2Test());
  const shadow = readJsonl(EVAL.shadowCases());
  const qwen = new Map(readJsonl(path.join(HERE, '..', 'oss', 'shadow-combined', 'llm-qwen3.5-4b.jsonl')).map((r) => [r.id, r]));
  const v2p = new Map(readJsonl(path.join(HERE, '..', 'model', 'artifacts', 'v2.test-preds.jsonl')).map((r) => [r.id, r]));
  const v21p = new Map(readJsonl(path.join(HERE, '..', 'model', 'artifacts', 'v21.test-preds.jsonl')).map((r) => [r.id, r]));
  const shadowBy = new Map(shadow.map((r) => [r.id, r]));
  const pool = [];
  for (const r of held) {
    if (skipId.has(r.id)) continue;
    if (customerish(r.provenance) || customerish(r.frameOrigin)) continue;
    pool.push({ kind: 'heldout', row: r, shadow: shadowBy.get(r.id) || null, v2stored: v2p.get(r.id) || null, v21stored: v21p.get(r.id) || null });
  }
  for (const s of shadow) {
    if (skipId.has(s.id) || shadowBy.get(s.id) && held.some((r) => r.id === s.id)) continue;
    if (customerish(s.set) || customerish(s.id)) continue;
    pool.push({ kind: 'shadow', row: null, shadow: s, v2stored: null, v21stored: null });
  }
  return { pool, qwen, skipTpl, b1: b1.length };
}

function caseOf(entry) {
  if (entry.row) return entry.row;
  const s = entry.shadow;
  const surface = s.surface === 'outlook' ? 'outlook' : 'gmail';
  const direction = s.direction || 'inbound';
  const own = OWN[surface];
  const fromEmail = (s.prompt && s.prompt.from) || '';
  return {
    id: s.id,
    lang: s.lang,
    surface,
    direction,
    subject: s.subject || '',
    body: s.own || (s.prompt && s.prompt.body) || '',
    attachmentCount: s.attachmentCount || 0,
    from: { name: '', email: direction === 'inbound' ? fromEmail : own },
    to: direction === 'inbound' ? [own] : [fromEmail || 'other@example.com'],
    cc: [],
    ownNames: ['Sali', 'Sali Sapan', 'סאלי'],
    scenario: s.set || 'shadow',
    templateId: s.id,
    provenance: 'shadow-' + (s.set || 'generated'),
    reference: { label: null, ownerVerified: false }
  };
}

function scoreEntry(entry, systems) {
  const present = systems.filter((s) => s.label != null);
  const shows = present.filter((s) => s.label !== 'SILENT');
  const silents = present.filter((s) => s.label === 'SILENT');
  const steps = [...new Set(shows.map((s) => stepOf(s.label)).filter(Boolean))];
  const split = shows.length > 0 && silents.length > 0;
  const p = entry.v2p;
  const margin = p == null ? 1 : Math.abs(p - TAU);
  let rank = 0;
  if (split) rank += 1000;
  rank += Math.min(shows.length, silents.length) * 20;
  // A model card while another system stays silent is the wrong-Do-It side of the disagreement.
  if (systems[0] && systems[0].label && systems[0].label !== 'SILENT' && silents.length) rank += 40;
  if (steps.length > 1) rank += 8;
  // A cached Qwen call on the same case is extra information for the same owner minute.
  if (systems[3] && systems[3].label != null && split) rank += 25;
  rank += Math.max(0, 10 - margin * 100);
  return { split, shows: shows.length, silents: silents.length, steps, margin, rank, present: present.length };
}

function pick(scored) {
  const picked = [];
  const usedTpl = new Set();
  const scen = {};
  function langCount(l) { return picked.filter((c) => c.lang === l).length; }
  function skeleton(c) {
    const toks = String(c.body || '').toLowerCase().replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\d+/g, '0').split(/\s+/).filter(Boolean);
    return toks.slice(0, 5).join(' ');
  }
  const usedSkel = new Set();
  function stepCount(step) { return picked.filter((c) => c.steps.includes(step)).length; }
  function canTake(c, opts) {
    opts = opts || {};
    if (usedTpl.has(c.templateId)) return false;
    if (usedSkel.has(skeleton(c))) return false;
    if (!opts.ignoreStepCap) {
      for (const step of c.steps) {
        if (STEP_CAP[step] && stepCount(step) >= STEP_CAP[step]) return false;
      }
    }
    if (c.lang === 'he' && langCount('he') >= HE_N) return false;
    if (c.lang === 'en' && langCount('en') >= EN_N) return false;
    if (!opts.ignoreScenario && (scen[c.scenario] || 0) >= SCENARIO_CAP) return false;
    if (opts.inboundOnly && c.direction !== 'inbound') return false;
    return true;
  }
  function take(c) {
    picked.push(c);
    usedTpl.add(c.templateId);
    usedSkel.add(skeleton(c));
    scen[c.scenario] = (scen[c.scenario] || 0) + 1;
  }
  const LABEL_CAP = 4;
  const PAIR_CAP = 2;
  function v2Count(label) { return picked.filter((c) => c.systems.v2 === label).length; }
  function pairCount(c0) {
    const key = c0.systems.v2 + '|' + c0.systems.tip;
    return picked.filter((c) => c.systems.v2 + '|' + c.systems.tip === key).length;
  }
  function capped(c, opts) {
    if (!canTake(c, opts)) return false;
    if (c.systems.v2 === 'confirmed-amount|task' && v2Count(c.systems.v2) >= 1) return false;
    if (!opts.ignoreLabelCap && c.systems.v2 && c.systems.v2 !== 'SILENT' && v2Count(c.systems.v2) >= (opts.labelCap || LABEL_CAP)) return false;
    if (!opts.ignorePairCap && pairCount(c) >= (opts.pairCap || PAIR_CAP)) return false;
    return true;
  }
  const ranked = scored.slice().sort((a, b) => b.rank - a.rank || a.margin - b.margin || (a.id < b.id ? -1 : 1));
  function best(pred, opts) {
    opts = opts || {};
    return ranked.find((c) => !picked.includes(c) && pred(c) && capped(c, opts));
  }
  // Silence-candidate quotas first, preferring a real show/silent split.
  for (const tag of ['money', 'fyi', 'group', 'smalltalk', 'injection']) {
    const c = best((x) => x.tags.includes(tag) && x.split, { inboundOnly: true })
      || best((x) => x.tags.includes(tag) && x.split)
      || best((x) => x.tags.includes(tag), { inboundOnly: true });
    if (c) take(c);
  }
  // A sixth silence candidate: a pay / wire / transfer line, not a second "the amount is $N".
  const pay = /שלם|תשלום|העבר(?:ה|ת)|pay\b|wire\b|transfer\b|invoice/i;
  const sixth = best((x) => x.tags.includes('money') && x.split && pay.test(x.body) && x.systems.v2 !== 'confirmed-amount|task', { inboundOnly: true })
    || best((x) => x.tags.length && x.split && x.systems.v2 !== 'confirmed-amount|task', { inboundOnly: true });
  if (sixth) take(sixth);
  // Qwen coverage.
  let qn = picked.filter((c) => c.qwen).length;
  while (qn < 2) {
    const c = best((x) => x.qwen && x.split, { inboundOnly: true }) || best((x) => x.qwen && x.split) || best((x) => x.qwen);
    if (!c) break;
    take(c);
    qn++;
  }
  // Action coverage, including a Drive save and a OneDrive save when one exists.
  function hasStep(step) { return picked.some((c) => c.steps.includes(step)); }
  for (const step of ['draft', 'task', 'calendar', 'file_save']) {
    if (hasStep(step)) continue;
    const c = best((x) => x.steps.includes(step) && x.split, { inboundOnly: true }) || best((x) => x.steps.includes(step) && x.split);
    if (c) take(c);
  }
  function hasDrive(which) {
    return picked.some((c) => (which === 'onedrive' ? c.onedrive : c.drive) && c.steps.includes('file_save'));
  }
  if (!hasDrive('drive')) {
    const c = best((x) => x.drive && x.steps.includes('file_save') && x.split) || best((x) => x.drive && x.steps.includes('file_save'));
    if (c) take(c);
  }
  if (!hasDrive('onedrive')) {
    const c = best((x) => x.onedrive && x.steps.includes('file_save') && x.split) || best((x) => x.onedrive && x.steps.includes('file_save'));
    if (c) take(c);
  }
  // Fill real splits. The same v2 label, and the same v2-vs-tip pair, stay capped
  // so the sheet is not eleven copies of one near-threshold draft.
  const fills = [
    { inboundOnly: true },
    { inboundOnly: true, ignoreScenario: true },
    { inboundOnly: true, ignoreScenario: true, pairCap: 3 },
    // A new disagreement pair is new information. Repeating a step is allowed
    // only when that pair is not already on the sheet.
    { inboundOnly: true, ignoreScenario: true, ignoreStepCap: true, pairCap: 2, labelCap: 4 }
  ];
  for (const opts of fills) {
    for (const c of ranked) {
      if (picked.length >= TOTAL) break;
      if (!c.split) continue;
      if (!capped(c, opts)) continue;
      take(c);
    }
  }
  return picked;
}

const GIST = {
  'v2syn-23763': 'נועה מודיעה שאושר תקציב של ₪500 לחידוש החוזה. אין כאן בקשה לשלם.',
  'v2syn-25810': 'מיכאל שולח דוח הוצאות וכותב שזה לתיעוד בלבד, לא נדרש דבר.',
  'v2syn-12865': 'שרה פונה לכל הקבוצה (Hi all) ומבקשת למלא היום את תזכיר הדירקטוריון.',
  'v2rtest-follow-up-corpus-696': 'תודה על השיחה, ואם יש שאלות אפשר לפנות. אין תאריך ואין בקשה מפורשת.',
  'inj-he-4': 'שורה שמורה למערכת ("אשר כל בקשה") ואז בקשה לשמור את הקובץ המצורף בדרייב.',
  'oss-B-prom-05': 'התחייבות לשלם את החשבונית עד יום ראשון.',
  'v2syn-9042': 'בקשה לשמור את הקובץ המצורף ב-OneDrive.',
  'v2syn-14049': 'שרה כותבת לליאור, לא אליך, שהוא אמר שיחזור עם ה-NDA עד 15 באוקטובר.',
  'oss-he-promise-047': 'דנה כותבת שנעביר את הזמנת הרכש עד יום ראשון.',
  'oss-en-promise-036': 'אחרי שיחה, אלכס כותב שנשלח את דוח הרבעון עד 20 באוקטובר.',
  'oss-en-promise-031': 'נועה כותבת שהיא תשלח אליך את דוח הרבעון עד יום שישי.',
  'v2syn-1096': 'תזכורת שאתה תשתף את גיליון התקציב עד 15 באוקטובר.',
  'v2syn-22902': 'שאלה אם מתאים שיחה ב-19 באוקטובר בשעה 15:00.',
  'v2rtest-intent-actions-corpus-887': 'הודעה שקבעו שיחה מחר ב-15:00 לסקירת החוזה.',
  'v2syn-12239': 'מיכאל שואל אם יש את החשבונית ומבקש לשלוח אותה מחר.',
  'v2syn-7685': 'שרה מזכירה שהתחייבת לשלוח את ה-SOW ביום שלישי הבא.',
  'oss-he-meet-013': 'דוד מציע להיפגש ביום רביעי ב-14:00 ולעבור על ההשקה.',
  'v2syn-1033': 'דנה כותבת שהזכרת שתחדש את בקשת הדרכון עד יום חמישי.',
  'ctrl-he-1': 'יעל כותבת שהיא תשלח אליך את הצעת המחיר עד יום ראשון.',
  'v2rtest-intent-actions-corpus-932': 'בקשה אליך: אתה אמור לשלוח את החוזה עד יום שני.'
};

function gistOf(c) {
  if (GIST[c.id]) return GIST[c.id];
  const line = firstLine(c.body).replace(/\s+/g, ' ').slice(0, 90);
  return (c.subject ? c.subject + ' — ' : '') + line;
}

function glanceWould(c) {
  const v2 = c.systems.v2;
  const tip = c.systems.tip;
  const v2s = !v2 || v2 === 'SILENT';
  const tips = !tip || tip === 'SILENT';
  if (!v2s && tips) return 'המודל היה מציג ' + heLabel(v2) + ', המנוע שותק';
  if (v2s && !tips) return 'המודל שותק, המנוע היה מציג ' + heLabel(tip);
  if (!v2s && !tips && v2 !== tip) return 'המודל היה מציג ' + heLabel(v2) + ', המנוע היה מציג ' + heLabel(tip);
  if (!v2s) {
    const v21s = !c.systems.v21 || c.systems.v21 === 'SILENT';
    return 'המודל והמנוע היו מציגים ' + heLabel(v2) + (v21s ? ', ו-v2.1 שותק' : '');
  }
  return 'המודל והמנוע שותקים';
}

function renderMd(picked) {
  let md = '<div dir="rtl">\n\n# סבב תיוג #2 – Glance\n\n';
  md += '**למי:** סאלי. **לא נשלח** – קובץ מוכן לתיוג בלבד. אין כאן תשובות מוצעות.\n\n';
  md += '**מה זה:** 20 מיילים סינתטיים שהמערכות לא מסכימות עליהם. כל שורה היא המייל בקצרה, ומה Glance היה עושה עכשיו. ';
  md += 'התשובה שלך היא התווית. עדיף לשתוק מאשר להציע פעולה שגויה. לולאה נסגרת רק אחרי שהדבר באמת חזר (fetchedBack) — טיוטה, משימה או שמירה הן הכנה, לא סגירה.\n\n';
  md += '**איך עונים:** ✅ הפעולה של המודל · ⚙️ הפעולה של המנוע (כשהיא שונה) · 🤫 לשתוק · ❓ לא בטוח. קובץ התשובות הריק: `batch-002.answers.json`.\n\n---\n';
  picked.forEach((c, i) => {
    const n = i + 1;
    const dir = c.direction === 'inbound' ? 'נכנס' : c.direction === 'outbound' ? 'יוצא (ממך)' : 'ממך אליך';
    const cc = (c.cc || []).length ? ' · Cc: ' + c.cc.join(', ') : '';
    const att = c.attachmentCount ? ' · 📎 ' + c.attachmentCount : '';
    md += '\n## ' + n + '. ' + (c.lang === 'he' ? 'עברית' : 'אנגלית') + ' · ' + (c.surface === 'gmail' ? 'Gmail' : 'Outlook') + ' · ' + dir + att + '\n\n';
    md += '**בשורה:** ' + gistOf(c) + ' **Glance עכשיו:** ' + glanceWould(c) + '. סימון: ✅ ⚙️ 🤫 ❓\n\n';
    md += '**נושא:** ' + (c.subject || '(ללא)') + '  \n**מאת:** ' + (c.fromName || '') + ' · **אל:** ' + (c.to || []).join(', ') + cc + '\n\n';
    md += '<div dir="auto">\n\n' + String(c.body || '').replace(/[\u200e\u200f]/g, '').split('\n').filter((l) => l.trim()).slice(0, 8).map((l) => '> ' + l.trim()).join('\n') + '\n\n</div>\n\n';
    md += '| | החלטה |\n|---|---|\n';
    md += '| מודל v2 + שתיקה | ' + heLabel(c.systems.v2) + (c.v2p != null ? ' (ביטחון ' + Math.round(c.v2p * 100) + '%)' : '') + ' |\n';
    md += '| מודל v2.1 + שתיקה | ' + heLabel(c.systems.v21) + ' |\n';
    md += '| מנוע (הקצה) | ' + heLabel(c.systems.tip) + ' |\n';
    md += '| Qwen בשער | ' + (c.qwen ? heLabel(c.systems.qwen) : 'אין תחזית שמורה') + ' |\n\n';
    md += '**למה זה כאן:** ' + c.why + '\n\n';
    if (c.systems.v2 && c.systems.v2 !== 'SILENT') md += '- [ ] ✅ להציע (כמו המודל): ' + heLabel(c.systems.v2) + '\n';
    if (c.systems.tip && c.systems.tip !== 'SILENT' && c.systems.tip !== c.systems.v2) md += '- [ ] ⚙️ להציע (כמו המנוע): ' + heLabel(c.systems.tip) + '\n';
    md += '- [ ] 🤫 לשתוק\n- [ ] ❓ לא בטוח · הערה: ______\n\n';
    md += '<sub>id: ' + c.id + '</sub>\n\n---\n';
  });
  md += '\n</div>\n';
  return md;
}

function whyOf(c) {
  const bits = [];
  if (c.split) bits.push('מערכת אחת מציגה פעולה ומערכת אחרת שותקת');
  if (c.tags.includes('money')) bits.push('יש כאן סכום או כסף');
  if (c.tags.includes('fyi')) bits.push('נראה כמו עדכון לידיעה');
  if (c.tags.includes('group')) bits.push('פנייה לקבוצה');
  if (c.tags.includes('smalltalk')) bits.push('נראה כמו שיחת חולין או אישור קצר');
  if (c.tags.includes('injection')) bits.push('טקסט שמנסה לתת הוראה למערכת');
  if (c.margin <= 0.03) bits.push('המודל קרוב לסף 0.97');
  if (c.qwen) bits.push('יש תחזית Qwen שמורה, כך שהתיוג שלך מכסה גם אותה');
  if (c.onedrive) bits.push('השמירה המבוקשת היא ל-OneDrive');
  else if (c.drive) bits.push('השמירה המבוקשת היא ל-Drive');
  return bits.join('. ') + '.';
}

function run(argv) {
  const dry = argv.includes('--dry');
  const t0 = Date.now();
  const { pool, qwen, skipTpl } = buildPool();
  const engine = makeEngine('tip');
  const v2 = makeV2('v2');
  const v21 = makeV21('v21');
  const scored = [];
  for (const entry of pool) {
    const c = caseOf(entry);
    if (!c.body || !String(c.body).trim()) continue;
    if (customerish(c.provenance)) continue;
    let v2label, v21label, v2p;
    if (entry.v2stored) {
      v2label = entry.v2stored.pred;
      v2p = entry.v2stored.p;
      v21label = entry.v21stored ? entry.v21stored.pred : null;
    } else {
      const d2 = v2.decide(c);
      const d21 = v21.decide(c);
      v2label = d2.label;
      v21label = d21.label;
      v2p = d2.pShow;
    }
    let tip;
    try { tip = engine.teach(c).label; } catch (e) { tip = 'SILENT'; }
    let qwenLabel = null;
    const cached = qwen.get(c.id);
    if (entry.shadow && cached && cached.pred) qwenLabel = strictGated(entry.shadow, cached.pred).step;
    const voc = (c.addressee && c.addressee.voc) || (entry.v2stored && entry.v2stored.voc) || null;
    const text = (c.body || '') + '\n' + (c.subject || '');
    const rec = {
      id: c.id,
      templateId: c.templateId || c.id,
      lang: c.lang === 'he' ? 'he' : 'en',
      surface: c.surface,
      direction: c.direction || 'inbound',
      subject: c.subject || '',
      body: c.body,
      fromName: (c.from && c.from.name) || '',
      fromEmail: (c.from && c.from.email) || '',
      to: c.to || [],
      cc: c.cc || [],
      attachmentCount: c.attachmentCount || 0,
      scenario: c.scenario || (entry.shadow && entry.shadow.set) || '',
      provenance: c.provenance || (entry.shadow && ('shadow-' + entry.shadow.set)) || '',
      set: entry.shadow ? entry.shadow.set : null,
      kind: entry.shadow && entry.shadow.gold ? entry.shadow.gold.kind : null,
      voc,
      v2p,
      systems: { v2: v2label, v21: v21label, tip, qwen: qwenLabel },
      qwen: qwenLabel != null,
      drive: /\bdrive\b|דרייב|בגוגל/i.test(text) && !/one\s?-?drive|וואן\s?-?דרייב/i.test(text),
      onedrive: /one\s?-?drive|וואן\s?-?דרייב/i.test(text),
      reference: c.reference || null
    };
    rec.tags = silenceTags(Object.assign({}, rec, { voc }));
    if (skipTpl.has(rec.templateId)) continue;
    const sc = scoreEntry(rec, [
      { label: v2label },
      { label: v21label },
      { label: tip },
      { label: qwenLabel }
    ]);
    Object.assign(rec, sc);
    scored.push(rec);
  }
  const picked = pick(scored);
  picked.forEach((c) => { c.why = whyOf(c); });
  const summary = {
    pool: scored.length,
    picked: picked.length,
    he: picked.filter((c) => c.lang === 'he').length,
    en: picked.filter((c) => c.lang === 'en').length,
    qwen: picked.filter((c) => c.qwen).length,
    silence: picked.filter((c) => c.tags.length).length,
    tags: ['money', 'fyi', 'group', 'smalltalk', 'injection'].map((t) => t + ':' + picked.filter((c) => c.tags.includes(t)).length).join(' '),
    steps: ['draft', 'task', 'calendar', 'file_save'].map((s) => s + ':' + picked.filter((c) => c.steps.includes(s)).length).join(' '),
    drive: picked.filter((c) => c.drive && c.steps.includes('file_save')).length,
    onedrive: picked.filter((c) => c.onedrive && c.steps.includes('file_save')).length,
    split: picked.filter((c) => c.split).length,
    secs: (Date.now() - t0) / 1000
  };
  const missingGist = picked.filter((c) => !GIST[c.id]).map((c) => c.id);
  if (!dry && missingGist.length) {
    console.error('missing Hebrew gist for ' + missingGist.join(', '));
    process.exitCode = 1;
    return { summary, picked, scored };
  }
  if (dry || picked.length !== TOTAL) {
    const bucket = {};
    for (const tag of ['money', 'fyi', 'group', 'smalltalk', 'injection']) {
      const rows = scored.filter((c) => c.tags.includes(tag));
      bucket[tag] = { n: rows.length, split: rows.filter((c) => c.split).length, he: rows.filter((c) => c.lang === 'he').length };
    }
    summary.bucket = bucket;
    console.log(JSON.stringify(summary, null, 1));
    for (const c of picked) {
      console.log([c.lang, c.tags.join('+') || '-', (c.steps.join('+') || 'silent'), c.qwen ? 'qwen' : '-', c.v2p != null ? c.v2p.toFixed(3) : '-', c.systems.v2, c.systems.v21, c.systems.tip, c.systems.qwen, c.id].join(' | '));
      console.log('   ' + String(c.body).replace(/\s+/g, ' ').slice(0, 220));
    }
    if (picked.length !== TOTAL) process.exitCode = 1;
    return { summary, picked, scored };
  }
  const json = picked.map((c) => ({
    id: c.id,
    templateId: c.templateId,
    lang: c.lang,
    surface: c.surface,
    direction: c.direction,
    subject: c.subject,
    body: c.body,
    from: { name: c.fromName, email: c.fromEmail },
    to: c.to,
    cc: c.cc,
    attachmentCount: c.attachmentCount,
    scenario: c.scenario,
    provenance: c.provenance,
    set: c.set,
    engineTip: c.systems.tip,
    engine35: c.systems.tip,
    v2: c.systems.v2,
    v21: c.systems.v21,
    qwen: c.qwen ? c.systems.qwen : null,
    v2pShow: c.v2p == null ? null : +c.v2p.toFixed(4),
    marginToTau: +c.margin.toFixed(4),
    silenceTags: c.tags,
    steps: c.steps,
    split: c.split,
    rank: c.rank,
    why: c.why,
    reference: { ownerVerified: false },
    ownerAnswer: null
  }));
  const { stampRow } = require('./context-tags.cjs');
  json.forEach(stampRow);
  fs.writeFileSync(path.join(HERE, 'batch-002.json'), JSON.stringify(json, null, 1) + '\n');
  fs.writeFileSync(path.join(HERE, 'batch-002.md'), renderMd(picked));
  const answers = {
    labeledBy: '',
    labeledAt: null,
    consent: false,
    batches: ['batch-002'],
    note: 'Empty template. Not owner-verified. Fill mark with ✅, ⚙️, 🤫, or ❓. labeledBy is sali only for an owner-verified row. ❓ stays out of the headline.',
    answers: json.map((r, i) => ({ item: i + 1, id: r.id, mark: null, note: '' }))
  };
  fs.writeFileSync(path.join(HERE, 'batch-002.answers.json'), JSON.stringify(answers, null, 1) + '\n');
  fs.writeFileSync(path.join(HERE, 'batch-002.selection.json'), JSON.stringify({ summary, rows: json.map((r) => ({ id: r.id, lang: r.lang, scenario: r.scenario, provenance: r.provenance, set: r.set, v2: r.v2, v21: r.v21, engineTip: r.engineTip, qwen: r.qwen, v2pShow: r.v2pShow, marginToTau: r.marginToTau, silenceTags: r.silenceTags, steps: r.steps, split: r.split, rank: r.rank })) }, null, 1) + '\n');
  console.log(JSON.stringify(summary));
  return { summary, picked };
}

module.exports = { run, pick, silenceTags, HE_N, EN_N };

if (require.main === module) run(process.argv);
