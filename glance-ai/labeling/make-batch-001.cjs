'use strict';
// Builds batch-001.md and batch-001.json: highest-value disagreements for owner labeling.
// Needs ../model/dataset/out-v2/test.jsonl and ../model/shadow/out-v2/test-preds.jsonl.
// Those files are produced by ../model/run-all-v2.sh and are not kept in git.
// The committed batch-001.json and batch-001.md are the snapshot. Re-running overwrites them.
const fs = require('fs'), path = require('path');
const M = path.join(__dirname, '..', 'model');
const rows = new Map(fs.readFileSync(path.join(M, 'dataset/out-v2/test.jsonl'), 'utf8').trim().split('\n').map((l) => { const r = JSON.parse(l); return [r.id, r]; }));
const P = fs.readFileSync(path.join(M, 'shadow/out-v2/test-preds.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const HE_LABEL = { SILENT: 'שותק (לא מציג כלום)', 'follow-up-ask|draft': 'טיוטת תשובה', 'event|calendar': 'הוספת אירוע ליומן', 'calendar-hold|calendar': 'שמירת זמן ביומן', 'commitment|task': 'משימה (התחייבות)',
  'dated-commitment|task': 'משימה עם תאריך יעד', 'confirmed-amount|task': 'משימת תשלום / סכום', 'decision|task': 'משימה (החלטה)', 'drive-file|file_save': 'שמירת הקובץ המצורף (Drive / OneDrive)', 'calendar-cancel|calendar': 'ביטול ביומן' };
const he = (l) => HE_LABEL[l] || l;
const used = new Set(), usedTpl = new Set(); const picks = [];
function take(list, n, why, question) {
  let k = 0;
  for (const p of list) {
    if (k >= n) break; const r = rows.get(p.id); if (!r || used.has(p.id) || usedTpl.has(r.templateId)) continue;
    used.add(p.id); usedTpl.add(r.templateId); picks.push({ p, r, why, question }); k++;
  }
}
const byP = (a, b) => b.v2pShow - a.v2pShow;
// A. engine silent (intent-null) on an ask addressed to you, model wants to act — decides Hebrew recall
const unsure = P.filter((p) => p.unsure && p['v2+veto'] !== 'SILENT').sort(byP);
take(unsure.filter((p) => p.lang === 'he'), 6, 'המנוע שתק (לא זיהה בקשה), המודל החדש רוצה להציע פעולה. זו ההכרעה החשובה ביותר לשיפור בעברית.', 'האם זו בקשה ממך שצריך להציע עליה פעולה?');
take(unsure.filter((p) => p.lang === 'en'), 2, 'המנוע שתק, המודל רוצה להציע פעולה.', 'האם זו בקשה ממך שצריך להציע עליה פעולה?');
// B. the model's wrong-Do-Its vs the product reference
take(P.filter((p) => !p.unsure && p.ref === 'SILENT' && p['v2+veto'] !== 'SILENT').sort(byP), 4, 'לפי התווית הנוכחית צריך לשתוק, אבל המודל הציע פעולה (נספר אצלנו כ"Do It שגוי").', 'האם השתיקה נכונה כאן, או שדווקא כדאי להציע את הפעולה?');
// C. rule-corrected policy calls (engine acts, our rule silences)
const ruleRow = (rule, lang) => P.filter((p) => { const r = rows.get(p.id); return r && r.reference.ruleCorrected.includes(rule) && p['engine-0.9.35'] !== 'SILENT' && (!lang || r.lang === lang); });
take(ruleRow('cc-only', 'he'), 1, 'אתה רק ב-Cc ואף אחד לא פנה אליך בשם. המנוע מציג פעולה, הכלל החדש משתיק.', 'כשאתה רק בהעתק (Cc) – לשתוק?');
take(ruleRow('addressed-to-other', 'he'), 1, 'המייל פונה בשם לאדם אחר (ואתה ב-To). המנוע מציג פעולה, הכלל החדש משתיק.', 'בקשה שפונה בשם למישהו אחר – לשתוק?');
take(P.filter((p) => { const r = rows.get(p.id); return r && r.addressee && r.addressee.voc === 'group' && p.ref !== 'SILENT' && r.lang === 'he'; }), 1, 'פנייה לקבוצה ("היי לכולם" / "צוות"). כרגע מוצגת פעולה.', 'בקשה שנשלחה לכל הצוות – להציע לך פעולה?');
take(ruleRow('no-action-fyi', 'he'), 1, 'כתוב במפורש שלא נדרשת פעולה. המנוע 0.9.35 עדיין מציע פעולה; הכלל החדש משתיק.', 'לאשר שתיקה כאן?');
take(ruleRow('conditional-undecided'), 1, 'הצעה מותנית ("אם נאשר… עוד לא הוחלט"). הכלל החדש משתיק.', 'לאשר שתיקה כאן?');
// D. format: engine flips on invisible formatting (RLM / nbsp / iPhone footer)
take(P.filter((p) => { const r = rows.get(p.id); return r && r.formatSensitive && r.scenario !== 'marketing' && p.ref === 'SILENT' && !p.unsure && p['engine-0.9.35'] !== 'SILENT'; }).sort((a, b) => (rows.get(a.id).lang === 'he' ? -1 : 1)), 2, 'על אותו טקסט בלי עיצוב המנוע שותק; עם סימני עיצוב בלתי נראים (כיווניות RTL / רווח קשיח / חתימת iPhone) הוא מציג פעולה.', 'האם השתיקה נכונה כאן?');
// E. wrong action (both act, different action)
take(P.filter((p) => !p.unsure && p.ref !== 'SILENT' && p['v2+veto'] !== 'SILENT' && p['v2+veto'] !== p.ref).sort(byP), 2, 'המנוע והמודל מסכימים שצריך פעולה, אבל לא על איזו.', 'איזו פעולה נכונה כאן?');
const rtl = (s) => String(s).replace(/\r\n/g, '\n').replace(/[\u00a0]/g, ' ').replace(/[\u200e\u200f]/g, '').split('\n').filter((l) => l.trim()).slice(0, 8).map((l) => '> ' + l).join('\n');
let md = `<div dir="rtl">\n\n# סבב תיוג #1 – Glance (מודל v2)\n\n**למי:** סאלי (דרך דוד). **לא נשלח** – קובץ מוכן לתיוג בלבד.\n\n**מה זה:** ${picks.length} מיילים שבהם המנוע הנוכחי (0.9.35) והמודל החדש (v2) לא מסכימים, או שהכלל שקבענו הוא החלטת מדיניות שצריכה אישור שלך. התשובות שלך יהפכו לתוויות "מאומת ע״י הבעלים" – הראשונות שיש לנו – וישמשו לאימון ולמדידה.\n\n**איך עונים:** לכל מייל מסמנים אחת: ✅ להציע את הפעולה של המודל · ⚙️ להציע את הפעולה של המנוע (כשהיא שונה) · 🤫 לשתוק · ❓ לא בטוח. אפשר להוסיף הערה קצרה. כלל הזהב נשאר: עדיף לשתוק מאשר להציע פעולה שגויה.\n\n---\n`;
picks.forEach(({ p, r, why, question }, i) => {
  const dir = r.direction === 'inbound' ? 'נכנס' : r.direction === 'outbound' ? 'יוצא (ממך)' : 'ממך אליך';
  const cc = (r.cc || []).length ? ` · Cc: ${r.cc.join(', ')}` : '';
  md += `\n## ${i + 1}. ${r.lang === 'he' ? 'עברית' : 'אנגלית'} · ${r.surface === 'gmail' ? 'Gmail' : 'Outlook'} · ${dir}${r.attachmentCount ? ` · 📎 ${r.attachmentCount}` : ''}\n\n**נושא:** ${r.subject || '(ללא)'}  \n**מאת:** ${r.from && r.from.name || ''} · **אל:** ${(r.to || []).join(', ')}${cc}\n\n<div dir="auto">\n\n${rtl(r.body)}\n\n</div>\n\n| | החלטה |\n|---|---|\n| מנוע 0.9.35 | ${he(p['engine-0.9.35'])} |\n| מודל v2 | ${he(p['v2+veto'])} (ביטחון ${Math.round(p.v2pShow * 100)}%) |\n| תווית נוכחית (לא מאומתת) | ${he(p.ref)}${r.reference.ruleCorrected.length ? ' – תוקן ע״י כלל: ' + r.reference.ruleCorrected.join(', ') : ''}${p.unsure ? ' – מסומן "לא בטוח"' : ''} |\n\n**למה זה כאן:** ${why}  \n**שאלה:** ${question}\n\n${p['v2+veto'] !== 'SILENT' ? '- [ ] ✅ להציע (כמו המודל): ' + he(p['v2+veto']) + '\n' : ''}${p['engine-0.9.35'] !== 'SILENT' && p['engine-0.9.35'] !== p['v2+veto'] ? '- [ ] ⚙️ להציע (כמו המנוע): ' + he(p['engine-0.9.35']) + '\n' : ''}- [ ] 🤫 לשתוק\n- [ ] ❓ לא בטוח · הערה: ______\n\n<sub>id: ${r.id} · template: ${r.templateId}</sub>\n\n---\n`;
});
md += `\n</div>\n`;
fs.writeFileSync(path.join(__dirname, 'batch-001.md'), md);
const { stampRow } = require('./context-tags.cjs');
const batch1Json = picks.map(({ p, r, why }) => stampRow({ id: r.id, templateId: r.templateId, lang: r.lang, surface: r.surface, subject: r.subject, body: r.body, engine35: p['engine-0.9.35'], v2: p['v2+veto'], v2pShow: p.v2pShow, reference: r.reference, why, ownerAnswer: null }));
fs.writeFileSync(path.join(__dirname, 'batch-001.json'), JSON.stringify(batch1Json, null, 1));
console.log('batch-001:', picks.length, 'items', picks.map((x) => x.r.lang).join(''));
