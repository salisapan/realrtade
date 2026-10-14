const { teach } = require('./teacher.cjs');
const ext = { name: 'Dana Levi', email: 'dana@acme.io' };
const cases = [
 ['gmail', ext, 'Could you send me the signed contract by Friday?', 0],
 ['gmail', ext, "Please don't save the attachment to Drive.", 1],
 ['outlook', ext, "Please don't save the attachment to Drive.", 1],
 ['gmail', ext, 'Please save the attached file to Drive.', 1],
 ['outlook', ext, 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks', 1],
 ['gmail', ext, 'Can we meet Tuesday at 3pm to go over the budget?', 0],
 ['outlook', ext, 'Can we meet Tuesday at 3pm to go over the budget?', 0],
 ['gmail', ext, 'Please pay the invoice of ₪1,200 by October 15.', 0],
 ['gmail', { name: 'Me', email: 'ai.local.flow@gmail.com' }, 'I will renew the passport application by Friday.', 0, ['ai.local.flow@gmail.com']],
 ['gmail', { name: 'Me', email: 'ai.local.flow@gmail.com' }, 'Could you send me the signed contract by Friday?', 0, ['dana@acme.io']],
 ['gmail', ext, 'אפשר לשלוח לי את החוזה החתום עד יום חמישי?', 0],
 ['gmail', ext, 'נקבע פגישה ביום שלישי בשעה 15:00 במשרד', 0],
 ['gmail', ext, 'FYI, attached for your records is the signed NDA.', 1],
 ['gmail', ext, 'We decided to go with Acme for the pilot; budget approved at $5,000.', 0],
 ['gmail', ext, 'Please add a task to renew the passport by October 20.', 0],
 ['gmail', ext, 'Put the agenda on the calendar for Tuesday at 10:00.', 0],
 ['gmail', ext, 'You agreed to send the deck by Thursday.', 0],
 ['gmail', ext, 'Please create an invoice for Acme for $500.', 0],
];
for (const [surface, from, body, att, to] of cases) console.log(surface.padEnd(8), JSON.stringify(body).slice(0, 60).padEnd(62), JSON.stringify(teach({ surface, from, to: to || ['ai.local.flow@gmail.com'], subject: 'Re: update', body, attachmentCount: att })));
