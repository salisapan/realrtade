// Accept only https URLs an owner typed into a script property.
// Never the address from a mail, and never a link-local or metadata host.

var GlanceUrls = (function () {
  function allowed(url) {
    if (typeof url !== 'string') return false;
    var value = url.trim();
    if (!value || value.length > 500) return false;
    if (!/^https:\/\//i.test(value)) return false;
    if (/^https:\/\/[^/\s]*@/i.test(value)) return false;
    var host = value.replace(/^https:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return false;
    if (host === 'metadata.google.internal' || host.slice(-9) === '.internal') return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(host)) return false;
    return true;
  }

  return { allowed: allowed };
})();

if (typeof module !== 'undefined') module.exports = GlanceUrls;
