// One Outlook mail that asks for a contact detail. The draft comes from the
// mocked contacts list. Nothing is sent.
const BODY = 'מה כתובת המייל של דנה כהן?';
const ID = 'AQMkLaneMsContacts';

const SCENARIO = {
  contacts: [{
    id: 'c1',
    displayName: 'כהן דנה',
    givenName: 'כהן',
    surname: 'דנה',
    fileAs: 'כהן, דנה',
    emailAddresses: [{ address: 'dana.cohen.test@example.com', name: 'כהן דנה' }],
    businessPhones: ['+972501234567']
  }, {
    id: 'c2',
    displayName: 'Levi Dana',
    givenName: 'Levi',
    surname: 'Dana',
    fileAs: 'Levi Dana',
    emailAddresses: [{ address: 'dana.levi.test@example.com', name: 'Levi Dana' }],
    businessPhones: ['+972509999999']
  }],
  people: []
};

module.exports = { BODY, ID, SCENARIO };
