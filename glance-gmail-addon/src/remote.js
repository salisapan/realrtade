// STUB boundary for the existing classifier.
// The repo already has flow-landing/netlify/functions/glance-assist
// action "classify". This host does not call it unless a script property
// names an https URL. The message stays in the Google account otherwise.
// No Authorization header: the Google OAuth token must not leave Google.

var GlanceRemote = (function () {
  function urls() {
    if (typeof GlanceUrls !== 'undefined') return GlanceUrls;
    return require('./urls.js');
  }

  function buildCall(url, text, lang) {
    if (!urls().allowed(url)) return null;
    return {
      url: url,
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      followRedirects: false,
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        action: 'classify',
        maskedText: String(text || '').slice(0, 4000),
        lang: lang === 'he' ? 'he' : 'en'
      })
    };
  }

  function fetchClassification(env) {
    env = env || {};
    var url = env.url ? String(env.url).trim() : '';
    if (!url) return { called: false, result: null };
    var call = buildCall(url, env.text, env.lang);
    if (!call) return { called: false, result: null, reason: 'url' };
    if (typeof env.fetch !== 'function') return { called: false, result: null, reason: 'nofetch' };
    if (call.headers.Authorization || /bearer/i.test(JSON.stringify(call.headers))) {
      return { called: false, result: null, reason: 'token' };
    }
    var res;
    try { res = env.fetch(call.url, call); } catch (err) { return { called: true, result: null, reason: 'error' }; }
    var status = res && (typeof res.status === 'number' ? res.status : null);
    if (status !== 200 || !res.body) return { called: true, result: null, reason: 'status' };
    try { return { called: true, result: JSON.parse(res.body) }; } catch (err) { return { called: true, result: null, reason: 'json' }; }
  }

  return { buildCall: buildCall, fetchClassification: fetchClassification };
})();

if (typeof module !== 'undefined') module.exports = GlanceRemote;
