'use strict';
// Slot development rows (2026-11-15): the shapes the held-out slot gold exposed, moved here when fixed (see the header of labeling/slot-gold/slot-gold-v0.cjs). Same row format.
module.exports = [
  ['task', 'en', 'Please submit the expense report by end of day Monday.', { date: '2026-10-12', has: ['expense'] }],
  ['task', 'en', 'Please send the draft by EOD Friday.', { date: '2026-10-09', has: ['draft'] }],
  ['commit', 'en', 'Hi Sali, I will send you the signed contract by Friday. Noa', { date: '2026-10-09', has: ['contract'] }],
  ['commit', 'en', 'Hi Sali, as agreed on the call, you will send the invoice by Friday.', { date: '2026-10-09', has: ['invoice'] }],
  ['hold', 'en', 'Hi Sali, the kickoff is Tuesday at 10:00. I will be abroad on Monday.', { date: '2026-10-13', hour: 10, minute: 0 }],
  ['hold', 'en', 'Hi Sali, the workshop is on Sunday at 14:00. I am out of office on Thursday.', { date: '2026-10-11', hour: 14, minute: 0 }],
  ['pay', 'en', 'Hi Sali, the invoice of $450 was due on Monday. Please pay it by Friday.', { date: '2026-10-09' }]
];
