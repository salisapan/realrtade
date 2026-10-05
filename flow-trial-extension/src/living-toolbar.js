// The toolbar face of the living icon (core/living-icon.js). Classic script: sets globalThis.FlowLivingToolbar.
//
// The toolbar icon is drawn live from the same field as the demo, at 16 and 32 px, about 12 times a second, and only while something is
// moving: while Glance is doing something (working: the body changes shape) and while a real close plays out (done: back to the ring, the
// tick draws in, it rests a moment, the tick goes). Then it stops drawing and puts the static icon back, so the service worker can sleep.
// At rest the toolbar is still; MV3 cannot keep a worker awake to breathe forever, and an icon that never stops costs battery.
//
// Done means a real close only: a write that happened (the Do It receipt) or the person marking a loop done. A prepared draft or a loop
// started is not completion, so it returns to the ring without a tick.
const FlowLivingToolbar = (() => {
  const FPS = 12;
  const DONE_REST_MS = 2600;        // the ring with its tick stays this long before the tick goes
  const MAX_WORK_MS = 45000;        // a call that never answers does not keep the icon morphing

  function create(chromeApi, engine, opts) {
    const o = opts || {};
    const now = o.now || (() => Date.now());
    const anim = engine.createAnimator();
    let active = 0, okSince = false, timer = null, restAt = null, workStarted = 0, lastSet = 0;

    const canDraw = () => typeof ImageData !== 'undefined' && chromeApi && chromeApi.action && typeof chromeApi.action.setIcon === 'function';
    function draw(params) {
      const imageData = {};
      [16, 32].forEach((n) => { imageData[n] = new ImageData(engine.render(params, n), n, n); });
      try { const p = chromeApi.action.setIcon({ imageData }); if (p && p.catch) p.catch(() => {}); } catch (e) { /* a closed window */ }
      lastSet = now();
    }
    function restoreStatic() {
      try {
        const p = chromeApi.action.setIcon({ path: { 16: '/icons/icon16.png', 48: '/icons/icon48.png', 128: '/icons/icon128.png' } });
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* ignore */ }
    }
    function tick() {
      timer = null;
      const t = now();
      if (anim.state === 'working' && t - workStarted > MAX_WORK_MS) { active = 0; anim.setState('idle', t); }
      if (anim.state === 'done' && anim.settled()) {
        if (restAt === null) restAt = t;
        else if (t - restAt >= DONE_REST_MS) { restAt = null; anim.setState('idle', t); }
      }
      const params = anim.frame(t);
      if (canDraw()) draw(params);
      if (anim.state === 'idle' && anim.settled()) { restoreStatic(); return; }
      timer = setTimeout(tick, Math.round(1000 / FPS));
    }
    function wake() { if (!timer) timer = setTimeout(tick, 0); }

    // begin() when Glance starts doing something; the returned end(closed) when it finished. closed=true only for a real close.
    function begin() {
      active++;
      if (anim.state !== 'working') { okSince = false; workStarted = now(); anim.setState('working', workStarted); }
      wake();
      let ended = false;
      return function end(closed) {
        if (ended) return; ended = true;
        active = Math.max(0, active - 1);
        if (closed) okSince = true;
        if (active === 0) { restAt = null; anim.setState(okSince ? 'done' : 'idle', now()); wake(); }
      };
    }
    return { begin, get state() { return anim.state; }, get drawing() { return timer !== null; }, get lastSet() { return lastSet; }, _tick: tick };
  }

  // Which messages are "Glance doing something", and which outcome is a real close. Everything else leaves the icon alone.
  const WATCH = Object.freeze({
    'flow:execute-action': (r) => !!(r && r.ok),     // the one write (the Do It receipt)
    'flow:follow-complete': (r) => !!(r && r.ok),    // the person marked the loop done
    'flow:follow-task': () => false,                 // a loop carried, not closed
    'flow:follow-draft': () => false                 // a draft prepared is not completion
  });

  return { create, WATCH, FPS, DONE_REST_MS, MAX_WORK_MS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { FlowLivingToolbar };
else if (typeof globalThis !== 'undefined') globalThis.FlowLivingToolbar = FlowLivingToolbar;
