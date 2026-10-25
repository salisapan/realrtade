// Read recent messages from one Teams chat (Chat.Read) when the page DOM is not enough.
// GET only. Never posts. No network unless deps.call is provided.
const FlowTeamsWebRead = (() => {
  const READ_SCOPE = 'Chat.Read';
  const MAX = 20;

  function scopeList(scopes) {
    if (scopes == null) return null;
    if (Array.isArray(scopes)) return scopes.map((s) => String(s || '').trim()).filter(Boolean);
    if (typeof scopes === 'string') return scopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return null;
  }

  function hasReadScope(scopes) {
    const list = scopeList(scopes);
    if (!list) return null;
    return list.some((s) => s === READ_SCOPE || s === 'https://graph.microsoft.com/' + READ_SCOPE);
  }

  function normalizeRow(row, selfId) {
    if (!row || !row.id) return null;
    const body = row.body && row.body.content ? String(row.body.content) : '';
    const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const authorId = row.from && row.from.user && row.from.user.id ? String(row.from.user.id) : '';
    const me = selfId && authorId && String(selfId) === authorId;
    return {
      id: String(row.id),
      text: text,
      author: me ? 'me' : 'them',
      attachments: Array.isArray(row.attachments) ? row.attachments.map((a) => ({ name: a.name ? String(a.name) : '' })).filter((a) => a.name) : [],
      createdDateTime: row.createdDateTime ? String(row.createdDateTime) : null
    };
  }

  async function readRecent(chatId, deps) {
    const id = String(chatId || '').trim();
    const call = deps && deps.call;
    if (!id || typeof call !== 'function') return { ok: false, reason: 'unclear' };
    if (hasReadScope(deps && deps.grantedScopes) === false) return { ok: false, reason: 'chat-not-granted' };
    const path = '/me/chats/' + encodeURIComponent(id) + '/messages?$top=' + MAX + '&$orderby=createdDateTime%20desc';
    const res = await call({ method: 'GET', path: path });
    if (!res || res.ok !== true) return { ok: false, reason: 'messages-failed', status: res && res.status };
    const raw = res.body && Array.isArray(res.body.value) ? res.body.value : [];
    const selfId = deps && deps.selfId ? String(deps.selfId) : '';
    const messages = raw.map((row) => normalizeRow(row, selfId)).filter(Boolean).reverse();
    if (!messages.length) return { ok: false, reason: 'empty' };
    return { ok: true, messages: messages, source: 'graph' };
  }

  return {
    READ_SCOPE: READ_SCOPE,
    hasReadScope: hasReadScope,
    normalizeRow: normalizeRow,
    readRecent: readRecent
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowTeamsWebRead = FlowTeamsWebRead;
if (typeof module !== 'undefined') module.exports = { FlowTeamsWebRead };
else if (typeof globalThis !== 'undefined') globalThis.FlowTeamsWebRead = FlowTeamsWebRead;
