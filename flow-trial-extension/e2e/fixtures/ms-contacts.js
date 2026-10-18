// One Outlook mail that asks to resolve a recipient. The address comes back
// from the mocked contacts list. Nothing is written.
const BODY = 'Please look up the contact Dana Cohen.';
const ID = 'AQMkLaneMsContacts';

const SCENARIO = {
  contacts: [{
    id: 'c1',
    displayName: 'Dana Cohen',
    emailAddresses: [{ address: 'dana@acme.com', name: 'Dana Cohen' }]
  }],
  people: []
};

module.exports = { BODY, ID, SCENARIO };
