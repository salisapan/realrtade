// Answers flow:teams-web-read for the Teams web lane. Chat.Read only, GET only.
const FlowLaneTeams = (() => {
  function forbiddenSend(path) {
    return /\/(send|reply|replyAll|forward|sendMail)(\b|$)/i.test(String(path || ''));
  }

  async function graphCall(access, req) {
    const method = String((req && req.method) || 'GET').toUpperCase();
    const path = String((req && req.path) || '');
    const pathOnly = path.split('?')[0];
    if (path.indexOf('/me/') !== 0 || pathOnly.indexOf('..') >= 0) return { ok: false, status: 0, reason: 'bad-path' };
    if (method !== 'GET' || forbiddenSend(pathOnly)) return { ok: false, status: 0, reason: 'FORBIDDEN_SEND' };
    if (!access) return { ok: false, status: 0, reason: 'not-connected' };
    let res;
    try {
      res = await fetch('https://graph.microsoft.com/v1.0' + path, { method: 'GET', headers: { Authorization: 'Bearer ' + access } });
    } catch (e) {
      return { ok: false, status: 0, reason: 'network' };
    }
    let body = null;
    try {
      const text = await res.text();
      if (text) body = JSON.parse(text);
    } catch (e) { body = null; }
    return { ok: res.status >= 200 && res.status < 300, status: res.status, body: body };
  }

  async function depsFromStore() {
    let bag = {};
    try { bag = await chrome.storage.local.get('outlookAuth'); } catch (e) { bag = {}; }
    const token = bag && bag.outlookAuth && bag.outlookAuth.token;
    const access = token && token.accessToken ? String(token.accessToken) : '';
    const scopes = token ? (token.grantedScopes || token.scopes || token.scope || null) : null;
    const selfId = token && token.userId ? String(token.userId) : (token && token.id ? String(token.id) : '');
    return {
      grantedScopes: scopes,
      selfId: selfId,
      call: (req) => graphCall(access, req || {})
    };
  }

  function ownSender(sender) {
    if (!sender) return false;
    try { return Boolean(sender.id && chrome.runtime && sender.id === chrome.runtime.id); }
    catch (e) { return false; }
  }

  function install() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage || !chrome.runtime.onMessage.addListener) return;
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== 'flow:teams-web-read') return;
      if (!ownSender(sender)) {
        sendResponse({ ok: false, reason: 'foreign-sender' });
        return true;
      }
      const chatId = msg.payload && msg.payload.chatId;
      depsFromStore().then((deps) => {
        const T = globalThis.FlowTeamsWebRead;
        if (!T || typeof T.readRecent !== 'function') return { ok: false, reason: 'missing' };
        return T.readRecent(chatId, deps);
      }).then(sendResponse).catch(() => sendResponse({ ok: false, reason: 'failed' }));
      return true;
    });
  }

  install();
  return { depsFromStore };
})();

if (typeof module !== 'undefined') module.exports = { FlowLaneTeams };
else if (typeof globalThis !== 'undefined') globalThis.FlowLaneTeams = FlowLaneTeams;
