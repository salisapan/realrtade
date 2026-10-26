// A page whose Date starts at a fixed instant, whatever day the suite runs on. It is a
// shim on this one page (addInitScript), not Playwright's context clock: the Chromium
// context is shared by every spec in the worker, and the context clock cannot be
// uninstalled, so it would leak into the next spec. The shim covers scripts that run in
// the page's own world (the dev fixture page loads the lane scripts there). Extension
// content scripts keep the real Date, so a spec that needs those relative to "today"
// computes its dates from today instead (see sameDayIso).
function frozenDateSource(iso) {
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) throw new Error('frozen date needs an ISO instant, got ' + iso);
  return '(' + function (startMs) {
    const RealDate = Date;
    const t0 = performance.now();
    const now = () => startMs + (performance.now() - t0);
    function FrozenDate(...args) {
      if (!new.target) return new RealDate(now()).toString();
      return args.length ? new RealDate(...args) : new RealDate(now());
    }
    FrozenDate.prototype = RealDate.prototype;
    FrozenDate.now = () => Math.floor(now());
    FrozenDate.parse = RealDate.parse;
    FrozenDate.UTC = RealDate.UTC;
    Object.setPrototypeOf(FrozenDate, RealDate);
    window.Date = FrozenDate;
  } + ')(' + start + ');';
}

async function freezeDate(page, iso) {
  await page.addInitScript({ content: frozenDateSource(iso) });
  return page;
}

// Today's calendar date as YYYY-MM-DD in the machine's zone, computed once from the real clock.
function sameDayIso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays || 0));
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

module.exports = { freezeDate, frozenDateSource, sameDayIso };
