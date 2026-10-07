'use strict';
// SFT v2 rows for the Glance judge LoRA. Step 1 of 2 (node): v1 rows (data/sft_train.jsonl + sft_val.jsonl, kept unchanged) are
// re-checked with the SAME rules the runtime gate uses (oss-models/veto/propose-gate.cjs, shadow-combined/gated/relabel.cjs,
// model/suggest-save/suggest-save.js), then new EN/HE examples are generated for: unsupported kinds, undated asks, money/offer
// acceptance, attach-to-invite (silence + the right-kind contrast) and attachmentSave (suggest-save consistent).
// Every row is checked against the held-out sets (v2 test split, CORE162, adversarial-v2, injection set): exact normalized-body
// matches are dropped. Writes data/v2/_rows.jsonl (case + target + meta) and data/v2/corrections.jsonl.
// Step 2 (python build_sft_v2.py) wraps rows with prompt_v2.SYSTEM_V2 / render_v2 into chat format.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PG = require('../veto/propose-gate.cjs');
const LV = require('../veto/llm-veto.cjs');
const RL = require('../shadow-combined/gated/relabel.cjs');
const { ROOT: AI, EVAL } = require('../../paths.cjs');
const SS = require(path.join(AI, 'model/suggest-save/suggest-save.js'));
const D = process.env.GLANCE_V2_DATASET || path.join(AI, 'model', 'dataset', 'out-v2'), OUT = path.join(__dirname, 'data', 'v2');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const norm = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
const HEB = /[\u0590-\u05FF]/;
let seed = 2026; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const stats = {}; const inc = (k, n = 1) => (stats[k] = (stats[k] || 0) + n);

// ---------- held-out bodies ----------
const held = new Set(); const heldIds = new Set();
const testFile = fs.existsSync(D + '/test.jsonl') ? D + '/test.jsonl' : EVAL.v2Test();
for (const r of read(testFile)) { held.add(norm(r.body)); held.add(norm(r.cleanBody)); heldIds.add(r.id); }
const advFile = D + '/adversarial-v2.jsonl';
if (fs.existsSync(advFile)) for (const r of read(advFile)) { held.add(norm(r.body)); heldIds.add(r.id); }
for (const c of read(EVAL.shadowCases())) { if (c.set === 'oss' && !c.core) continue; held.add(norm(c.prompt.body)); held.add(norm(c.own)); heldIds.add(c.id); }
held.delete('');

// ---------- v1 rows ----------
const src = {}; for (const f of ['train', 'val']) for (const r of read(`${D}/${f}.jsonl`)) src[r.id] = r;
const ev = Object.fromEntries(read(path.join(__dirname, '..', 'eval', 'eval.jsonl')).map((r) => [r.id, r]));
const facts = Object.fromEntries(read(path.join(__dirname, 'data', 'engine-facts.jsonl')).map((r) => [r.id, r]));
function parseUser(u) {
  const [head, body] = u.split('\nBody:\n'); const h = {}; for (const line of head.split('\n')) { const i = line.indexOf(': '); if (i > 0) h[line.slice(0, i)] = line.slice(i + 2); }
  return { direction: h.Direction, from: h.From, subject: h.Subject, attachments: h.Attachments && h.Attachments !== 'none' ? h.Attachments.split(', ') : [], body };
}
const SIL = { decision: 'silence', family: 'none', action: 'none', title: '', due: '' };
const ODRX = /one\s?-?drive|וואן\s?-?דרייב/i;
const GDRX = /\bg(?:oogle)?\s*-?drive\b|\bdrive\b|דרייב|גוגל\s*דרייב/i;
const OTHER_TGT = /\bshared\s+(?:folder|drive|files?)\b|\bsharepoint\b|\bdropbox\b|(?:ה)?תיקי(?:י)?ה\s+המשותפת|הקבצים\s+המשותפים|שרפוינט|דרופבוקס/i;
const SAVE_ASK = /\b(?:save|upload|store|file|put)\b|(?:^|[\s,.(])ו?(?:ל|ת|נ)?(?:שמור|שמרי|שמרו|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|העלה|העלי|תאחסן|לאחסן)(?=$|[\s,.?!])/i;
const ATT_REF = /\battach(?:ed|ment|ments)?\b|\benclosed\b|מצורף|המצורף|המצורפת|המצורפים|הקובץ|הקבצים/i;
const hostAct = (surface) => (surface === 'outlook' ? 'save_to_onedrive' : 'save_to_drive');
function saveTitle(lang, surface, old) {
  const en = surface === 'outlook' ? 'OneDrive' : 'Drive', he = surface === 'outlook' ? 'בוואן דרייב' : 'בדרייב';
  if (lang === 'he') { const m = /^לשמור את (.+?) (?:בדרייב|בוואן דרייב)$/.exec(old || ''); return `לשמור את ${m ? m[1] : 'הקובץ'} ${he}`; }
  const m = /^Save the (.+?) to (?:Drive|OneDrive)$/.exec(old || ''); return `Save the ${m ? m[1] : 'attachment'} to ${en}`;
}
const rows = [], corrections = [];
function push(split, c, tgt, meta) {
  const k = norm(c.body);
  if (held.has(k) || heldIds.has(meta.id)) { inc('drop-heldout-overlap:' + meta.src); return false; }
  rows.push({ split, case: c, target: tgt, meta }); inc(`${split}:${meta.src}:${meta.lang}:${tgt.decision === 'act' ? tgt.family : 'SILENT'}`); return true;
}
for (const split of ['train', 'val']) {
  for (const x of read(path.join(__dirname, 'data', `sft_${split}.jsonl`))) {
    const m = x.meta, c = parseUser(x.messages[x.messages.length - 2].content); let t = JSON.parse(x.messages[x.messages.length - 1].content);
    const isOss = m.src === 'oss-eval-noncore', s = isOss ? ev[m.id.replace(/^oss-/, '')] : src[m.id];
    c.surface = (s && s.surface) || 'gmail';
    const own = isOss ? c.body : ((facts[m.id] && facts[m.id].own) || c.body);
    const lang = m.lang; const before = JSON.stringify(t); let rule = null;
    const saveAsk = SAVE_ASK.test(own) && ATT_REF.test(own) && (ODRX.test(own) || GDRX.test(own));
    if (t.decision === 'act' && t.family === 'reply' && saveAsk) {
      // an explicit save of an attachment that v1 labelled as a reply draft: the right kind is now attachmentSave (or silence)
      const od = ODRX.test(own), gd = GDRX.test(own.replace(/one\s?-?drive|וואן\s?-?דרייב/gi, ' '));
      const k = s && !isOss ? RL.check(Object.assign({}, s, { reference: { label: 'SILENT', ruleCorrected: [] } }), own, 'intent-null') : null;
      if (k) { rule = 'save-asked-as-reply->attachmentSave'; t = { decision: 'act', family: 'file', action: hostAct(c.surface), title: saveTitle(lang, c.surface, null), due: '' }; }
      else { rule = 'save-asked-as-reply->silence(' + (!c.attachments.length ? 'no-attachment' : (c.surface === 'gmail' && od) ? 'onedrive-on-gmail' : (c.surface === 'outlook' && gd && !od) ? 'drive-on-outlook' : 'not-eligible') + ')'; t = SIL; }
    } else if (t.decision === 'act' && t.family !== 'file') {
      const uk = PG.unsupportedKind(own);
      if (uk) { rule = uk.replace('gate:', ''); t = SIL; }
      else if ((t.family === 'reply' || t.family === 'task') && PG.offerAcceptance(own)) { rule = 'money-offer-acceptance'; t = SIL; }
      else if (LV.moneyMovement({ body: own, subject: '' }, own)) { rule = 'money-movement'; t = SIL; }
      // typo twins: the reference label comes from the CLEAN render, so the deadline cue is read from the clean body too
      else if (t.family === 'reply' && !t.due && !PG.hasDeadline(own) && !PG.hasDeadline((s && s.cleanBody) || '')) { rule = 'undated-ask'; t = SIL; }
    } else if (t.decision === 'act' && t.family === 'file') {
      const od = ODRX.test(own), gd = GDRX.test(own.replace(/one\s?-?drive|וואן\s?-?דרייב/gi, ' '));
      if (!c.attachments.length) { rule = 'save-no-attachment'; t = SIL; }
      else if (c.surface === 'gmail' && od) { rule = 'save-onedrive-target-on-gmail'; t = SIL; }
      else if (c.surface === 'outlook' && gd && !od) { rule = 'save-drive-target-on-outlook'; t = SIL; }
      else if (OTHER_TGT.test(own)) { rule = 'save-other-target'; t = SIL; }
      else if (t.action !== hostAct(c.surface)) { rule = 'save-target-follows-host'; t = Object.assign({}, t, { action: hostAct(c.surface), title: saveTitle(lang, c.surface, t.title) }); }
    } else if (t.decision === 'silence' && !isOss && s) {
      const k = RL.check(s, own, (facts[m.id] && facts[m.id].engine === 'SILENT') ? 'intent-null' : 'show');
      if (k) { rule = 'explicit-save-real-attachment'; t = { decision: 'act', family: 'file', action: hostAct(c.surface), title: saveTitle(lang, c.surface, null), due: '' }; }
    }
    if (rule) { corrections.push({ id: m.id, split, src: m.src, lang, surface: c.surface, rule, from: JSON.parse(before), to: t, text: own.slice(0, 140) }); inc('correction:' + rule); }
    push(split, c, t, Object.assign({}, m, { src: 'v1-' + m.src, v1Label: m.label, correction: rule }));
  }
}

// ---------- new examples ----------
const TODAY_DATES = { tomorrow: '2026-10-08', Thursday: '2026-10-08', Friday: '2026-10-09', Sunday: '2026-10-11', Monday: '2026-10-12', Tuesday: '2026-10-13', 'October 15': '2026-10-15', 'October 20': '2026-10-20', 'October 22': '2026-10-22' };
const DAYS_EN = [['by Friday', 'Friday'], ['by Monday', 'Monday'], ['by Tuesday', 'Tuesday'], ['by tomorrow', 'tomorrow'], ['by Thursday', 'Thursday'], ['by October 15', 'October 15'], ['before October 20', 'October 20'], ['by Sunday', 'Sunday']];
const DAYS_HE = [['עד יום שישי', 'Friday'], ['עד יום שני', 'Monday'], ['עד יום שלישי', 'Tuesday'], ['עד מחר', 'tomorrow'], ['עד יום חמישי', 'Thursday'], ['עד ה-15 באוקטובר', 'October 15'], ['עד יום ראשון', 'Sunday'], ['עד ה-20.10', 'October 20']];
const MEET_DAYS_EN = [['on Monday', 'Monday'], ['on Tuesday', 'Tuesday'], ['on Sunday', 'Sunday'], ['on October 15', 'October 15'], ['tomorrow', 'tomorrow'], ['on October 22', 'October 22']];
const MEET_DAYS_HE = [['ביום שני', 'Monday'], ['ביום שלישי', 'Tuesday'], ['ביום ראשון', 'Sunday'], ['ב-15 באוקטובר', 'October 15'], ['מחר', 'tomorrow'], ['ב-22 באוקטובר', 'October 22']];
const TIMES = ['9:00', '9:30', '10:00', '11:15', '13:00', '14:30', '15:00', '16:00', '17:30'];
const NAMES_EN = ['Gal', 'Ido', 'Tamar', 'Ron', 'Shira', 'Eyal', 'Nir', 'Keren', 'Jonah', 'Priya', 'Lucas', 'Emma', 'Owen', 'Mia', 'Daniel', 'Zoe'];
const NAMES_HE = ['גל', 'עידו', 'תמר', 'רון', 'שירה', 'אייל', 'ניר', 'קרן', 'יונתן', 'אורית', 'משה', 'רותם', 'עדי', 'אלעד', 'ליאת', 'צחי'];
const COS = ['initech', 'globex', 'umbrella', 'hooli', 'vandelay', 'stark', 'wayne', 'pied-piper', 'soylent', 'cyberdyne'];
const VENDORS_EN = ['Northwind', 'Contoso', 'Fabrikam', 'Tailspin', 'Litware', 'Adatum'];
const VENDORS_HE = ['נורת׳ווינד', 'קונטוסו', 'פבריקם', 'טייל-ספין', 'ליטוור', 'אדאטום'];
const OBJ_EN = ['vendor agreement', 'Q4 forecast', 'onboarding checklist', 'insurance form', 'offer letter', 'sales deck', 'travel request', 'purchase order', 'expense report', 'design spec', 'lease renewal', 'audit report', 'hiring plan', 'pilot summary', 'security review'];
const OBJ_HE = ['הסכם הספק', 'תחזית הרבעון', 'רשימת הקליטה', 'טופס הביטוח', 'מכתב ההצעה', 'מצגת המכירות', 'בקשת הנסיעה', 'הזמנת הרכש', 'דוח ההוצאות', 'מסמך האפיון', 'חידוש השכירות', 'דוח הביקורת', 'תוכנית הגיוס', 'סיכום הפיילוט', 'סקירת האבטחה'];
const TOPIC_EN = ['the migration', 'the offsite', 'the Q4 launch', 'the vendor review', 'the hiring sprint', 'the security audit', 'the pricing update', 'the onboarding flow'];
const TOPIC_HE = ['המיגרציה', 'יום הגיבוש', 'ההשקה של Q4', 'סקירת הספקים', 'ספרינט הגיוס', 'ביקורת האבטחה', 'עדכון התמחור', 'תהליך הקליטה'];
const AMT = ['$4,200', '₪3,900', '€1,750', '12,000 ₪', '$950', '₪18,500', '$27,000', '€640', '7,300 ש"ח'];
const CITY_EN = ['London', 'Berlin', 'New York', 'Lisbon'], CITY_HE = ['לונדון', 'ברלין', 'ניו יורק', 'ליסבון'];
const MEET_EN = ['kickoff', 'demo', 'review', 'sync', 'interview', 'planning call'], MEET_HE = ['קיקאוף', 'דמו', 'סקירה', 'סנכרון', 'ראיון', 'שיחת תכנון'];
const G_EN = ['Hi Sali,\n\n', 'Hey Sali,\n\n', 'Hello,\n\n', 'Good morning,\n\n', 'Sali, ', '', 'Hi,\n\n'];
const G_HE = ['היי סאלי,\n\n', 'שלום,\n\n', 'בוקר טוב,\n\n', 'סאלי, ', '', 'הי,\n\n', 'ערב טוב סאלי,\n\n'];
const S_EN = (n) => pick([`\n\nThanks,\n${n}`, `\n\nBest,\n${n}`, `\n${n}`, `\n\nCheers,\n${n}`, '', `\n\nRegards,\n${n}\n${n} | ${pick(COS)}`]);
const S_HE = (n) => pick([`\n\nתודה,\n${n}`, `\n\nבברכה,\n${n}`, `\n${n}`, `\n\nיום נעים,\n${n}`, '', `\n\nתודה רבה,\n${n}`]);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : `{${k}}`));
function mk(lang, tpl, extra) {
  const he = lang === 'he', n = pick(he ? NAMES_HE : NAMES_EN);
  const d = pick(he ? DAYS_HE : DAYS_EN), md = pick(he ? MEET_DAYS_HE : MEET_DAYS_EN);
  const v = Object.assign({ obj: pick(he ? OBJ_HE : OBJ_EN), topic: pick(he ? TOPIC_HE : TOPIC_EN), vendor: pick(he ? VENDORS_HE : VENDORS_EN), amt: pick(AMT), city: pick(he ? CITY_HE : CITY_EN),
    meet: pick(he ? MEET_HE : MEET_EN), dl: d[0], dlKey: d[1], mday: md[0], mdayKey: md[1], time: pick(TIMES) }, extra || {});
  const body = pick(he ? G_HE : G_EN) + fill(tpl, v) + (he ? S_HE(n) : S_EN(n));
  return { body, v, from: `${pick(['gal', 'ido', 'tamar', 'ron', 'shira', 'eyal', 'nir', 'keren', 'ops', 'finance', 'legal'])}@${pick(COS)}.${he ? 'co.il' : 'com'}` };
}
const TPL = {
  unsupported: { en: ['Could you start a new Google Doc for {topic} notes?', 'Please set up a shared spreadsheet to track {topic} {dl}.', 'Can you build a slide deck for the {topic} kickoff {dl}?', 'Please open a blank document for the {meet} minutes.',
    'Can you draw up an invoice for {vendor} for {amt}?', 'Please book me a flight to {city} for next week.', 'Can you order lunch for the {topic} workshop {dl}?', 'Please update the CRM with the {topic} notes.', 'Could you create a Jira ticket for the bug in {topic}?',
    'Please make a new form for the {topic} survey {dl}.', 'Can you prepare a quote for {vendor} for {amt} {dl}?', 'Would you create a tracker sheet for {topic}?'],
    he: ['תוכלי לפתוח גוגל דוק חדש לסיכום של {topic}?', 'בבקשה ליצור גיליון משותף למעקב אחרי {topic} {dl}.', 'תבנה מצגת לקיקאוף של {topic} {dl}?', 'בבקשה להפיק חשבונית ל{vendor} על סך {amt}.', 'תזמיני לי טיסה ל{city} לשבוע הבא.',
      'בבקשה לעדכן את ה-CRM עם הסיכום של {topic}.', 'תפתח טיקט בג׳ירה על הבאג ב{topic}.', 'תכין טופס חדש לסקר על {topic} {dl}.', 'תכין הצעת מחיר ל{vendor} על {amt} {dl}.', 'בבקשה לפתוח מסמך חדש לפרוטוקול של ה{meet}.'], label: 'SILENT' },
  undated: { en: ['Can you approve the {obj}?', 'Could you take a look at the {obj} and let me know what you think?', 'I need the {obj}, could you find it and send it over?', 'Can you confirm the {obj} when you get a chance?', 'Please review the {obj}.', 'Would you sign off on the {obj}?', 'Could you check the {obj} for me?'],
    he: ['תוכלי לאשר את {obj}?', 'אפשר שתעבור על {obj} ותגיד מה דעתך?', 'אני צריך את {obj}, תוכל למצוא ולשלוח?', 'תאשר בבקשה את {obj} כשיש לך רגע.', 'בבקשה לעבור על {obj}.', 'תוכלי לבדוק לי את {obj}?'], label: 'SILENT' },
  dated: { en: [['Can you approve the {obj} {dl}?', 'Approve the {obj}'], ['Could you review the {obj} and get back to me {dl}?', 'Review the {obj}'], ['Please confirm the {obj} {dl}.', 'Confirm the {obj}'], ['Would you sign off on the {obj} {dl}?', 'Sign off on the {obj}']],
    he: [['תוכלי לאשר את {obj} {dl}?', 'לאשר את {obj}'], ['אפשר את האישור שלך על {obj} {dl}?', 'לאשר את {obj}'], ['תעבור בבקשה על {obj} ותחזור אליי {dl}.', 'לעבור על {obj}'], ['תבדקי בבקשה את {obj} {dl}.', 'לבדוק את {obj}']], label: 'draft' },
  offer: { en: ['Do you agree to the {amt} offer from {vendor}?', 'Can you approve the {amt} quote from {vendor} {dl}?', 'Please accept the counteroffer of {amt} so we can move ahead.', 'Are you OK with the {amt} price for {topic}? We need an answer {dl}.',
    'Let me know if you accept the {amt} proposal for {topic}.', 'Would you sign off on the {amt} deal with {vendor} {dl}?', 'Do you accept the terms ({amt} per month) from {vendor}?'],
    he: ['אתה מסכים להצעה על סך {amt} {dl}?', 'תאשרי את הצעת המחיר של {vendor} על {amt} {dl}.', 'האם את מקבלת את ההצעה של {amt} עבור {topic}?', 'תסכים לתנאים של {vendor} ({amt} לחודש)? מחכים לתשובה {dl}.', 'אתם מאשרים את העסקה עם {vendor} על סך {amt}?', 'תאשר בבקשה את הסכום של {amt} ל{vendor} {dl}.'], label: 'SILENT' },
  attachInvite: { en: ['Please attach the {obj} to the {meet} invite for {mday} at {time}.', 'Can you add the {obj} to the calendar invite for our {meet} {mday} at {time}?', 'Could you put the {obj} in the meeting invite for {mday}?', 'Please include the {obj} in the {meet} event {mday} at {time}.', 'Add the {obj} to the task for {mday}, please.'],
    he: ['בבקשה לצרף את {obj} לזימון של ה{meet} {mday} בשעה {time}.', 'תוסיפי את {obj} להזמנה ליומן של ה{meet} {mday}.', 'תצרף בבקשה את {obj} לאירוע ביומן {mday} בשעה {time}.', 'אפשר לצרף את {obj} לזימון לפגישה {mday}?'], label: 'SILENT' },
  meetContrast: { en: [['Can we meet {mday} at {time} to go over the {obj}?', 'Meeting about the {obj}'], ["Let's have a {meet} {mday} at {time} about {topic}.", 'Meeting about {topic}']],
    he: [['אפשר להיפגש {mday} בשעה {time} כדי לעבור על {obj}?', 'פגישה על {obj}'], ['בוא נעשה שיחה {mday} בשעה {time} על {topic}.', 'שיחה על {topic}']], label: 'calendar' },
};
function addNew(cls, lang, n, opts) {
  const T = TPL[cls][lang]; let made = 0, tries = 0;
  while (made < n && tries < n * 30) {
    tries++; const t = pick(T); const tpl = Array.isArray(t) ? t[0] : t; const r = mk(lang, tpl);
    let tgt = SIL;
    if (TPL[cls].label === 'draft') tgt = { decision: 'act', family: 'reply', action: 'draft_reply', title: fill(t[1], r.v), due: TODAY_DATES[r.v.dlKey] };
    if (TPL[cls].label === 'calendar') tgt = { decision: 'act', family: 'calendar', action: 'calendar_event', title: fill(t[1], r.v), due: TODAY_DATES[r.v.mdayKey] };
    // the generator's own label must agree with the runtime gate: silence classes must trip the gate rule, contrast rows must not
    const g = PG.unsupportedKind(r.body), off = PG.offerAcceptance(r.body), dl = PG.hasDeadline(r.body);
    const ok = { unsupported: !!g && /create-doc/.test(g) || (!g && !off), undated: !dl && !g && !off, dated: dl && !g && !off, offer: off, attachInvite: g === 'gate:unsupported-kind:attach-to-invite', meetContrast: !g && !off && dl }[cls];
    if (!ok) { inc('gen-reject-gate-disagree:' + cls); continue; }
    if (tgt.decision === 'act' && (tgt.title.length > 60 || HEB.test(tgt.title) !== (lang === 'he'))) { inc('gen-reject-title:' + cls); continue; }
    const c = { direction: 'inbound', surface: rnd() < 0.5 ? 'gmail' : 'outlook', from: r.from, subject: pick(lang === 'he' ? ['בקשה', 'עדכון', 'לגבי ' + r.v.topic, r.v.obj] : ['Quick ask', 'Re: ' + r.v.topic, r.v.obj, 'Request']), attachments: [], body: r.body };
    const split = parseInt(crypto.createHash('md5').update(norm(r.body)).digest('hex').slice(0, 6), 16) % 10 === 0 ? 'val' : 'train';
    if (seen.has(norm(r.body))) { inc('gen-dup'); continue; }
    seen.add(norm(r.body));
    if (push(split, c, tgt, { id: `sftv2-${cls}-${lang}-${made}`, src: 'new-' + cls, lang })) made++;
  }
  inc(`gen:${cls}:${lang}`, made);
}
const seen = new Set(rows.map((r) => norm(r.case.body)));
for (const lang of ['en', 'he']) {
  addNew('unsupported', lang, 160); addNew('undated', lang, 140); addNew('dated', lang, 110); addNew('offer', lang, 130); addNew('attachInvite', lang, 120); addNew('meetContrast', lang, 70);
}
// ---------- attachmentSave (suggest-save consistent) ----------
// The LLM only handles EXPLICIT save asks; an unasked "Save X to OneDrive?" step is produced deterministically by suggest-save.js.
// Label = act iff suggest-save.js says suggest:show on the row's attachment metadata with the explicit ask (no other card), target = host.
const REAL = [['Q3-report.pdf', 'Q3 report', 'דוח Q3'], ['contract_v2.docx', 'contract', 'החוזה'], ['budget-2027.xlsx', 'budget sheet', 'גיליון התקציב'], ['signed-NDA.pdf', 'signed NDA', 'ה-NDA החתום'], ['invoice_8812.pdf', 'invoice', 'החשבונית'],
  ['deck_final.pptx', 'deck', 'המצגת'], ['receipt_scan.jpg', 'receipt scan', 'סריקת הקבלה'], ['lease.pdf', 'lease', 'חוזה השכירות'], ['W-9.pdf', 'W-9', 'טופס W-9'], ['tax-form-101.pdf', 'tax form', 'טופס 101']];
const NONFILE = [{ name: 'image001.png', size: 8 * 1024, isInline: false }, { name: 'Outlook-Logo.png', size: 12 * 1024 }, { name: 'invite.ics', size: 3 * 1024 }, { name: 'smime.p7s', size: 4 * 1024 }, { name: 'winmail.dat', size: 40 * 1024 }, { name: 'contact.vcf', size: 2 * 1024 }];
const ASK_EN = ['Please save the attached {f} to {tgt}.', 'Can you save the attached {f} to {tgt}?', 'Please upload the attachment to {tgt}.', 'Could you store the attached {f} in {tgt}?', 'Save the attached {f} to {tgt}, please.'];
const ASK_EN_NOTGT = ['Please save the attached {f}.', 'Can you file the attached {f} in your cloud folder?'];
const ASK_EN_MULTI = ['Please save the attachments to {tgt}.', 'Can you save both attached files to {tgt}?'];
const ASK_HE = ['בבקשה לשמור את {f} המצורף {tgt}.', 'תוכלי לשמור את {f} המצורף {tgt}?', 'תעלה בבקשה את הקובץ המצורף {tgt}.', 'תשמרי את {f} המצורף {tgt}, תודה.'];
const ASK_HE_MULTI = ['בבקשה לשמור את הקבצים המצורפים {tgt}.', 'תשמור את שני הקבצים המצורפים {tgt}.'];
const TGT = { en: { onedrive: 'OneDrive', drive: 'Google Drive', drive2: 'Drive', shared: 'our shared folder', sharepoint: 'SharePoint', dropbox: 'Dropbox' }, he: { onedrive: 'בוואן דרייב', drive: 'בגוגל דרייב', drive2: 'בדרייב', shared: 'בתיקייה המשותפת', sharepoint: 'בשרפוינט', dropbox: 'בדרופבוקס' } };
const NEG_EN = ['No need to save the attached {f}, it is just a draft.', "Please don't upload the attached {f} to {tgt} yet."], NEG_HE = ['אין צורך לשמור את {f} המצורף, זו רק טיוטה.', 'אל תשמרי את {f} המצורף {tgt} בינתיים.'];
function attMeta(list) { return list.map((a, i) => Object.assign({ id: 'a' + i, contentType: null, isInline: false, contentId: null, kind: 'file' }, a)); }
let saveMade = 0;
function addSave(kind, lang, n) {
  let made = 0, tries = 0; const he = lang === 'he';
  while (made < n && tries < n * 30) {
    tries++; const surface = rnd() < 0.5 ? 'gmail' : 'outlook'; const host = surface === 'outlook' ? 'onedrive' : 'drive';
    const f = pick(REAL); let files = [{ name: f[0], size: f[0].endsWith('.jpg') ? 1200 * 1024 : 240 * 1024 }], tplList, tgtKey = rnd() < 0.3 && surface === 'gmail' ? 'drive2' : host, extraBody = '';
    if (kind === 'pos') tplList = he ? ASK_HE : (rnd() < 0.15 ? ASK_EN_NOTGT : ASK_EN);
    else if (kind === 'multi') { tplList = he ? ASK_HE_MULTI : ASK_EN_MULTI; const g = pick(REAL.filter((x) => x !== f)); files.push({ name: g[0], size: 300 * 1024 }); }
    else if (kind === 'nonfile') { tplList = he ? ASK_HE : ASK_EN; files = [pick(NONFILE)]; }
    else if (kind === 'none') { tplList = he ? ASK_HE : ASK_EN; files = []; }
    else if (kind === 'wrongtgt') { tplList = he ? ASK_HE : ASK_EN; tgtKey = surface === 'gmail' ? 'onedrive' : pick(['drive', 'drive2']); }
    else if (kind === 'othertgt') { tplList = he ? ASK_HE : ASK_EN; tgtKey = pick(['shared', 'sharepoint', 'dropbox']); }
    else if (kind === 'neg') { tplList = he ? NEG_HE : NEG_EN; }
    else if (kind === 'mkt') { tplList = he ? ASK_HE : ASK_EN; extraBody = he ? '\n\nהצטרפו לוובינר שלנו! להסרה מרשימת התפוצה לחצו כאן.' : '\n\nJoin our webinar next week! Unsubscribe here.'; files = [{ name: 'brochure.pdf', size: 900 * 1024 }]; }
    const r = mk(lang, pick(tplList), { f: he ? f[2] : f[1], tgt: TGT[lang][tgtKey] }); const body = r.body + extraBody;
    const att = attMeta(files);
    const d = SS.decide({ surface, direction: 'inbound', consent: true, attachmentsRead: true, attachments: att, bodyCids: [], headers: kind === 'mkt' ? { listUnsubscribe: '<mailto:u@x>' } : {}, text: body, subject: '', judgment: { reason: 'intent-null', explicit: null }, messageId: 'm' });
    // suggest-save does not know bare "Drive"/"דרייב" on Outlook is the wrong target (GDRIVE needs "Google Drive"); the runtime gate adds
    // gate:save-target-mismatch for that, so the label follows the gate too.
    const bareDriveOnOutlook = surface === 'outlook' && tgtKey === 'drive2';
    const shouldAct = (kind === 'pos' || kind === 'multi');
    const act = d.suggest && !bareDriveOnOutlook && files.length > 0;
    if (act !== shouldAct) { inc('gen-reject-suggest-disagree:' + kind); continue; }
    if (seen.has(norm(body))) { inc('gen-dup'); continue; } seen.add(norm(body));
    const tEn = surface === 'outlook' ? 'OneDrive' : 'Drive', tHe = surface === 'outlook' ? 'בוואן דרייב' : 'בדרייב';
    const title = !act ? '' : (kind === 'multi' ? (he ? `לשמור את הקבצים ${tHe}` : `Save the attachments to ${tEn}`) : (he ? `לשמור את ${f[2]} ${tHe}` : `Save the ${f[1]} to ${tEn}`));
    const tgt = act ? { decision: 'act', family: 'file', action: hostAct(surface), title, due: '' } : SIL;
    const c = { direction: 'inbound', surface, from: r.from, subject: he ? pick(['קובץ', 'מצורף', f[2]]) : pick(['File attached', f[1], 'For your files']), attachments: files.map((x) => x.name), body };
    const split = parseInt(crypto.createHash('md5').update(norm(body)).digest('hex').slice(0, 6), 16) % 10 === 0 ? 'val' : 'train';
    if (push(split, c, tgt, { id: `sftv2-save-${kind}-${lang}-${made}`, src: 'new-attachmentSave-' + kind, lang, suggest: d.reason })) made++;
  }
  inc(`gen:attachmentSave-${kind}:${lang}`, made); saveMade += made;
}
for (const lang of ['en', 'he']) { addSave('pos', lang, 110); addSave('multi', lang, 40); addSave('nonfile', lang, 50); addSave('none', lang, 30); addSave('wrongtgt', lang, 50); addSave('othertgt', lang, 30); addSave('neg', lang, 30); addSave('mkt', lang, 20); }
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '_rows.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'corrections.jsonl'), corrections.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(OUT, '_stats.json'), JSON.stringify(Object.fromEntries(Object.entries(stats).sort()), null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(stats).sort()), null, 1));
