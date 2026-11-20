// Match patterns for the Teams web lane. Optional hosts stay the two site grants.
// `https://teams.live.com/*` covers the root and /v2/ (and every other path). Chrome
// rejects matchOriginAsFallback unless the path component is exactly `*`, so the
// registration cannot also list `/v2/*` or a bare `/`.
const FlowTeamsLaneSpec = (() => {
  const HOSTS = ['https://teams.microsoft.com/*', 'https://teams.live.com/*'];
  const MATCHES = HOSTS.slice();
  const BOOT = 'src/teams-lane-boot.js';

  function star(patternPath, pathname) {
    const path = pathname || '/';
    if (patternPath === '/*') return true;
    const prefix = patternPath.slice(0, -1);
    const stem = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return path === stem || path === prefix || path.indexOf(prefix) === 0;
  }

  function one(pattern, href) {
    let url;
    try { url = new URL(String(href || '')); } catch (e) { return false; }
    const parsed = /^(https):\/\/([^/]+)(\/.*)$/.exec(pattern);
    if (!parsed) return false;
    if (url.protocol !== parsed[1] + ':') return false;
    if (url.hostname !== parsed[2]) return false;
    const want = parsed[3];
    const path = url.pathname || '/';
    if (want.slice(-2) === '/*') return star(want, path);
    return path === want;
  }

  function covers(href) {
    return MATCHES.some((pattern) => one(pattern, href));
  }

  return { HOSTS: HOSTS, MATCHES: MATCHES, BOOT: BOOT, covers: covers };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowTeamsLaneSpec = FlowTeamsLaneSpec;
if (typeof module !== 'undefined') module.exports = { FlowTeamsLaneSpec };
