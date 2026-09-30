// Regression corpus for core/close-memory.js — Glance's local personal
// close memory. A successful Trusted Do It (one of the personal
// closes, every attempted write ok) leaves a compact record. A later
// message that clearly continues that same matter stays quiet. Anything
// less clear leaves the chip alone.
//
// Run: node test/close-memory-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'close-memory.js'), 'utf8'), sandbox, { filename: 'close-memory.js' });
const FlowCloseMemory = vm.runInContext('FlowCloseMemory', sandbox);

function freshAdapter() {
  const store = new Map();
  return {
    backing: store,
    async get(key) { return store.get(key); },
    async set(key, value) { store.set(key, value); }
  };
}
function resetAdapter() {
  FlowCloseMemory.setStorageAdapter(freshAdapter());
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const SUBJECT = 'Budget approval for the Q3 vendor contract';
const SNIPPET = 'Please follow up with Dana about the invoice by Friday.';

function closeInput(overrides) {
  return Object.assign({
    personalClose: 'follow-up-ask',
    fullWrite: true,
    threadId: 'thread-1',
    subject: SUBJECT,
    snippet: SNIPPET,
    messageId: 'msg-1',
    targets: ['gmailDraft', 'googleTask'],
    timestamp: '2026-09-27T12:00:00.000Z'
  }, overrides);
}

async function run() {
  console.log('--- close-memory.js: storage key is its own namespace ---\n');
  {
    check('the memory key is glancePersonalCloseMemory', FlowCloseMemory.STORAGE_KEY === 'glancePersonalCloseMemory', FlowCloseMemory.STORAGE_KEY);
    check('the cap is the last 40 closes', FlowCloseMemory.MAX_CLOSES === 40, FlowCloseMemory.MAX_CLOSES);
    resetAdapter();
    const empty = await FlowCloseMemory.getAll();
    check('an untouched profile reads as an empty list', Array.isArray(empty) && empty.length === 0, empty);
  }

  console.log('\n--- close-memory.js: fullWriteOf ---\n');
  {
    check('no results is not a full write', FlowCloseMemory.fullWriteOf([]) === false);
    check('a missing list is not a full write', FlowCloseMemory.fullWriteOf(null) === false);
    check('every attempted step ok is a full write', FlowCloseMemory.fullWriteOf([
      { response: { ok: true } },
      { response: { ok: true } }
    ]) === true);
    check('one failed step is not a full write', FlowCloseMemory.fullWriteOf([
      { response: { ok: true } },
      { response: { ok: false } }
    ]) === false);
    check('a skipped dependency is not a full write', FlowCloseMemory.fullWriteOf([
      { response: { ok: false, skipped: true } }
    ]) === false);
  }

  console.log('\n--- close-memory.js: record only a successful trusted close ---\n');
  resetAdapter();
  {
    const refusedPartial = await FlowCloseMemory.recordClose(closeInput({ fullWrite: false }));
    check('a partial write is not remembered', refusedPartial === null && (await FlowCloseMemory.getAll()).length === 0, refusedPartial);

    const refusedType = await FlowCloseMemory.recordClose(closeInput({ personalClose: 'schedule' }));
    check('a non-trusted close type is not remembered', refusedType === null && (await FlowCloseMemory.getAll()).length === 0, refusedType);

    const refusedId = await FlowCloseMemory.recordClose(closeInput({ messageId: '   ' }));
    check('a close without a message id is not remembered', refusedId === null, refusedId);

    const stored = await FlowCloseMemory.recordClose(closeInput());
    check('a full trusted write is remembered', stored && stored.closeType === 'follow-up-ask', stored);
    check('the record keeps the thread id', stored.threadId === 'thread-1', stored.threadId);
    check('targets collapse to tasks and draft, in first-seen order', JSON.stringify(stored.targets) === JSON.stringify(['draft', 'tasks']), stored.targets);
    check('calendar, notion, and tasks are remembered, in first-seen order', JSON.stringify(
      (await FlowCloseMemory.recordClose(closeInput({
        messageId: 'msg-notion',
        personalClose: 'calendar-hold',
        threadId: 'thread-notion',
        targets: ['calendar', 'notion', 'notion', 'googleTask', 'not-a-target']
      }))).targets
    ) === JSON.stringify(['calendar', 'notion', 'tasks']));
    check('the timestamp is kept', stored.timestamp === '2026-09-27T12:00:00.000Z', stored.timestamp);

    const blob = JSON.stringify(await FlowCloseMemory.getAll());
    check('the raw subject is not stored', blob.indexOf('Budget approval') === -1, blob);
    check('the raw snippet is not stored', blob.indexOf('Dana') === -1 && blob.indexOf('invoice') === -1, blob);
    check('a subject hash and a snippet hash are stored', typeof stored.subjectHash === 'string' && stored.subjectHash.length === 8 && typeof stored.snippetHash === 'string', stored);

    const again = await FlowCloseMemory.recordClose(closeInput({ targets: ['googleTask'], timestamp: '2026-09-27T13:00:00.000Z' }));
    const all = await FlowCloseMemory.getAll();
    const same = all.filter((r) => r.messageId === 'msg-1');
    check('recording the same message replaces the row instead of duplicating it', same.length === 1 && again.timestamp === '2026-09-27T13:00:00.000Z', same);
  }

  console.log('\n--- close-memory.js: recall prefers silence only when the matter is clear ---\n');
  resetAdapter();
  {
    await FlowCloseMemory.recordClose(closeInput());

    const sameThread = await FlowCloseMemory.recall({
      personalClose: 'follow-up-ask',
      threadId: 'thread-1',
      subject: 'A completely different subject line that is still long enough'
    });
    check('the same thread and the same close type stays silent', sameThread.action === 'silence' && sameThread.via === 'thread', sameThread);

    const otherType = await FlowCloseMemory.recall({
      personalClose: 'dated-commitment',
      threadId: 'thread-1',
      subject: SUBJECT
    });
    check('a different personal close in the same thread is left alone', otherType.action === 'none', otherType);

    const otherThread = await FlowCloseMemory.recall({
      personalClose: 'follow-up-ask',
      threadId: 'thread-2',
      subject: SUBJECT
    });
    check('the same subject in a different thread is left alone', otherThread.action === 'none', otherThread);

    const notTrusted = await FlowCloseMemory.recall({
      personalClose: 'schedule',
      threadId: 'thread-1',
      subject: SUBJECT
    });
    check('a message that is not a trusted personal close is left alone', notTrusted.action === 'none', notTrusted);

    const noQuery = await FlowCloseMemory.recall(null);
    check('an empty recall has no effect', noQuery.action === 'none', noQuery);
  }

  console.log('\n--- close-memory.js: subject hash only when neither side has a thread id ---\n');
  resetAdapter();
  {
    await FlowCloseMemory.recordClose(closeInput({ threadId: null, messageId: 'msg-subject' }));

    const continued = await FlowCloseMemory.recall({
      personalClose: 'follow-up-ask',
      threadId: null,
      subject: 'Re: Re: ' + SUBJECT
    });
    check('a reply prefix on the same specific subject stays silent when no thread id exists', continued.action === 'silence' && continued.via === 'subject', continued);

    const hebrew = await FlowCloseMemory.recordClose(closeInput({
      threadId: null,
      messageId: 'msg-he',
      personalClose: 'confirmed-amount',
      subject: 'אישור תקציב הרבעון השלישי'
    }));
    const hebrewRecall = await FlowCloseMemory.recall({
      personalClose: 'confirmed-amount',
      subject: 'השב: אישור תקציב הרבעון השלישי'
    });
    check('a Hebrew reply prefix matches the same specific subject', hebrew && hebrewRecall.action === 'silence' && hebrewRecall.via === 'subject', hebrewRecall);

    const oneSided = await FlowCloseMemory.recall({
      personalClose: 'follow-up-ask',
      threadId: 'thread-later',
      subject: SUBJECT
    });
    check('a subject match is not used when only the new message has a thread id', oneSided.action === 'none', oneSided);

    await FlowCloseMemory.recordClose(closeInput({
      threadId: null,
      messageId: 'msg-short',
      personalClose: 'dated-commitment',
      subject: 'Invoice'
    }));
    const shortRecall = await FlowCloseMemory.recall({
      personalClose: 'dated-commitment',
      subject: 'Re: Invoice'
    });
    check('a short subject does not count as the same matter', shortRecall.action === 'none', shortRecall);
  }

  console.log('\n--- close-memory.js: cap, undo, and clear ---\n');
  resetAdapter();
  {
    for (let i = 0; i < 41; i++) {
      await FlowCloseMemory.recordClose(closeInput({
        messageId: 'm' + i,
        threadId: 't' + i,
        timestamp: '2026-09-27T12:00:' + String(i).padStart(2, '0') + '.000Z'
      }));
    }
    const capped = await FlowCloseMemory.getAll();
    check('the log keeps the newest 40 closes', capped.length === 40, capped.length);
    check('the oldest close falls off the cap', !capped.some((r) => r.messageId === 'm0'), capped[capped.length - 1]);
    check('the newest close is first', capped[0].messageId === 'm40', capped[0] && capped[0].messageId);

    const forgotten = await FlowCloseMemory.forgetMessage('m40');
    const afterUndo = await FlowCloseMemory.recall({ personalClose: 'follow-up-ask', threadId: 't40', subject: SUBJECT });
    check('forgetting a message drops that close', forgotten === true && afterUndo.action === 'none', afterUndo);
    check('forgetting an unknown message is a no-op', (await FlowCloseMemory.forgetMessage('missing')) === false);

    await FlowCloseMemory.clear();
    const afterClear = await FlowCloseMemory.getAll();
    const recalled = await FlowCloseMemory.recall({ personalClose: 'follow-up-ask', threadId: 't39', subject: SUBJECT });
    check('clear removes every close', afterClear.length === 0 && recalled.action === 'none', afterClear.length);
  }

  console.log('\n--- close-memory.js: a calendar hold on this thread stays quiet the next time ---\n');
  resetAdapter();
  {
    const stored = await FlowCloseMemory.recordClose(closeInput({
      personalClose: 'calendar-hold',
      messageId: 'cal-1',
      threadId: 'thread-cal',
      targets: ['calendar']
    }));
    check('a full calendar hold is remembered', stored && stored.closeType === 'calendar-hold' && JSON.stringify(stored.targets) === JSON.stringify(['calendar']), stored);
    const again = await FlowCloseMemory.recall({
      personalClose: 'calendar-hold',
      threadId: 'thread-cal',
      subject: SUBJECT
    });
    check('the same thread and the same hold stays silent', again.action === 'silence' && again.via === 'thread', again);
    const removed = await FlowCloseMemory.recordClose(closeInput({
      personalClose: 'calendar-cancel',
      messageId: 'cal-cancel',
      threadId: 'thread-cancel',
      targets: ['calendar']
    }));
    const removedAgain = await FlowCloseMemory.recall({
      personalClose: 'calendar-cancel',
      threadId: 'thread-cancel',
      subject: SUBJECT
    });
    check('a full calendar cancel is remembered and stays quiet',
      removed && removed.closeType === 'calendar-cancel' && removedAgain.action === 'silence', removedAgain);
    const shifted = await FlowCloseMemory.recordClose(closeInput({
      personalClose: 'calendar-move',
      messageId: 'cal-move',
      threadId: 'thread-move',
      targets: ['calendar']
    }));
    const shiftedAgain = await FlowCloseMemory.recall({
      personalClose: 'calendar-move',
      threadId: 'thread-move',
      subject: SUBJECT
    });
    check('a full calendar move is remembered and stays quiet',
      shifted && shifted.closeType === 'calendar-move' && shiftedAgain.action === 'silence', shiftedAgain);
    const other = await FlowCloseMemory.recall({
      personalClose: 'dated-commitment',
      threadId: 'thread-cal',
      subject: SUBJECT
    });
    check('a different close type on that thread is not silenced', other.action === 'none', other);
    const partial = await FlowCloseMemory.recordClose(closeInput({
      personalClose: 'calendar-hold',
      fullWrite: false,
      messageId: 'cal-partial',
      threadId: 'thread-partial',
      targets: ['calendar']
    }));
    check('a calendar hold that did not fully write is not remembered', partial === null);
  }

  console.log('\n--- close-memory.js: parallel records both land ---\n');
  resetAdapter();
  {
    await Promise.all([
      FlowCloseMemory.recordClose(closeInput({ messageId: 'parallel-a', threadId: 'pa' })),
      FlowCloseMemory.recordClose(closeInput({ messageId: 'parallel-b', threadId: 'pb', personalClose: 'dated-commitment' }))
    ]);
    const ids = (await FlowCloseMemory.getAll()).map((r) => r.messageId).sort();
    check('two overlapping writes both survive', JSON.stringify(ids) === JSON.stringify(['parallel-a', 'parallel-b']), ids);
  }

  console.log('\n--- close-memory.js: a corrupt log does not throw ---\n');
  {
    const adapter = freshAdapter();
    FlowCloseMemory.setStorageAdapter(adapter);
    await adapter.set(FlowCloseMemory.STORAGE_KEY, { not: 'a list' });
    const read = await FlowCloseMemory.getAll();
    const stored = await FlowCloseMemory.recordClose(closeInput({ messageId: 'after-corrupt' }));
    check('a non-list value reads as empty and a new close can still be written', read.length === 0 && stored && stored.messageId === 'after-corrupt', stored);
  }

  console.log(failures === 0 ? '\nAll close-memory checks passed.' : '\n' + failures + ' close-memory check(s) failed.');
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
