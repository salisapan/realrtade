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

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
