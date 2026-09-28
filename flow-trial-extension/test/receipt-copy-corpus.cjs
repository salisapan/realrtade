// receipt-copy.js corpus — the words a successful Do It is allowed to say.
//
// The receipt DOM lives in content-gmail.js, which boots the Gmail watcher
// the moment it loads. The status word and the Undo label are the part a
// person actually reads, and they don't need a DOM to be wrong: "Handled."
// on a partial write, or the early-close sentence standing in for the
// status word, both leave the outcome ambiguous. This pins the copy.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'receipt-copy.js'), 'utf8'), sandbox, { filename: 'receipt-copy.js' });
const FlowReceipt = vm.runInContext('FlowReceipt', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

console.log('\n--- receipt-copy: a full close says Handled, and Undo is singular ---\n');
{
  const c = FlowReceipt.confirmation({ succeeded: 1, total: 1, priorCloses: 5 });
  check('a full close is Handled.', c.status === 'Handled.' && c.full === true, c);
  check('past the third close there is no extra early line', c.earlyLine === null, c);
  check('one write says Undo, not Undo all', c.undoLabel === 'Undo', c);
}

console.log('\n--- receipt-copy: the first three full closes keep the magic-moment line under Handled ---\n');
{
  for (const prior of [0, 1, 2]) {
    const c = FlowReceipt.confirmation({ succeeded: 1, total: 1, priorCloses: prior });
    check('close ' + (prior + 1) + ' still leads with Handled.', c.status === 'Handled.', c);
    check('close ' + (prior + 1) + ' adds the same early line', c.earlyLine === FlowReceipt.EARLY_LINE, c);
  }
  const fourth = FlowReceipt.confirmation({ succeeded: 2, total: 2, priorCloses: 3 });
  check('the fourth full close drops the early line', fourth.earlyLine === null && fourth.status === 'Handled.', fourth);
  check('the early line is one fixed sentence', FlowReceipt.EARLY_LINE === 'Nothing else to open, nothing else to check — that’s handled.');
  check('two successful steps say Undo all', fourth.undoLabel === 'Undo all', fourth.undoLabel);
}

console.log('\n--- receipt-copy: a partial close does not claim it was handled ---\n');
{
  const c = FlowReceipt.confirmation({ succeeded: 1, total: 2, priorCloses: 0 });
  check('a partial close says Partly handled.', c.status === 'Partly handled.' && c.full === false, c);
  check('the early line is withheld when something did not land', c.earlyLine === null, c);
  check('the one write that did land is still Undo, not Undo all', c.undoLabel === 'Undo', c);

  const twoOfThree = FlowReceipt.confirmation({ succeeded: 2, total: 3, priorCloses: 9 });
  check('two successes out of three still say Undo all', twoOfThree.undoLabel === 'Undo all' && twoOfThree.status === 'Partly handled.', twoOfThree);
}

console.log('\n--- receipt-copy: Undo names the record it removes ---\n');
{
  check('one Google Task says Undo removes that task',
    FlowReceipt.undoHint(['Google Tasks']) === 'Undo removes the Google Task.');
  check('a draft and a task, in the order they landed, say Undo all',
    FlowReceipt.undoHint(['Gmail', 'Google Tasks']) === 'Undo all removes the Gmail draft and the Google Task.');
  check('three records keep each “the” and a final and',
    FlowReceipt.undoHint(['Google Calendar', 'Gmail', 'Google Tasks']) === 'Undo all removes the Calendar event, the Gmail draft, and the Google Task.');
  check('a Calendar event is named the same way',
    FlowReceipt.undoHint(['Google Calendar']) === 'Undo removes the Calendar event.');
  check('the same destination twice is still one kind of record',
    FlowReceipt.undoHint(['Google Tasks', 'Google Tasks']) === 'Undo removes the Google Task.');
  check('a destination this receipt does not name stays generic',
    FlowReceipt.undoHint(['Slack']) === 'Undo removes what was just written.');
  check('a named write beside one this receipt does not name stays generic',
    FlowReceipt.undoHint(['Google Tasks', 'Slack']) === 'Undo all removes what was just written.');
  check('two unnamed destinations stay a generic Undo all',
    FlowReceipt.undoHint(['Slack', 'Notion']) === 'Undo all removes what was just written.');
  check('nothing named still tells the person Undo removes the write',
    FlowReceipt.undoHint([]) === 'Undo removes what was just written.' && FlowReceipt.undoHint(null) === 'Undo removes what was just written.');
}

console.log('\n--- receipt-copy: a finished undo names what was removed ---\n');
{
  check('one task says that task was removed',
    FlowReceipt.undoneLine(['Google Tasks']) === 'Undone — the Google Task was removed.');
  check('a draft and a task both get named',
    FlowReceipt.undoneLine(['Gmail', 'Google Tasks']) === 'Undone — the Gmail draft and the Google Task were removed.');
  check('an unnamed write still says nothing was kept',
    FlowReceipt.undoneLine(['Slack']) === 'Undone — nothing was kept.' && FlowReceipt.undoneLine() === 'Undone — nothing was kept.');
}

console.log('\n--- receipt-copy: a failed reverse is honest about what is still there ---\n');
{
  check('the only task, and Undo did not move it',
    FlowReceipt.reverseNote({ reversed: 0, remaining: 1, keptWhere: 'Google Tasks' }) === 'Still there — the Google Task was not removed.');
  check('one unnamed write that did not move',
    FlowReceipt.reverseNote({ reversed: 0, remaining: 1, keptWhere: 'Slack' }) === 'Still there — Undo didn’t remove it.');
  check('several writes and nothing moved — do not say only the first one',
    FlowReceipt.reverseNote({ reversed: 0, remaining: 2, keptWhere: 'Google Tasks' }) === 'Still there — nothing was removed.');
  check('one record left after a partial reverse names it and asks to finish',
    FlowReceipt.reverseNote({ reversed: 1, remaining: 1, keptWhere: 'Gmail' }) === 'The Gmail draft is still there. Undo again to remove it.');
  check('more than one left does not pretend only one remains',
    FlowReceipt.reverseNote({ reversed: 1, remaining: 2, keptWhere: 'Gmail' }) === 'Not all of it is gone. Undo again to remove what’s left.');
  check('no input does not claim a partial undo',
    FlowReceipt.reverseNote() === 'Still there — nothing was removed.' && FlowReceipt.reverseNote(null) === 'Still there — nothing was removed.');
  check('the old "some of this" sentence is not what a failed reverse says',
    FlowReceipt.reverseNote({ reversed: 0, remaining: 1, keptWhere: 'Google Tasks' }).indexOf('Some of this') === -1);
}

console.log('\n--- receipt-copy: silence — nothing succeeded, so there is no Handled line ---\n');
{
  const none = FlowReceipt.confirmation();
  const zero = FlowReceipt.confirmation({ succeeded: 0, total: 2, priorCloses: 0 });
  check('silence: no input has no status and no early line', none.status === null && none.earlyLine === null, none);
  check('silence: null input has no status', FlowReceipt.confirmation(null).status === null);
  check('silence: zero successes is neither Handled nor Partly handled', zero.status === null && zero.earlyLine === null, zero);
  check('a missing prior-close count is treated as a first close', FlowReceipt.confirmation({ succeeded: 1, total: 1 }).earlyLine === FlowReceipt.EARLY_LINE);
  check('a non-numeric prior-close count is treated as a first close', FlowReceipt.confirmation({ succeeded: 1, total: 1, priorCloses: 'nope' }).earlyLine === FlowReceipt.EARLY_LINE);
  check('more successes than steps is not called a full close', FlowReceipt.confirmation({ succeeded: 3, total: 1, priorCloses: 0 }).full === false);
}

console.log('\n--- receipt-copy: a Hebrew full close says טופל ---\n');
{
  const c = FlowReceipt.confirmation({ succeeded: 1, total: 1, priorCloses: 5, lang: 'he' });
  check('a full Hebrew close is טופל.', c.status === 'טופל.' && c.full === true, c);
  check('English stays the default', FlowReceipt.confirmation({ succeeded: 1, total: 1, priorCloses: 5 }).status === 'Handled.');
  const partial = FlowReceipt.confirmation({ succeeded: 1, total: 2, priorCloses: 0, lang: 'he' });
  check('a partial close does not say טופל', partial.status === 'Partly handled.', partial);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
