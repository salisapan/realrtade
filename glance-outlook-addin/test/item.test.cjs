#!/usr/bin/env node
// Unit tests for the Office.js item reader and the reply-draft html / undo kind.
// No Office host, no network, no Graph.

const item = require('../src/item.js');

const ASK = 'Hi Sali, could you reply to confirm you will be at the review on Thursday morning? Please let me know by Wednesday.';
const ME = 'sali@example.com';

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

function asyncCall(fn) {
  return new Promise(function (resolve) {
    fn(function (result) {
      var ok = result && result.status === 'succeeded';
      resolve({ ok: Boolean(ok), value: ok ? result.value : null });
    });
  });
}

function succeeded(value) {
  return function (a, b) {
    var cb = typeof b === 'function' ? b : a;
    cb({ status: 'succeeded', value: value });
  };
}
function failed(a, b) {
  var cb = typeof b === 'function' ? b : a;
  cb({ status: 'failed', value: null });
}

(async () => {
  {
    const readItem = {
      subject: 'Review',
      conversationId: 'AAQkConv+1/x',
      from: { emailAddress: 'dana@client.example', displayName: 'Dana Cohen' },
      to: [{ emailAddress: ME, displayName: 'Sali Sapan' }, { emailAddress: 'sam@example.com', displayName: 'Sam' }],
      cc: [{ emailAddress: 'Casey@example.com', displayName: 'Casey' }],
      body: { getAsync: succeeded(ASK) }
    };
    const res = await item.read(readItem, { me: ME, compose: false, asyncCall: asyncCall, coercionText: 'text' });
    check('read: body, subject, from, to, cc, conversationId',
      res.ok === true
      && res.message.text === ASK
      && res.message.subject === 'Review'
      && res.message.from === 'dana@client.example'
      && res.message.fromName === 'Dana Cohen'
      && res.message.to.join(',') === ME + ',sam@example.com'
      && res.message.cc.join(',') === 'casey@example.com'
      && res.message.conversationId === 'AAQkConv+1/x'
      && res.message.isMine === false,
      res);
    check('read: reply-all when Cc is present', item.replyFormKind(res.message.cc) === 'reply-all');
  }

  {
    const readItem = {
      subject: 'Review',
      conversationId: 'c1',
      from: { emailAddress: 'dana@client.example', displayName: 'Dana' },
      to: [{ emailAddress: ME, displayName: 'Sali' }],
      cc: [],
      body: { getAsync: succeeded(ASK) }
    };
    const res = await item.read(readItem, { me: ME, compose: false, asyncCall: asyncCall, coercionText: 'text' });
    check('read: reply to the sender when Cc is empty', res.ok && item.replyFormKind(res.message.cc) === 'reply');
  }

  {
    const readItem = {
      subject: 'Note',
      from: { emailAddress: ME, displayName: 'Sali Sapan' },
      to: [{ emailAddress: 'dana@client.example', displayName: 'Dana' }],
      cc: [],
      body: { getAsync: succeeded(ASK) }
    };
    const res = await item.read(readItem, { me: ME, compose: false, asyncCall: asyncCall, coercionText: 'text' });
    check('read: a message from the mailbox is marked mine', res.ok && res.message.isMine === true);
  }

  {
    const nested = {
      subject: 'Review',
      from: { emailAddress: { address: 'dana@client.example', name: 'Dana Cohen' } },
      to: ['Sali Sapan <' + ME + '>'],
      cc: [],
      body: { getAsync: succeeded(ASK) }
    };
    const res = await item.read(nested, { me: ME, compose: false, asyncCall: asyncCall, coercionText: 'text' });
    check('read: nested Graph-shaped from and a display-name To string',
      res.ok && res.message.from === 'dana@client.example' && res.message.fromName === 'Dana Cohen' && res.message.to[0] === ME,
      res.message);
  }

  {
    const blank = { subject: 'Review', from: { emailAddress: 'dana@client.example' }, to: [], cc: [], body: { getAsync: succeeded('   \n') } };
    const res = await item.read(blank, { me: ME, compose: false, asyncCall: asyncCall, coercionText: 'text' });
    check('read: a blank body is empty-item', res.ok === false && res.why === 'empty-item', res);
  }

  {
    const broken = { subject: 'Review', body: { getAsync: failed } };
    const res = await item.read(broken, { me: ME, compose: false, asyncCall: asyncCall, coercionText: 'text' });
    check('read: a failed body getAsync is body-unreadable', res.ok === false && res.why === 'body-unreadable', res);
  }

  {
    const missing = await item.read(null, { me: ME, asyncCall: asyncCall });
    check('read: no item', missing.ok === false && missing.why === 'no-item');
  }

  {
    const compose = {
      conversationId: 'AAQkConv+1/x',
      subject: { getAsync: succeeded('Re: Review') },
      to: { getAsync: succeeded([{ emailAddress: 'dana@client.example', displayName: 'Dana Cohen' }]) },
      cc: { getAsync: succeeded([{ emailAddress: 'casey@example.com', displayName: 'Casey' }]) },
      body: { getAsync: succeeded('Thanks.\n\nOn Tue Dana wrote: ' + ASK) }
    };
    const res = await item.read(compose, { me: ME, compose: true, asyncCall: asyncCall, coercionText: 'text' });
    check('compose: subject, to and cc are read, and the quoted ask is the message',
      res.ok === true
      && res.message.subject === 'Re: Review'
      && res.message.text === ASK
      && res.message.fromName === 'Dana'
      && res.message.to.join(',') === ME
      && res.message.cc.length === 0
      && res.message.isMine === false
      && res.recipients.to.join(',') === 'dana@client.example'
      && res.recipients.cc.join(',') === 'casey@example.com'
      && res.message.conversationId === 'AAQkConv+1/x',
      res);
  }

  {
    const own = {
      subject: { getAsync: succeeded('Re: Review') },
      to: { getAsync: succeeded([]) },
      cc: { getAsync: succeeded([]) },
      body: { getAsync: succeeded('I will send the notes tomorrow.') }
    };
    const res = await item.read(own, { me: ME, compose: true, asyncCall: asyncCall, coercionText: 'text' });
    check('compose: the person\'s own typing, with no quoted message, is not an ask',
      res.ok === false && res.why === 'no-quoted-message', res);
  }

  {
    const fromLine = item.quotedIncoming('Hello\nFrom: Dana Cohen <dana@client.example>\n' + ASK);
    check('quote: a From line keeps the name and the address',
      fromLine && fromLine.text === ASK && fromLine.fromName === 'Dana Cohen' && fromLine.from === 'dana@client.example',
      fromLine);
    const hebrew = item.quotedIncoming('שלום\nמאת: דנה כהן <dana@client.example>\n' + ASK);
    check('quote: a Hebrew מאת line keeps the address',
      hebrew && hebrew.from === 'dana@client.example' && hebrew.text === ASK, hebrew);
    const dated = item.quotedIncoming('On Tuesday, Oct 14, 2026 at 10:00 AM Dana Cohen wrote: ' + ASK);
    check('quote: On ... wrote keeps the person, not the weekday',
      dated && dated.fromName === 'Dana Cohen' && dated.text.indexOf('Hi Sali') === 0, dated);
    check('quote: no marker means there is no incoming message', item.quotedIncoming('Just my own sentence.') === null);
  }

  {
    const html = item.draftHtml('Hi Dana,\n<script>alert(1)</script> & friends');
    check('draft html escapes markup and keeps line breaks',
      html === 'Hi Dana,<br>&lt;script&gt;alert(1)&lt;/script&gt; &amp; friends', html);
    check('draft html has no send instruction', !/sendmail|\/send\b/i.test(html));
  }

  if (failures) {
    console.error('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nAll outlook item-reader checks passed');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
