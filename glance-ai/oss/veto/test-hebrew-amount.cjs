'use strict';
// Hebrew currency in llm-veto. JS \\b is ASCII-only, so a trailing \\b used to miss ₪ / ש"ח / שקל.
// These rules only silence. They never add a card. No engine and no dataset.
const assert = require('assert');
const LV = require('./llm-veto.cjs');

const moneyTitles = ['500 ש"ח', '500 ₪', '1,200 שקל', '₪ 90', '1,500 ש״ח', "1,500 ש''ח", '300 שקלים', '$40', '500 USD', '500 shekels'];
for (const t of moneyTitles) assert.strictEqual(LV.titleVeto(t), 'money', t);

const notMoney = ['300 שקלונות', 'שלום', '5 files', 'hard drive', 'please send the file by Friday', 'Q3 report'];
for (const t of notMoney) assert.notStrictEqual(LV.titleVeto(t), 'money', t);

assert.strictEqual(LV.moneyMovement({ body: 'תעביר 500 ש"ח לחשבון', subject: '' }, null), true);
assert.strictEqual(LV.moneyMovement({ body: 'please send the file by Friday', subject: '' }, null), false);
assert.strictEqual(LV.moneyMovement({ body: '300 שקלונות על המדף', subject: '' }, null), false);

// A veto reason is silence. moneyMovement never returns a card.
assert.strictEqual(typeof LV.moneyMovement({ body: '500 ₪', subject: '' }, null), 'boolean');
console.log('hebrew-amount: ' + moneyTitles.length + ' titles vetoed, ' + notMoney.length + ' left alone');
