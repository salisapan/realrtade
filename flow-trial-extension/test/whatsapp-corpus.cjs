// WhatsApp Web parsing: only one-to-one chats, only what the page really says about them.
// Run: node test/whatsapp-corpus.cjs
const { FlowWhatsAppParse: P } = require('../src/whatsapp-parse.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const mine = 'true_972541234567@c.us_3EB0AB12';
const theirs = 'false_972541234567@c.us_3EB0CD34';
const group = 'false_120363041234567890@g.us_3EB0EF56_972501112222@c.us';

console.log('\n--- message ids ---\n');
{
  const a = P.parseDataId(mine), b = P.parseDataId(theirs);
  check('"true_" is sent by you, "false_" by them', a.fromMe === true && b.fromMe === false);
  check('a normal contact\'s id carries their number', b.user === '972541234567' && b.hasPhone && b.oneToOne && b.jid === '972541234567@c.us', b);
  check('a group message is not one-to-one', P.parseDataId(group).oneToOne === false && P.parseDataId(group).server === 'g.us');
  check('a broadcast list and a channel are not one-to-one', P.parseDataId('false_status@broadcast_3EB0').oneToOne === false && P.parseDataId('false_120363@newsletter_3EB0').oneToOne === false);
  check('a hidden-number id (lid) is one-to-one but has no phone', (() => { const x = P.parseDataId('false_1234567890@lid_3EB0AB'); return x.oneToOne && !x.hasPhone; })());
  check('garbage is null, never a guess', P.parseDataId('') === null && P.parseDataId('hello') === null && P.parseDataId('maybe_972541234567@c.us_ab') === null && P.parseDataId('false_noserver_ab') === null && P.parseDataId(null) === null);
  check('the whole chat must be one-to-one: one group id spoils it', P.isOneToOne([mine, theirs]) && !P.isOneToOne([mine, group]) && !P.isOneToOne([]) && !P.isOneToOne([group]));
  check('a three-part-or-more id is a group even if it looks like c.us', !P.isOneToOne(['false_972541234567@c.us_3EB0_972501112222@c.us']));
}

console.log('\n--- who the chat is with ---\n');
{
  const ids = [mine, theirs];
  const p = P.partyFromChat('Dana Cole', ids);
  check('a saved contact: the name from the title, the number from the ids', p.name === 'Dana Cole' && p.phone === '972541234567' && p.email === null, p);
  const q = P.partyFromChat('+972 54-123-4567', ids);
  check('an unsaved number as the title is a phone, not a name', q.name === null && q.phone === '972541234567', q);
  const r = P.partyFromChat('‪Dana Cole‬', ids);
  check('direction marks around the title are removed', r.name === 'Dana Cole', r);
  const l = P.partyFromChat('Dana Cole', ['false_1234567890@lid_3EB0AB']);
  check('a hidden-number chat has a name and no phone, and says so', l.name === 'Dana Cole' && l.phone === null && l.lidOnly === true, l);
  check('the thread id is the chat\'s own id', P.threadIdFor('Dana Cole', [mine, theirs]) === 'wa:972541234567@c.us' && P.threadIdFor('x', [group]) === null);
}

console.log('\n--- message text ---\n');
{
  check('the quoted message a reply carries is dropped, the reply kept', P.joinText([{ text: 'Can you send the old invoice?', quoted: true }, { text: 'Yes, sending it now' }]) === 'Yes, sending it now');
  check('pieces are joined and cleaned', P.joinText([{ text: '  Hi  ' }, { text: 'Could you   send it?' }]) === 'Hi\nCould you send it?');
  check('text is bounded', P.joinText([{ text: 'x'.repeat(9000) }]).length === 4000);
  check('nothing is nothing', P.joinText([]) === '' && P.joinText(null) === '');
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
