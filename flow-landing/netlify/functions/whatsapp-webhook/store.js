// Conversation and idempotency storage.
//
// The interface is small on purpose so a later durable backend can replace
// the memory implementation without touching the state machine. In-memory
// is correct for tests. On Netlify it will not survive a cold start — before
// this goes live, wire Netlify Blobs or a Supabase table behind the same
// methods. Do not provision either from this change.
function createMemoryStore() {
  const conversations = new Map();
  const messages = new Set();

  return {
    kind: 'memory',
    async getConversation(phone) {
      const row = conversations.get(phone);
      return row ? JSON.parse(JSON.stringify(row)) : null;
    },
    async saveConversation(phone, state) {
      conversations.set(phone, JSON.parse(JSON.stringify(state)));
    },
    async hasMessage(messageId) {
      return messages.has(messageId);
    },
    async markMessage(messageId) {
      messages.add(messageId);
    },
  };
}

module.exports = { createMemoryStore };
