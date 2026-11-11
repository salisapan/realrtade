// v3 frame features (lab, 2026-11-11; Phase 1 of docs/glance-ai/model-upgrade-plan.md): the linear model over hashed n-grams cannot express
// "who acts, on what, with which date" because that is an INTERACTION of words. This adds explicit speech-act frames (a request to the reader,
// a promise by the reader, a promise by the sender, a statement/confirmation, an approximate amount, a no-reply note, a past report, a group
// greeting, a question) and their conjunctions with the facts the featurizer already reads (date, time, direction, addressee, language), as
// extra hashed indices in the SAME space. Reads a features dir and writes a copy with the extra indices. Lab only: the JS runtime does not
// know these features, so a model trained on them is not wired anywhere until the runtime and its parity check learn them.
// usage: node train/add-frames-v3.cjs <src features dir name> <dst features dir name>   e.g. features-v26 features-v3a
'use strict';
const fs = require('fs'), path = require('path');
const { DIM } = require('./featurize-v2.cjs');
const HERE = __dirname;
const [SRCN, DSTN] = process.argv.slice(2);
if (!SRCN || !DSTN) { console.error('usage: add-frames-v3.cjs <src> <dst>'); process.exit(2); }
const SRC = path.join(HERE, SRCN), DST = path.join(HERE, DSTN);
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
const FRAMES = {
  req_modal: /\b(?:can|could|would|will)\s+you\b|\bany chance\b|\bwould you mind\b|\bdo you mind\b|\bplease\b|\bkindly\b|אפשר\s+(?:ל|לה)|תוכל|תוכלי|תוכלו|יש מצב|בבקשה|נא\s+ל|תעשה לי טובה|אשמח ש/i,
  need_from_you: /\b(?:need|needs|still need)\b[^.?!]{0,40}\bfrom you\b|\bwe(?:'re| are)? waiting (?:for|on)\b|צריך(?:ים)? ממך|חסר לנו|מחכים ל/i,
  reader_promise: /\byou(?:'ll| will| would)\b|\byou (?:said|promised|agreed)\b|\bas (?:agreed|promised|discussed)\b|אתה (?:שולח|מעביר|מכין)|את (?:שולחת|מעבירה|מכינה)|אתם (?:שולחים|מעבירים)|התחייבת|סיכמנו ש|לפי מה שאמרת/i,
  sender_promise: /\bI(?:'ll| will| am going to|'m going to)\b|\bwe(?:'ll| will)\b|\bI can send\b|אני (?:אשלח|אעביר|אשלם|אעדכן|אבדוק)|נשלח|נעביר/i,
  confirm_state: /\b(?:confirm(?:ed|ing)|approved|was approved|has been approved|signed off)\b|אושר|אישרנו|מאשרים|אושרה/i,
  approx: /\b(?:about|around|approximately|roughly|ballpark|give or take)\b|בערך|בסביבות|כ-|משוער/i,
  no_reply: /\bno need to (?:reply|respond)\b|\bfyi\b|\bfor your information\b|\bno action (?:needed|required)\b|לידיעתך|אין צורך להשיב|אין צורך בתגובה/i,
  past_report: /\b(?:already|have (?:sent|paid|done)|I sent|I paid|was sent|has been sent)\b|\byesterday\b|שלחתי כבר|כבר שלחתי|שולם|הועבר כבר/i,
  group: /\b(?:hi|hello|hey|dear)\s+(?:all|everyone|team|guys|folks)\b|(?:היי|שלום)\s+(?:לכולם|לכולן|צוות|חברים)/i,
  question: /\?/,
  asap: /\b(?:asap|as soon as possible)\b|בהקדם|(?:^|\s)מיד(?:\s|[.,!?]|$)/i,
  work_verb: /\b(?:create|make|prepare|schedule|review|proofread|sign|fix|update|book|set up|finish|complete)\b|תכין|תכיני|תסדר|תעדכן|תעבור על|תחתום|תקבע|להכין|לסדר|לבדוק|לסיים/i
};
const NAMES = Object.keys(FRAMES);
const src = {}; for (const f of ['train', 'val', 'test']) for (const r of read(path.join(HERE, '..', 'dataset', 'out-v2', f + '.jsonl'))) src[r.id] = r;
fs.mkdirSync(DST, { recursive: true });
fs.copyFileSync(path.join(SRC, 'meta.json'), path.join(DST, 'meta.json'));
let added = 0, rows = 0;
for (const split of fs.readdirSync(SRC).filter((f) => /^(train|val|test|adversarial|oss)\.jsonl$/.test(f))) {
  const out = [];
  for (const f of read(path.join(SRC, split))) {
    const r = src[f.id]; rows++;
    if (!r) { out.push(f); continue; }
    const body = r.cleanBody || r.body || '';
    const hit = NAMES.filter((n) => FRAMES[n].test(body));
    const lang = /[א-ת]/.test(body) ? 'he' : 'en';
    const ctx = ['d:' + (f.x ? '' : ''), 'dir:' + (f.direction || ''), 'v:' + (f.voc || ''), 'r:' + (f.role || ''), 'l:' + lang];
    const extra = new Set();
    const add = (s) => extra.add(fnv1a('v3:' + s) % DIM);
    add('none=' + (hit.length === 0));
    for (const n of hit) {
      add('f:' + n); add(n + '|' + lang); add(n + '|dir=' + f.direction); add(n + '|voc=' + f.voc); add(n + '|role=' + f.role); add(n + '|voc=' + f.voc + '|role=' + f.role);
      add(n + '|att=' + (f.att || 0)); add(n + '|scn=' + (f.scenario ? 'y' : 'n'));
    }
    for (let i = 0; i < hit.length; i++) for (let j = i + 1; j < hit.length; j++) add(hit[i] + '+' + hit[j]);
    // frame conjunctions with the facts the device reads: is there a date? (the existing f:date features are in x; here a plain date regex stand-in keeps the lab self-contained)
    const dated = /\b(?:\d{1,2}[\/.]\d{1,2}|monday|tuesday|wednesday|thursday|friday|sunday|saturday|tomorrow|today|tonight|end of (?:the )?(?:day|week)|eod|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|יום [א-ו]|מחר|היום|סוף (?:ה)?(?:שבוע|יום)|עד\s+\d|ב-\d/i.test(body);
    for (const n of hit) add(n + '|dated=' + dated);
    const idx = [...extra].filter((i) => !f.x.includes(i));
    added += idx.length;
    out.push(Object.assign({}, f, { x: f.x.concat(idx) }));
  }
  fs.writeFileSync(path.join(DST, split), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
}
console.log(JSON.stringify({ rows, avgAddedPerRow: +(added / rows).toFixed(2), frames: NAMES.length }));
