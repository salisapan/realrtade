// Read the chats the person is in (Chat.Read) and show a draft reply in the
// panel. Never posts. A draft is not a close. No network in this file: pass call().
const FlowTeamsChat = (() => {
  const CONNECTOR = 'teamsChat';
  const READ_SCOPE = 'Chat.Read';

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

  function draftFrom(text) {
    const m = String(text || '').match(/\b(?:reply in teams|teams chat|draft a teams reply|draft the teams reply)\b[:\s-]*([\s\S]{0,400})/i);
    let rest = m && m[1] ? m[1].trim() : '';
    rest = rest.replace(/^to\s+[^:]+:\s*/i, '').trim();
    if (!rest) rest = 'Thanks, I will follow up.';
    return rest.slice(0, 400);
  }

  function offer(ctx) {
    const text = String((ctx && (ctx.text || ctx.body)) || '');
    if (!/\b(?:reply in teams|teams chat|draft a teams reply|draft the teams reply)\b/i.test(text)) return { show: false };
    return {
      show: true,
      connectorId: CONNECTOR,
      title: 'Teams',
      lines: [{ label: 'Draft', value: 'Reads your chats. Nothing is posted.' }],
      button: 'Show draft',
      closes: false,
      params: { text: text }
    };
  }

  async function run(input, deps) {
    if (input && (input.post === true || (input.method && String(input.method).toUpperCase() !== 'GET'))) {
      return { ok: false, reason: 'FORBIDDEN_SEND' };
    }
    const params = (input && input.params) || {};
    const text = String(params.text || (input && input.text) || '');
    const call = deps && deps.call;
    if (typeof call !== 'function') return { ok: false, reason: 'unclear' };
    if (hasReadScope(deps && deps.grantedScopes) === false) return { ok: false, reason: 'chat-not-granted' };
    const res = await call({ method: 'GET', path: '/me/chats?$top=20&$select=id,topic,chatType' });
    if (!res || res.ok !== true) return { ok: false, reason: 'chats-failed', status: res && res.status };
    const chats = (res.body && Array.isArray(res.body.value) ? res.body.value : []).filter((chat) => chat && chat.id);
    if (!chats.length) return { ok: false, reason: 'not-found' };
    const lower = text.toLowerCase();
    const named = chats.find((chat) => chat.topic && lower.indexOf(String(chat.topic).toLowerCase()) >= 0);
    const chat = named || chats[0];
    return {
      ok: true,
      connectorId: CONNECTOR,
      posted: false,
      closes: false,
      chat: { id: String(chat.id), topic: chat.topic ? String(chat.topic) : '' },
      draft: draftFrom(text)
    };
  }

  function undo() {
    return Promise.resolve({ ok: false, reason: 'no-undo' });
  }

  function receiptFromLog() {
    return null;
  }

  return {
    CONNECTOR: CONNECTOR,
    READ_SCOPE: READ_SCOPE,
    hasReadScope: hasReadScope,
    offer: offer,
    run: run,
    undo: undo,
    receiptFromLog: receiptFromLog
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowTeamsChat = FlowTeamsChat;
if (typeof module !== 'undefined') module.exports = { FlowTeamsChat };
else if (typeof globalThis !== 'undefined') globalThis.FlowTeamsChat = FlowTeamsChat;
