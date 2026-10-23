'use strict';
// A Google Form from a request ("create a feedback form for the Q4 launch"): recognition, the Forms API create with
// read-back by id, Undo that leaves an edited form alone. In-memory stand-in for forms.googleapis.com and Drive.
// Run: node test/google-form-corpus.cjs
const path = require('path');
const { FlowWorkspaceFile: W } = require(path.join(__dirname, '..', 'core', 'workspace-file.js'));

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const flags = { [W.SWITCH]: true };

// Recognition.
const POS = [
  ['Can you create a feedback form for the Q4 launch?', 'Q4 launch feedback form'],
  ['Please set up a sign-up form called Spring Open Day', 'Spring Open Day'],
  ['Please create a survey about the new office', 'new office survey'],
  ['Could you make a registration form called Hackathon 2026?', 'Hackathon 2026'],
  ['תוכל לפתוח טופס הרשמה בשם יום פתוח אביב', 'יום פתוח אביב'],
  ['בבקשה תיצור שאלון בשם שביעות רצון לקוחות', 'שביעות רצון לקוחות']
];
for (const [text, name] of POS) {
  const r = W.recognize(text);
  check('form: ' + text.slice(0, 48), r.kind === 'clear' && r.fileKind === 'form' && r.name === name, r);
}
const NEG = [
  ['Can you create a feedback form?', 'no-name'],
  ['Could you create a form that asks about dietary needs, called Lunch RSVP?', 'asks-content'],
  ['Please create a Typeform for the launch', null],
  ['Please create a Microsoft Forms survey called Pulse', null],
  ['Maybe we could create a survey called Pulse at some point', 'hedge'],
  ['No need to create a feedback form called Pulse', 'negation'],
  ['Ask Dana to create a sign-up form called Open Day', 'third-party'],
  ['FYI the feedback form called Pulse is live', null],
  ['Please update the feedback form called Pulse', null],
  ['Here is the form we use for onboarding.', null]
];
for (const [text, why] of NEG) {
  const r = W.recognize(text);
  check('quiet: ' + text.slice(0, 48), r.kind !== 'clear' && (why === null || r.reason === why), r);
}
check('existing Doc ask still reads as a Doc', W.recognize('Please create a doc called Q4 launch plan').fileKind === 'doc');
const he = W.plan({ flags: flags, text: 'תוכל לפתוח טופס הרשמה בשם יום פתוח אביב' });
check('the Hebrew plan names a form and does not send', he.action === 'offer' && /טופס/.test(he.line) && /לא שולח/.test(he.steps[1].label), he);
check('switch off: no offer', W.plan({ flags: {}, text: POS[0][0] }).action === 'off');

// In-memory Forms + Drive.
function server(opts) {
  opts = opts || {};
  const forms = {};
  const drive = {};
  let n = 0;
  const calls = [];
  async function http(req) {
    calls.push(req.method + ' ' + req.url);
    const body = req.body ? JSON.parse(req.body) : null;
    if (opts.status) return { status: opts.status, ok: false, json: null };
    let m;
    if (req.method === 'POST' && req.url === 'https://forms.googleapis.com/v1/forms') {
      const id = 'form' + (++n);
      forms[id] = { formId: id, info: { title: opts.titleOnGet || body.info.title, documentTitle: body.info.documentTitle }, revisionId: '0000a1' };
      drive[id] = { id: id, trashed: false };
      return { status: 200, ok: true, json: { formId: id, info: { title: body.info.title }, revisionId: '0000a1' } };
    }
    if ((m = req.url.match(/^https:\/\/forms\.googleapis\.com\/v1\/forms\/([^/?]+)$/)) && req.method === 'GET') {
      return forms[m[1]] ? { status: 200, ok: true, json: forms[m[1]] } : { status: 404, ok: false, json: null };
    }
    if ((m = req.url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/?]+)/))) {
      const f = drive[m[1]];
      if (!f) return { status: 404, ok: false, json: null };
      if (req.method === 'PATCH') { Object.assign(f, body); return { status: 200, ok: true, json: f }; }
      return { status: 200, ok: true, json: f };
    }
    return { status: 400, ok: false, json: null };
  }
  return { http, forms, drive, calls };
}

(async () => {
  const input = { flags: flags, fileKind: 'form', name: 'Q4 launch feedback form' };
  const s = server();
  const r = await W.write(input, s.http);
  check('create: ok and read back by id', r.ok === true && r.proof && r.proof.fetchedBack === true && r.proof.system === 'google/forms', r);
  check('create: ProofOfClose carries the form id and an edit link', r.proof && r.proof.externalId === r.ref.fileId && /^https:\/\/docs\.google\.com\/forms\/d\/form1\/edit$/.test(r.url || ''), r);
  check('create: the form is empty and was not sent anywhere', Object.keys(s.forms).length === 1 && s.calls.every((c) => !/send|publish|responses/i.test(c)), s.calls);
  check('create: written line names the form', r.written === 'Form · Q4 launch feedback form' && r.where === 'Google Forms');

  const u = await W.undo(r.ref, s.http);
  check('undo: untouched form is trashed and checked', u.ok === true && u.undone === true && s.drive.form1.trashed === true, u);

  const s2 = server();
  const r2 = await W.write(input, s2.http);
  s2.forms.form1.revisionId = '0000b2'; // the person added a question
  const u2 = await W.undo(r2.ref, s2.http);
  check('undo: an edited form is left alone', u2.ok === false && u2.reason === 'user-edited' && s2.drive.form1.trashed === false, u2);

  const s3 = server();
  const r3 = await W.write(input, s3.http);
  delete s3.forms.form1;
  const u3 = await W.undo(r3.ref, s3.http);
  check('undo: a form already deleted counts as undone', u3.ok === true && u3.undone === true, u3);

  const r4 = await W.undo({ fileId: 'form9', kind: 'form' }, server().http);
  check('undo: not ours is refused', r4.ok === false && r4.reason === 'not-ours', r4);

  const s5 = server({ status: 403 });
  const r5 = await W.write(input, s5.http);
  check('no Forms scope: answers not-connected and writes nothing', r5.ok === false && r5.reason === 'not-connected' && r5.proof === null, r5);

  const s6 = server({ titleOnGet: 'Something else' });
  const r6 = await W.write(input, s6.http);
  check('read-back with another title: the form is withdrawn, never Handled', r6.ok === false && r6.reason === 'verify_failed' && s6.drive.form1.trashed === true && r6.removed === true, r6);

  const r7 = await W.write(Object.assign({}, input, { flags: {} }), server().http);
  check('switch off: nothing is created', r7.ok === false && r7.reason === 'switch-off', r7);

  // Wiring the page and the lane already carry.
  const fs = require('fs');
  const gm = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
  check('the Gmail card labels a Form and says it was created in Google Forms', /plan\.fileKind === 'form' \? 'Form'/.test(gm) && /Created in Google Forms/.test(gm));

  console.log(failures ? failures + ' failure(s)' : 'all passed');
  process.exit(failures ? 1 : 0);
})();
