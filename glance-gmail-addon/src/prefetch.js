// Homepage prefetch. STUB: with no URL the call is not made.
// v2 may fill this from a push cache. v1 does not watch the mailbox,
// because that needs a restricted Gmail scope.
// The response is { next: { title, due } | null }. Extra fields are dropped.
// The user's Google token is never attached to this request.

var GlancePrefetch = (function () {
  function urls() {
    if (typeof GlanceUrls !== 'undefined') return GlanceUrls;
    return require('./urls.js');
  }

  function intent() {
    if (typeof GlanceIntent !== 'undefined') return GlanceIntent;
    return require('./intent.js');
  }

  function parse(body) {
    var parsed = body;
    if (typeof body === 'string') {
      if (!body) return null;
      try { parsed = JSON.parse(body); } catch (err) { return null; }
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.next || typeof parsed.next !== 'object') return null;
    var title = intent().sanitizeTitle(parsed.next.title);
    if (!title) return null;
    var due = typeof parsed.next.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.next.due) ? parsed.next.due : null;
    return { title: title, due: due, source: 'prefetch' };
  }

  function fetchNext(env) {
    env = env || {};
    var url = env.url ? String(env.url).trim() : '';
    if (!url) return { called: false, next: null };
    if (!urls().allowed(url)) return { called: false, next: null, reason: 'url' };
    if (typeof env.fetch !== 'function') return { called: false, next: null, reason: 'nofetch' };
    var res;
    try {
      res = env.fetch(url, {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: false,
        headers: {}
      });
    } catch (err) {
      return { called: true, next: null, reason: 'error' };
    }
    var status = res && (typeof res.status === 'number' ? res.status : null);
    if (status !== 200) return { called: true, next: null, reason: 'status' };
    return { called: true, next: parse(res.body) };
  }

  return { parse: parse, fetchNext: fetchNext };
})();

if (typeof module !== 'undefined') module.exports = GlancePrefetch;
