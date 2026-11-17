// One person in two scripts (core/name-sound.js): «אבי» and "Avi", «לוי» and "Levi". Two sets of common Israeli names (first names
// and surnames) with their usual Latin spelling. TUNED: the rules were fixed against it (58/60 and 21 wrong pairings at the first run).
// FRESH: written after, run once with no change (40/40, 3 wrong pairings). Wrong pairing = a Hebrew name matching another set name's
// Latin spelling; what vowelless Hebrew cannot tell apart is left to the caller's one-person rule (core/loop-answer.js).
// Run: node test/name-sound-corpus.cjs
const fs = require('fs');
const path = require('path');
const { FlowNameSound: N } = require('../core/name-sound.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const TUNED = [['אבי','Avi'],['דנה','Dana'],['שי','Shai'],['יוסי','Yossi'],['נועה','Noa'],['מיכל','Michal'],['רונית','Ronit'],['לוי','Levi'],['כהן','Cohen'],['חן','Chen'],
['רחל','Rachel'],['שרה','Sarah'],['דוד','David'],['משה','Moshe'],['יעל','Yael'],['תמר','Tamar'],['אורי','Uri'],['עומר','Omer'],['גיל','Gil'],['רועי','Roy'],
['איתי','Itai'],['נועם','Noam'],['ליאור','Lior'],['שירה','Shira'],['מאיה','Maya'],['אלון','Alon'],['עידו','Ido'],['יונתן','Yonatan'],['אביב','Aviv'],['ורד','Vered'],
['צביקה','Tzvika'],['ציון','Zion'],['חיים','Chaim'],['שמעון','Shimon'],['פרץ','Peretz'],['בר','Bar'],['הילה','Hila'],['אלי','Eli'],['רז','Raz'],['טל','Tal'],
['קרן','Keren'],['אסף','Asaf'],['יובל','Yuval'],['ענבל','Inbal'],['סיגל','Sigal'],['אפרת','Efrat'],['מזרחי','Mizrahi'],['ברק','Barak'],['פרידמן','Friedman'],['גולן','Golan'],
['שלומי','Shlomi'],['אהרון','Aharon'],['רפאל','Rafael'],['ג׳ני','Jenny'],['אילנה','Ilana'],['דורית','Dorit'],['עדי','Adi'],['נתן','Natan'],['אריאל','Ariel'],['שחר','Shahar']];
const FRESH = [['אורית','Orit'],['גלית','Galit'],['מירב','Merav'],['ליאת','Liat'],['אסתר','Esther'],['יצחק','Yitzhak'],['אברהם','Avraham'],['יעקב','Yaakov'],['שמואל','Shmuel'],['אליהו','Eliyahu'],
['רבקה','Rivka'],['לאה','Leah'],['נחום','Nachum'],['זהבה','Zehava'],['צפי','Tzafi'],['אופיר','Ofir'],['דקל','Dekel'],['ניר','Nir'],['גדי','Gadi'],['קובי','Kobi'],
['בני','Benny'],['סהר','Sahar'],['ספיר','Sapir'],['רוני','Roni'],['אנה','Anna'],['מרים','Miriam'],['חנה','Hana'],['אילן','Ilan'],['ערן','Eran'],['אופק','Ofek'],
['שגיא','Sagi'],['גלעד','Gilad'],['אמיר','Amir'],['עמית','Amit'],['אביטל','Avital'],['בתיה','Batya'],['זיו','Ziv'],['פנינה','Pnina'],['שושנה','Shoshana'],['וויקטור','Victor']];
function measure(P) {
  let hit = 0, wrong = 0; const miss = [], pairs = [];
  for (const [he, en] of P) {
    if (N.same(he, en)) hit++; else miss.push(he + '/' + en);
    for (const [, o] of P) if (o !== en && N.same(he, o)) { wrong++; pairs.push(he + '~' + o); }
  }
  return { hit, wrong, miss, pairs, of: P.length * (P.length - 1) };
}
for (const [name, P, maxWrong] of [['tuned', TUNED, 7], ['fresh', FRESH, 3]]) {
  const m = measure(P);
  console.log(`  ${name}: ${m.hit}/${P.length} pairs match; wrong pairings ${m.wrong}/${m.of} (${(100 * m.wrong / m.of).toFixed(2)}%): ${m.pairs.join(' ')}`);
  check(name + ': every pair matches', m.hit === P.length, m.miss);
  check(name + ': wrong pairings no more than ' + maxWrong + ' (a ceiling: never raise it to pass)', m.wrong <= maxWrong, m.pairs);
}

console.log('\n--- the rules ---\n');
check('a Hebrew vowel letter must show in the Latin: שירה is not Sarah, אלון is not Ilana', !N.same('שירה', 'Sarah') && !N.same('אלון', 'Ilana'));
check('two v sounds stay two: אבי is not Aviv', !N.same('אבי', 'Aviv') && N.same('אביב', 'Aviv'));
check('an opening vowel is kept: לוי is not Eli', !N.same('לוי', 'Eli') && N.same('אלי', 'Eli'));
check('ח written h: Shahar, Mizrahi', N.same('שחר', 'Shahar') && N.same('מזרחי', 'Mizrahi'));
check('either order', N.same('Avi', 'אבי'));
check('same script is not this helper\'s question', !N.same('Avi', 'Avi') && !N.same('אבי', 'אבי'));
check('a word with no consonant sound never matches: איה / Eya', !N.same('איה', 'Eya'));
check('readings stay few (at most MAX_VARIANTS)', N.skeletons('צביקה וויצמן').length <= N.MAX_VARIANTS && N.skeletons('Tzvika').length <= N.MAX_VARIANTS);

console.log('\n--- portability ---\n');
const src = fs.readFileSync(path.join(__dirname, '../core/name-sound.js'), 'utf8').replace(/\/\/.*$/gm, '');
check('no chrome.*, document or window, no network', !/\bchrome\.|\bdocument\.|\bwindow\.|fetch\(|XMLHttpRequest/.test(src));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
