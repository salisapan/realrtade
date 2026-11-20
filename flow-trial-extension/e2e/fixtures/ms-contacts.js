// One Outlook mail that asks for a contact detail. The draft comes from the
// mocked contacts list. Nothing is sent.
const BODY = "What's Dana Cohen's email?";
const ID = 'AQMkLaneMsContacts';

const SCENARIO = {
  contacts: [{
    id: 'c1',
    displayName: 'Dana Cohen',
    emailAddresses: [{ address: 'dana.cohen.test@example.com', name: 'Dana Cohen' }],
    businessPhones: ['+972501234567']
  }, {
    id: 'c2',
    displayName: 'Levi Dana',
    emailAddresses: [{ address: 'levi.dana@example.com', name: 'Levi Dana' }],
    businessPhones: ['+972509999999']
  }],
  people: []
};

module.exports = { BODY, ID, SCENARIO };
