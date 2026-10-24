'use strict';
// Profile-dependent batch rows. A binary yes/no is the wrong question: the
// offer depends on the user. These ids stay out of the 200-label count.
const TAGS = {
  'v2syn-405': 'user_is_approver_for',
  'v2syn-6931': 'cc_reply_rate',
  'v2syn-7013': 'covers_addressee',
  'v2syn-9674': 'role_matches_topic',
  'v2syn-10482': 'work_style.files',
  'v2syn-25810': 'work_style.files',
  'v2syn-12865': 'user_is_approver_for'
};

function stampRow(row) {
  if (!row || !TAGS[row.id]) return row;
  row.answerType = 'context-dependent';
  row.depends_on = TAGS[row.id];
  return row;
}

module.exports = { TAGS, stampRow };
