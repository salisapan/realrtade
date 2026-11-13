// Draft read-back for the Gmail compose trigger. Never sends mail.

var GlanceDraftCompose = (function () {
  function norm(value) {
    return String(value == null ? '' : value).replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  }

  function matches(readBack, expected) {
    return norm(readBack) === norm(expected);
  }

  return { norm: norm, matches: matches };
})();

if (typeof module !== 'undefined') module.exports = GlanceDraftCompose;
