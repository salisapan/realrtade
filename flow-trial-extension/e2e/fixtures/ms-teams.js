// One mail that asks for a Teams draft. The draft stays in the panel.
const BODY = 'Please draft a teams reply to the pricing chat: I will send the numbers Thursday.';
const ID = 'AQMkLaneMsTeams';
const SCENARIO = {
  chats: [
    { id: 'chat-2', topic: 'other', chatType: 'group' },
    { id: 'chat-1', topic: 'pricing', chatType: 'group' }
  ]
};

module.exports = { BODY, ID, SCENARIO };
