// Runs on mail.google.com. Watches the message open in the reading pane and,
// when the on-device judgment engine finds a real reason, injects a single
// Do It chip — never a popup, never a second confirmation step, never a
// paragraph to read.
//
// Honesty about fragility: Gmail's DOM has no public contract and changes
// without notice. The selectors below read the current structure (role="main"
// reading pane, div[role="listitem"] messages, div.a3s for the message body,
// the `email` attribute on the sender span, h2.hP for the subject). Judgment
// reads the body (.a3s), not the whole listitem — the listitem also carries
// the received-time row, invite chips, and suggested reply chips. If Gmail changes,
// this degrades to "the chip stops appearing" — never to a crash and never to
// a wrong write, because judgment only ever reads text and the write path
// only ever adds a record.

// Chip and header lines follow the Gmail UI language. A stored setting
// wins, then the host page language, then the browser UI, then
// navigator.language. An English Gmail UI stays English. A Hebrew Gmail
// UI (he, he-*, iw, iw-*) is Hebrew. FlowDisplay.uiLangFrom is that
// picker. This fallback is the same order when the shared file has not loaded.
function glancePickLang(sources) {
  const s = sources || {};
  if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.uiLangFrom === 'function') {
    return FlowDisplay.uiLangFrom(s);
  }
  const raw = String(s.setting || s.hostLanguage || s.uiLanguage || s.navigatorLanguage || '').trim().toLowerCase();
  if (raw === 'he' || raw.indexOf('he-') === 0 || raw === 'iw' || raw.indexOf('iw-') === 0) return 'he';
  return 'en';
}

function glanceUiLanguage() {
  let host = '';
  let ui = '';
  let nav = '';
  try { host = (document.documentElement && document.documentElement.lang) || ''; } catch (e) {}
  try {
    const i18n = typeof chrome !== 'undefined' && chrome.i18n;
    if (i18n && typeof i18n.getUILanguage === 'function') ui = i18n.getUILanguage() || '';
  } catch (e) {}
  try { nav = (typeof navigator !== 'undefined' && navigator.language) || ''; } catch (e) {}
  return glancePickLang({ hostLanguage: host, uiLanguage: ui, navigatorLanguage: nav });
}

function glanceUiHebrew() {
  const code = glanceUiLanguage().trim().toLowerCase().replace(/_/g, '-');
  return code === 'he' || code.indexOf('he-') === 0;
}

function glanceUiCopy(kind) {
  try {
    if (typeof FlowDisplay !== 'undefined' && FlowDisplay && typeof FlowDisplay.chrome === 'function') {
      const table = FlowDisplay.chrome(glanceUiHebrew() ? 'he' : 'en') || {};
      if (table[kind]) return table[kind];
    }
  } catch (e) { /* the lines below are the same table when the shared one is absent */ }
  const he = glanceUiHebrew();
  if (kind === 'reconnect') return he ? 'חבר מחדש את Google' : 'Reconnect Google';
  if (kind === 'connect') return he ? 'התחבר ל-Google בחלון Glance קודם.' : 'Connect Google in the Glance popup first.';
  if (kind === 'edited') return he ? 'שינית את זה. Undo השאיר אותו כמו שהוא.' : 'You edited this. Undo left it alone.';
  if (kind === 'still') return he ? 'עדיין שם — משימת Google לא הוסרה.' : 'Still there — the Google Task was not removed.';
  if (kind === 'calendar') return he ? 'אין מועד אחד לאירוע הזה.' : 'No single time for this event.';
  if (kind === 'calendarFailed') return he ? 'היומן נכשל.' : 'Calendar failed.';
  if (kind === 'stepFailed') return he ? 'השלב נכשל.' : 'This step failed.';
  if (kind === 'taskRemoved') return he ? 'משימת Google הוסרה.' : 'Google Task removed.';
  if (kind === 'calendarRemoved') return he ? 'אירוע היומן הוסר.' : 'Calendar event removed.';
  if (kind === 'handled') return he ? 'טופל.' : 'Handled.';
  if (kind === 'notVerified') return he ? 'לא אומת' : 'Not verified';
  if (kind === 'undo') return he ? 'בטל' : 'Undo';
  if (kind === 'undoAll') return he ? 'בטל הכל' : 'Undo all';
  if (kind === 'undoing') return he ? 'מבטל…' : 'Undoing…';
  if (kind === 'tryAgain') return he ? 'נסה שוב' : 'Try again';
  if (kind === 'panelHead') return he ? 'מה עדיין פתוח' : 'Still open';
  return '';
}

(function flowGmailWatcher() {
  // A second injection in this same world must not start another watcher.
  // After an update the old world is gone, so this guard is false and the
  // new files run. The service worker removes leftover chips first.
  if (typeof globalThis !== 'undefined' && globalThis.__glanceGmailGuard === true) return;
  if (typeof globalThis !== 'undefined') globalThis.__glanceGmailGuard = true;
  // A content-script throw does not reach the page console on its own.
  // Logging it is what the Gmail path test fails on.
  try {
    self.addEventListener('error', (ev) => {
      console.error('[Glance] content error', ev && (ev.message || ev.error) || ev);
    });
    self.addEventListener('unhandledrejection', (ev) => {
      const reason = ev && ev.reason;
      console.error('[Glance] unhandled rejection', reason && reason.message ? reason.message : reason);
    });
  } catch (e) { /* the page test still watches pageerror */ }
  // Every FlowStorage.appendLog() call this file makes is tagged with this
  // one constant — see core/README.md's "Adding a new inbox host" section.
  // A future content-outlook.js defines its own SOURCE_APP ('outlook') and
  // tags every one of ITS appendLog calls the same way; nothing else in
  // this file, or in storage.js/execution-memory.js, needs to change for
  // that to work. Historically only 'shown' entries carried this field —
  // extended to every kind so the Activity log, and any future
  // per-host precision comparison, can attribute every logged outcome to
  // the surface that produced it, not just the ones that happened to
  // remember to.
  const SOURCE_APP = 'gmail';
  let state = null;

  function glanceUiLang() {
    let ui = '';
    try { if (chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') ui = chrome.i18n.getUILanguage() || ''; } catch (e) {}
    let nav = '';
    try { nav = (navigator && navigator.language) || ''; } catch (e) {}
    let host = '';
    try { host = (document.documentElement && document.documentElement.lang) || ''; } catch (e) {}
    rememberHostLanguage(host);
    return glancePickLang({ setting: state && state.glanceUiLanguage, hostLanguage: host, uiLanguage: ui, navigatorLanguage: nav });
  }

  function rememberHostLanguage(host) {
    const raw = String(host || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (rememberHostLanguage.last === key) return;
    rememberHostLanguage.last = key;
    if (typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function' || typeof FlowStorage.set !== 'function') return;
    FlowStorage.get().then(function (st) {
      if (st && st.glanceHostLanguage === raw) return null;
      return FlowStorage.set({ glanceHostLanguage: raw });
    }).catch(function () {});
  }

  function glanceChrome() {
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.chrome === 'function') return FlowDisplay.chrome(glanceUiLang());
    return { dismiss: 'Dismiss', doIt: 'Do It', view: 'View', undo: 'Undo', undoing: 'Undoing…', holdingReply: 'Draft a holding reply', draftReadyNotSent: 'Draft ready. Not sent.' };
  }

  function glanceShow(text) {
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.showChrome === 'function') return FlowDisplay.showChrome(glanceUiLang(), text);
    return text == null ? '' : String(text);
  }
  let watching = false;
  let observer = null;
  let laneDead = false;
  let worldStamp = '';
  const laneTimers = new Set();
  const laneIntervals = new Set();
  try {
    const extId = String(chrome.runtime && chrome.runtime.id || 'ext');
    worldStamp = extId + ':' + Math.random().toString(36).slice(2);
  } catch (e) {
    worldStamp = 'dead:' + Math.random().toString(36).slice(2);
  }

  function removeOwnCards() {
    try {
      const nodes = document.querySelectorAll('.flow-chip-host, .flow-chip');
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node || !node.remove) continue;
        const host = node.classList && node.classList.contains('flow-chip-host') ? node : node.closest && node.closest('.flow-chip-host');
        const stamp = host && host.getAttribute ? host.getAttribute('data-glance-world') : '';
        if (stamp && worldStamp && stamp !== worldStamp) continue;
        if (host && host.remove) host.remove();
        else node.remove();
      }
    } catch (e) { /* the page is already gone */ }
  }

  function clearLaneTimers() {
    laneTimers.forEach((id) => { try { clearTimeout(id); } catch (e) { /* already cleared */ } });
    laneIntervals.forEach((id) => { try { clearInterval(id); } catch (e) { /* already cleared */ } });
    laneTimers.clear();
    laneIntervals.clear();
  }

  function tearDownOrphan() {
    if (laneDead) return;
    laneDead = true;
    watching = false;
    if (observer) {
      try { observer.disconnect(); } catch (e) { /* already disconnected */ }
      observer = null;
    }
    clearLaneTimers();
    removeOwnCards();
    try { if (typeof FlowChipPeek !== 'undefined') FlowChipPeek.stop(document, window); } catch (e) { /* nothing to stop */ }
  }

  // One read of chrome.runtime.id. When the extension context is gone that
  // read throws, and it is the only chrome touch this copy may make.
  function chromeLive() {
    if (laneDead) return false;
    try {
      const id = chrome.runtime.id;
      if (!id) throw new Error('Extension context invalidated');
      return true;
    } catch (e) {
      tearDownOrphan();
      return false;
    }
  }

  function catchChrome(out) {
    if (!out || typeof out.then !== 'function') return out;
    return out.then((value) => value, () => {
      tearDownOrphan();
      return null;
    });
  }

  function guardChromeMethod(obj, name, sync) {
    if (!obj || typeof obj[name] !== 'function' || obj[name].__glanceGuarded) return;
    const orig = obj[name];
    function guarded() {
      if (!chromeLive()) return sync ? '' : Promise.resolve(null);
      try {
        const out = orig.apply(obj, arguments);
        return sync ? out : catchChrome(out);
      } catch (e) {
        tearDownOrphan();
        return sync ? '' : Promise.resolve(null);
      }
    }
    guarded.__glanceGuarded = true;
    obj[name] = guarded;
  }

  function guardChromeSurface() {
    try {
      if (chrome.storage && chrome.storage.local) {
        ['get', 'set', 'remove', 'clear'].forEach((name) => guardChromeMethod(chrome.storage.local, name));
      }
      if (chrome.runtime) {
        ['sendMessage', 'connect', 'getURL'].forEach((name) => guardChromeMethod(chrome.runtime, name));
        if (chrome.runtime.onMessage) guardChromeMethod(chrome.runtime.onMessage, 'addListener');
      }
      if (chrome.storage && chrome.storage.onChanged) guardChromeMethod(chrome.storage.onChanged, 'addListener');
      if (chrome.i18n) {
        guardChromeMethod(chrome.i18n, 'getUILanguage', true);
        guardChromeMethod(chrome.i18n, 'getMessage', true);
      }
    } catch (e) { tearDownOrphan(); }
  }
  guardChromeSurface();

  const nativeSetTimeout = typeof setTimeout === 'function' ? setTimeout : function (fn) { return 0; };
  const nativeSetInterval = typeof setInterval === 'function' ? setInterval : function () { return 0; };
  setTimeout = function (fn, ms) {
    const id = nativeSetTimeout(function () {
      laneTimers.delete(id);
      if (laneDead) return;
      try { fn(); }
      catch (e) { tearDownOrphan(); }
    }, ms);
    laneTimers.add(id);
    return id;
  };
  setInterval = function (fn, ms) {
    const id = nativeSetInterval(function () {
      if (laneDead) {
        try { clearInterval(id); } catch (e) { /* already cleared */ }
        return;
      }
      try { fn(); }
      catch (e) { tearDownOrphan(); }
    }, ms);
    laneIntervals.add(id);
    return id;
  };

  function dropStaleCards() {
    try {
      const nodes = document.querySelectorAll('.flow-chip-host');
      for (let i = 0; i < nodes.length; i++) {
        const stamp = nodes[i].getAttribute && nodes[i].getAttribute('data-glance-world');
        if (stamp && stamp === worldStamp) continue;
        nodes[i].remove();
      }
    } catch (e) { /* nothing to drop */ }
  }

  function stampHost(node) {
    if (node && node.setAttribute && worldStamp) node.setAttribute('data-glance-world', worldStamp);
  }
  // Guards ensureGoogleAutoConnect() below against firing twice for two
  // messages classified in the same debounced scanReadingPane pass, before
  // either call's FlowStorage.set({ onboarded: true }) has landed.
  let autoConnectInFlight = false;

  // The reading pane's currently open thread, refreshed on every
  // scanReadingPane() pass — this is what Feature 2 (Draft-It) and Feature 4
  // (Next-Step) act on, independent of whether the on-device judgment engine
  // found anything worth a chip for. A user asking Glance to draft a reply
  // isn't asking "was this a decision" — they're asking about whatever
  // message is in front of them right now.
  let currentContext = null; // { message, messages, sender, subject, legacyId }

  async function init() {
    if (!chromeLive()) return;
    state = await FlowStorage.get();
    publishNamesDiag();
    // Watching starts regardless of onboarded state now — scanReadingPane()
    // still runs the real judgment pipeline on every message either way, and
    // it's the one that decides (in ensureGoogleAutoConnect(), right before
    // it would otherwise show a chip) whether this is the moment to ask for
    // Google access at all. A not-yet-onboarded account isn't "off," it's
    // just quiet until there's something real to connect for.
    if (!watching) { watching = true; observe(); }
    if (!state.onboarded) return;
    // The sidebar surface (privacy badge, Draft-It, attachment X-ray) is the
    // Glance Pro feature set: it calls the masked-AI backend, which costs
    // money per use and is licence-gated on the server. Free accounts never
    // see it. See applyProState().
    await applyProState();
    if (typeof FlowBrief !== 'undefined') {
      await checkBrief();
      await consumeStillOpenHandoff();
    }
    checkWeeklySummary();
    trackDailyActive();
    trackWeeklyHabit();
    checkPrecisionSelfTune();
  }

  // Silent precision self-tuning — no chip, no popup card, nothing rendered.
  // This is the "should improve itself without requiring manual tuning"
  // half of the precision/harm work: a process type this account has
  // whole-dismissed repeatedly and never once closed gets its intent
  // type(s) nudged toward a quieter bar automatically, the same way an
  // organic run of dismissals would — just applied all at once instead of
  // waiting for enough individual dismissals to accumulate. Runs once per
  // Gmail tab load (same cadence as checkWeeklySummary above), which is
  // plenty for a background correction that only ever needs to fire once
  // per process id, ever (see storage.js's precisionAutoTuned).
  const SELF_TUNE_WHOLE_DISMISS_MIN = 3;
  async function checkPrecisionSelfTune() {
    if (typeof FlowExecutionMemory === 'undefined') return;
    const mem = await FlowExecutionMemory.getAll();
    // Scoped to 'log-it' only: it's the one catalog entry whose intent
    // type(s) (DECISION_TO_LOG / FOLLOW_UP) actually consult a calibrated
    // threshold at all — see intent.js's gate. schedule/reply-track/
    // follow-through's own types (event/request/commitment) are hard
    // evidentiary gates with no threshold for this to adjust; whole-
    // dismissing one of those is a real signal too, but not one this
    // mechanism can act on without changing what those gates mean, which is
    // outside what a silent background nudge should ever do.
    const logIt = mem['log-it'];
    if (!logIt || logIt.closedCount > 0) return; // closed at least once -> not a rejected type
    if (logIt.wholeDismissCount < SELF_TUNE_WHOLE_DISMISS_MIN) return;
    if (await FlowStorage.wasPrecisionAutoTuned('log-it')) return;
    // 'log-it' backs both DECISION_TO_LOG and FOLLOW_UP (see actions.js's
    // processFor) — the event log has no record of which of the two each
    // whole dismissal actually was, so the conservative move is to ease off
    // both rather than guess and risk quieting only the wrong one.
    //
    // Deliberately sequenced, not one flat Promise.all with
    // markPrecisionAutoTuned alongside the two calibrate() calls: if either
    // calibrate() call failed but markPrecisionAutoTuned still ran (as it
    // could in a flat Promise.all — resolution order isn't guaranteed by
    // array position), this account would be permanently marked "already
    // tuned" without ever actually having been quieted, with no future
    // init() able to retry it. Marking it done only after both calibrate()
    // calls genuinely succeed means an interrupted attempt here just tries
    // again next page load — the safe direction for this specific failure,
    // unlike onDismiss/showMultiActionReceipt's independent-catch sites
    // just above, where retrying isn't the right recovery.
    await Promise.all([
      FlowStorage.calibrate('dismiss', 'decision'),
      FlowStorage.calibrate('dismiss', 'followup')
    ]);
    await FlowStorage.markPrecisionAutoTuned('log-it');
  }

  // Runs once per init() — a fresh page load, or the rare onboarding/
  // connector-change re-init below — never on every debounced Gmail
  // mutation, since storage.js's consumeWeeklySummaryTrigger already owns
  // the entire "is this actually due" question (once a week, or on return
  // from inactivity, never more than once a day, never with nothing to
  // say). This function's only job is rendering whatever that call decides.
  async function checkWeeklySummary() {
    if (!watching || typeof FlowWeekly === 'undefined') return;
    const summary = await FlowStorage.consumeWeeklySummaryTrigger();
    if (!summary) return; // not due, or due with nothing to report — stay silent either way
    if (typeof FlowWeekly.setUiLang === 'function') FlowWeekly.setUiLang(glanceUiLang());
    FlowWeekly.showSummary(summary, {
      onOpenList: async () => {
        // Re-read at click time. This opens the same Still Open list the
        // morning brief uses, not every unresolved chip.
        const open = await dropHandledMails(await FlowStorage.getStillOpen());
        if (open.length) openBriefPanel(open);
      }
    });
  }

  // The one DAU-shaped signal this product has: "Glance was active in a
  // Gmail tab today," fired at most once per install per day (see
  // FlowStorage.consumeDailyActiveTrigger). No content, no per-message
  // detail — the same allow-listed, install-id-only pipe every other
  // 'flow:track' event already uses (see background.js's trackEvent and
  // track-event.js's ALLOWED_EVENTS on the receiving end).
  async function trackDailyActive() {
    if (await FlowStorage.consumeDailyActiveTrigger()) {
      chrome.runtime.sendMessage({ type: 'flow:track', event: 'extension_active', params: { domain: state.domainId } });
    }
  }

  // The population-level half of weekly habit formation: "how many
  // installs form one" is a question no single account's own local
  // storage can answer, so — same posture as trackDailyActive() right
  // above — this fires one anonymous, install-id-only event through the
  // exact same allow-listed pipe, at most once per calendar week, only the
  // first time this account's own local computation
  // (core/pmf-metrics.js's computeWeeklyHabit, via
  // consumeWeeklyHabitTrigger) says the week actually crossed the bar. No
  // content, no per-day detail — just the fact that it happened, the same
  // shape extension_active already uses for "is anyone still using this."
  async function trackWeeklyHabit() {
    if (await FlowStorage.consumeWeeklyHabitTrigger()) {
      chrome.runtime.sendMessage({ type: 'flow:track', event: 'weekly_habit_formed', params: { domain: state.domainId } });
    }
  }

  // Called from scanReadingPane() at the one moment this account is ever
  // asked for Google access: right after judgment has already found a real
  // Do It moment on screen, never on install and never from a settings
  // page. Reuses the exact same chrome.identity grant popup.js's manual
  // "Connect Google Tasks" + "Save & start" flow already triggers — this
  // just removes the trip through Setup to get there. That manual path
  // stays available as a fallback regardless of anything below (including
  // autoConnectAttempted, which only ever gates this automatic one).
  async function ensureGoogleAutoConnect() {
    if (autoConnectInFlight || state.autoConnectAttempted) return false;
    autoConnectInFlight = true;
    try {
      const status = await new Promise((resolve) => chrome.runtime.sendMessage({ type: 'flow:connector-status' }, resolve));
      // Not yet configured (manifest.json's oauth2.client_id is still the
      // placeholder) — background.js's connectGoogleTasks() would reject
      // instantly with no account chooser shown at all. Stay quiet and
      // retryable rather than remembering this as a decline: the very next
      // actionable email after the owner configures a real Client ID should
      // just work, with no reinstall or manual reset needed.
      if (!status || !status.googleTasks || !status.googleTasks.configured) return false;

      const res = await new Promise((resolve) => chrome.runtime.sendMessage({ type: 'flow:connect', connectorId: 'googleTasks' }, resolve));
      if (res && res.ok) {
        await FlowStorage.set({ onboarded: true, connectorId: 'googleTasks' });
        state = await FlowStorage.get();
        chrome.runtime.sendMessage({ type: 'flow:track', event: 'connector_configured', params: { connector: 'googleTasks', via: 'auto' } });
        return true;
      }
      // Google IS configured but the account chooser was closed, denied, or
      // failed for a real reason — remember that so the next actionable
      // email doesn't reopen it too.
      await FlowStorage.set({ autoConnectAttempted: true });
      return false;
    } finally {
      autoConnectInFlight = false;
    }
  }

  // The remote fallback classifier — see glance-assist.js's 'classify'
  // action for the actual model call and content-gmail.js's own comment at
  // this function's one call site for why it exists at all. Masks text
  // with FlowPrivacyShield exactly the way Draft-It and the attachment
  // summarizer already do (same tokens, same contract — this reuses it,
  // doesn't invent a second one), unmasks the entities that come back, and
  // returns a full FlowIntent.classify()-shaped object so actions.js and
  // everything downstream of it need no changes at all: as far as
  // planFor() is concerned, this is indistinguishable from a local hit.
  // Returns null on any failure — not configured, network error, model
  // found nothing either — and the caller treats that exactly like the
  // local classifier's own { type: null }: stay silent, no crash, no chip.
  // Off by design. Sending even masked email text to a model on every message
  // Glance cannot read locally would contradict the one promise this product
  // makes on its own page: the decision happens on your device. Draft-It and
  // attachment summaries are different — you ask for them, and you know the
  // masked text goes out. If this ever returns it must be opt-in, in the
  // popup, and the privacy copy must change in the same commit.
  // (The opt-in "second reading" of ONE masked sentence is a different, narrower
  // path: src/follow.js ladderAsk, docs/ai-ladder.md. It never reaches this chip.)
  const REMOTE_CLASSIFY = false;

  async function ensureRemoteClassification(rawText) {
    if (typeof FlowPrivacyShield === 'undefined') return null;
    const lang = (typeof FlowSidebar !== 'undefined' && FlowSidebar.isRTLText(rawText)) ? 'he' : 'en';
    const masked = FlowPrivacyShield.mask(rawText);
    let res;
    try {
      res = await new Promise((resolve) => chrome.runtime.sendMessage(
        { type: 'flow:classify-remote', payload: { lang, maskedText: masked.maskedText } },
        resolve
      ));
    } catch (e) {
      return null;
    }
    if (!res || !res.ok || !res.result || !res.result.type) return null;

    const r = res.result;
    const unmask = (v) => FlowPrivacyShield.unmask(v || '', masked.tokenMap);
    const what = unmask(r.what);
    const when = unmask(r.when);
    const amount = unmask(r.amount);
    const who = unmask(r.who);
    const requestWhat = unmask(r.requestWhat);

    return {
      type: r.type,
      confidence: 'remote',
      entities: { who, what, when, amount, requestWhat, dateIso: r.dateIso || null },
      label: what || requestWhat || who || 'Update',
      // Not a graded score the way the local scorer produces one — the
      // model either returned a type or it didn't — but appendLog's
      // 'shown' entry reads intent.signals.score unconditionally, so this
      // needs a real number, not a fabricated confidence percentage.
      signals: { score: 100, threshold: 50, remote: true },
      facts: {
        money: amount ? { raw: amount } : null,
        date: r.dateIso ? { raw: when, iso: r.dateIso } : null,
        wordCount: rawText.trim().split(/\s+/).filter(Boolean).length,
        automated: false
      }
    };
  }

  // Mounted once per tab, idempotent (FlowSidebar.mount() itself no-ops if
  // already attached). Feature 1's badge appears the moment the sidebar
  // mounts — it isn't gated behind the judgment engine finding anything,
  // since "the shield is active" is true for every message Glance ever
  // reads, not only the ones that clear the chip threshold.
  // ---- Glance Pro ---------------------------------------------------------
  // `proActive` mirrors the stored licence (written only by background.js).
  // It decides whether the Draft-It / attachment-summary surface exists at
  // all. The server re-checks the licence on every AI call, so a stale value
  // here can show a button that then answers "part of Glance Pro" — it can
  // never get anyone a free model call.
  let proActive = false;

  async function applyProState() {
    let active = false;
    try {
      const res = await new Promise((resolve) => chrome.runtime.sendMessage({ type: 'flow:pro-status' }, resolve));
      active = Boolean(res && res.ok && res.active);
    } catch (e) { active = false; }
    proActive = active;
    if (active) mountSidebar();
    else if (typeof FlowSidebar !== 'undefined') FlowSidebar.unmount();
  }

  // Shown where a Pro feature was reached without a live licence (an expired
  // key, or a lapse mid-session). Plain words, one path forward.
  const PRO_REQUIRED_MESSAGE = 'Draft-It and attachment summaries are part of Glance Pro. Open the Glance panel to start a free trial or enter a key.';

  function aiErrorMessage(response, fallback) {
    if (response && response.code === 'pro_required') return PRO_REQUIRED_MESSAGE;
    return (response && response.error) || fallback;
  }

  function mountSidebar() {
    if (typeof FlowSidebar === 'undefined') return; // degrade silently, same policy as the chip system below
    FlowSidebar.mount();
    FlowSidebar.renderDraft('idle', { onDraft: handleDraftIt });
  }

  // Local inbox scan. The rows Gmail has already rendered — subject and
  // snippet only, judged on this device, never sent anywhere. A row that
  // clears the Still Open bar is remembered as a compact snapshot so the
  // morning list can offer Do It without the thread being open. Rows that
  // miss the bar are not stored. Opening the thread drops the snapshot;
  // the full message is then judged the same way the chip always was.
  let lastInboxScan = 0;
  // One Drive lookup per open message. Silence has no chip, and Gmail
  // mutates the thread constantly — without this, a fact ask that did not
  // match would export the same Sheet on every mutation.
  const factLookupCache = new Map();

  function compactIntent(intent) {
    const entities = (intent && intent.entities) || {};
    return {
      type: intent.type,
      label: intent.label,
      confidence: intent.confidence || null,
      personalClose: intent.personalClose || null,
      facts: intent.facts || {},
      entities: {
        what: entities.what || null,
        requestWhat: entities.requestWhat || null,
        requestedObjectTerm: entities.requestedObjectTerm || null,
        amount: entities.amount || null
      },
      googleClose: intent.googleClose || null,
      signals: { score: intent.signals && intent.signals.score }
    };
  }

  function inboxThreadUrl(threadId) {
    if (!threadId) return null;
    return 'https://mail.google.com/mail/u/' + accountIndex() + '/#inbox/' + threadId;
  }

  // The chip's plan. The inbox scan and the reading pane both call this,
  // then only the surface differs. Outlook's judge calls the same planFor.
  function planOpenMail(text, ctx) {
    ctx = ctx || {};
    let intent = ctx.intent || null;
    if (!intent || !intent.type) {
      const prepared = (typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.prepareForJudge === 'function')
        ? FlowIncomingJudge.prepareForJudge(text)
        : text;
      intent = (typeof FlowIntent !== 'undefined') ? FlowIntent.classify(prepared, ctx) : null;
    }
    if (!intent || !intent.type) return { show: false, reason: 'intent-null', intent: intent || null };
    if (intent.plannedProcess && intent.plannedProcess.steps && intent.plannedProcess.steps.length) {
      return { show: true, intent: intent, process: intent.plannedProcess };
    }
    if (intent.systemNotice && intent.notice && typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.noticeProcess === 'function') {
      return { show: true, intent: intent, process: FlowIncomingJudge.noticeProcess(intent.notice, ctx.threadUrl) };
    }
    if (typeof FlowIntent !== 'undefined' && typeof FlowIntent.shouldShowChip === 'function' && !FlowIntent.shouldShowChip(intent)) {
      return { show: false, reason: 'chip-low-confidence', intent: intent };
    }
    const process = (typeof FlowActions !== 'undefined') ? FlowActions.planFor(intent, {
      threadUrl: ctx.threadUrl || null,
      hasThreadAttachment: Boolean(ctx.hasThreadAttachment),
      executionMemory: ctx.executionMemory || null,
      attachFile: ctx.attachFile || null,
      text: text
    }) : null;
    if (!process || !process.steps || !process.steps.length) return { show: false, reason: 'no-process', intent: intent };
    return { show: true, intent: intent, process: process };
  }

  function deadlineWasDropped(intent) {
    return Boolean(intent && intent.facts && intent.facts.date && intent.facts.date.dropped);
  }

  async function considerInboxRow(row, executionMemory, freshState) {
    const threadId = row.getAttribute('data-legacy-thread-id') || row.getAttribute('data-thread-id');
    if (!threadId) return false;
    const subject = ((row.querySelector('span.bog') || {}).textContent || '').trim();
    const snippet = ((row.querySelector('span.y2') || {}).textContent || '').replace(/^\s*-\s*/, '').trim();
    const rawText = [subject, snippet].filter(Boolean).join('\n');
    const text = (typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.prepareForJudge === 'function')
      ? FlowIncomingJudge.prepareForJudge(rawText)
      : rawText;
    if (text.length < 12) return false;
    const emailEl = row.querySelector('[email]');
    const nameEl = row.querySelector('.yP, .zF');
    const sender = {
      email: emailEl ? emailEl.getAttribute('email') : null,
      name: (emailEl && emailEl.getAttribute('name')) || (nameEl && nameEl.textContent.trim()) || null
    };
    const intent = FlowIntent.classify(text, {
      senderEmail: sender.email,
      senderName: sender.name,
      calibration: freshState.calibration,
      calibrationByType: freshState.calibrationByType,
      now: new Date()
    });
    if (!intent || !intent.type || typeof FlowStillOpen === 'undefined') return false;
    // A fact ask is not a morning card. The cell has not been checked.
    if (typeof FlowFactReply !== 'undefined' && FlowFactReply.blocksInbox(intent, text)) return false;
    // Same silence bar as the in-thread chip. A local 'low', or any
    // classification shouldShowChip refuses, is not a morning card.
    if (!FlowIntent.shouldShowChip(intent)) return false;
    const probe = {
      messageId: 'scan:' + threadId,
      threadId: threadId,
      subject: subject,
      intent: compactIntent(intent)
    };
    if (!FlowStillOpen.scoreOf(probe, Date.now())) return false;
    if (await personalCloseSaysSilence(intent, threadId, subject)) return false;
    const threadLink = inboxThreadUrl(threadId);
    const planned = planOpenMail(text, {
      intent: intent,
      threadUrl: threadLink,
      hasThreadAttachment: false,
      executionMemory: executionMemory
    });
    const process = planned && planned.process;
    if (!process) return false;
    await FlowStorage.upsertStillOpenScan({
      messageId: 'scan:' + threadId,
      threadId: threadId,
      threadUrl: threadLink,
      sender: sender,
      subject: subject,
      ts: Date.now(),
      app: SOURCE_APP,
      intent: compactIntent(intent),
      process: process
    });
    return true;
  }

  async function maybeScanInbox() {
    if (!watching || !state || !state.onboarded) return;
    if (typeof FlowIntent === 'undefined' || typeof FlowStillOpen === 'undefined') return;
    const rows = document.querySelectorAll('tr.zA');
    if (!rows.length) return;
    if (Date.now() - lastInboxScan < 60000) return;
    lastInboxScan = Date.now();
    const executionMemory = await FlowExecutionMemory.getAll();
    const freshState = await FlowStorage.get();
    let noticed = false;
    const limit = Math.min(rows.length, 25);
    for (let i = 0; i < limit; i++) {
      if (await considerInboxRow(rows[i], executionMemory, freshState)) noticed = true;
    }
    if (noticed) checkBrief();
  }

  function observe() {
    const run = debounce(() => {
      if (!chromeLive()) return;
      maybeScanInbox()
        .catch((e) => console.error('[Glance] inbox scan failed', e))
        .then(() => scanReadingPane())
        .catch((e) => { console.error('[Glance] reading pane scan failed', e && e.message ? e.message : e); tearDownOrphan(); });
    }, 400);
    const onMutate = () => {
      if (!chromeLive()) return;
      run();
    };
    observer = new MutationObserver(onMutate);
    observer.observe(document.body, { childList: true, subtree: true });
    onMutate();
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // Gmail puts the address on email, or only on data-hovercard-id when the
  // visible chip is the display name. A name with no @ is not an address.
  function addressFrom(el) {
    if (!el || !el.getAttribute) return '';
    const email = String(el.getAttribute('email') || '').trim();
    if (email.indexOf('@') >= 0) return email;
    const hover = String(el.getAttribute('data-hovercard-id') || '').trim();
    if (hover.indexOf('@') >= 0) return hover;
    return email;
  }

  function extractSender(messageNode) {
    if (!messageNode || !messageNode.querySelector) return { email: null, name: null };
    const el = messageNode.querySelector('[email], [data-hovercard-id]');
    if (!el) return { email: null, name: null };
    const email = addressFrom(el);
    return { email: email || null, name: el.getAttribute('name') || el.textContent.trim() };
  }

  // The Gmail account button, for example
  // "Google Account: Sali Sapan (x@y)". The name only. No scope, no token.
  // A label that is not that button is not a name.
  function accountNameFromLabel(label) {
    const raw = String(label || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[\u00a0\u202f\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    const prefixed = raw.match(/^(?:Google Account|חשבון Google)\s*:\s*(.+)$/i);
    if (!prefixed) return '';
    const body = prefixed[1].trim();
    const email = body.match(/^(.*)\(([^)]*@[^)]+)\)\s*$/);
    const name = (email ? email[1] : body).trim();
    if (!name || /@/.test(name)) return '';
    if (name.toLowerCase() === 'me') return '';
    return name;
  }

  function gmailAccountName() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return '';
    const nodes = document.querySelectorAll('a[aria-label], button[aria-label], [role="button"][aria-label]');
    for (let i = 0; i < nodes.length; i++) {
      const name = accountNameFromLabel(nodes[i].getAttribute('aria-label'));
      if (name) return name;
    }
    return '';
  }

  // The side panel reads this line. The aria name stays out of glanceOwnNames.
  function publishNamesDiag() {
    if (typeof FlowDisplay === 'undefined' || typeof FlowDisplay.namesDiagFrom !== 'function') return;
    const st = state || {};
    const profile = [];
    const gp = st.googleProfile || {};
    if (gp.displayName) profile.push(gp.displayName);
    if (gp.givenName) profile.push(gp.givenName);
    if (gp.surname) profile.push(gp.surname);
    if (gp.givenName && gp.surname) profile.push(String(gp.givenName) + ' ' + String(gp.surname));
    (Array.isArray(st.glanceOwnNames) ? st.glanceOwnNames : []).forEach(function (n) { profile.push(n); });
    const diag = FlowDisplay.namesDiagFrom(profile, gmailAccountName());
    try {
      console.info(FlowDisplay.namesDiagLine(diag));
    } catch (e) { /* the record below is the same line */ }
    const key = diag.source + '\n' + diag.names.join('\n');
    if (publishNamesDiag.last === key) return;
    publishNamesDiag.last = key;
    try {
      chrome.storage.local.set({
        glanceNamesDiag: { names: diag.names.slice(), source: diag.source, at: Date.now() }
      });
    } catch (e) { /* the panel keeps the last line */ }
  }

  // To and Cc as the open message shows them. The header is read in
  // document order: a label (to, cc, bcc, אל, עותק) switches the list, a
  // chip or an address lands in the list that is current, and the "me" chip,
  // which carries no address, is the account's own. This covers the collapsed
  // line ("to Dana, cc: me"), the opened details table, and fixtures that
  // put each list in its own block. The sender's address is not a recipient,
  // and nothing inside the message body or its quoted history is a header.
  const AUDIENCE_LABEL = /(^|[\s,;])(to|cc|bcc|אל|עותק(?: מוסתר)?)\s*:|(^|[\s,;])(עותק)(?=\s)/ig;

  function audienceBucketFor(label) {
    const word = String(label || '').toLowerCase();
    if (word === 'to' || word === 'אל') return 'to';
    return word === 'cc' || word === 'עותק' ? 'cc' : 'bcc';
  }

  function normalizeAudienceLabel(text) {
    return String(text || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim().toLowerCase().replace(/:+$/, '');
  }

  // Gmail's details table is the source of truth when it is open: labelled
  // אל:/עותק:/to:/cc: rows only. The collapsed summary line and the sender
  // row are not recipients.
  function audienceFromDetailsTable(messageNode, ownEmail, senderEmail) {
    const lists = { to: [], cc: [], bcc: [] };
    let userName = '';
    if (!messageNode || !messageNode.querySelectorAll) return null;
    const own = String(ownEmail || '').trim().toLowerCase();
    const from = String(senderEmail || '').trim().toLowerCase();
    const add = (bucket, email) => {
      const clean = String(email || '').trim().toLowerCase();
      if (!clean || clean.indexOf('@') < 0 || !bucket || bucket.indexOf(clean) >= 0) return;
      if (from && clean === from) return;
      bucket.push(clean);
    };
    const rows = [];
    const seen = new Set();
    const pushRow = (tr) => {
      if (!tr || seen.has(tr) || inMessageBody(tr)) return;
      seen.add(tr);
      rows.push(tr);
    };
    messageNode.querySelectorAll('.ajB table tr, table.ajC tr, table.ajB tr').forEach(pushRow);
    messageNode.querySelectorAll('tr.ajv').forEach(pushRow);
    let labelled = false;
    for (let r = 0; r < rows.length; r++) {
      const tr = rows[r];
      const labelCell = tr.querySelector('th.gG, td.gG');
      const addrCell = tr.querySelector('td.gL');
      if (!labelCell || !addrCell) continue;
      const label = normalizeAudienceLabel(labelCell.textContent);
      if (!label || label === 'from' || label === 'מאת') continue;
      let bucket = null;
      if (label === 'to' || label === 'אל') bucket = lists.to;
      else if (label === 'cc' || label === 'עותק') bucket = lists.cc;
      else if (label === 'bcc' || label.indexOf('עותק מוסתר') >= 0) bucket = lists.bcc;
      else continue;
      labelled = true;
      addrCell.querySelectorAll('[email]').forEach((n) => {
        const email = addressFrom(n).toLowerCase();
        const shown = String(n.textContent || '').trim().toLowerCase();
        if (email && email.indexOf('@') >= 0) add(bucket, email);
        else if (own && (shown === 'me' || shown === 'אני' || shown === 'אליי')) add(bucket, own);
      });
    }
    if (!labelled) return null;
    const mine = messageNode.querySelectorAll('[email]');
    for (let i = 0; i < mine.length; i++) {
      if (String(mine[i].textContent || '').trim() !== 'me') continue;
      const name = String(mine[i].getAttribute('name') || '').trim();
      if (name && name.toLowerCase() !== 'me') userName = name;
    }
    return { to: lists.to, cc: lists.cc, userName: userName, labelled: true };
  }

  function inMessageBody(n) {
    return !!(n.closest && n.closest(BODY_SELECTOR + ', ' + QUOTE_CONTAINER_SELECTOR));
  }

  function audienceOf(messageNode, ownEmail) {
    const lists = { to: [], cc: [], bcc: [] };
    let userName = '';
    let labelled = false;
    if (!messageNode || !messageNode.querySelectorAll) return { to: lists.to, cc: lists.cc, userName: userName, labelled: false };
    const own = String(ownEmail || '').trim().toLowerCase();
    const sender = extractSender(messageNode);
    const senderEmail = String((sender && sender.email) || '').trim().toLowerCase();
    const tableAud = audienceFromDetailsTable(messageNode, ownEmail, senderEmail);
    if (tableAud) return tableAud;
    const add = (bucket, email) => {
      const clean = String(email || '').trim().toLowerCase();
      if (!clean || clean.indexOf('@') < 0 || !bucket || bucket.indexOf(clean) >= 0) return;
      bucket.push(clean);
    };
    const nodes = messageNode.querySelectorAll('div, p, li, span, td, tr');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (inMessageBody(n)) continue;
      const t = String(n.textContent || '').replace(/[\u00a0\u202f\u200e\u200f]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 400) continue;
      if (/^(from|מאת)(?=$|[\s:,;])/i.test(t)) continue;
      const head = t.match(/^(to|cc|bcc|אל|עותק(?: מוסתר)?)(?=$|[\s:,;])/i);
      if (!head) continue;
      let current = lists[audienceBucketFor(head[1].replace(/ מוסתר$/, ''))] || lists.to;
      if (/^עותק מוסתר/.test(head[1])) current = lists.bcc;
      const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let node = walker.nextNode();
      const taken = new Set();
      while (node) {
        if (node.nodeType === 3) {
          const text = String(node.nodeValue || '').replace(/[\u00a0\u202f\u200e\u200f]+/g, ' ');
          let last = 0;
          let m;
          AUDIENCE_LABEL.lastIndex = 0;
          while ((m = AUDIENCE_LABEL.exec(text))) {
            const label = m[2] || m[4];
            labelled = true;
            (text.slice(last, m.index).toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g) || []).forEach((e) => add(current, e));
            current = lists[audienceBucketFor(label)] || current;
            last = m.index + m[0].length;
          }
          (text.slice(last).toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g) || []).forEach((e) => add(current, e));
        } else if (node.nodeType === 1 && node.getAttribute) {
          const email = addressFrom(node).toLowerCase();
          const shown = String(node.textContent || '').trim().toLowerCase();
          if (email && email.indexOf('@') >= 0) {
            if (own && email === own && (shown === 'me' || shown === 'אני' || shown === 'אליי')) add(current, email);
            else if (!taken.has(node) && email !== senderEmail) add(current, email);
          } else if (own && node.children && node.children.length === 0 && (shown === 'me' || shown === 'אני' || shown === 'אליי')) {
            add(current, own);
          }
        }
        node = walker.nextNode();
      }
    }
    const mine = messageNode.querySelectorAll('[email]');
    for (let i = 0; i < mine.length; i++) {
      if (String(mine[i].textContent || '').trim() !== 'me') continue;
      const name = String(mine[i].getAttribute('name') || '').trim();
      if (name && name.toLowerCase() !== 'me') userName = name;
    }
    return { to: lists.to, cc: lists.cc, userName: userName, labelled: labelled };
  }

  function audienceAmbiguous(audience, ownEmail) {
    const own = String(ownEmail || '').trim().toLowerCase();
    if (!own || !audience || audience.labelled) return false;
    const to = (audience.to || []).map((a) => String(a || '').trim().toLowerCase());
    return to.indexOf(own) >= 0 && to.length > 1 && !(audience.cc || []).length;
  }

  const DETAILS_TOGGLE = '[aria-label="Show details"], [data-tooltip="Show details"], [aria-label="הצג פרטים"], [data-tooltip="הצג פרטים"], [aria-label="הצגת פרטים"], [aria-label="הצגת הפרטים"], [data-tooltip="הצגת הפרטים"], .ajy[role="button"], span.ajy';
  const detailsAudienceRead = new Map();

  // A collapsed header names the recipients on one line with no label, so a
  // copy looks the same as a To. The account among others on that line is
  // not enough to know it was addressed to the account.
  function collapsedRecipientsAmbiguous(messageNode, senderEmail, ownEmail, audience) {
    const own = String(ownEmail || '').trim().toLowerCase();
    if (!own || !messageNode || !messageNode.querySelector || (audience && audience.labelled)) return false;
    const toggle = messageNode.querySelector(DETAILS_TOGGLE);
    if (!toggle) return false;
    const line = toggle.parentElement || toggle;
    const from = String(senderEmail || '').trim().toLowerCase();
    const found = new Set();
    line.querySelectorAll('[email]').forEach((n) => {
      const email = String(n.getAttribute('email') || '').trim().toLowerCase();
      if (email && email !== from && !inMessageBody(n)) found.add(email);
    });
    return found.size > 0 && (from !== own || !found.has(own) || found.size > 1);
  }

  function audienceUnclear(messageNode, senderEmail, ownEmail, audience) {
    if (audience && audience.labelled) return false;
    return audienceAmbiguous(audience, ownEmail)
      || collapsedRecipientsAmbiguous(messageNode, senderEmail, ownEmail, audience)
      || otherSenderOnlyOwnChip(messageNode, senderEmail, ownEmail, audience)
      || (collapsedChipLineUnlabelled(messageNode, audience) && !collapsedSelfHeader(messageNode, senderEmail, ownEmail));
  }

  async function audienceAfterDetailsProbe(messageId, messageNode, senderEmail, ownEmail, audience) {
    if (detailsAudienceRead.has(messageId)) return detailsAudienceRead.get(messageId);
    let bag = audience;
    if (await expandMessageDetails(messageNode)) {
      bag = noteAddressedToSelf(messageNode, senderEmail, ownEmail, audienceOf(messageNode, ownEmail));
      await collapseMessageDetails(messageNode);
    }
    detailsAudienceRead.set(messageId, bag);
    return bag;
  }

  function collapsedHeaderLine(messageNode) {
    if (!messageNode || !messageNode.querySelector) return null;
    const hb = messageNode.querySelector('tr.acZ.xD span.hb, tr.acZ.xD .hb, span.hb');
    if (!hb || inMessageBody(hb)) return null;
    return hb;
  }

  function chipsOnCollapsedLine(messageNode) {
    const hb = collapsedHeaderLine(messageNode);
    if (!hb) return [];
    return Array.from(hb.querySelectorAll('[email], [data-hovercard-id]'));
  }

  function chipIsOwn(n, ownEmail) {
    const own = String(ownEmail || '').trim().toLowerCase();
    if (!own || !n) return false;
    const email = String(addressFrom(n) || '').trim().toLowerCase();
    const shown = String(n.textContent || '').trim();
    if (email && email === own) return true;
    return /^(?:me|אני)$/i.test(shown) && (!email || email === own);
  }

  // Real Gmail: span.hb lists chips only — no "to/אל". Self only when you sent it and every chip is you.
  function collapsedSelfHeader(messageNode, senderEmail, ownEmail) {
    const own = String(ownEmail || '').trim().toLowerCase();
    const from = String(senderEmail || '').trim().toLowerCase();
    if (!own || !from || from !== own) return false;
    const chips = chipsOnCollapsedLine(messageNode);
    if (!chips.length) return false;
    for (let i = 0; i < chips.length; i++) {
      if (!chipIsOwn(chips[i], own)) return false;
    }
    return true;
  }

  // Someone else sent it but the collapsed line shows only your "me" chip — same look as empty To + Cc you.
  function otherSenderOnlyOwnChip(messageNode, senderEmail, ownEmail, audience) {
    const own = String(ownEmail || '').trim().toLowerCase();
    const from = String(senderEmail || '').trim().toLowerCase();
    if (audience && audience.labelled) return false;
    if (!own || !from || from === own) return false;
    const chips = chipsOnCollapsedLine(messageNode);
    if (chips.length !== 1) return false;
    if (!chipIsOwn(chips[0], own)) return false;
    // 1:1 mail to the reader shows one "me" chip with a real address — not Cc-only.
    const email = String(addressFrom(chips[0]) || '').trim().toLowerCase();
    if (email && email === own) return false;
    return true;
  }

  // Collapsed chip line with no To/Cc label is never a resolved audience.
  function collapsedChipLineUnlabelled(messageNode, audience) {
    if (audience && audience.labelled) return false;
    const chips = chipsOnCollapsedLine(messageNode);
    if (!chips.length) return false;
    // A single addressed chip with an email is the To line, not an unresolved copy.
    if (chips.length === 1) {
      const email = String(addressFrom(chips[0]) || '').trim();
      if (email.indexOf('@') >= 0) return false;
    }
    return true;
  }

  function senderIsOwn(senderEmail, ownEmail) {
    const own = String(ownEmail || '').trim().toLowerCase();
    const from = String(senderEmail || '').trim().toLowerCase();
    return Boolean(own && from && from === own);
  }

  // A self-sent mail with a real PDF (or similar) must keep its card even
  // when rule (6) would not open details for an inbound ask and even when
  // classification is still thin. Cc-only stays quiet — this is only when
  // the collapsed header is clearly a note to self.
  function selfMailAttachmentKeepCard(messageNode, senderEmail, ownEmail, audience, attachments) {
    if (!senderIsOwn(senderEmail, ownEmail)) return false;
    if (!attachments || !attachments.length) return false;
    const own = String(ownEmail || '').trim().toLowerCase();
    const aud = noteAddressedToSelf(messageNode, senderEmail, ownEmail, audience);
    const cc = (aud.cc || []).map((a) => String(a || '').trim().toLowerCase());
    if (cc.some((a) => a && a !== own)) return false;
    if (otherSenderOnlyOwnChip(messageNode, senderEmail, ownEmail, audience)) return false;
    if (!headerToSelf(messageNode, own, senderEmail)) return false;
    if (typeof FlowSuggestSave === 'undefined' || typeof FlowSuggestSave.suggestSave !== 'function') return false;
    const mapped = attachments.map((meta) => {
      const sized = Number(meta.size);
      return {
        id: meta.url || meta.filename,
        name: meta.filename,
        size: (isFinite(sized) && sized > 0) ? sized : 8192,
        contentType: meta.mimeType || '',
        isInline: false
      };
    });
    try {
      const decision = FlowSuggestSave.suggestSave({
        surface: 'gmail',
        direction: 'inbound',
        senderIsUser: false,
        consent: true,
        attachmentsRead: true,
        attachments: mapped,
        text: '',
        subject: '',
        messageId: 'self-attach-probe',
        dismissed: [],
        log: []
      });
      return Boolean(decision && decision.eligible);
    } catch (e) {
      console.error('[Glance] self attachment keep-card probe failed', e);
      return false;
    }
  }

  function messageDetailsOpen(messageNode) {
    return !!(messageNode && messageNode.querySelector
      && messageNode.querySelector('.ajB table, table.ajC, table.ajB'));
  }

  function removeMessageDetailsPanels(messageNode) {
    if (!messageNode || !messageNode.querySelectorAll) return;
    messageNode.querySelectorAll('.ajA').forEach((n) => n.remove());
    messageNode.querySelectorAll('.ajB').forEach((n) => {
      if (n.closest && n.closest('.ajA')) return;
      n.remove();
    });
  }

  async function expandMessageDetails(messageNode) {
    const toggle = messageNode && messageNode.querySelector
      ? messageNode.querySelector(DETAILS_TOGGLE)
      : null;
    if (!toggle) return false;
    if (messageDetailsOpen(messageNode)) return true;
    try { toggle.click(); } catch (e) { return false; }
    await new Promise((r) => setTimeout(r, 200));
    return messageDetailsOpen(messageNode);
  }

  async function collapseMessageDetails(messageNode) {
    const toggle = messageNode && messageNode.querySelector
      ? messageNode.querySelector(DETAILS_TOGGLE)
      : null;
    if (!toggle || !messageNode.querySelector) return false;
    if (!messageDetailsOpen(messageNode)) return true;
    try { toggle.click(); } catch (e) { return false; }
    await new Promise((r) => setTimeout(r, 120));
    removeMessageDetailsPanels(messageNode);
    const row = toggle.closest('td') || toggle.parentElement;
    if (row) {
      const open = row.querySelector('.ajB');
      if (open) open.remove();
    }
    return !messageDetailsOpen(messageNode);
  }

  // Collapsed Gmail header: "to me", and the me chip has no email attribute.
  // The body is not this header. "Remind me" in the message is not "to me".
  function headerToSelf(messageNode, ownEmail, senderEmail) {
    if (!messageNode || !messageNode.querySelectorAll) return false;
    const nodes = messageNode.querySelectorAll('span, div, p');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.closest && n.closest(BODY_SELECTOR)) continue;
      const t = String(n.textContent || '').replace(/[\u00a0\u202f]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 24) continue;
      if (/^(?:(?:to|אל)\s+(?:me|אני)|אליי)$/i.test(t)) return true;
    }
    if (collapsedSelfHeader(messageNode, senderEmail, ownEmail)) return true;
    return false;
  }

  // A note from the account to itself. The collapsed header names no
  // address, and a mail that also names someone else is not this note.
  function noteAddressedToSelf(messageNode, senderEmail, ownEmail, audience) {
    const bag = audience || { to: [], cc: [], userName: '' };
    const own = String(ownEmail || '').trim().toLowerCase();
    const from = String(senderEmail || '').trim().toLowerCase();
    if (!own || !from || from !== own || !headerToSelf(messageNode, own, from)) return bag;
    const cc = (bag.cc || []).map((a) => String(a || '').trim().toLowerCase());
    if (cc.some((a) => a && a !== own)) return bag;
    const to = (bag.to || []).map((a) => String(a || '').trim().toLowerCase());
    if (to.some((a) => a && a !== own && a !== 'me')) return bag;
    bag.to = [own];
    return bag;
  }

  // Every [email] on the message, sender first. Same order extractSender
  // uses for the first one. Passed to FlowGoogleCloses.messageToJudge.
  function addressesOn(messageNode) {
    if (!messageNode || !messageNode.querySelectorAll) return [];
    const all = [];
    const els = messageNode.querySelectorAll('[email], [data-hovercard-id]');
    for (const el of els) {
      if (addressFrom(el)) all.push(el);
    }
    if (!all.length) return [];
    // messageToJudge treats the first address as the sender. A Hebrew
    // message can paint "me" before the sender. The sender is the address
    // that is not the "me" chip and not inside a To or Cc line.
    let sender = '';
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (String(el.textContent || '').trim().toLowerCase() === 'me') continue;
      const block = el.closest ? el.closest('div, p, li') : null;
      const head = block ? String(block.innerText || '').trim() : '';
      if (/^(to|cc|bcc|אל|עותק)(?=$|[\s:,;])/i.test(head)) continue;
      sender = addressFrom(el);
      break;
    }
    const out = [];
    if (sender) out.push(sender);
    for (let i = 0; i < all.length; i++) {
      const email = addressFrom(all[i]);
      if (email && out.indexOf(email) < 0) out.push(email);
    }
    return out;
  }

  // Gmail writes quoted/forwarded history into a message's own HTML inside
  // an element carrying this class — a stable, widely-documented convention
  // (not one of Gmail's internal minified names) that Gmail itself inserts
  // whenever a message was composed as a reply or forward in Gmail, in any
  // UI language. Cutting the DOM here, before any text ever reaches
  // judgment/intent, is the strong signal; FlowJudgment.newContent()'s own
  // regex-based cut (which classify() always runs regardless of this
  // function's result) remains the fallback for quotes with no such
  // wrapper — a non-Gmail sender, or a plain-text forward.
  const QUOTE_CONTAINER_SELECTOR = '.gmail_quote';

  // Gmail's message body. Prefer this over the whole listitem: the
  // listitem also carries the sender row (a received clock like "12:05"),
  // detected-event invite chips, and smart-reply suggestions. Those are
  // UI chrome, not the sender's words. A received "12:05" next to a
  // meeting "10:00" looks like Family H two-slot ambiguity and stays
  // quiet forever. .a3s is the long-standing body class. If it is missing
  // we fall back to the listitem and strip known chrome there only.
  const BODY_SELECTOR = 'div.a3s';

  // Drop Gmail reading-pane chrome that is not part of the sender's
  // message. Listitem fallback only. Never run this on .a3s text — a
  // clock the sender wrote in the body must stay.
  function stripGmailReadingChrome(text) {
    let t = String(text || '');
    // Leading header: optional name/email lines, then HH:MM (optionally
    // "(N minutes ago)"), then "to me".
    t = t.replace(
      /^(?:[^\n]{1,120}\n){0,4}?\d{1,2}:\d{2}(?:\s*\([^)\n]{0,40}\))?\s*\n(?:to\s+me\b[^\n]*\n)?/i,
      ''
    );
    // Detected-event invite chip under the body.
    t = t.replace(
      /(?:^|\n)(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s+[A-Za-z]+\s+\d{1,2},\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*[–—-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*\([A-Z]{2,5}\))?\s*(?=\n|$)/gi,
      '\n'
    );
    // Bare invite range without a weekday prefix.
    t = t.replace(
      /(?:^|\n)\d{1,2}:\d{2}\s*(?:AM|PM)\s*[–—-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*\([A-Z]{2,5}\))?\s*(?=\n|$)/gi,
      '\n'
    );
    // Smart-reply chips Gmail appends under the message.
    t = t.replace(
      /(?:^|\n)(?:Yes, that works for me\.?|Yes, see you then!?|No, I can'?t make it\.?)\s*(?=\n|$)/gi,
      '\n'
    );
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }

  function isMessageBody(node) {
    if (!node || typeof node.matches !== 'function') return false;
    try { return node.matches(BODY_SELECTOR); } catch (e) { return false; }
  }

  // Returns only the text that renders before the first quote container —
  // never the quoted history sitting after it. Prefers the .a3s body node
  // (see BODY_SELECTOR), including when the caller already passed that
  // node. Falls back to the listitem only when that node is missing, and
  // only then strips reading-pane chrome. Matches the chosen node's own
  // innerText computation (rather than a DOM Range) specifically so the
  // whitespace/line-break shape of what's returned is identical to what
  // every other caller of .innerText in this file already expects.
  function ownMessageText(messageNode) {
    if (!messageNode) return '';
    const body = isMessageBody(messageNode) ? messageNode : messageNode.querySelector(BODY_SELECTOR);
    const root = body || messageNode;
    const full = (root.innerText || '').trim();
    let cut = full;
    const quoteBlock = root.querySelector(QUOTE_CONTAINER_SELECTOR);
    if (quoteBlock) {
      const quoted = (quoteBlock.innerText || '').trim();
      if (quoted) {
        const idx = full.lastIndexOf(quoted);
        // Not found at all (a rendering mismatch between the isolated
        // block's own innerText and its innerText as read within the
        // full message) — keep the unfiltered text rather than guess
        // where to cut. idx === 0 (the quote is the entire visible
        // message) correctly yields an empty string, same treatment as
        // judgment.js's own newContent() gives that case.
        if (idx >= 0) cut = full.slice(0, idx).trim();
      }
    }
    const plain = body ? cut : stripGmailReadingChrome(cut);
    if (typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.prepareForJudge === 'function') {
      return FlowIncomingJudge.prepareForJudge(plain);
    }
    return plain;
  }

  // Own address is the stored userinfo email, then the openid login hint,
  // then the Gmail account button. The page title, the subject, and a
  // "me" chip are not an address. A stored address is never replaced.
  function accountEmailFromLabel(label) {
    const raw = String(label || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[\u00a0\u202f\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    const prefixed = raw.match(/^(?:Google Account|חשבון Google)\s*:\s*(.+)$/i);
    if (!prefixed) return '';
    const email = prefixed[1].match(/\(([^)]*@[^)]+)\)\s*$/);
    return email ? email[1].trim() : '';
  }

  function ownEmailFromAccount() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return '';
    const nodes = document.querySelectorAll('a[aria-label], button[aria-label], [role="button"][aria-label]');
    for (let i = 0; i < nodes.length; i++) {
      const email = accountEmailFromLabel(nodes[i].getAttribute('aria-label'));
      if (email) return email;
    }
    return '';
  }

  function ownEmailFromThread() {
    return ownEmailFromAccount() || null;
  }

  function emailish(value) {
    const raw = String(value || '').trim();
    return raw.indexOf('@') > 0 ? raw : '';
  }

  function storedOwnEmailFromBag(bag) {
    const profile = bag && bag.googleProfile;
    const fromProfile = emailish(profile && profile.email);
    if (fromProfile) return fromProfile;
    const web = bag && bag.googleWebAuth;
    return emailish(web && web.loginHint);
  }

  async function readStoredOwnEmail() {
    if (!chromeLive()) return '';
    try {
      const bag = await chrome.storage.local.get(['googleProfile', 'googleWebAuth']);
      return storedOwnEmailFromBag(bag);
    } catch (e) {
      tearDownOrphan();
      return '';
    }
  }

  let lastOwnEmail = '';

  function currentSubject() {
    const h = document.querySelector('h2.hP') || document.querySelector('div[role="main"] h2');
    return h ? h.textContent.trim() : '';
  }

  // Multiple Google accounts can each have Gmail open in their own /mail/u/N/
  // tab — the own-email cache below is kept per account index so switching
  // tabs never reads (or overwrites) another account's cached address.
  function accountIndex() {
    const m = location.pathname.match(/\/mail\/u\/(\d+)/);
    return m ? m[1] : '0';
  }

  // Gmail's #all/<id> route resolves a legacy message id from any label, which
  // makes the link in the written record survive archiving.
  function threadUrl(legacyId) {
    if (!legacyId) return null;
    return 'https://mail.google.com/mail/u/' + accountIndex() + '/#all/' + legacyId;
  }

  // Gmail stamps data-legacy-thread-id on the message or an ancestor. A
  // missing attribute is not guessed at — personal close memory treats a
  // missing thread id as "not clear" unless the subject itself is specific.
  //
  // Real Gmail does not stamp the thread on the message at all. The thread
  // header (h2.hP) carries data-legacy-thread-id, the id the Gmail API takes,
  // and data-thread-perm-id, the same id written in decimal after
  // "thread-f:". The decimal is converted to the hex id. The address bar is
  // read last, and only when it holds a hex id. A thread whose id cannot be
  // read stays null: nothing is guessed.
  function threadIdFromHeader() {
    const header = document.querySelector('div[role="main"] h2.hP, h2.hP');
    if (header && header.getAttribute) {
      const legacy = String(header.getAttribute('data-legacy-thread-id') || '').trim();
      if (/^[0-9a-f]{8,24}$/i.test(legacy)) return legacy.toLowerCase();
      const perm = /^thread-f:(\d{6,30})$/.exec(String(header.getAttribute('data-thread-perm-id') || '').trim());
      if (perm && typeof BigInt === 'function') {
        try { return BigInt(perm[1]).toString(16); } catch (e) { /* not a number */ }
      }
    }
    const hash = String((location && location.hash) || '').split('/').pop().split('?')[0];
    return /^[0-9a-f]{12,24}$/i.test(hash) ? hash.toLowerCase() : '';
  }

  function threadIdFrom(message) {
    return gmailAttr(message, 'data-legacy-thread-id') || threadIdFromHeader() || null;
  }

  // Prefer silence when this open message clearly continues a personal
  // matter Glance already fully closed. No effect when memory is absent,
  // the message is not one of the three trusted closes, or the match is
  // not clear — the chip then decides as usual. A storage failure must
  // never be the reason a real chip disappears.
  async function personalCloseSaysSilence(intent, threadId, subject) {
    if (!intent || !intent.personalClose || typeof FlowCloseMemory === 'undefined') return false;
    try {
      if (typeof FlowStorage !== 'undefined' && typeof FlowStorage.get === 'function') {
        const bag = await FlowStorage.get();
        const log = (bag && bag.log) || [];
        for (let i = 0; i < log.length; i++) {
          const row = log[i];
          if (!row || row.kind !== 'undone') continue;
          if (threadId && (row.threadId === threadId || row.outlookConversationId === threadId || row.messageId === threadId)) return false;
          if (subject && row.subject && String(row.subject).toLowerCase() === String(subject).toLowerCase()) return false;
        }
      }
      const recalled = await FlowCloseMemory.recall({
        personalClose: intent.personalClose,
        threadId: threadId,
        subject: subject
      });
      return Boolean(recalled && recalled.action === 'silence');
    } catch (e) {
      return false;
    }
  }

  // ownEmailFromThread() above only finds an answer when the reader appears
  // as a recipient somewhere in the visible thread — which is every ordinary
  // multi-message thread, but NOT a thread made of exactly one message that
  // is the reader's own freshly-sent, no-reply-yet outbound email (the
  // reader never shows up as "me" in a thread where they're only ever the
  // sender). Caching the answer the moment it IS found, per Google account,
  // means that gap only ever shows up once per account — the very next
  // ordinary thread fills the cache, and every single-message "I just sent
  // this" thread after that is covered by it.
  const OWN_EMAIL_STORAGE_KEY = 'flowOwnEmailByAccount';

  async function getCachedOwnEmail() {
    if (!chromeLive()) return null;
    try {
      const bag = await chrome.storage.local.get(OWN_EMAIL_STORAGE_KEY);
      const flowOwnEmailByAccount = bag && bag.flowOwnEmailByAccount;
      return (flowOwnEmailByAccount && flowOwnEmailByAccount[accountIndex()]) || null;
    } catch (e) {
      tearDownOrphan();
      return null;
    }
  }

  function rememberOwnEmail(email) {
    if (!chromeLive()) return;
    Promise.resolve()
      .then(() => chrome.storage.local.get(OWN_EMAIL_STORAGE_KEY))
      .then((bag) => {
        if (!chromeLive() || !bag) return null;
        const map = Object.assign({}, bag.flowOwnEmailByAccount);
        const idx = accountIndex();
        if (map[idx] === email) return null;
        map[idx] = email;
        return chrome.storage.local.set({ [OWN_EMAIL_STORAGE_KEY]: map });
      })
      .catch(() => { tearDownOrphan(); });
  }

  async function readCompanyTemplate() {
    if (!chromeLive()) return null;
    try {
      const bag = await chrome.storage.local.get('glanceCompanyTemplate');
      return (bag && bag.glanceCompanyTemplate) || null;
    } catch (e) {
      tearDownOrphan();
      return null;
    }
  }

  function driveFindOne(term) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'flow:drive-find-one', term: term }, (res) => {
        resolve({
          match: res && res.match ? res.match : 'unknown',
          file: res && res.file ? res.file : null,
          driveSearchUnavailable: !!(res && res.driveSearchUnavailable)
        });
      });
    });
  }

  // The one Cc-only rule, asked of the live header. Classification asks it
  // first. Gmail can paint the recipients after the body, so a card that was
  // offered before the header was read is asked again once it is there, and
  // again when Do It is pressed. Copied only, with no greeting of the
  // account's own name, is no card of any kind.
  function copiedOnlyNow(message, text, ownEmail) {
    if (typeof FlowIntent === 'undefined' || typeof FlowIntent.copiedOnly !== 'function') return false;
    const own = String(ownEmail || '').trim();
    if (!own || !message || !message.isConnected) return false;
    const aud = audienceOf(message, own);
    if (!(aud.to || []).length && !(aud.cc || []).length) return false;
    try {
      return FlowIntent.copiedOnly(text, {
        to: aud.to, cc: aud.cc, ownAddresses: [own],
        userName: aud.userName || null, ownNames: ownNamesForChip(aud.userName)
      });
    } catch (e) { return false; }
  }

  function withdrawOffer(message, messageId) {
    if (!message || !message.querySelectorAll) return;
    message.querySelectorAll('.flow-chip-host').forEach((h) => {
      if (h.querySelector('.flow-chip-handled, .flow-chip-done-icon') || h.getAttribute('data-glance-chain') === 'task-proof') return;
      h.remove();
    });
    recordSilence(messageId, 'audience');
  }

  const copiedWatchers = new WeakMap();
  function watchCopiedOnly(message, messageId, text, ownEmail, audience) {
    if (!message || typeof MutationObserver === 'undefined' || copiedWatchers.has(message)) return;
    let timer = null;
    const stop = () => {
      const w = copiedWatchers.get(message);
      if (w) w.observer.disconnect();
      clearTimeout(timer);
      copiedWatchers.delete(message);
    };
    const check = () => {
      if (!message.isConnected || !message.querySelector('.flow-chip-host')) { stop(); return; }
      const aud = audienceOf(message, ownEmail);
      if (!copiedOnlyNow(message, text, ownEmail)) return;
      // Withdraw when the labelled details table is open, or while the header
      // is still empty and a late paint may arrive. Keep watching after a
      // late details expand — no time cap.
      if (aud.labelled || (!(aud.to || []).length && !(aud.cc || []).length)) {
        withdrawOffer(message, messageId);
        if (aud.labelled) stop();
      }
    };
    const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check, 80); });
    observer.observe(message, { childList: true, subtree: true, characterData: true });
    copiedWatchers.set(message, { observer: observer });
  }

  // A Drive / Doc / Sheet close has to know whether exactly one file
  // already matches before the chip can claim "didn't find it". The
  // check is one name lookup, not a picker and not a Drive browser.
  // A reminder for an appointment this sender's confirmation already put on the calendar (and was not undone) is not offered twice.
  async function holdAlreadyMade(senderEmail, intent, ownIds) {
    if (typeof FlowHeldHold === 'undefined' || !senderEmail || !FlowHeldHold.keyOf(intent)) return false;
    try {
      const bag = await FlowStorage.get();
      return !!FlowHeldHold.find((bag && bag.log) || [], senderEmail, FlowHeldHold.keyOf(intent), ownIds);
    } catch (e) { return false; }
  }

  // The business cancelled a booking, a trip or an invitation that Glance put on this calendar from its own earlier mail: Do It takes that
  // same event off again through the hold's own undo (Google Calendar read back that it is gone; an event the person changed is left
  // alone and says so). Quiet when no hold of this sender at that day and clock is on the calendar. Never sends anything.
  async function cancelledHoldIntent(text, senderEmail) {
    if (typeof FlowHeldHold === 'undefined' || !senderEmail) return null;
    let gone = null;
    for (const reader of [typeof FlowChatAppointmentNotice !== 'undefined' ? FlowChatAppointmentNotice : null, typeof FlowChatTravelNotice !== 'undefined' ? FlowChatTravelNotice : null, typeof FlowChatInvitationNotice !== 'undefined' ? FlowChatInvitationNotice : null]) {
      if (!reader || typeof reader.cancelled !== 'function') continue;
      try { const g = reader.cancelled(text, new Date()); if (g && g.kind === 'cancelled') { gone = g; break; } } catch (e) { /* the next reader */ }
    }
    if (!gone) return null;
    let held = null;
    try {
      const bag = await FlowStorage.get();
      held = FlowHeldHold.find((bag && bag.log) || [], senderEmail, FlowHeldHold.holdAt(gone), []);
    } catch (e) { return null; }
    if (!held || !held.ref || (held.connectorId !== 'calendar' && held.connectorId !== 'googleHold')) return null;
    const he = gone.lang === 'he';
    const title = String(held.label || '').replace(/^Calendar\s*·\s*/i, '').slice(0, 80);
    return {
      type: 'event', label: (he ? 'בוטל: ' : 'Cancelled: ') + title, confidence: 0.9, personalClose: 'booking-cancelled', signals: { score: 90, threshold: 50 },
      entities: { dateIso: gone.dateIso, hour: gone.hour, minute: gone.minute },
      removeHeld: { ref: held.ref, messageId: held.messageId || null, he: he },
      plannedProcess: { id: 'booking-cancelled', name: he ? 'הסר מהיומן' : 'Remove It', closingLine: he ? 'מסיר מהיומן.' : 'Removing it from your calendar.', closedLine: he ? 'הוסר מהיומן.' : 'Removed from your calendar.', needsDateChoice: false, dateChoices: null,
        steps: [{ id: 'calendar', kind: 'calendar', label: 'Calendar', hint: (he ? 'להסיר מהיומן: ' : 'Remove from calendar: ') + title, params: { dateIso: gone.dateIso, hour: gone.hour, minute: gone.minute, title: title }, dependsOn: null }] }
    };
  }

  // Do It on a cancellation: remove the hold through the lane's undo. A changed event stays and the card says so.
  async function removeHeldHold(host, chip, ctx) {
    const held = ctx.intent.removeHeld;
    setChipState(chip, 'flow-chip-pending', held.he ? 'מסיר…' : 'Removing…');
    const ref = laneUndoSnapshot('googleHold', held.ref) || held.ref;
    const u = await sendLaneUndo('googleHold', ref);
    if (!(u && u.ok)) {
      const edited = u && laneEditedReason(u.reason);
      setChipState(chip, 'flow-chip-error', edited ? (held.he ? 'שינית את האירוע, השארתי אותו' : 'You changed this event, so I left it') : (held.he ? 'לא הצלחתי להסיר, נסה שוב' : "Couldn't remove it, try again"));
      return;
    }
    // The hold's own row is undone (so a later mail of that booking can be offered again); this cancellation mail is closed, read back.
    try { await FlowStorage.appendLog({ kind: 'undone', label: 'Calendar event removed.', messageId: held.messageId, app: SOURCE_APP, connectorId: 'calendar' }); } catch (e) { /* the receipt still shows */ }
    try { await FlowStorage.appendLog({ kind: 'written', label: 'Calendar event removed.', messageId: ctx.messageId, legacyMessageId: ctx.legacyMessageId || null, threadId: ctx.threadId || null, app: SOURCE_APP, connectorId: 'calendar', fetchedBack: true, receiptStatus: 'Handled.' }); } catch (e) { /* the receipt still shows */ }
    host.classList.add('flow-chip-settled');
    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    done.setAttribute('role', 'status');
    const icon = el('span', 'flow-chip-done-icon', '✓');
    icon.setAttribute('aria-hidden', 'true');
    done.appendChild(icon);
    done.appendChild(el('span', 'flow-chip-handled', glanceShow('Handled.')));
    done.appendChild(el('span', 'flow-chip-written', glanceShow(u.written || (held.he ? 'הוסר מהיומן.' : 'Removed from your calendar.'))));
    host.replaceChildren(done);
  }

  async function classifyForChip(text, base) {
    const prepared = (typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.prepareForJudge === 'function')
      ? FlowIncomingJudge.prepareForJudge(text)
      : text;
    const template = await readCompanyTemplate();
    const ctx = Object.assign({ now: new Date() }, base, { companyTemplate: template });
    // A known service's notice with a deadline and a preventing action is a task with the date (core/system-notice.js).
    // Off unless glanceSwitches.SYSTEM_NOTICE is true.
    let noticeOn = false;
    try { const bag = await chrome.storage.local.get({ glanceSwitches: {} }); noticeOn = !!(bag.glanceSwitches && bag.glanceSwitches.SYSTEM_NOTICE === true); } catch (e) { noticeOn = false; }
    if (noticeOn && typeof FlowSystemNotice !== 'undefined' && typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.noticeIntent === 'function' && base && base.inbound !== false) {
      const notice = FlowSystemNotice.detect({ text: prepared, subject: ctx.subject || '', sender: { email: ctx.senderEmail, name: ctx.senderName }, now: ctx.now });
      if (notice) return FlowIncomingJudge.noticeIntent(FlowIntent, notice);
    }
    // A booking, an invitation or a pickup told to the person, and a payment asked of them (core/chat-appointment-notice.js,
    // chat-invitation-notice.js, chat-pickup-notice.js, chat-payment-ask.js): the same readers Outlook uses through the shared
    // judge. Each is behind its own switch, glanceSwitches.BOOKING_NOTICE and PAYMENT_ASK, default off. Nothing is paid or sent.
    if (typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.bookingNotice === 'function' && base && base.inbound !== false && ctx.senderIsUser !== true) {
      let bag = null;
      try { bag = await chrome.storage.local.get({ glanceSwitches: {} }); } catch (e) { bag = null; }
      const sw = (bag && bag.glanceSwitches) || {};
      const judgeIn = { text: prepared, subject: ctx.subject || '', sender: { email: ctx.senderEmail, name: ctx.senderName }, now: ctx.now, threadUrl: ctx.threadUrl || null, to: ctx.to || null, cc: ctx.cc || null, ownAddresses: ctx.ownAddresses || null, senderEmail: ctx.senderEmail, userName: ctx.userName || null, ownNames: ctx.ownNames || null };
      if (sw.BOOKING_NOTICE === true) {
        const gone = await cancelledHoldIntent(prepared, ctx.senderEmail);
        if (gone) return gone;
      }
      const hit = (sw.PAYMENT_ASK === true ? FlowIncomingJudge.paymentAsk(judgeIn, prepared) : null) || (sw.BOOKING_NOTICE === true ? FlowIncomingJudge.bookingNotice(judgeIn, prepared) : null) || (sw.TASK_ASK === true ? FlowIncomingJudge.taskAsk(judgeIn, prepared) : null);
      if (hit && await holdAlreadyMade(ctx.senderEmail, hit.intent, [ctx.messageId])) return { type: null };
      if (hit) return Object.assign({}, hit.intent, { plannedProcess: hit.process });
    }
    let intent = FlowIntent.classify(prepared, ctx);
    if (intent && intent.googleWait && intent.googleWait.fileTerm) {
      const usingGoogle = state.onboarded && state.connectorId === 'googleTasks';
      if (!usingGoogle) await ensureGoogleAutoConnect();
      const found = await driveFindOne(intent.googleWait.fileTerm);
      if (found && found.driveSearchUnavailable) return { type: null };
      const match = found && typeof found === 'object' ? found.match : found;
      intent = FlowIntent.classify(prepared, Object.assign({}, ctx, { fileMatch: match || 'unknown' }));
      if (intent && found && found.file) intent.laneFile = found.file;
    }
    return intent || { type: null };
  }

  // data-legacy-message-id and data-legacy-thread-id sit on the message
  // (.adn), which is inside the listitem, not always on the listitem
  // itself. The hash of the row text changes when Gmail rewrites
  // "0 minutes ago". The legacy id and the thread id do not.
  function gmailAttr(node, name, ownOnly) {
    if (!node || !node.getAttribute) return '';
    const own = node.getAttribute(name);
    if (own) return own;
    if (node.querySelector) {
      try {
        const child = node.querySelector('[' + name + ']');
        const fromChild = child && child.getAttribute(name);
        if (fromChild) return fromChild;
      } catch (e) { /* attribute selector is a fixed name */ }
    }
    // A message id on an ancestor belongs to a different message. Thread
    // id is the exception: Gmail stamps it on the thread, not the row.
    if (ownOnly) return '';
    let parent = node.parentElement;
    let hops = 0;
    while (parent && hops < 8) {
      const value = parent.getAttribute && parent.getAttribute(name);
      if (value) return value;
      parent = parent.parentElement;
      hops++;
    }
    return '';
  }

  // The ids that name THIS message. A text hash, the thread id, and the
  // subject are not among them. legacy-message-id and an rfc Message-ID
  // on this node (or the .adn inside it) are.
  function laneMessageIds(message) {
    const legacy = gmailAttr(message, 'data-legacy-message-id', true);
    const rfc = gmailAttr(message, 'data-rfc822msgid', true);
    const ids = [];
    if (legacy) ids.push(legacy);
    if (rfc && ids.indexOf(rfc) < 0) ids.push(rfc);
    return ids;
  }

  function stableMessageKey(message) {
    const laneIds = laneMessageIds(message);
    const legacy = laneIds[0] || '';
    const threadId = gmailAttr(message, 'data-legacy-thread-id');
    let hash = '';
    try { hash = hashNode(message) || ''; } catch (e) { hash = ''; }
    const messageIds = laneIds.slice();
    if (hash) messageIds.push(hash);
    if (threadId) messageIds.push('scan:' + threadId);
    return {
      messageId: legacy || hash,
      legacy: legacy,
      rfc: laneIds.length > 1 ? laneIds[1] : '',
      threadId: threadId,
      messageIds: messageIds,
      laneIds: laneIds,
      threadIds: threadId ? [threadId] : []
    };
  }

  // Before own-email, before "which message to judge", before the terminal
  // return. A proved Google Task is mounted again whenever this thread has
  // the receipt and the chip is gone. Classification staying quiet must
  // not leave the thread blank.
  async function remountProvedTaskReceipts(messages) {
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (!message || !message.isConnected || message.querySelector('.flow-chip-host')) continue;
      const ids = stableMessageKey(message);
      if (!ids.messageId) continue;
      let lane = null;
      try { lane = await readLaneUndo(ids.legacy || ids.messageId, ids.laneIds); }
      catch (e) { lane = null; }
      if (!chromeLive()) return false;
      if (lane && lane.steps && lane.steps.length) {
        mountLaneReceipt(message, lane, ids.messageId || (ids.messageIds && ids.messageIds[0]));
      }
    }
    if (typeof FlowProofOfClose === 'undefined' || !FlowProofOfClose.taskReceiptFromLog) return false;
    let settled = null;
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (!message || !message.isConnected || message.querySelector('.flow-chip-host')) continue;
      const ids = stableMessageKey(message);
      if (!ids.messageIds.length && !ids.threadIds.length) continue;
      if (!settled) {
        try { settled = await FlowStorage.get(); }
        catch (e) { return false; }
      }
      const taskRow = FlowProofOfClose.taskReceiptFromLog(settled.log, {
        messageIds: ids.messageIds,
        threadIds: ids.threadIds
      });
      const decision = FlowProofOfClose.scanReceiptDecision
        ? FlowProofOfClose.scanReceiptDecision({
          log: settled.log,
          messageIds: ids.messageIds,
          threadIds: ids.threadIds,
          hasHost: false,
          terminal: true
        })
        : (taskRow ? 'mount' : 'silent');
      if (decision !== 'mount' || !taskRow) continue;
      const direct = ids.messageIds.some((id) => {
        const c = FlowProofOfClose.canonId ? FlowProofOfClose.canonId(id) : id;
        if (!c) return false;
        return c === (FlowProofOfClose.canonId ? FlowProofOfClose.canonId(taskRow.messageId) : taskRow.messageId)
          || c === (FlowProofOfClose.canonId ? FlowProofOfClose.canonId(taskRow.legacyMessageId) : taskRow.legacyMessageId);
      });
      if (!direct) continue;
      mountProvedTaskReceipt(message, taskRow);
      return true;
    }
    return false;
  }

  // A thread is usually a list of listitems. An opened message can also be
  // only the .adn row, with the legacy id and no listitem. That row is
  // still the mail the receipt was stored against.
  // The open message is the node that contains the body (.a3s). An inbox
  // row is also a listitem, and it stays in the page when a thread opens.
  // Judging that row misses the mail that was just opened. A subject with
  // no body yet waits for the next mutation instead of judging the inbox.
  function openMailNodes(main) {
    if (!main || !main.querySelectorAll) return [];
    const nodes = [];
    function add(node) {
      if (!node) return;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i] === node || (nodes[i].contains && nodes[i].contains(node))) return;
        if (node.contains && node.contains(nodes[i])) nodes.splice(i, 1);
      }
      nodes.push(node);
    }
    function hasBody(node) {
      return !!(node && node.querySelector && node.querySelector('.a3s'));
    }
    const marked = main.querySelectorAll('[data-legacy-message-id]');
    for (let i = 0; i < marked.length; i++) {
      if (hasBody(marked[i])) add(marked[i]);
    }
    if (nodes.length) return nodes;
    const listed = main.querySelectorAll('div[role="listitem"]');
    for (let i = 0; i < listed.length; i++) {
      if (hasBody(listed[i])) add(listed[i]);
    }
    if (nodes.length) return nodes;
    // A handled receipt is stored on the .adn row. That row has the legacy
    // id before the body is painted, and an inbox row does not.
    for (let i = 0; i < marked.length; i++) add(marked[i]);
    if (nodes.length) return nodes;
    if (main.querySelector('h2.hP')) return [];
    return listed;
  }

  async function scanReadingPane() {
    if (!watching || !chromeLive()) return;
    publishNamesDiag();
    dropStaleCards();
    if (!chromeLive()) return;
    const main = document.querySelector('div[role="main"]');
    if (!main) {
      logScanSkip('', 'no-main-pane');
      return;
    }

    const messages = openMailNodes(main);
    if (!messages.length) {
      logScanSkip('', 'no-open-messages');
      return;
    }

    try {
      await remountProvedTaskReceipts(messages);
    } catch (e) {
      console.error('[Glance] failed to remount a handled task', e);
    }

    // Only the newest message in the thread — this mirrors "an email arrived",
    // not "re-judge the entire history on every DOM mutation". But the newest
    // *node* is your own reply the moment you send one, and judging it as an
    // incoming decision meant Flow looked up your own address as the sender
    // and re-offered to log whatever the thread was already about. Walking
    // backward for the newest message that isn't from the account itself
    // finds the thing this scanner exists to react to: mail that arrived.
    // A note addressed only to yourself is the exception: there is no other
    // sender, and the note is the ask (a file on your calendar, a hold).
    // A message you sent to someone else still stays quiet.
    const storedOwn = await readStoredOwnEmail();
    const cachedOwn = await getCachedOwnEmail();
    if (!chromeLive()) return;
    // The account button is this tab. userinfo is one address for the
    // whole extension, so it is used only when this tab has no button.
    // A stored address is not replaced by the other account.
    const buttonOwn = ownEmailFromThread() || '';
    let ownEmail = buttonOwn || storedOwn || cachedOwn || '';
    if (buttonOwn) lastOwnEmail = buttonOwn;
    if (!storedOwn && ownEmail) rememberOwnEmail(ownEmail);
    if (!chromeLive()) return;
    // No account button and no stored userinfo or openid email. Nothing can be
    // verified or written; offer Reconnect instead of waiting for a name.
    if (!ownEmail) {
      const pending = messages[messages.length - 1];
      if (pending && pending.getAttribute && pending.getAttribute('data-glance-names') === 'pending') {
        const pendingKey = stableMessageKey(pending);
        logScanSkip(pendingKey && pendingKey.messageId, 'own-email-pending');
        return;
      }
      const stablePending = pending ? stableMessageKey(pending) : null;
      if (pending && pending.setAttribute) pending.setAttribute('data-glance-names', 'pending');
      paintAccountReconnectRow(pending, stablePending && stablePending.messageId, currentSubject());
      armNamesHold();
      return;
    }

    // "Waiting on" looks at the thread as a whole — whose message is newest —
    // so it runs before the incoming-mail logic below, which skips the
    // account's own messages entirely. It never blocks or alters that logic.
    if (typeof FlowFollow !== 'undefined') {
      // Read the message BODY, not the whole row: the row's text carries the
      // sender's name, "to me" and the date, which would look like content.
      const bodyOf = (node) => (node && node.querySelector && node.querySelector('.a3s.aiL, .a3s')) || node;
      const followCtx = {
        messages, ownEmail, extractSender,
        ownMessageText: (node) => ownMessageText(bodyOf(node)),
        messageText: (node) => ownMessageText(bodyOf(node)),
        threadIdFrom, subject: currentSubject(), threadUrl,
        // Real attachments of a message (not the word "attached"), and the bytes of one
        // of them, for file-backed loops (core/file-path.js).
        attachmentsOf: (node) => allRealAttachments(node),
        fetchAttachment: (meta) => fetchAttachmentBase64(meta)
      };
      FlowFollow.consider(followCtx).catch((e) => console.error('[Glance] follow-up check failed', e));
      // A date that runs out ("valid until…"). Same silence rules; marketing mail is skipped.
      FlowFollow.considerClock(followCtx).catch((e) => console.error('[Glance] expiry check failed', e));
    }

    const emailLists = [];
    for (let i = 0; i < messages.length; i++) emailLists.push(addressesOn(messages[i]));
    let judgeAt = -1;
    if (typeof FlowGoogleCloses !== 'undefined' && FlowGoogleCloses.messageToJudge) {
      judgeAt = FlowGoogleCloses.messageToJudge(emailLists, ownEmail);
    } else {
      for (let i = emailLists.length - 1; i >= 0; i--) {
        const sender = (emailLists[i] && emailLists[i][0]) || '';
        if (sender && sender.toLowerCase() === ownEmail.toLowerCase()) continue;
        judgeAt = i;
        break;
      }
    }
    const message = judgeAt >= 0 ? messages[judgeAt] : null;
    if (!message) {
      logScanSkip('', 'no-incoming-message');
      return; // own mail to someone else, or no message we can tell apart from one
    }

    const stable = stableMessageKey(message);
    const legacyId = stable.legacy || null;

    // A stale Feature 3 hover card is otherwise left floating in
    // document.body: it's appended independent of the chip's own DOM
    // subtree, so it doesn't get cleaned up just because Gmail replaces the
    // message node it was hovering over when the user opens a new thread.
    const messageChanged = !currentContext || currentContext.message !== message;
    if (messageChanged && typeof FlowSidebar !== 'undefined') FlowSidebar.hideFloatingCard();

    // Refreshed on every pass, independent of the chip early-returns below —
    // Draft-It and Next-Step act on "whatever thread is open", not on
    // whether this particular message cleared the judgment threshold.
    currentContext = {
      message, messages,
      sender: extractSender(message),
      subject: currentSubject(),
      legacyId,
      messageId: stable.messageId,
      threadUrl: threadUrl(legacyId)
    };
    // Only worth re-checking when the message actually being looked at
    // changed — a new thread opened, or this one reopened after Gmail tore
    // its nodes down — not on every debounced mutation inside a thread
    // that's already open, which fires far more often than the underlying
    // pending set could possibly have changed.
    if (messageChanged) {
      const openedThread = threadIdFrom(message);
      if (openedThread) {
        FlowStorage.forgetStillOpenScan(openedThread)
          .catch((e) => console.error('[Glance] failed to drop an inbox snapshot after the thread was opened', e));
      }
      checkContextualResurface(messages, currentContext.messageId);
    }
    // Attachment summaries are a Glance Pro feature (see applyProState()).
    if (proActive) wireAttachmentHoverCards(message);

    // A live chip already sitting in this exact node means there is nothing
    // to do — this is the fast path that avoids re-running judgment on every
    // debounced mutation while a chip is already showing. A needs-you card is
    // the exception: the requirement may have shown up since the last look,
    // so that card is rebuilt at most once a minute.
    const chainHost = message.querySelector('.flow-chip-host[data-glance-chain="needs-you"]');
    if (chainHost) {
      const last = Number(chainHost.getAttribute('data-checked-at') || 0);
      if (Date.now() - last < 60000) return;
      chainHost.remove();
    } else if (message.querySelector('.flow-chip-host[data-glance-verifying]')) {
      // The read-back is still open. A later pass offers Do It if it fails.
    } else if (message.querySelector('.flow-chip-host')) {
      void noteSuggestShown(currentContext && currentContext.messageId);
      logScanSkip(stable.messageId, 'chip-present');
      return;
    }

    const messageId = stable.messageId;
    openSuggest = null;
    if (!messageId) {
      logScanSkip('', 'no-message-id');
      return;
    }
    if (!chromeLive()) return;

    // The open mail's own Do It, every step. A task row from another
    // message in this thread is not this mail, and a card left in the DOM
    // by the previous content-script world was already removed.
    const laneRecord = await readLaneUndo(stable.legacy || messageId, stable.laneIds);
    if (!chromeLive()) return;
    if (laneRecord && laneRecord.steps && laneRecord.steps.length && message.isConnected && !message.querySelector('.flow-chip-host')) {
      mountLaneReceipt(message, laneRecord, messageId);
      logScanSkip(messageId, 'lane-receipt');
      return;
    }

    // A message can reach "seen" with no live chip in front of you two very
    // different ways: you dismissed it, or Gmail rebuilt the DOM out from
    // under it. Those call for opposite responses, so the check below asks
    // "did the user ever take a final action on this message" rather than
    // "have we looked at this message before" — see hasTerminalOutcome for
    // why "seen" alone used to make a rebuilt node's chip unrecoverable.
    // A Still Open card closed from the inbox snapshot uses scan:<threadId>
    // as its id, because the inbox row does not carry the open message's
    // id. Once this thread is actually open, that decision covers the
    // message too — otherwise Do It here would write the same close again.
    // An inbox snapshot is one thread id. It covers the single open message
    // that snapshot was. A newer message in the same thread is a different
    // mail and keeps its own card.
    const openedThreadId = threadIdFrom(message);
    if (messages.length === 1 && openedThreadId && await FlowStorage.hasTerminalOutcome('scan:' + openedThreadId)) {
      await FlowStorage.markAlreadyClosed(messageId);
    }
    // A proved Google Task stays on the thread after Gmail rebuilds this
    // node (reload, or inbox and back). Activity already has the row.
    // Mount that receipt again when fetchedBack is true, or when the row
    // is the 0.9.28 triple (system, externalId, verifiedAt) written only
    // after a read-back. A newer undo or dismiss does not come back.
    // Other writers still stop at the terminal check below.
    const settled = await FlowStorage.get();
    const taskQuery = { messageIds: stable.messageIds, threadIds: stable.threadIds };
    const taskRow = (typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.taskReceiptFromLog)
      ? FlowProofOfClose.taskReceiptFromLog(settled && settled.log, taskQuery)
      : null;
    const taskDecision = (typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.scanReceiptDecision)
      ? FlowProofOfClose.scanReceiptDecision({
        log: settled && settled.log,
        messageIds: stable.messageIds,
        threadIds: stable.threadIds,
        hasHost: false,
        terminal: !!(FlowStorage.hasTerminalOutcomeFrom && FlowStorage.hasTerminalOutcomeFrom(settled, messageId))
      })
      : (taskRow ? 'mount' : 'silent');
    if (taskRow && taskDecision === 'mount') {
      // One receipt for the thread. The pass above already mounted it when
      // the legacy id or the thread id matched. Do not add a second banner
      // on a different message in the same thread.
      const already = main.querySelector('.flow-chip-host[data-glance-chain="task-proof"]');
      if (!already && message.isConnected && !message.querySelector('.flow-chip-host')) {
        mountProvedTaskReceipt(message, taskRow);
      }
      logScanSkip(messageId, 'task-receipt');
      return;
    }
    if (typeof FlowStorage.verifyGateFrom === 'function' && FlowStorage.verifyGateFrom(settled, messageId) === 'verifying') {
      if (!message.querySelector('[data-glance-verifying]')) {
        const host = document.createElement('div');
        host.className = 'flow-chip-host';
        stampHost(host);
        host.setAttribute('data-glance-verifying', '1');
        const label = document.createElement('span');
        label.className = 'flow-chip-label';
        label.textContent = 'Verifying…';
        host.appendChild(label);
        if (message.firstChild) message.insertBefore(host, message.firstChild);
        else message.appendChild(host);
      }
      logScanSkip(messageId, 'verifying');
      return;
    }
    if (FlowStorage.hasTerminalOutcomeFrom(settled, messageId)) {
      const verifying = message.querySelector('.flow-chip-host[data-glance-verifying]');
      if (verifying) verifying.remove();
      if (message.isConnected && !message.querySelector('.flow-chip-host')) {
        const late = await readLaneUndo(stable.legacy || messageId, stable.laneIds);
        if (late && late.steps && late.steps.length) mountLaneReceipt(message, late, messageId);
      }
      logScanSkip(messageId, 'terminal-outcome');
      return;
    }
    const verifyingHost = message.querySelector('.flow-chip-host[data-glance-verifying]');
    if (verifyingHost) verifyingHost.remove();

    // ownMessageText (not a bare .innerText) both guards against Gmail
    // detaching or replacing this exact node between the synchronous work
    // above and this line (the awaits above this point yield back to the
    // event loop — a crash here would violate this file's own "never
    // crash, just stop showing the chip" contract) and — the actual point
    // of the "quoted text" fix — never lets a long quoted contract sitting
    // below a one-line "Sounds good!" reply count toward "is there enough
    // new content to judge" in the first place.
    let text = ownMessageText(message);
    const attachmentsEarly = allRealAttachments(message);
    // A note to yourself can be only a subject line. The subject is the note.
    if (text.length < 20 && typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.selfSent === 'function') {
      const early = extractSender(message);
      const noteSubject = currentSubject();
      const earlyAud = noteAddressedToSelf(message, early.email, ownEmail, audienceOf(message, ownEmail));
      if (FlowIncomingJudge.selfSent({
        sender: early,
        ownAddresses: ownEmail ? [ownEmail] : [],
        to: earlyAud.to,
        cc: earlyAud.cc,
        headerToSelf: headerToSelf(message, ownEmail, early.email)
      })) {
        text = FlowIncomingJudge.textForJudge(text, noteSubject, true);
        // A short subject plus a real attachment is still the note — "חוזה
        // חתום" is a filename topic, not a completion that silences save.
        const sub = String(noteSubject || '').replace(/\s+/g, ' ').trim();
        if (sub && attachmentsEarly.length && text.length < 20) text = sub;
      }
    }
    // A fact ask can be one short Hebrew sentence ("מה הסכום בגיליון?").
    // The 20-character floor stays for everything else — this does not
    // lower the scorer, it only lets a fully-formed fact ask through.
    const factProbe = (text.length >= 12 && typeof FlowFactReply !== 'undefined') ? FlowFactReply.detect(text) : null;
    const contactProbe = (typeof FlowGoogleContacts !== 'undefined' && typeof FlowGoogleContacts.recognize === 'function')
      ? FlowGoogleContacts.recognize(text)
      : { kind: 'ignore' };
    if (text.length < 20 && !factProbe && !attachmentsEarly.length && contactProbe.kind !== 'clear') {
      logScanSkip(messageId, 'short-text');
      return; // still rendering, or genuinely nothing new was written
    }

    // Seen-ids stay a "we already looked at this message" mark, including
    // when personal-close memory stays quiet below. The 'shown' row is a
    // separate question, answered from the log itself at inject time: a
    // silence return never writes that row, so clearing close memory can
    // still record the first real chip.
    await FlowStorage.markSeen(messageId);

    state = await FlowStorage.get();

    // The action-planning pipeline below only ever writes to Google
    // (Calendar, Gmail, Tasks) — Notion/HubSpot/Salesforce/Slack/Monday.com
    // are the MVP-paused connectors (connectors.js's mvp:true filter
    // already limits onboarding to Google Tasks only, and background.js's
    // WRITERS/UNDOERS entries for the others exist purely so a direct API
    // caller isn't broken, not because the live chip still routes to them).
    // A stored connectorId left over from one of those — most commonly an
    // old manual Notion connect from before this MVP cut, which still
    // reports as "connected" in the popup's status pill — used to dead-end
    // classification right here with no way back short of the Setup tab.
    // It no longer does: this is now treated exactly like "not onboarded"
    // and handed to ensureGoogleAutoConnect() below, which silently
    // upgrades the account to Google (overwriting the stale connectorId)
    // the moment it can, using the same one-time grant either path takes.

    const sender = extractSender(message);
    const subject = currentSubject();
    const threadId = threadIdFrom(message);
    let audience = noteAddressedToSelf(message, sender.email, ownEmail, audienceOf(message, ownEmail));

    // Opt-in local trace. chrome.storage.local.glanceDebug === true, unset
    // by default. One read per scan. Never sent off-device. A storage miss
    // leaves the trace off and does not stop the scan.
    let debug = false;
    try {
      const debugBag = await chrome.storage.local.get('glanceDebug');
      debug = !!(debugBag && debugBag.glanceDebug === true);
    } catch (e) {
      debug = false;
    }

    // Classification (intent.js) -> Decision (actions.js) -> Execution
    // (background.js's writer functions, dispatched by step.kind). This
    // file only ever sits at the two ends of that chain: it hands intent.js
    // the raw text, hands actions.js the classified Intent, and later hands
    // background.js one step at a time — it never re-derives what "this is
    // a request" or "this should become a Calendar event" means. A fact
    // ask is the one exception: FlowFactReply may replace that intent with
    // one Sheet cell or Doc paragraph, or stay quiet. It does not replace
    // a Drive / Doc / Sheet close.
    const attachments = allRealAttachments(message);
    const attachment = attachments[0] || null;
    openSuggest = {
      messageId: messageId,
      text: text,
      inbound: String((sender && sender.email) || '').toLowerCase() !== String(ownEmail || '').toLowerCase(),
      attachments: attachments.map((meta) => ({
        id: meta.url || meta.filename,
        name: meta.filename,
        filename: meta.filename,
        contentType: meta.mimeType || '',
        size: Number(meta.size)
      }))
    };
    let chosenAttachment = attachment;
    let intent = await classifyForChip(text, {
      senderEmail: sender.email,
      senderName: sender.name,
      subject: subject,
      calibration: state.calibration,
      calibrationByType: state.calibrationByType,
      attachmentCount: attachments.length,
      messageId: messageId,
      debug: debug,
      to: audience.to,
      cc: audience.cc,
      ownAddresses: ownEmail ? [ownEmail] : [],
      userName: audience.userName || null,
      ownNames: ownNamesForChip(audience.userName),
      namesPending: namesWaitDone ? false : readerNamesNotCached(audience.userName),
      namesWaitDone: namesWaitDone === true,
      inbound: String((sender && sender.email) || '').toLowerCase() !== String(ownEmail || '').toLowerCase()
    });
    // Reply-with-facts. Only when Google is already connected, so the chip
    // appears after one Sheet cell or Doc paragraph actually matched.
    // No match → silence, including over a generic reply chip. A meeting
    // or a dated commitment keeps its own close. The scorer threshold is
    // not involved.
    const usingGoogle = state.onboarded && state.connectorId === 'googleTasks';
    const factAsk = factProbe || ((typeof FlowFactReply !== 'undefined') ? FlowFactReply.detect(text) : null);
    const factOwns = typeof FlowFactReply !== 'undefined' && FlowFactReply.ownsClose(factAsk, intent, usingGoogle);
    if (factOwns) {
      let match;
      if (factLookupCache.has(messageId)) match = factLookupCache.get(messageId);
      else {
        match = await resolveReplyFact(factAsk);
        factLookupCache.set(messageId, match);
        if (factLookupCache.size > 40) factLookupCache.delete(factLookupCache.keys().next().value);
      }
      intent = FlowFactReply.apply(intent, factAsk, { connected: true, match });
    }
    // The free, local, fixed-pattern classifier found nothing — not the
    // same thing as "there was nothing here." It's a regex corpus, tuned
    // hardest for English; a plainly real request or commitment in Hebrew
    // (or any phrasing its patterns never anticipated) reads the same as
    // an actual non-decision unless something else looks harder. That's
    // what this is: one remote attempt, only ever reached when the local
    // pass already gave up, sending only privacy-masked text (see
    // ensureRemoteClassification). Silent either way if it also finds
    // nothing, times out, or the backend isn't configured — same "just
    // don't show a chip" contract the local path already follows.
    // Names are not cached yet. No card, and this is not a quiet. The
    // line on the mail is names-pending. The storage listener judges
    // the open mail again once userinfo or the account button lands a
    // name. The hold lasts at most 2s. After that the same mail is
    // judged with whatever names are known, including none.
    if (intent && intent.namesPending) {
      paintNamesPending(message, messageId, subject);
      armNamesHold();
      logScanSkip(messageId, 'names-pending');
      return;
    }
    if (namesWaitDone && message && message.setAttribute) {
      message.setAttribute('data-glance-names', intent && intent.type ? 'offer' : 'quiet');
      releaseNamesPending(message);
    }
    const localFired = Boolean(intent.type);
    // A local 'low' is a decision to stay quiet, not a miss. A named quiet
    // (noise, hedge, family, calibrated, google) is the same decision.
    // The remote router is only for when the local pass found nothing at
    // all — it must not be asked to overturn a silence. A fact ask Glance
    // already owned is not sent out to be reclassified into a generic reply.
    if (REMOTE_CLASSIFY && !intent.type && !intent.quiet && !intent.googleSilence && !factOwns) intent = await ensureRemoteClassification(text) || intent;
    // Item 4's real-usage telemetry — the empirical answer to "how often is
    // the free local pass actually enough, how often does the one remote
    // fallback rescue what it missed, how often does nothing fire at all,"
    // replacing hand-written test sentences as the improvement signal for
    // future corpus work. Fire-and-forget, same as the calibrate() calls
    // just above/below this function — never blocks showing (or not
    // showing) the chip on a diagnostic-only write. Counts and a message id
    // only, no text, no sender — see storage.js's recordClassificationOutcome
    // for the dedup rule that keeps a re-scanned open message from being
    // counted twice.
    FlowStorage.recordClassificationOutcome(messageId, localFired ? 'local' : (intent.type ? 'ai' : 'miss'));
    const inboundMail = String((sender && sender.email) || '').toLowerCase() !== String(ownEmail || '').toLowerCase();
    // A new empty Google Doc, Sheet or Slides deck asked for by name ("Can you create a shared doc called
    // Q4 launch plan?"). The worker decides and only when the owner's switch WORKSPACE_FILE is on (off by
    // default); otherwise nothing here changes. It is the canonical Do It card with the existing step list.
    if (inboundMail && usingGoogle && await showFullDocumentChip(message, { messageId, stable, legacyId, threadId, sender, subject, text, intent })) return;
    if (inboundMail && usingGoogle && await showGoogleContactsChip(message, { messageId, stable, legacyId, threadId, sender, subject, text, intent })) return;
    if (inboundMail && usingGoogle && await showEventLinkChip(message, { messageId, stable, legacyId, threadId, sender, subject, text, intent })) return;
    if (inboundMail && usingGoogle && await showRecurringChip(message, { messageId, stable, legacyId, threadId, sender, subject, text, intent })) return;
    if (inboundMail && usingGoogle && await showNewFileChip(message, { messageId, stable, legacyId, threadId, sender, subject, text, intent })) return;
    const inboundAsk = inboundMail && text.length >= 20
      && /\b(?:can you|could you|would you|please send|send me|any chance you could)\b/i.test(text);
    const inboundHeAsk = inboundMail && text.length >= 12
      && /(?:תשמור|לשמור|שמור|תעלה|להעלות|בדרייב|ב-?דרייב|drive|save|upload)/i.test(text);
    const inboundAttachAsk = inboundMail && attachments.length > 0 && inboundHeAsk;
    const audienceNeedsProbe = audienceUnclear(message, sender.email, ownEmail, audience);
    const attachKeep = selfMailAttachmentKeepCard(message, sender.email, ownEmail, audience, attachments);
    if (attachKeep && (!intent || !intent.type) && String(subject || '').trim()) {
      intent = await classifyForChip(String(subject || '').trim(), {
        senderEmail: sender.email,
        senderName: sender.name,
        subject: subject,
        calibration: state.calibration,
        calibrationByType: state.calibrationByType,
        attachmentCount: attachments.length,
        messageId: messageId,
        debug: debug,
        to: audience.to,
        cc: audience.cc,
        ownAddresses: ownEmail ? [ownEmail] : [],
        userName: audience.userName || null,
        ownNames: ownNamesForChip(audience.userName),
        namesPending: namesWaitDone ? false : readerNamesNotCached(audience.userName),
        namesWaitDone: namesWaitDone === true,
        inbound: false
      });
    }
    if (!FlowIntent.shouldShowChip(intent) && !(audienceNeedsProbe && (inboundAsk || inboundAttachAsk)) && !attachKeep) {
      clearGmailWhy(message);
      // Named silence only. An ordinary miss stays the classification
      // counter above — it is not given a reason it did not earn.
      const reason = (typeof FlowQuietMetrics !== 'undefined' && FlowQuietMetrics.reasonFor(intent))
        || (factOwns && !intent.type ? 'fact' : null);
      logScanSkip(messageId, reason || 'no-chip-candidate');
      recordSilence(messageId, reason, {
        family: intent.closeFamily || intent.quiet,
        clocks: (String(text).match(/\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:am|pm)\b/gi) || []).join(' ').slice(0, 80),
        debug: debug
      });
      return;
    }
    // Collapsed headers hide To vs Cc. Open Gmail's details at most once per
    // message, only after a real chip candidate exists, then close the box.
    if (audienceNeedsProbe && (FlowIntent.shouldShowChip(intent) || inboundAsk || inboundAttachAsk || attachKeep)) {
      audience = await audienceAfterDetailsProbe(messageId, message, sender.email, ownEmail, audience);
      if (audienceUnclear(message, sender.email, ownEmail, audience)) {
        logScanSkip(messageId, 'audience');
        recordSilence(messageId, 'audience');
        return;
      }
      intent = await classifyForChip(text, {
        senderEmail: sender.email,
        senderName: sender.name,
        subject: subject,
        calibration: state.calibration,
        calibrationByType: state.calibrationByType,
        attachmentCount: attachments.length,
        messageId: messageId,
        debug: debug,
        to: audience.to,
        cc: audience.cc,
        ownAddresses: ownEmail ? [ownEmail] : [],
        userName: audience.userName || null,
        ownNames: ownNamesForChip(audience.userName),
        namesPending: namesWaitDone ? false : readerNamesNotCached(audience.userName),
        namesWaitDone: namesWaitDone === true,
        inbound: String((sender && sender.email) || '').toLowerCase() !== String(ownEmail || '').toLowerCase()
      });
      if (intent && intent.namesPending) {
        paintNamesPending(message, messageId, subject);
        armNamesHold();
        logScanSkip(messageId, 'names-pending');
        return;
      }
      if (!FlowIntent.shouldShowChip(intent) && !attachKeep) {
        const reason = (typeof FlowQuietMetrics !== 'undefined' && FlowQuietMetrics.reasonFor(intent))
          || (factOwns && !intent.type ? 'fact' : null);
        logScanSkip(messageId, reason || 'audience-reclassify');
        recordSilence(messageId, reason || 'audience', {
          family: intent.closeFamily || intent.quiet,
          clocks: (String(text).match(/\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:am|pm)\b/gi) || []).join(' ').slice(0, 80),
          debug: debug
        });
        return;
      }
    }
    // The ask named OneDrive. This surface writes Drive. Stay quiet rather than save it there.
    if (intent.googleClose && intent.googleClose.target === 'onedrive') {
      logScanSkip(messageId, 'onedrive-target-on-gmail');
      recordSilence(messageId, 'onedrive-target-on-gmail');
      return;
    }

    // A file-shaped message that is not one clear object (two files, a
    // hedge, a "don't send") must not become a Do It. Other closes are
    // left alone — this only stops a REQUEST chip that would otherwise
    // offer to attach or draft around an unclear file.
    // A note the user sent to themself is already a task, with no draft
    // and no attach-to-invite track. The file chain does not take it.
    const selfSentTask = Boolean(intent && intent.selfTask);
    const fileGate = selfSentTask ? { kind: 'ignore' } : (typeof FlowFileAttach !== 'undefined' ? FlowFileAttach.gate(text) : { kind: 'ignore' });
    // A file asked onto an invite that already exists is the attach card
    // (task + short draft). The receipt chain does not own that ask.
    // The shared judge skips this silence when intent.inviteFile is set.
    const inviteAsked = Boolean(intent && intent.inviteFile);
    if (!inviteAsked && fileGate.kind === 'block' && intent.type === FlowIntent.TYPES.REQUEST) {
      const fileReason = fileGate.reason === 'third-party' ? 'third-party' : 'file';
      logScanSkip(messageId, fileReason);
      recordSilence(messageId, fileReason);
      return;
    }
    // A request that attests a payment (a receipt) takes more than one step.
    // The shared judge is the only receipt check on this page. A contract,
    // a quote, or a signed copy is a file to send, not that silence.
    if (!inviteAsked && !deadlineWasDropped(intent) && fileGate.kind === 'clear' && intent.type === FlowIntent.TYPES.REQUEST && typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.silencesReceipt === 'function' && FlowIncomingJudge.silencesReceipt(text)) {
      logScanSkip(messageId, 'file');
      recordSilence(messageId, 'file');
      return;
    }

    // Execution Memory is fetched once here, not once per process — which
    // process this message needs isn't known until after classification,
    // and actions.js's planFor() does the per-process lookup itself from
    // this same full blob.
    const executionMemory = await FlowExecutionMemory.getAll();

    // Same matter, already fully closed: stay quiet. Checked before the
    // Google connect prompt so a continuation never asks for access, and
    // before 'shown' is logged so it never becomes an open Brief row.
    if (await personalCloseSaysSilence(intent, threadId, subject)) {
      logScanSkip(messageId, 'memory');
      recordSilence(messageId, 'memory');
      return;
    }

    // The one moment this account is ever asked for Google access at all —
    // right here, after judgment has already found a real Do It moment on
    // screen, never before and never from a settings page. Covers both "not
    // onboarded yet" and "onboarded, but to a stale non-Google connectorId"
    // (see the comment above this function's earlier connectorId check) —
    // either way, the account isn't actually ready to write to Google, and
    // ensureGoogleAutoConnect() is the one path that can fix that silently.
    if (!usingGoogle && !(await ensureGoogleAutoConnect())) {
      logScanSkip(messageId, 'google-connect');
      return;
    }

    let attachFile = null;
    const invitePlan = (typeof FlowIntent !== 'undefined' && typeof FlowIntent.attachToInvitePlan === 'function')
      ? FlowIntent.attachToInvitePlan(text) : null;
    // A file onto an existing invite is the file-track card (task + short
    // draft) even when the file was not found. Never the needs-you banner.
    if (!invitePlan && !deadlineWasDropped(intent) && fileGate.kind === 'clear' && intent.type === FlowIntent.TYPES.REQUEST && !intent.googleClose && typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.silencesOwnedDeliverable === 'function' && FlowIncomingJudge.silencesOwnedDeliverable(text)) {
      logScanSkip(messageId, 'resolution');
      recordSilence(messageId, 'resolution');
      void flushSuggest(false);
      return;
    }
    if (!invitePlan && !deadlineWasDropped(intent) && fileGate.kind === 'clear' && intent.type === FlowIntent.TYPES.REQUEST && !intent.googleClose && typeof FlowFileAttach !== 'undefined') {
      const searched = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'flow:search-drive', query: FlowFileAttach.driveQuery(fileGate.ask.searchTerms || fileGate.ask.query) }, resolve);
      });
      if (searched && searched.reason === 'drive-search-unavailable') {
        logScanSkip(messageId, 'file');
        recordSilence(messageId, 'file');
        void flushSuggest(false);
        return;
      } else {
      // One resolver for every file ask the resolution planner does not own.
      // A template is not a file that was found. Mailbox-wide attachment
      // search is not connected (compose-only Gmail). Null Drive means the
      // search did not finish: stay quiet rather than say "not found".
      let chainSettled = false;
      if (typeof FlowCloseChains !== 'undefined') {
        let watching = null;
        try {
          const watches = await FlowStorage.getWatches();
          const open = (watches || []).find((w) => w && String(w.threadId) === String(threadId) && w.status === 'waiting' && w.requirement && w.requirement.kind);
          if (open) watching = { requirement: open.requirement };
        } catch (e) { watching = null; }
        const threadFiles = attachments.map((meta) => ({ id: meta.url || meta.filename, name: meta.filename, filename: meta.filename }));
        const chain = FlowCloseChains.resolve({
          text,
          origin: 'gmail',
          now: Date.now(),
          lang: glanceUiLanguage(),
          watching,
          evidence: FlowCloseChains.fileEvidence({
            driveOk: Boolean(searched && searched.ok),
            driveFiles: (searched && searched.files) || [],
            threadFiles
          })
        });
        if (chain && chain.move === 'needs-you') {
          if (!(await gmailComposeApiAllowedFromStorage())) {
            logScanSkip(messageId, 'compose-closed');
            recordSilence(messageId, 'file');
            chainSettled = true;
          } else {
            injectNeedsYou(message, {
              messageId, intent, sender, subject, attachment, attachments,
              threadUrl: threadUrl(legacyId), threadId, bodyText: text, chain
            });
            watchCopiedOnly(message, messageId, text, ownEmail, audience);
            return;
          }
        }
        if (chain && (chain.move === 'watch' || chain.reason === 'conflict' || chain.reason === 'unclear')) {
          logScanSkip(messageId, 'file-chain');
          recordSilence(messageId, 'file');
          return;
        }
        if (chain && chain.move === 'prepare' && chain.hit && chain.hit.file && chain.hit.source === 'drive') {
          attachFile = chain.hit.file;
          chainSettled = true;
        } else if (chain && chain.move === 'prepare' && chain.hit && chain.hit.file && chain.hit.source === 'thread') {
          const match = attachments.find((meta) => meta.filename && chain.hit.file.name && meta.filename === chain.hit.file.name);
          if (match) { chosenAttachment = match; chainSettled = true; }
        }
      }
      if (!chainSettled) {
        const decision = FlowFileAttach.decide(fileGate.ask, searched && searched.ok ? searched.files : null, {
          senderName: sender.name,
          amount: intent.entities && intent.entities.amount,
          when: intent.entities && intent.entities.when
        }, text);
        // No single file, and no single template: stay quiet. A conflict
        // is the same silence — never a second guess, never a blank doc.
        // A create-from-template is not a found file, so it is not offered
        // once the close chain already said the file is missing.
        if (!decision || decision.action === 'silence' || decision.action === 'create') {
          logScanSkip(messageId, 'file-attach');
          recordSilence(messageId, 'file');
          return;
        }
        attachFile = decision.file;
      }
      }
    }

    const planned = planOpenMail(text, {
      intent: intent,
      threadUrl: threadUrl(legacyId),
      hasThreadAttachment: Boolean(chosenAttachment) || Boolean(attachFile),
      executionMemory: executionMemory,
      attachFile: attachFile
    });
    let process = planned && planned.process;
    if (!process) {
      logScanSkip(messageId, 'no-process');
      void flushSuggest(false);
      return;
    }
    // A reply draft is saved in the thread by its id. With no thread id and
    // no compose window open, that step cannot be kept, so it is not offered.
    if (!threadId && !composeBodyOpen()) {
      const kept = process.steps.filter((step) => !(step && step.kind === 'gmailDraft'));
      if (kept.length !== process.steps.length) {
        if (!kept.length) {
          logScanSkip(messageId, 'thread-id');
          void flushSuggest(false);
          recordSilence(messageId, 'thread-id');
          return;
        }
        process = Object.assign({}, process, { steps: kept });
      }
    }

    injectChip(message, {
      messageId, legacyMessageId: legacyId || null, messageIds: stable.messageIds, laneIds: stable.laneIds, intent, process, sender, subject, attachment: chosenAttachment, attachments,
      threadUrl: threadUrl(legacyId),
      threadId: threadId,
      // Snapshotted now, not re-read from the DOM at click time — by the
      // time "Do It" is clicked the chip's own ctx has no live node
      // reference to this message, and Gmail may have long since rebuilt or
      // removed it anyway.
      bodyText: text,
      executionMemory: executionMemory,
      app: 'gmail'
    });
    watchCopiedOnly(message, messageId, text, ownEmail, audience);
    // Re-injecting after Gmail rebuilds the node is now expected behaviour,
    // not a rare edge case — logging 'shown' again every time would fill the
    // 200-entry cap with duplicates for one message and evict real history
    // for others. Dedup against the log, not the seen-id set: silence marks
    // a message seen without a 'shown' row, and that row is what the Brief
    // actually reads.
    const shownAlready = (state.log || []).some((entry) => entry && entry.kind === 'shown' && entry.messageId === messageId);
    if (!shownAlready) {
      // The extra fields below (process/threadUrl/sender/subject/intent) are
      // what let the Morning Brief re-run Do It / Dismiss on this exact
      // process later, without this message node — or even this tab — still
      // existing. Every field is already a plain value at this point (no
      // DOM references, nothing that depends on the live node), the same
      // snapshot discipline injectChip's own ctx already follows.
      FlowStorage.appendLog({
        kind: 'shown', label: activityLabel({ intent: intent, process: process, bodyText: text }), messageId, score: intent.signals.score, signals: intent.signals,
        process: { id: process.id, name: process.name, steps: process.steps },
        threadUrl: threadUrl(legacyId), threadId: threadId, sender, subject,
        intent: compactIntent(intent),
        // Which app this process was noticed in — see this file's own
        // SOURCE_APP constant. getPending()'s entries (and everything built
        // on them: the Brief panel, the popup's Open tab, the badge count)
        // are already source-agnostic, so a future host content script only
        // has to stamp its own SOURCE_APP value here to plug into the same
        // engine, not change the engine itself.
        app: SOURCE_APP
      });
      chrome.runtime.sendMessage({ type: 'flow:track', event: 'chip_shown', params: { domain: state.domainId } });
      checkBrief();
    }
  }

  function hashNode(node) {
    const s = (node?.innerText || '').slice(0, 120);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 'h' + h;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (cls && String(cls).indexOf('flow-chip-host') >= 0) stampHost(n);
    return n;
  }

  // The sentence that sits above the step list, saying what Glance is
  // ABOUT TO DO — generated from intent.entities (the same who/what/when/
  // amount fields every one of the 5 intent.js types normalizes onto) and
  // keyed by process.id, not intent.type, so the sentence always matches
  // the actual process actions.js chose (schedule-confirm vs. plain
  // schedule reads differently, even though both come from
  // SCHEDULED_EVENT). "You intend — we execute": this used to ask a
  // question ("detected a meeting?", inviting confirmation of a guess) —
  // it now states what's about to close, declaratively, because that is
  // the entire point of the redesign: the system is not offering to help
  // you decide, it is telling you what it is closing. Originally written
  // in Hebrew (a deliberate choice at the time — see this file's git
  // history) and translated to English to match the receipt, the Brief,
  // the Weekly Summary, the popup, and everything else in the product,
  // which were never Hebrew: a user used to read this sentence in one
  // language and the "Closed —" receipt in another.
  //
  // Returns the sentence WITHOUT the "Glance" prefix — injectChip() renders
  // that separately as a styled brand mark (loop mark + gradient wordmark),
  // so this function only ever has to answer "what is about to happen,"
  // not "how should the brand name look."
  function closingSentence(process, intent) {
    const e = intent.entities || {};
    const when = e.when ? ', ' + e.when : '';
    const amount = e.amount ? ', ' + e.amount : '';
    const g = intent && intent.googleClose;
    if (g && (process.id === 'create-missing' || process.id === 'file-it' || process.id === 'file-on-hold' || process.id === 'file-on-task')) {
      return g.lang === 'he' ? g.cardLineHe : g.cardLine;
    }
    switch (process.id) {
      case 'hold':
        return 'is putting this on your calendar' + when + '.';
      case 'clear-it':
        return 'is taking this off your calendar' + when + '.';
      case 'move-it':
        return 'is moving this on your calendar' + when + '.';
      case 'schedule-confirm':
        return 'is scheduling the meeting' + when + ', drafting a reply to confirm, and opening a follow-up task.';
      case 'schedule':
        return 'is scheduling the meeting' + when + ' and opening a reminder to prepare.';
      case 'reply-track': {
        const draft = (process.steps || []).find((step) => step.kind === 'gmailDraft');
        const foundName = draft && draft.params && draft.params.attachSource === 'found' && draft.params.driveFileName;
        if (foundName) {
          const alsoTask = (process.steps || []).some((step) => step.kind === 'googleTask');
          return 'is attaching ' + foundName + ' to a reply draft' + (alsoTask ? ' and opening a follow-up task.' : '.');
        }
        return 'is drafting a reply to the request' + when + ' and opening a follow-up task.';
      }
      case 'reply-fact':
        return e.factValue
          ? 'is putting ' + e.factValue + ' into a reply draft.'
          : 'is putting that fact into a reply draft.';
      case 'follow-through':
        return 'is opening a reminder for your commitment' + when + amount + ', with a reply ready.';
      default: // log-it
        return 'is logging the decision' + amount + when + '.';
    }
  }

  // The card's one brand signature: a small closed-loop mark (a ring with the
  // tick that shuts it) ahead of the gradient-text "Glance" — the same blue
  // family the Do It button's own ring/shell already use, not a new palette, and
  // confined to a single word rather than a page-level gradient wash. It says
  // "closed", not "intelligent": docs/product-identity.md.
  function loopMark() {
    const svg = svgEl('svg', { viewBox: '0 0 16 16', class: 'flow-chip-mark', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { cx: '8', cy: '8', r: '5.6' }));
    svg.appendChild(svgEl('path', { d: 'M5.3 8.2 L7.2 10.1 L10.8 6.2' }));
    return svg;
  }

  // Small monochrome line icons, one per action kind — built via the SVG
  // DOM API (never innerHTML: every other element in this file is built the
  // same way, via el()'s textContent, specifically so nothing here ever
  // needs a markup-injection code path at all, even for content that's
  // static and this file's own). stroke uses currentColor, so a pill's own
  // text color is the icon's color for free — no separate palette to keep
  // in sync.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function actionIcon(kind) {
    const svg = svgEl('svg', { viewBox: '0 0 16 16', class: 'flow-chip-action-icon', 'aria-hidden': 'true' });
    if (kind === 'calendar') {
      svg.appendChild(svgEl('rect', { x: 2, y: 3, width: 12, height: 11, rx: 2 }));
      svg.appendChild(svgEl('line', { x1: 2, y1: 6.5, x2: 14, y2: 6.5 }));
      svg.appendChild(svgEl('line', { x1: 5, y1: 1.5, x2: 5, y2: 4.5 }));
      svg.appendChild(svgEl('line', { x1: 11, y1: 1.5, x2: 11, y2: 4.5 }));
    } else if (kind === 'gmailDraft') {
      svg.appendChild(svgEl('rect', { x: 2, y: 3.5, width: 12, height: 9, rx: 1.5 }));
      svg.appendChild(svgEl('polyline', { points: '2.5,4 8,9 13.5,4' }));
    } else if (kind === 'driveDoc' || kind === 'driveSheet' || kind === 'driveFile') {
      svg.appendChild(svgEl('path', { d: 'M4 1.5 H9 L12.5 5 V14.5 H4 Z' }));
      svg.appendChild(svgEl('polyline', { points: '9,1.5 9,5 12.5,5' }));
    } else { // googleTask
      svg.appendChild(svgEl('rect', { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2.5 }));
      svg.appendChild(svgEl('polyline', { points: '5,8.2 7,10.2 11,5.8' }));
    }
    return svg;
  }

  // content-gmail.js can't open a chrome.windows popup itself — that API
  // isn't exposed to content scripts — so opening the Drive picker means
  // asking background.js to do it, then waiting for the result to come back
  // as its own message (the picker is a separate window the user interacts
  // with for as long as they like, not something a single request/response
  // round-trip can represent). resolves null on cancel, on a background.js
  // failure (e.g. the picker API key isn't configured yet), or if the
  // picker window is closed without picking anything.
  //
  // The one gap that pattern doesn't cover on its own: background.js's
  // pendingDrivePickers map (the record of which requestId belongs to which
  // Gmail tab) lives only in the service worker's memory. MV3 kills an idle
  // service worker after a short window with no activity — entirely
  // plausible while the user is just browsing folders in the picker with no
  // messages passing through background.js — and a restart silently empties
  // that map. picker.js still posts its result and still closes itself
  // either way, so the window closing looks like nothing went wrong; but
  // deliverDrivePickerResult() then finds no matching entry and treats it as
  // "already delivered, or the tab is gone" (its own comment's other two
  // cases), so flow:drive-file-result never arrives here. Without a bound,
  // this promise — and the "Opening Drive…" chip that awaits it, disabled
  // the whole time — would hang forever, exactly the "user gets stuck" this
  // product treats as unacceptable everywhere else. DRIVE_PICKER_TIMEOUT_MS
  // is generous enough to never fire on a real pick (minutes, not seconds)
  // and simply resolves null — the same outcome an explicit cancel already
  // produces — rather than inventing a new, scarier failure state for what
  // is, from the user's side, indistinguishable from having closed the
  // window themselves.
  const DRIVE_PICKER_TIMEOUT_MS = 10 * 60 * 1000;
  let drivePickerSeq = 0;
  const pendingDrivePickerResolvers = new Map(); // requestId -> resolve(file|null)

  function openDrivePicker() {
    const requestId = 'dp_' + Date.now() + '_' + (++drivePickerSeq);
    return new Promise((resolve) => {
      const settle = (result) => {
        if (!pendingDrivePickerResolvers.has(requestId)) return; // already settled via the other path
        pendingDrivePickerResolvers.delete(requestId);
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => settle(null), DRIVE_PICKER_TIMEOUT_MS);
      pendingDrivePickerResolvers.set(requestId, settle);
      chrome.runtime.sendMessage({ type: 'flow:open-drive-picker', payload: { requestId } }, (response) => {
        if (response && response.ok) return; // the real result arrives later via flow:drive-file-result
        settle(null);
      });
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'flow:still-open-do-it' && msg.messageId) {
      runStillOpenDoIt(msg.messageId);
      return;
    }
    if (msg && msg.type === 'flow:still-open-show') {
      chrome.storage.local.remove('glanceStillOpenOpenBrief');
      FlowStorage.getStillOpen()
        .then((open) => dropHandledMails(open))
        .then((open) => { if (open.length) openBriefPanel(open); })
        .catch((e) => console.error('[Glance] failed to open Still Open from the notification', e));
      return;
    }
    if (!msg || msg.type !== 'flow:drive-file-result') return;
    // settle() itself guards against a requestId that's already gone (the
    // open-ack failure path, or DRIVE_PICKER_TIMEOUT_MS already firing) and
    // does its own map cleanup — no separate get/delete needed here.
    const settle = pendingDrivePickerResolvers.get(msg.requestId);
    if (settle) settle(msg.cancelled ? null : (msg.file || null));
  });

  // The attachment-choice row under the gmailDraft pill: one chip per real
  // thread attachment (so the user can pick which one when there's more
  // than one — this is the disambiguation surface, not a blocking prompt),
  // plus a chip that opens the Drive picker as an alternative source.
  // Mutates action.params directly — buildActionPayload() below reads
  // whatever was last selected, defaulting to the thread's first attachment
  // when the user never opens this row at all (the ordinary, one-attachment
  // Zero-Prompt path this pill already handled before Drive existed).
  function buildAttachChooser(action, ctx) {
    const attachments = ctx.attachments && ctx.attachments.length ? ctx.attachments : (ctx.attachment ? [ctx.attachment] : []);

    const row = el('div', 'flow-chip-attach-row');
    row.setAttribute('dir', 'ltr');

    const chips = [];
    function selectChip(chosen) {
      for (const c of chips) c.setAttribute('aria-pressed', String(c === chosen));
    }

    attachments.forEach((meta, i) => {
      const chip = el('button', 'flow-chip-attach-chip', meta.filename || 'Attachment');
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(i === 0));
      chips.push(chip);
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        action.params.driveFileId = null;
        action.params.selectedAttachment = meta;
        selectChip(chip);
      });
      row.appendChild(chip);
    });

    if (typeof FlowBuild !== 'undefined' && FlowBuild.PICKER_BUNDLED) {
      const driveChip = el('button', 'flow-chip-attach-chip flow-chip-attach-drive', attachments.length ? 'Choose from Drive instead' : 'Attach from Drive');
      driveChip.type = 'button';
      driveChip.setAttribute('aria-pressed', 'false');
      chips.push(driveChip);
      driveChip.addEventListener('click', async (e) => {
        e.stopPropagation();
        const prevLabel = driveChip.textContent;
        driveChip.textContent = 'Opening Drive…';
        driveChip.disabled = true;
        const picked = await openDrivePicker();
        driveChip.disabled = false;
        if (!picked) { driveChip.textContent = prevLabel; return; }
        action.params.selectedAttachment = null;
        action.params.driveFileId = picked.id;
        action.params.driveFileName = picked.name;
        action.params.driveMimeType = picked.mimeType;
        driveChip.textContent = 'Drive: ' + picked.name;
        selectChip(driveChip);
      });
      row.appendChild(driveChip);
    }

    return row;
  }

  // Create-when-missing. One line, and either up to four named fields or
  // one named slot at a time when more than four facts are still missing.
  // There is no free prompt. Dismiss, or an answer that isn't the fact,
  // removes the card and does not create a file.
  // The file (or the fact, the day, the approval, the answer) is not in any
  // connected source. The card names what is missing and where Glance looked.
  // The button drafts a holding reply and opens a promise. It is not the close
  // chip: that one stays "Do It". Nothing is sent, and the receipt does not
  // say the loop is handled.
  function injectNeedsYou(messageNode, ctx) {
    void flushSuggest(true);
    if (messageNode.querySelector('.flow-chip-host')) return;
    const chain = ctx.chain || {};
    const card = chain.card || {};
    const he = glanceUiHebrew();
    const host = el('div', 'flow-chip-host');
    host.setAttribute('data-glance-chain', 'needs-you');
    host.setAttribute('data-checked-at', String(Date.now()));
    host.setAttribute('dir', he ? 'auto' : 'ltr');
    const textEl = el('p', 'flow-chip-text');
    textEl.appendChild(loopMark());
    textEl.appendChild(el('span', 'flow-chip-brand', 'Glance'));
    if (card.lead) {
      textEl.appendChild(document.createTextNode(' ' + card.lead));
      const object = el('span', null, card.object || '');
      object.setAttribute('data-glance-user', 'object');
      textEl.appendChild(object);
      textEl.appendChild(document.createTextNode(card.tail || '.'));
      const rest = [card.searched, card.why, card.skipped].filter(Boolean).join(' ');
      if (rest) textEl.appendChild(document.createTextNode(' ' + rest));
    } else {
      textEl.appendChild(document.createTextNode(' ' + [card.line, card.searched, card.why, card.skipped].filter(Boolean).join(' ')));
    }
    if (he) textEl.setAttribute('dir', 'auto');
    host.appendChild(textEl);

    const cardCtx = Object.assign({}, ctx, {
      process: { id: 'reply-track', name: 'Reply & Track', steps: [] }
    });
    const mainRow = el('div', 'flow-chip-main-row');
    mainRow.setAttribute('dir', 'ltr');
    const dismiss = el('button', 'flow-chip-dismiss', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', glanceChrome().dismiss);
    dismiss.addEventListener('click', (e) => { e.stopPropagation(); onDismiss(host, cardCtx); });
    mainRow.appendChild(dismiss);
    const chip = el('button', 'flow-chip');
    chip.type = 'button';
    chip.appendChild(el('span', 'shell'));
    chip.appendChild(el('span', 'ring'));
    chip.appendChild(el('span', 'shine'));
    chip.appendChild(el('span', 'flow-chip-do-label', glanceChrome().holdingReply));
    mainRow.appendChild(chip);
    host.appendChild(mainRow);

    let busy = false;
    chip.addEventListener('click', async () => {
      if (busy) return;
      const holding = chain.holding && chain.holding.text;
      if (!holding || !ctx.sender || !ctx.sender.email) {
        setChipState(chip, 'flow-chip-error', 'Needs an address');
        return;
      }
      busy = true;
      setChipState(chip, 'flow-chip-pending', 'Working…');
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'flow:follow-draft',
          payload: { to: ctx.sender.email, toName: ctx.sender.name, subject: ctx.subject, body: holding }
        }, resolve);
      });
      if (!res || !res.ok) {
        setChipState(chip, 'flow-chip-error', reasonMessage(res, ctx));
        busy = false;
        return;
      }
      if (typeof FlowFollowUp !== 'undefined' && chain.promise && chain.promise.ask && ctx.threadId) {
        const watch = FlowFollowUp.buildWatch({
          ask: chain.promise.ask,
          threadId: ctx.threadId,
          messageId: ctx.messageId,
          subject: ctx.subject,
          counterpart: { email: ctx.sender.email, name: ctx.sender.name || null },
          channel: 'gmail',
          now: Date.now()
        });
        watch.requirement = chain.requirement;
        await FlowStorage.upsertWatch(watch);
      }
      const done = el('div', 'flow-chip flow-chip-done');
      done.setAttribute('role', 'status');
      done.appendChild(el('span', 'flow-chip-label', glanceChrome().draftReadyNotSent));
      const undo = el('button', 'flow-chip-undo', glanceChrome().undo);
      undo.type = 'button';
      undo.addEventListener('click', async (e) => {
        e.stopPropagation();
        const undone = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'flow:undo-action', connectorId: 'gmailDraft', ref: res.ref }, resolve);
        });
        if (undone && undone.ok && ctx.threadId && typeof FlowStorage.updateWatch === 'function') {
          await FlowStorage.updateWatch(ctx.threadId, { status: 'stopped', resolvedBy: 'undo' });
        }
        if (undone && undone.ok) host.remove();
      });
      done.appendChild(undo);
      host.replaceChildren(done);
    });
    messageNode.insertBefore(host, messageNode.firstChild);
  }

  function injectCreateCard(messageNode, ctx) {
    if (messageNode.querySelector('.flow-chip-host')) return;
    const ask = ctx.ask;
    const decision = ctx.decision;
    let fields = (decision.fields || []).map((field) => ({ id: field.id, label: field.label, value: field.value || '' }));

    const host = el('div', 'flow-chip-host');
    host.setAttribute('dir', 'ltr');
    const textEl = el('p', 'flow-chip-text');
    textEl.appendChild(loopMark());
    textEl.appendChild(el('span', 'flow-chip-brand', 'Glance'));
    textEl.appendChild(document.createTextNode(' ' + (decision.line || ask.line)));
    host.appendChild(textEl);
    const fieldsHost = el('div', 'flow-chip-fields');
    host.appendChild(fieldsHost);

    const action = { id: 'draft', kind: 'gmailDraft', label: 'Draft reply + file', params: {} };
    const cardCtx = Object.assign({}, ctx, {
      process: {
        id: 'reply-track',
        name: 'Reply & Track',
        closedLine: 'Drafted, with the file attached.',
        steps: [action]
      }
    });

    const mainRow = el('div', 'flow-chip-main-row');
    mainRow.setAttribute('dir', 'ltr');
    const dismiss = el('button', 'flow-chip-dismiss', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', glanceChrome().dismiss);
    dismiss.addEventListener('click', (e) => { e.stopPropagation(); onDismiss(host, cardCtx); });
    mainRow.appendChild(dismiss);

    const chip = el('button', 'flow-chip');
    chip.type = 'button';
    chip.appendChild(el('span', 'shell'));
    chip.appendChild(el('span', 'ring'));
    chip.appendChild(el('span', 'shine'));
    chip.appendChild(el('span', 'flow-chip-do-label', glanceChrome().doIt));
    mainRow.appendChild(chip);
    host.appendChild(mainRow);

    function paint() {
      fieldsHost.replaceChildren();
      const view = FlowFileAttach.present(fields);
      for (const field of view.filled || []) {
        fieldsHost.appendChild(el('p', 'flow-chip-field-line', field.label + ': ' + field.value));
      }
      const slots = view.mode === 'slots' && view.slot ? [view.slot] : (view.mode === 'card' ? view.slots : []);
      for (const slot of slots) {
        const row = el('label', 'flow-chip-field');
        row.appendChild(el('span', 'flow-chip-field-label', slot.label));
        const input = el('input', 'flow-chip-field-input');
        input.type = 'text';
        input.name = slot.id;
        input.setAttribute('aria-label', slot.label);
        input.maxLength = 160;
        input.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          chip.click();
        });
        row.appendChild(input);
        fieldsHost.appendChild(row);
      }
    }

    let busy = false;
    async function onCreate() {
      if (busy) return;
      const view = FlowFileAttach.present(fields);
      let step;
      if (view.mode === 'slots') {
        const input = fieldsHost.querySelector('input');
        step = FlowFileAttach.fillSlot(fields, view.slot.id, input ? input.value : '');
      } else if (view.mode === 'card') {
        const values = {};
        fieldsHost.querySelectorAll('input').forEach((input) => { values[input.name] = input.value; });
        step = FlowFileAttach.fillAll(fields, values);
      } else {
        step = { ready: true, fields };
      }
      if (step.silence) { onDismiss(host, cardCtx); return; }
      if (step.stay) return;
      fields = step.fields || fields;
      const ready = step.ready || (step.present && step.present.mode === 'ready');
      if (!ready) { paint(); return; }
      busy = true;
      action.params = {
        what: ask.label,
        templateId: decision.template.id,
        copyTitle: FlowFileAttach.copyTitle(ask, fields),
        fields: fields.map((field) => ({ id: field.id, label: field.label, value: field.value })),
        attachSource: 'template'
      };
      setChipState(chip, 'flow-chip-pending', 'Working…');
      const results = await runActionsSequentially([action], cardCtx);
      await showMultiActionReceipt(host, chip, cardCtx, results);
    }

    chip.addEventListener('click', () => { onCreate(); });
    paint();
    messageNode.insertBefore(host, messageNode.firstChild);
  }

  // Zero-Prompt, deliberately: the idle card is one process badge, one
  // sentence, and one button. actions.js already picked exactly one named
  // process (never a loose action list) — when it has more than one step,
  // that shows up as a quiet "N steps" toggle next to Do It, not a row of
  // pills sitting open competing with the button for attention. Do It
  // always closes the full process either way; opening the toggle is
  // purely for someone who wants to look before confirming, or prune one
  // step out — a real control, not the headline of the interaction.
  function readSlotFills(host) {
    const fills = {};
    host.querySelectorAll('[data-slot]').forEach((input) => {
      const name = input.getAttribute('data-slot');
      const value = String(input.value || '').trim();
      if (name && value) fills[name] = value.slice(0, 200);
    });
    return fills;
  }

  // Fields when at most four slots are missing. The checklist opens only
  // when more than four are still empty, and it only names those slots.
  function mountGoogleDetail(host, ctx) {
    const old = host.querySelector('.flow-chip-slots');
    if (old) old.remove();
    const g = ctx.intent && ctx.intent.googleClose;
    if (!g || typeof FlowGoogleCloses === 'undefined' || g.copyAttachment) {
      delete host.dataset.collectorOpen;
      return;
    }
    const plan = FlowGoogleCloses.cardPlan(g);
    host.dataset.glanceMode = plan.mode;
    if (plan.chat) host.dataset.collectorOpen = '1';
    else delete host.dataset.collectorOpen;
    if (plan.mode === 'ready') return;
    const box = el('div', 'flow-chip-slots');
    if (plan.mode === 'fields') {
      for (const name of plan.fields) {
        const label = el('label', 'flow-chip-field');
        label.appendChild(el('span', 'flow-chip-field-name', name));
        const input = el('input', 'flow-chip-field-input');
        input.type = 'text';
        input.setAttribute('data-slot', name);
        input.setAttribute('aria-label', name);
        input.maxLength = 200;
        label.appendChild(input);
        box.appendChild(label);
      }
    } else if (plan.chat) {
      const heading = (plan.chatLine || '').indexOf('חסר') === 0 ? 'חסר' : 'Still needed';
      box.appendChild(el('p', 'flow-chip-slot-line', heading));
      const list = el('ul', 'flow-chip-slot-list');
      for (const name of plan.chatSlots || []) {
        list.appendChild(el('li', 'flow-chip-slot-item', name));
      }
      box.appendChild(list);
      const input = el('input', 'flow-chip-slot-reply');
      input.type = 'text';
      input.setAttribute('aria-label', plan.chatLine || heading);
      const first = (plan.chatSlots || [])[0] || '';
      input.placeholder = first ? (first + ':') : '';
      input.maxLength = 400;
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
        applySlotTurn(host, ctx, input.value);
      });
      box.appendChild(input);
    }
    const main = host.querySelector('.flow-chip-main-row');
    if (main) host.insertBefore(box, main);
    else host.appendChild(box);
  }

  function applySlotTurn(host, ctx, reply) {
    const g = ctx.intent && ctx.intent.googleClose;
    if (!g) return;
    const result = FlowGoogleCloses.acceptTurn(g, reply, Number(host.dataset.slotTurns || '0'));
    if (result.ignore) return;
    if (result.silence) {
      host.remove();
      return;
    }
    g.filled = result.filled;
    g.missing = result.missing;
    g.chat = result.mode === 'chat';
    host.dataset.slotTurns = String(result.turns);
    mountGoogleDetail(host, ctx);
  }

  function clearGmailWhy(messageNode) {
    if (!messageNode || !messageNode.querySelectorAll) return;
    const nodes = messageNode.querySelectorAll('.flow-why-not');
    for (let i = nodes.length - 1; i >= 0; i--) {
      try { nodes[i].remove(); } catch (e) { /* already gone */ }
    }
  }

  function paintGmailWhy(messageNode, reason, text) {
    if (!messageNode || (messageNode.querySelector && messageNode.querySelector('.flow-chip-host'))) return;
    let line = messageNode.querySelector ? messageNode.querySelector('.flow-why-not') : null;
    if (line && line.getAttribute('data-glance-why') === reason && line.textContent === text) return;
    if (!line) {
      line = document.createElement('p');
      line.className = 'flow-why-not';
      messageNode.appendChild(line);
    }
    line.className = 'flow-why-not';
    line.textContent = text;
    line.setAttribute('data-glance-why', reason || 'names-pending');
  }

  function paintAccountReconnectRow(messageNode, messageId, subject) {
    if (!messageNode) return;
    const he = glanceUiHebrew();
    const line = he ? 'לא הצלחתי לאמת את החשבון — יש להתחבר מחדש. לא נכתב דבר.' : "Couldn't verify the account — reconnect Google. Nothing was written.";
    paintGmailWhy(messageNode, 'account-unverified', line);
    if (messageNode.querySelector('.flow-chip-reconnect')) return;
    const btn = el('button', 'flow-chip-reconnect', glanceShow(glanceUiCopy('reconnect')));
    btn.type = 'button';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = he ? 'מתחבר…' : 'Connecting…';
      sendRuntime({ type: 'flow:google-reconnect', account: '' }).then((res) => {
        if (res && res.ok) {
          btn.remove();
          paintGmailWhy(messageNode, 'account-unverified', he ? 'החיבור התחדש. רענן Gmail.' : 'Reconnected. Refresh Gmail.');
          return;
        }
        btn.disabled = false;
        btn.textContent = glanceShow(glanceUiCopy('reconnect'));
      }).catch(() => {
        btn.disabled = false;
        btn.textContent = glanceShow(glanceUiCopy('reconnect'));
      });
    });
    messageNode.appendChild(btn);
    if (typeof FlowStorage === 'undefined' || typeof FlowStorage.set !== 'function') return;
    FlowStorage.set({
      glanceWhyCurrent: {
        reason: 'account-unverified',
        subject: subject || '',
        messageId: messageId || null,
        at: Date.now()
      }
    }).catch(() => {});
  }

  function paintNamesPending(messageNode, messageId, subject) {
    const lang = glanceUiLang();
    const line = (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.namesPendingLine === 'function')
      ? FlowDisplay.namesPendingLine(lang)
      : (lang === 'he' ? 'ממתין לשם' : 'Waiting for your name');
    paintGmailWhy(messageNode, 'names-pending', line);
    if (typeof FlowStorage === 'undefined' || typeof FlowStorage.set !== 'function') return;
    FlowStorage.set({
      glanceWhyCurrent: {
        reason: 'names-pending',
        subject: subject || '',
        messageId: messageId || null,
        at: Date.now()
      }
    }).catch(() => {});
  }

  function stampInviteDraft(host, ctx) {
    if (!host || !ctx || !ctx.intent || !ctx.intent.inviteFile) return;
    const steps = (ctx.process && ctx.process.steps) || [];
    let body = '';
    let title = '';
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || !step.params) continue;
      if ((step.kind === 'gmailDraft' || step.kind === 'outlookDraft') && step.params.body) body = String(step.params.body);
      if ((step.kind === 'googleTask' || step.kind === 'googleTasks' || step.kind === 'task') && step.params.title) title = String(step.params.title);
    }
    if (title) host.setAttribute('data-glance-task', title);
    if (!body) return;
    host.setAttribute('data-glance-draft', body);
    const note = el('p', 'flow-chip-draft', body);
    host.appendChild(note);
  }

  function appendCardWhen(host, ctx, lang) {
    if (!host || typeof FlowDisplay === 'undefined' || typeof FlowDisplay.holdClockFrom !== 'function') return;
    const clock = FlowDisplay.holdClockFrom(ctx);
    if (!clock || !clock.dateIso) return;
    const hold = ctx.process && (ctx.process.id === 'hold' || ctx.process.id === 'schedule' || ctx.process.id === 'schedule-confirm' || ctx.process.id === 'clear-it' || ctx.process.id === 'move-it');
    let line = '';
    if (hold && typeof FlowDisplay.holdWhenLine === 'function') line = FlowDisplay.holdWhenLine(clock.dateIso, clock.hour, clock.minute, lang);
    else if (typeof FlowDisplay.cardDateLine === 'function') line = FlowDisplay.cardDateLine(clock.dateIso, lang);
    if (!line) return;
    const node = el('p', 'flow-chip-when', line);
    node.setAttribute('data-glance-when', line);
    host.appendChild(node);
  }

  // A full quote/proposal Doc in the person's writing style (switch FULL_DOCUMENT_CLOSE, off).
  // One Do It creates the Doc for preview; Glance never sends mail.
  async function showFullDocumentChip(message, c) {
    try {
      const st = await FlowStorage.get();
      if (!(st && st.glanceSwitches && st.glanceSwitches.FULL_DOCUMENT_CLOSE === true)) return false;
    } catch (e) { return false; }
    const lang = mailLanguage({ bodyText: c.text });
    let styleSummary = null;
    try {
      if (typeof FlowStyle !== 'undefined' && FlowStorage.getStyleProfile) {
        styleSummary = FlowStyle.summary(await FlowStorage.getStyleProfile(), lang);
      }
    } catch (e) { styleSummary = null; }
    const template = await readCompanyTemplate();
    let plan = null;
    try {
      plan = await sendRuntime(Object.assign({
        type: 'flow:google-full-document-plan',
        text: String(c.subject || '').trim() ? c.subject + '. ' + c.text : c.text,
        lang: lang,
        styleSummary: styleSummary,
        companyTemplate: template
      }, laneAccountContext()));
    } catch (e) { plan = null; }
    if (!plan || plan.action !== 'offer' || !plan.built || plan.built.blank) return false;
    const he = lang === 'he';
    const title = (plan.built && plan.built.title) || (plan.googleClose && plan.googleClose.templateName) || 'Document';
    const process = {
      id: 'full-document',
      name: title,
      closingLine: plan.cardLine,
      closedLine: he ? 'המסמך מוכן לעיון — לא נשלח.' : 'Document ready to preview — not sent.',
      steps: [{
        id: 'full-doc',
        kind: 'driveDoc',
        label: 'Doc',
        hint: he ? 'יוצר מסמך מלא ב-Drive לעיון' : 'Create the full document in Drive for preview',
        dependsOn: null,
        params: { title: title }
      }]
    };
    const intent = Object.assign({}, c.intent, {
      label: plan.cardLine || title,
      type: (c.intent && c.intent.type) || 'request',
      googleClose: plan.googleClose || null
    });
    injectChip(message, {
      messageId: c.messageId, legacyMessageId: c.legacyId || null, messageIds: c.stable.messageIds, laneIds: c.stable.laneIds,
      intent: intent, process: process, sender: c.sender, subject: c.subject, attachment: null, attachments: [],
      threadUrl: threadUrl(c.legacyId), threadId: c.threadId, bodyText: c.text, executionMemory: {}, app: 'gmail',
      googleBuilt: plan.built, previewOnly: true
    });
    const shownAlready = (state.log || []).some((entry) => entry && entry.kind === 'shown' && entry.messageId === c.messageId);
    if (!shownAlready) {
      FlowStorage.appendLog({
        kind: 'shown', label: plan.cardLine || title, messageId: c.messageId, score: (c.intent && c.intent.signals && c.intent.signals.score) || 0, signals: (c.intent && c.intent.signals) || {},
        process: { id: process.id, name: process.name, steps: process.steps },
        threadUrl: threadUrl(c.legacyId), threadId: c.threadId, sender: c.sender, subject: c.subject,
        intent: compactIntent(intent), app: SOURCE_APP
      });
      userContextEvent({ type: 'shown', partyKey: userContextParty({ sender: c.sender }), intentFamily: (plan.googleClose && plan.googleClose.artifact) || 'full-document', at: new Date().toISOString() });
    }
    return true;
  }

  // A Meet link added to an event the person already organizes ("Can you add a Meet link to the Thursday sync?").
  // The worker decides (flow:google-event-link-plan, only with the switch EVENT_CALL_LINK on) and reads the
  // calendar; the page shows the canonical Do It card with a one-step list, or nothing.
  // Google Contacts (G8): answer with an address or forward to a named person. The worker
  // searches People API when GOOGLE_CONTACTS is on; the page fills compose only, never sends.
  async function showGoogleContactsChip(message, c) {
    let plan = null;
    try {
      plan = await sendRuntime(Object.assign({
        type: 'flow:google-contacts-plan',
        text: c.text,
        choiceIndex: typeof c.choiceIndex === 'number' ? c.choiceIndex : undefined
      }, laneAccountContext()));
    } catch (e) { plan = null; }
    if (!plan || plan.action === 'off' || plan.action === 'silence') return false;
    if (plan.action === 'not-found') {
      if (!message.querySelector('.flow-chip-contact-miss')) {
        const miss = el('p', 'flow-chip-contact-miss', plan.line || '');
        miss.setAttribute('role', 'status');
        message.insertBefore(miss, message.firstChild);
      }
      return true;
    }
    if (plan.action === 'choose' && Array.isArray(plan.candidates) && plan.candidates.length > 1) {
      if (message.querySelector('.flow-chip-contact-choose')) return true;
      const host = el('div', 'flow-chip-contact-choose');
      host.setAttribute('role', 'group');
      host.appendChild(el('p', 'flow-chip-contact-choose-q', plan.line || ''));
      const row = el('div', 'flow-chip-contact-choose-row');
      plan.candidates.slice(0, 6).forEach((rowCand, idx) => {
        const btn = el('button', 'flow-chip-contact-pick', (rowCand.displayName || rowCand.address || '').trim());
        btn.type = 'button';
        btn.addEventListener('click', () => {
          host.replaceWith(el('span', 'flow-chip-contact-pick-wait', '…'));
          void showGoogleContactsChip(message, Object.assign({}, c, { choiceIndex: idx }));
        });
        row.appendChild(btn);
      });
      host.appendChild(row);
      message.insertBefore(host, message.firstChild);
      return true;
    }
    if (plan.action !== 'offer' || !plan.email || !plan.mode) return false;
    const stepKind = plan.mode === 'forward' ? 'googleContactForward' : 'googleContactAnswer';
    const process = {
      id: 'google-contact',
      name: plan.title || plan.line,
      closingLine: plan.line || plan.title,
      closedLine: plan.lang === 'he' ? 'מוכן בטיוטה. אתה שולח.' : 'Ready in compose. You send it.',
      steps: [{
        id: 'compose',
        kind: stepKind,
        label: 'Compose',
        hint: plan.lang === 'he' ? 'מילוי טיוטה בגימייל — לא נשלח' : 'Fill Gmail compose — nothing is sent',
        dependsOn: null,
        params: {
          mode: plan.mode,
          email: plan.email,
          displayName: plan.displayName || plan.name,
          name: plan.name,
          lang: plan.lang
        }
      }]
    };
    const intent = Object.assign({}, c.intent, { label: plan.title || plan.line, type: (c.intent && c.intent.type) || 'request' });
    injectChip(message, {
      messageId: c.messageId, legacyMessageId: c.legacyId || null, messageIds: c.stable.messageIds, laneIds: c.stable.laneIds, intent: intent, process: process, sender: c.sender, subject: c.subject, attachment: null, attachments: [],
      threadUrl: threadUrl(c.legacyId), threadId: c.threadId, bodyText: c.text, executionMemory: {}, app: 'gmail'
    });
    const shownAlready = (state.log || []).some((entry) => entry && entry.kind === 'shown' && entry.messageId === c.messageId);
    if (!shownAlready) {
      const logSteps = process.steps.map((step) => {
        if (!step || !step.params) return step;
        const hash = typeof FlowGoogleContacts !== 'undefined' && typeof FlowGoogleContacts.contactLogHash === 'function'
          ? FlowGoogleContacts.contactLogHash(step.params.email)
          : '';
        return Object.assign({}, step, {
          params: { mode: step.params.mode, lang: step.params.lang, contactHash: hash }
        });
      });
      FlowStorage.appendLog({
        kind: 'shown', label: plan.title || plan.line, messageId: c.messageId, score: (c.intent && c.intent.signals && c.intent.signals.score) || 0, signals: (c.intent && c.intent.signals) || {},
        process: { id: process.id, name: process.name, steps: logSteps },
        threadUrl: threadUrl(c.legacyId), threadId: c.threadId, sender: c.sender, subject: c.subject,
        intent: compactIntent(intent), app: SOURCE_APP
      });
    }
    return true;
  }

  async function showEventLinkChip(message, c) {
    let plan = null;
    try {
      // The body only: a subject like "Sync notes" must not steer which event is picked.
      plan = await sendRuntime(Object.assign({ type: 'flow:google-event-link-plan', text: c.text }, laneAccountContext()));
    } catch (e) { plan = null; }
    if (!plan || plan.action !== 'offer' || !plan.event || !plan.event.id) return false;
    const he = plan.lang === 'he';
    const process = {
      id: 'event-call-link',
      name: plan.event.summary || 'Meet link',
      closingLine: plan.line,
      closedLine: he ? 'נוסף קישור Meet לאירוע.' : 'Meet link added to the event.',
      steps: [{
        id: 'link',
        kind: 'calendarCallLink',
        label: 'Calendar',
        hint: (plan.steps && plan.steps[0] && plan.steps[0].label) || 'Create a Meet link on the event and read it back',
        dependsOn: null,
        params: { event: plan.event }
      }]
    };
    const intent = Object.assign({}, c.intent, { label: plan.line, type: (c.intent && c.intent.type) || 'request' });
    injectChip(message, {
      messageId: c.messageId, legacyMessageId: c.legacyId || null, messageIds: c.stable.messageIds, laneIds: c.stable.laneIds, intent: intent, process: process, sender: c.sender, subject: c.subject, attachment: null, attachments: [],
      threadUrl: threadUrl(c.legacyId), threadId: c.threadId, bodyText: c.text, executionMemory: {}, app: 'gmail'
    });
    const shownAlready = (state.log || []).some((entry) => entry && entry.kind === 'shown' && entry.messageId === c.messageId);
    if (!shownAlready) {
      FlowStorage.appendLog({
        kind: 'shown', label: plan.line, messageId: c.messageId, score: (c.intent && c.intent.signals && c.intent.signals.score) || 0, signals: (c.intent && c.intent.signals) || {},
        process: { id: process.id, name: process.name, steps: process.steps },
        threadUrl: threadUrl(c.legacyId), threadId: c.threadId, sender: c.sender, subject: c.subject,
        intent: compactIntent(intent), app: SOURCE_APP
      });
    }
    return true;
  }

  // A repeating commitment ("please send the sales report every Monday at 9:00") as one repeating reminder on the
  // calendar, no guest (switch RECURRING_REMINDER, off). The worker owns the switch; the page only shows what it offers.
  async function showRecurringChip(message, c) {
    // A meeting that repeats is the Hold It card's (RECURRING_HOLD), not a second reminder.
    if (c.intent && c.intent.type === 'event') return false;
    let plan = null;
    try {
      plan = await sendRuntime({ type: 'flow:google-recurring-plan', text: c.text });
    } catch (e) { plan = null; }
    if (!plan || plan.action !== 'offer' || !plan.title || !plan.rrule || !plan.when) return false;
    const he = plan.lang === 'he';
    const process = {
      id: 'recurring-reminder',
      name: plan.title,
      closingLine: plan.line,
      closedLine: he ? 'נקבעה תזכורת חוזרת ביומן.' : 'Repeating reminder added to your calendar.',
      steps: [{
        id: 'series',
        kind: 'calendarRecurring',
        label: 'Calendar',
        hint: (plan.steps && plan.steps[0] && plan.steps[0].label) || 'Create the repeating event and read it back (no guests)',
        dependsOn: null,
        params: { title: plan.title, rrule: plan.rrule, when: plan.when, destinationText: 'Calendar · ' + plan.title }
      }]
    };
    const intent = Object.assign({}, c.intent, { label: plan.line, type: (c.intent && c.intent.type) || 'request' });
    injectChip(message, {
      messageId: c.messageId, legacyMessageId: c.legacyId || null, messageIds: c.stable.messageIds, laneIds: c.stable.laneIds, intent: intent, process: process, sender: c.sender, subject: c.subject, attachment: null, attachments: [],
      threadUrl: threadUrl(c.legacyId), threadId: c.threadId, bodyText: c.text, executionMemory: {}, app: 'gmail'
    });
    const shownAlready = (state.log || []).some((entry) => entry && entry.kind === 'shown' && entry.messageId === c.messageId);
    if (!shownAlready) {
      FlowStorage.appendLog({
        kind: 'shown', label: plan.line, messageId: c.messageId, score: (c.intent && c.intent.signals && c.intent.signals.score) || 0, signals: (c.intent && c.intent.signals) || {},
        process: { id: process.id, name: process.name, steps: process.steps },
        threadUrl: threadUrl(c.legacyId), threadId: c.threadId, sender: c.sender, subject: c.subject,
        intent: compactIntent(intent), app: SOURCE_APP
      });
    }
    return true;
  }

  async function showNewFileChip(message, c) {
    let plan = null;
    try {
      plan = await sendRuntime({ type: 'flow:google-new-file-plan', text: String(c.subject || '').trim() ? c.subject + '. ' + c.text : c.text });
    } catch (e) { plan = null; }
    if (!plan || plan.action !== 'offer' || !plan.name || !plan.fileKind) return false;
    const he = plan.lang === 'he';
    const process = {
      id: 'new-file',
      name: plan.name,
      closingLine: plan.line,
      closedLine: plan.fileKind === 'form' ? (he ? 'נוצר ב-Google Forms.' : 'Created in Google Forms.') : (he ? 'נוצר ב-Drive.' : 'Created in Drive.'),
      steps: [{
        id: 'file',
        kind: 'driveNewFile',
        label: plan.fileKind === 'sheet' ? 'Sheet' : plan.fileKind === 'slides' ? 'Slides' : plan.fileKind === 'form' ? 'Form' : 'Doc',
        hint: (plan.steps && plan.steps[0] && plan.steps[0].label) || 'Create the file in Drive and read it back',
        dependsOn: null,
        params: { fileKind: plan.fileKind, name: plan.name, destinationText: (plan.fileKind === 'form' ? 'Forms · ' : 'Drive · ') + plan.name }
      }]
    };
    const intent = Object.assign({}, c.intent, { label: plan.name, type: (c.intent && c.intent.type) || 'request' });
    injectChip(message, {
      messageId: c.messageId, legacyMessageId: c.legacyId || null, messageIds: c.stable.messageIds, laneIds: c.stable.laneIds, intent: intent, process: process, sender: c.sender, subject: c.subject, attachment: null, attachments: [],
      threadUrl: threadUrl(c.legacyId), threadId: c.threadId, bodyText: c.text, executionMemory: {}, app: 'gmail'
    });
    const shownAlready = (state.log || []).some((entry) => entry && entry.kind === 'shown' && entry.messageId === c.messageId);
    if (!shownAlready) {
      FlowStorage.appendLog({
        kind: 'shown', label: plan.name, messageId: c.messageId, score: (c.intent && c.intent.signals && c.intent.signals.score) || 0, signals: (c.intent && c.intent.signals) || {},
        process: { id: process.id, name: process.name, steps: process.steps },
        threadUrl: threadUrl(c.legacyId), threadId: c.threadId, sender: c.sender, subject: c.subject,
        intent: compactIntent(intent), app: SOURCE_APP
      });
    }
    return true;
  }

  function injectChip(messageNode, ctx) {
    void flushSuggest(true);
    if (messageNode.querySelector('.flow-chip-host')) return;
    clearGmailWhy(messageNode);

    const lang = glanceUiLang();
    const host = el('div', 'flow-chip-host');
    host.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    host.setAttribute('lang', lang);

    // The process name as its own small, quiet label — "this is one named
    // thing Glance is closing," stated before the sentence explains what
    // that means, not left for the user to infer from a pile of pills.
    const face = (typeof FlowDisplay !== 'undefined' && FlowDisplay.cardFace)
      ? FlowDisplay.cardFace(ctx.process, ctx.intent, { bodyText: ctx.bodyText || '' })
      : { title: ctx.process.name, sentence: null, fileCard: false };
    let title = face.title || ctx.process.name;
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.cardTitle === 'function') title = FlowDisplay.cardTitle(lang, ctx, title);
    ctx.renderedTitle = title;
    host.appendChild(el('span', 'flow-chip-process-name', title));

    // loop mark + gradient "Glance" + the rest of the sentence as its own
    // text node — three children in that DOM order, mark first, right
    // before the brand name, same as before this was translated to
    // English (see closingSentence's own header comment for why it no
    // longer needs a dir="rtl" host).
    const textEl = el('p', 'flow-chip-text');
    textEl.appendChild(loopMark());
    textEl.appendChild(el('span', 'flow-chip-brand', 'Glance'));
    const sentence = face.fileCard ? '' : (face.sentence != null ? face.sentence : closingSentence(ctx.process, ctx.intent));
    if (sentence) textEl.appendChild(document.createTextNode(' ' + sentence));
    if (ctx.intent && ctx.intent.googleClose && ctx.intent.googleClose.lang === 'he') textEl.setAttribute('dir', 'auto');
    host.appendChild(textEl);

    // liveSteps is the mutable working copy Do It actually reads;
    // ctx.process.steps (what actions.js proposed) is left untouched so a
    // re-scan of this same message always starts from the full process
    // again, and so onDoIt can diff against it to tell Execution Memory
    // which steps were kept vs. stripped off.
    const liveSteps = ctx.process.steps.slice();
    const multi = ctx.process.steps.length > 1;
    const stepsReady = typeof FlowStepList !== 'undefined' && typeof FlowStepListView !== 'undefined';

    let pillRow = null;
    if (!stepsReady && multi) {
      pillRow = el('div', 'flow-chip-actions-row');
      pillRow.setAttribute('dir', 'ltr');
      pillRow.inert = true; // collapsed and non-interactive until the toggle opens it
      for (const step of ctx.process.steps) {
        let attachChooser = null;
        const pill = el('span', 'flow-chip-action-pill');
        pill.appendChild(actionIcon(step.kind));
        pill.appendChild(el('span', 'flow-chip-action-pill-label', step.label));
        if (step.hint) pill.title = step.hint;
        const x = el('button', 'flow-chip-action-pill-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Remove: ' + (step.hint || step.label));
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = liveSteps.indexOf(step);
          if (idx >= 0) liveSteps.splice(idx, 1);
          pill.remove();
          if (attachChooser) attachChooser.remove();
          // Zero steps left is a valid state, not a disabled one — Do It
          // still responds (as a dismiss; see onDoIt) rather than the
          // button going dead with no explanation.
        });
        pill.appendChild(x);
        pillRow.appendChild(pill);

        // Only the gmailDraft pill ever has a document to choose — and only
        // when it actually wants one. Google-ecosystem-only, same as every
        // other write path here: the choice is between this thread's own
        // attachment(s) and a single file picked from Drive, nothing else.
        if (step.kind === 'gmailDraft' && step.params && step.params.includeAttachment && !step.params.driveFileId) {
          attachChooser = buildAttachChooser(step, ctx);
          pillRow.appendChild(attachChooser);
        }
      }
    }

    const mainRow = el('div', 'flow-chip-main-row');
    mainRow.setAttribute('dir', 'ltr');

    if (multi && pillRow) {
      const stepCount = ctx.process.steps.length;
      const stepWords = glanceChrome();
      const stepsLabel = (typeof FlowDisplay !== 'undefined' && FlowDisplay.fillChrome)
        ? FlowDisplay.fillChrome(stepWords.steps || '{n} steps', { n: stepCount })
        : (stepCount + ' steps');
      const hideLabel = stepWords.hideSteps || 'Hide steps';
      const toggle = el('button', 'flow-chip-more-toggle', stepsLabel);
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanding = !host.classList.contains('flow-chip-expanded');
        host.classList.toggle('flow-chip-expanded', expanding);
        pillRow.inert = !expanding;
        toggle.setAttribute('aria-expanded', String(expanding));
        toggle.textContent = expanding ? hideLabel : stepsLabel;
      });
      mainRow.appendChild(toggle);
    }

    const dismiss = el('button', 'flow-chip-dismiss', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', glanceChrome().dismiss);
    dismiss.addEventListener('click', (e) => { e.stopPropagation(); onDismiss(host, ctx); });
    mainRow.appendChild(dismiss);

    const chip = el('button', 'flow-chip');
    chip.type = 'button';
    chip.appendChild(el('span', 'shell'));
    chip.appendChild(el('span', 'ring'));
    chip.appendChild(el('span', 'shine'));
    chip.appendChild(el('span', 'flow-chip-do-label', glanceChrome().doIt));
    chip.addEventListener('click', () => onDoIt(host, chip, ctx, liveSteps));
    mainRow.appendChild(chip);

    host.appendChild(mainRow);
    if (pillRow) host.appendChild(pillRow);
    if (stepsReady && typeof FlowStepKit !== 'undefined') {
      host.replaceChildren();
      const rows = FlowStepList.rowsFor(ctx.process, { memory: ctx.executionMemory, surface: 'gmail', lang: ctx.intent && ctx.intent.lang });
      host.__glanceSteps = FlowStepListView.mount(host, rows, {
        intent: title,
        lang: (ctx.intent && ctx.intent.lang) || (ctx.intent && ctx.intent.googleClose && ctx.intent.googleClose.lang),
        uiLang: lang,
        surface: 'gmail',
        dateChoices: ctx.process.dateChoices || null,
        onDateChoice: (iso) => {
          if (typeof FlowActions !== 'undefined' && FlowActions.chooseDate) FlowActions.chooseDate(ctx.process, iso);
          liveSteps.forEach((step) => {
            if (step && step.kind === 'calendar' && step.params) step.params.dateIso = iso;
          });
        },
        onDoIt: (button) => {
          if (button && button.disabled) return;
          if (ctx.process.needsDateChoice) return;
          onDoIt(host, button, ctx, liveSteps);
        },
        onDismiss: () => onDismiss(host, ctx),
        onChange: (next) => {
          const picked = FlowStepList.liveStepsFrom(next, 'gmail');
          liveSteps.length = 0;
          picked.forEach((step) => liveSteps.push(step));
        },
        onRetry: () => onDoIt(host, host.querySelector('button.flow-chip') || host.querySelector('.do-halo'), ctx, liveSteps)
      });
      const draft = ctx.process.steps.find((step) => step.kind === 'gmailDraft' && step.params && step.params.includeAttachment && !step.params.driveFileId);
      if (draft) host.appendChild(buildAttachChooser(draft, ctx));
      mountGoogleDetail(host, ctx);
      stampInviteDraft(host, ctx);
      appendCardWhen(host, ctx, lang);
      messageNode.insertBefore(host, messageNode.firstChild);
      return;
    }
    if (stepsReady) {
      const rows = FlowStepList.rowsFor(ctx.process, { memory: ctx.executionMemory, surface: 'gmail', lang: ctx.intent && ctx.intent.lang });
      const view = FlowStepListView.mount(host, rows, {
        uiLang: glanceUiLang(),
        onChange: (next) => {
          const picked = FlowStepList.liveStepsFrom(next, 'gmail');
          liveSteps.length = 0;
          picked.forEach((step) => liveSteps.push(step));
        },
        onRetry: () => onDoIt(host, chip, ctx, liveSteps)
      });
      host.__glanceSteps = view;
      const draft = ctx.process.steps.find((step) => step.kind === 'gmailDraft' && step.params && step.params.includeAttachment && !step.params.driveFileId);
      if (draft) host.appendChild(buildAttachChooser(draft, ctx));
    }
    mountGoogleDetail(host, ctx);
    stampInviteDraft(host, ctx);
    appendCardWhen(host, ctx, lang);

    messageNode.insertBefore(host, messageNode.firstChild);
  }

  function setChipState(chip, cls, text) {
    const shown = glanceShow(text);
    if (chip && chip.classList && (chip.classList.contains('do-halo') || (chip.closest && chip.closest('.flow-step-card')))) {
      chip.setAttribute('data-glance-chip-state', cls || '');
      if (shown) chip.setAttribute('data-glance-chip-label', shown);
      return;
    }
    chip.className = 'flow-chip ' + cls;
    chip.replaceChildren(el('span', 'flow-chip-label', shown));
  }

  function receiptProcessName(name) {
    if (!glanceUiHebrew() || typeof FlowDisplay === 'undefined' || typeof FlowDisplay.localizeHeading !== 'function') return name;
    return glanceShow(FlowDisplay.localizeHeading('he', name));
  }

  function reasonMessage(response, ctx) {
    return glanceShow(reasonMessageRaw(response, ctx));
  }

  function reasonMessageRaw(response, ctx) {
    if (!response) return 'Something went wrong. Try again.';
    if (response.reason === 'connector-not-live') return 'That action isn’t wired up yet.';
    if (response.reason === 'not-connected') return response.needsReconnect ? glanceUiCopy('reconnect') : glanceUiCopy('connect');
    if (response.reason === 'drive-not-granted') {
      return glanceUiHebrew()
        ? 'דרייב עדיין לא אושר. חבר מחדש את Google ואשר את Drive.'
        : 'Drive is not allowed yet. Reconnect Google and allow Drive.';
    }
    if (response.reason === 'attachment-unreadable') {
      return glanceUiHebrew()
        ? 'לא הצלחתי לקרוא את הקובץ המצורף מג׳ימייל, לכן לא נשמר דבר.'
        : 'Could not read the attachment from Gmail, so nothing was saved.';
    }
    if (response.reason === 'attachment-too-big') {
      return glanceUiHebrew()
        ? 'הקובץ גדול מ-4MB ולכן לא נשמר בדרייב.'
        : 'That file is over 4 MB, so it was not saved to Drive.';
    }
    if (response.reason === 'attachment-ambiguous') {
      return glanceUiHebrew()
        ? 'יש כמה קבצים מצורפים. פתח אחד ונסה שוב.'
        : 'More than one file is attached. Open one and try again.';
    }
    if (response.reason === 'unclear' && /file and time|time for this event/i.test(response.error || '')) return glanceUiCopy('calendar');
    if (response.reason === 'unclear') return response.error || 'Nothing was written.';
    if (response.reason === 'compose-closed') return response.error || 'Open Reply first. Glance does not press Send.';
    if (response.reason === 'user-edited') return glanceUiHebrew() ? glanceUiCopy('edited') : (response.error || glanceUiCopy('edited'));
    if (response.reason === 'unconfirmed') return response.error || response.written || "Couldn't confirm it's unchanged. Undo left it alone.";
    if (response.reason === 'range-edited') return glanceUiHebrew() ? glanceUiCopy('edited') : (response.error || 'Undo stopped. That text was edited, so nothing was deleted.');
    if (response.preview && response.reason === 'verify_failed') return response.error || 'The compose window is still empty.';
    if (response.reason === 'wrong-account' && !response.expected && response.error) return response.error;
    if (response.reason === 'account-unverified') return response.error || (glanceUiHebrew() ? 'לא הצלחתי לאמת את החשבון — יש להתחבר מחדש. לא נכתב דבר.' : "Couldn't verify the account — reconnect Google. Nothing was written.");
    if (response.reason === 'wrong-account') {
      return glanceUiHebrew()
        ? 'לא נסגר — האירוע נכתב ליומן של ' + (response.account || 'חשבון אחר') + ' ולא של ' + (response.expected || 'החשבון הפתוח') + '. הסרתי אותו.'
        : 'Not closed — the event went to the calendar of ' + (response.account || 'another account') + ', not ' + (response.expected || 'the open account') + '. Glance removed it.';
    }
    if (response.reason === 'list-missing') {
      return glanceUiHebrew()
        ? 'לא נסגר — רשימת המשימות ב-Google לא נמצאה. לא נכתבה משימה ולא נוצרה רשימה.'
        : 'Not closed — the Google Tasks list was not found. No task was written and no list was made.';
    }
    if (response.reason === 'unverified') {
      const what = response.object === 'event' ? (glanceUiHebrew() ? 'האירוע' : 'event') : (glanceUiHebrew() ? 'המשימה' : 'task');
      return glanceUiHebrew()
        ? 'לא אומת — Google עדיין לא החזיר את ' + what + '. הוא נשאר, ו-Undo מסיר אותו.'
        : 'Not verified — Google has not returned the ' + what + ' yet. It stays, and Undo removes it.';
    }
    if (response.reason === 'verify_failed') {
      const what = response.object === 'event' ? (glanceUiHebrew() ? 'האירוע' : 'event') : (glanceUiHebrew() ? 'המשימה' : 'task');
      const name = response.title ? ' "' + response.title + '"' : '';
      return glanceUiHebrew()
        ? 'לא נסגר — לא מצאתי את ' + what + name + ' ב-Google אחרי הכתיבה.'
        : 'Not closed — Glance could not find the ' + what + name + ' in Google after writing it.';
    }
    if (response.reason === 'proof_pending') {
      const event = response.object === 'event';
      if (glanceUiHebrew()) return event ? 'לא נסגר — האירוע לא אושר ביומן.' : (response.object === 'draft' ? 'לא נסגר — הטיוטה לא אושרה.' : 'לא נסגר — המשימה לא אושרה.');
      return event ? 'Not closed — the event was not confirmed.' : (response.object === 'draft' ? 'Not closed — the draft was not confirmed.' : 'Not closed — the task was not confirmed.');
    }
    if (response.reason === 'no-matching-contact') return 'No matching contact for ' + (ctx.sender.email || 'this sender') + '.';
    if (response.skipped) return glanceUiHebrew() ? 'דולג — שלב קודם בתהליך לא הושלם.' : 'Skipped — an earlier step in this process didn’t complete.';
    return response.error || 'Couldn’t complete that action.';
  }

  // btoa(String.fromCharCode(...bytes)) blows the call stack on anything but
  // small files — chunking keeps this working for a real attachment's size.
  function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  // Kept equal to background.js's own GMAIL_ATTACHMENT_MAX_BYTES — no reason
  // to download and base64-encode a file here that the write path would
  // reject anyway once it arrives; a large video or PDF attached to the
  // thread would otherwise freeze this fetch (and the base64 conversion)
  // for however long that download takes, for an attachment that was never
  // going anywhere.
  const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
  // core/google-drive.js refuses a file above this, so say so before the send.
  const DRIVE_SAVE_MAX_BYTES = 4 * 1024 * 1024;

  // download_url is an attribute Gmail's own rendering sets on a real
  // attachment chip (see findAttachmentChips below) — not something email
  // content can write into the DOM — but a credentialed fetch
  // (`credentials: 'include'`) carries the signed-in Gmail session, so this
  // stays a belt-and-suspenders check rather than trusting that assumption
  // unconditionally: only ever fetch a Google-hosted URL with the account's
  // own cookies attached.
  function isTrustedAttachmentUrl(url) {
    try {
      const h = new URL(url).hostname;
      return h === 'google.com' || h.endsWith('.google.com') || h === 'googleusercontent.com' || h.endsWith('.googleusercontent.com');
    } catch (e) {
      return false;
    }
  }

  // Best-effort, same policy as background.js's own findThreadId and
  // oversized-attachment handling: a failed fetch here means the draft is
  // still created, just without the attachment — never a failed action.
  async function fetchAttachmentBase64(meta) {
    if (!isTrustedAttachmentUrl(meta.url)) return null;
    const viaWorker = await sendRuntime({ type: 'flow:fetch-attachment', url: meta.url, maxBytes: ATTACHMENT_MAX_BYTES, expectMime: meta.mimeType }).catch(() => null);
    if (viaWorker && viaWorker.ok === true && viaWorker.base64) {
      return { filename: meta.filename, mimeType: meta.mimeType || viaWorker.mimeType, base64: viaWorker.base64 };
    }
    try {
      const res = await fetch(meta.url, { credentials: 'include' });
      if (!res.ok) return null;
      const gotType = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (gotType === 'text/html' && String(meta.mimeType || '').toLowerCase() !== 'text/html') return null;
      const declaredLength = Number(res.headers.get('content-length') || 0);
      if (declaredLength > ATTACHMENT_MAX_BYTES) return null;
      const buf = await res.arrayBuffer();
      // Content-Length can be absent or wrong; the actual byte count is the
      // real guard.
      if (buf.byteLength > ATTACHMENT_MAX_BYTES) return null;
      return { filename: meta.filename, mimeType: meta.mimeType, base64: arrayBufferToBase64(buf) };
    } catch (e) {
      return null;
    }
  }

  // Every real attachment on the message, deduped by URL (Gmail sometimes
  // renders more than one chip for the same file — inline preview plus the
  // download chip). This is what lets the gmailDraft pill offer a real
  // choice when a message has more than one attachment, instead of always
  // silently picking the first one.
  function allRealAttachments(messageNode) {
    const seen = new Set();
    const metas = [];
    for (const chip of findAttachmentChips(messageNode)) {
      const meta = parseDownloadUrl(chip.getAttribute('download_url'));
      if (!meta || seen.has(meta.url)) continue;
      seen.add(meta.url);
      metas.push(meta);
    }
    return metas;
  }

  // Only the content script has credentials:'include' access to Gmail's own
  // attachment URLs, so fetching the bytes has to happen here, not in
  // background.js — everything else about the shape background.js's
  // gmailDraftWrite(p) expects is assembled below, per action.kind.
  async function buildActionPayload(action, ctx, prior) {
    const base = { connectorId: action.kind, threadUrl: ctx.threadUrl };
    const priorUrl = prior && prior.url;

    if (action.kind === 'driveDoc' || action.kind === 'driveSheet') {
      const built = ctx.googleBuilt;
      if (!built || built.blank) return null;
      return Object.assign(base, {
        params: {
          title: built.title,
          html: action.kind === 'driveDoc' ? built.html : null,
          csv: action.kind === 'driveSheet' ? built.csv : null
        }
      });
    }

    // A repeating reminder (switch RECURRING_REMINDER, off): the title, the one rule and the first start travel.
    if (action.kind === 'calendarRecurring') {
      const rp = action.params || {};
      if (!rp.title || !rp.rrule || !rp.when) return null;
      const zone = await glanceUserTimeZone();
      return Object.assign(base, { params: { title: rp.title, rrule: rp.rrule, when: rp.when, timeZone: zone || '' } });
    }

    // A Meet link on an event already on the calendar (switch EVENT_CALL_LINK, off): only the event's id and title travel.
    if (action.kind === 'calendarCallLink') {
      const ev = action.params && action.params.event;
      if (!ev || !ev.id) return null;
      return Object.assign(base, { params: { event: { id: ev.id, summary: ev.summary || '', day: ev.day || '' } } });
    }

    // An empty Doc, Sheet or Slides deck asked for by name (switch WORKSPACE_FILE, off). Nothing is written into it.
    if (action.kind === 'driveNewFile') {
      const nf = action.params || {};
      if (!nf.fileKind || !nf.name) return null;
      return Object.assign(base, { params: { fileKind: nf.fileKind, name: nf.name } });
    }

    if (action.kind === 'driveFile') {
      if (action.params && action.params.googleClose && action.params.googleClose.target === 'onedrive') return null;
      const listed = ctx.attachments && ctx.attachments.length ? ctx.attachments : (ctx.attachment ? [ctx.attachment] : []);
      const only = listed.length === 1 ? listed[0] : null;
      if (!only) return { fail: { reason: listed.length > 1 ? 'attachment-ambiguous' : 'attachment-unreadable' } };
      const fetched = await fetchAttachmentBase64(only);
      if (!fetched) return { fail: { reason: 'attachment-unreadable' } };
      if (Math.floor(String(fetched.base64 || '').length * 3 / 4) > DRIVE_SAVE_MAX_BYTES) return { fail: { reason: 'attachment-too-big' } };
      return Object.assign(base, { attachment: fetched, params: { copyAttachment: true } });
    }

    if (action.kind === 'calendar') {
      const params = Object.assign({}, action.params);
      if (params.shareLink && priorUrl) params.shareUrl = priorUrl;
      const file = ctx.intent && ctx.intent.laneFile;
      if (file && file.url && /^https:\/\//.test(String(file.url))) {
        if (!params.fileUrl) params.fileUrl = file.url;
        if (!params.fileName) params.fileName = file.name || params.fileTerm || '';
      }
      if (!params.timeZone) {
        const zone = await glanceUserTimeZone();
        if (zone) params.timeZone = zone;
      }
      params.title = renderedTitleFor(ctx, params.title);
      // The worker adds a Meet link only when this text proposes a video call and
      // the MEET_LINK switch is on (off by default). Text stays local.
      if (ctx && ctx.bodyText) params.callText = String(ctx.bodyText).slice(0, 1500);
      return Object.assign(base, { params: params, ownEmail: ownEmailFromThread() || lastOwnEmail || '' });
    }

    if (action.kind === 'googleContactAnswer' || action.kind === 'googleContactForward') {
      const p = action.params || {};
      if (!p.email || !p.mode) return null;
      const G = typeof FlowGoogleContacts !== 'undefined' ? FlowGoogleContacts : null;
      const composeIn = G && typeof G.composeInputFromOffer === 'function'
        ? G.composeInputFromOffer({ mode: p.mode, email: p.email, name: p.name, lang: p.lang }, {
          subject: ctx.subject,
          senderEmail: ctx.sender && ctx.sender.email,
          quote: ctx.bodyText
        })
        : null;
      if (!composeIn) return null;
      return Object.assign(base, {
        connectorId: 'gmailCompose',
        contactCompose: composeIn,
        showCopy: p.mode === 'answer',
        copyText: p.mode === 'answer' ? p.email : '',
        lang: p.lang
      });
    }

    if (action.kind === 'gmailDraft') {
      // selectedAttachment/driveFileId are only ever set by the attach
      // chooser (buildAttachChooser, above) — if the user never opened it,
      // both stay undefined and this falls back to exactly the old
      // single-attachment behaviour: the thread's first real attachment.
      const { selectedAttachment, driveFileId, driveFileName, driveMimeType, ...cleanParams } = action.params;
      if (cleanParams.shareLink) {
        if (!priorUrl) return null;
        return Object.assign(base, {
          params: Object.assign({}, cleanParams, { shareUrl: priorUrl, shareLink: true, includeAttachment: false, requestedObjectTerm: null, lang: cleanParams.lang || mailLanguage(ctx) }),
          senderEmail: ctx.sender.email,
          senderName: ctx.sender.name,
          subject: ctx.subject,
          threadId: ctx.threadId || ''
        });
      }
      const payload = Object.assign(base, {
        params: Object.assign({}, driveFileId ? Object.assign({}, cleanParams, { driveFileId, driveFileName, driveMimeType }) : cleanParams, { lang: cleanParams.lang || mailLanguage(ctx) }),
        senderEmail: ctx.sender.email,
        senderName: ctx.sender.name,
        subject: ctx.subject,
        threadId: ctx.threadId || ''
      });
      if (driveFileId) {
        // background.js fetches Drive bytes itself — it already holds the
        // OAuth token that call needs, so there is nothing to attach here.
      } else if (action.params.includeAttachment) {
        const chosen = selectedAttachment !== undefined ? selectedAttachment : ctx.attachment;
        if (chosen) {
          const fetched = await fetchAttachmentBase64(chosen);
          if (fetched) payload.attachment = fetched;
        }
      }
      return payload;
    }

    // googleTask — label/facts/entities stay, because the writer still
    // builds the title and the From/Subject lines from them. params is the
    // close itself: the date, the amount, and the sentence the chip
    // planned. The writer prefers those over facts when both are present.
    const taskEntities = (ctx.intent && ctx.intent.entities)
      || (action.params && action.params.what ? { what: action.params.what } : null);
    return Object.assign(base, {
      label: renderedTitleFor(ctx, action.params.title || action.label),
      params: {
        dateIso: action.params.dateIso || null,
        amount: action.params.amount || null,
        what: action.params.what || null,
        fileTerm: action.params.fileTerm || null
      },
      facts: ctx.intent.facts,
      // The quoted sentence. Live clicks still have intent.entities; a Brief
      // or resurface replay only kept the step, so the sentence rides on
      // params.what and is reconstructed here when entities are gone.
      entities: taskEntities,
      senderName: ctx.sender.name,
      senderEmail: ctx.sender.email,
      subject: ctx.subject,
      // Same non-third-party use as the old single-action flow: only ever
      // read locally in background.js to match a Notion select column's own
      // option names, never sent anywhere as free text by this action kind.
      bodyText: (ctx.bodyText || '').slice(0, 20000)
    });
  }

  // A reason code and a message id. recordSilence drops anything else.
  // detail is local only. A family trace logs clock tokens, never the body.
  let openSuggest = null;

  async function appendSuggestLog(entry) {
    if (!entry || typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function') return;
    const bag = await FlowStorage.get();
    const log = Array.isArray(bag.suggestLog) ? bag.suggestLog.slice() : [];
    const key = String(entry.messageId || '') + '|' + String(entry.reason || '');
    if (log[0] && log[0].key === key) return;
    log.unshift({
      key: key, at: Date.now(), messageId: entry.messageId || null, reason: entry.reason,
      fileCount: entry.fileCount || 0, target: entry.target || null, surface: 'gmail'
    });
    await FlowStorage.set({ suggestLog: log.slice(0, 40) });
  }

  function noteSuggestShown(messageId) {
    if (!messageId) return;
    void appendSuggestLog({ messageId: messageId, reason: 'suggest:other-card', surface: 'gmail' });
  }

  async function flushSuggest(showedCard) {
    const ctx = openSuggest;
    openSuggest = null;
    if (!ctx || typeof FlowSuggestSave === 'undefined' || typeof FlowSuggestSave.suggestSave !== 'function') return;
    if (showedCard) {
      await appendSuggestLog({ messageId: ctx.messageId, reason: 'suggest:other-card', surface: 'gmail' });
      return;
    }
    let bag = {};
    try { bag = await FlowStorage.get(); } catch (e) { bag = {}; }
    const decision = FlowSuggestSave.suggestSave({
      surface: 'gmail',
      inbound: ctx.inbound !== false,
      text: ctx.text || '',
      body: ctx.text || '',
      messageId: ctx.messageId,
      attachments: ctx.attachments,
      consent: null,
      otherCard: false,
      dismissals: bag.suggestDismissals || {},
      log: bag.log || []
    });
    await appendSuggestLog({
      messageId: ctx.messageId, reason: decision.reason, surface: 'gmail',
      fileCount: decision.fileCount, target: decision.target
    });
  }

  function logScanSkip(messageId, reason) {
    console.log('[Glance] scan skip:', String(reason || 'unknown'), messageId || '');
  }

  function recordSilence(messageId, reason, detail) {
    void flushSuggest(false);
    if (!messageId || !reason || typeof FlowStorage.recordSilence !== 'function') return;
    FlowStorage.recordSilence({ messageId: messageId, reason: reason })
      .catch((e) => console.error('[Glance] failed to record a silence decision', e));
    if (!detail || detail.debug !== true || reason !== 'family') return;
    const clocks = String(detail.clocks || '').slice(0, 80);
    console.log('[Glance debug]', {
      messageId: messageId,
      reason: reason,
      family: detail.family || null,
      clocks: clocks || null
    });
  }

  // Card kinds on this page. The service worker's older writers stay for
  // every other caller. Hold It, Task, Save file, Doc insert and Sheet row
  // go through flow:google-write. Draft reply fills compose and looks up
  // the contact. Undo of those cards is flow:google-undo.
  const LANE_BY_KIND = {
    calendar: 'googleHold',
    googleTask: 'googleLaneTask',
    googleTasks: 'googleLaneTask',
    driveFile: 'googleDriveSave',
    attachmentSave: 'googleDriveSave',
    driveDoc: 'googleDoc',
    driveSheet: 'googleSheetAppend',
    driveNewFile: 'googleNewFile',
    calendarCallLink: 'googleEventCallLink',
    calendarRecurring: 'googleRecurringReminder',
    googleContactAnswer: 'gmailCompose',
    googleContactForward: 'gmailCompose',
    gmailDraft: 'gmailCompose'
  };

  function laneConnectorId(kind) {
    if (LANE_BY_KIND[kind]) return LANE_BY_KIND[kind];
    if (kind === 'googleHold' || kind === 'googleLaneTask' || kind === 'googleDriveSave' || kind === 'googleDoc' || kind === 'googleSheetAppend' || kind === 'gmailCompose') return kind;
    return '';
  }

  async function glanceUserTimeZone() {
    let stored = '';
    if (chromeLive()) {
      try {
        const bag = await chrome.storage.local.get('glanceTimeZone');
        const raw = bag && bag.glanceTimeZone;
        if (typeof raw === 'string') stored = raw.trim();
        else if (raw && typeof raw.timeZone === 'string') stored = raw.timeZone.trim();
      } catch (e) { stored = ''; }
    }
    if (stored) return stored.slice(0, 80);
    try {
      return String(Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 80);
    } catch (e) {
      return '';
    }
  }

  function userContextParty(ctx) {
    const e = ctx && ctx.sender && ctx.sender.email;
    return e ? String(e).trim().toLowerCase() : 'unknown';
  }

  function userContextFamily(ctx) {
    const g = ctx && ctx.intent && ctx.intent.googleClose;
    return (g && g.artifact) || (ctx && ctx.process && ctx.process.id) || 'unknown';
  }

  let userContextSwitchOn = null;
  async function userContextEnabled() {
    if (userContextSwitchOn != null) return userContextSwitchOn;
    try {
      const st = await FlowStorage.get();
      userContextSwitchOn = !!(st && st.glanceSwitches && st.glanceSwitches.USER_CONTEXT_WRITER === true);
    } catch (e) { userContextSwitchOn = false; }
    return userContextSwitchOn;
  }

  function userContextEvent(ev) {
    if (!chromeLive()) return;
    userContextEnabled().then((on) => {
      if (!on) return;
      const lane = laneAccountContext();
      try {
        chrome.runtime.sendMessage({
          type: 'flow:user-context-event',
          event: ev,
          accountKey: lane.tabAccount || 'default'
        });
      } catch (e) { /* worker off */ }
    });
  }

  function sendRuntime(msg) {
    return new Promise((resolve) => {
      if (!chromeLive()) {
        resolve({ ok: false, reason: 'unavailable' });
        return;
      }
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          try {
            if (chrome.runtime && chrome.runtime.lastError && !res) resolve({ ok: false, reason: 'unavailable' });
            else resolve(res);
          } catch (e) {
            tearDownOrphan();
            resolve({ ok: false, reason: 'unavailable' });
          }
        });
      } catch (e) {
        tearDownOrphan();
        resolve({ ok: false, reason: 'unavailable' });
      }
    });
  }

  // The card shows the title in the UI language. The event and the task
  // written on Do It carry that same title.
  function artifactTitleFor(ctx, title) {
    if (typeof FlowDisplay === 'undefined' || typeof FlowDisplay.artifactTitle !== 'function') return title;
    return FlowDisplay.artifactTitle(glanceUiLang(), ctx, title);
  }

  // One source of truth for what Glance writes. The string the card showed is
  // the string the event, the task and the Activity row carry. Nothing in the
  // write path translates or rebuilds it. A card that was never rendered here
  // (a replay from the Brief) falls back to the same display function.
  function renderedTitleFor(ctx, fallback) {
    const shown = ctx && typeof ctx.renderedTitle === 'string' ? ctx.renderedTitle.trim() : '';
    if (shown) return shown;
    return artifactTitleFor(ctx, fallback);
  }

  // The Activity row names what the card said. A Save the file? card is not a decision.
  function activityLabel(ctx) {
    const raw = ctx && ctx.intent && ctx.intent.label;
    const shown = ctx && typeof ctx.renderedTitle === 'string' ? ctx.renderedTitle.trim() : '';
    if (shown) return shown;
    const p = ctx && ctx.process;
    if (p && (p.id === 'file-it' || p.id === 'suggest-save')) return artifactTitleFor(ctx, raw);
    return raw;
  }

  // The draft answers the mail in the mail's own language. The UI language is
  // only the fallback for a mail with no letters to read.
  function mailLanguage(ctx) {
    const text = String((ctx && ctx.bodyText) || '');
    const he = (text.match(/[\u0590-\u05FF]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    if (he || latin) return he > latin ? 'he' : 'en';
    return glanceUiHebrew() ? 'he' : 'en';
  }

  function laneAccountContext() {
    return { tabAccount: ownEmailFromThread() || lastOwnEmail || '', lang: glanceUiHebrew() ? 'he' : 'en' };
  }

  async function gmailComposeApiAllowedFromStorage() {
    const C = typeof FlowGoogleConfig !== 'undefined' ? FlowGoogleConfig : null;
    if (!C || typeof C.gmailDraftApiAllowed !== 'function') return false;
    try {
      const bag = await chrome.storage.local.get('googleGrantedScopes');
      const rec = bag && bag.googleGrantedScopes;
      const raw = rec && rec.version;
      const scopes = raw == null ? null : String(raw).split('\n').map((s) => s.trim()).filter(Boolean);
      return C.gmailDraftApiAllowed(scopes);
    } catch (e) { return false; }
  }

  function activityLogRef(ref) {
    if (!ref || typeof ref !== 'object') return ref;
    const out = Object.assign({}, ref);
    delete out.to;
    delete out.target;
    delete out.body;
    delete out.subject;
    if (out.before && typeof out.before === 'object') {
      const before = Object.assign({}, out.before);
      delete before.to;
      delete before.body;
      delete before.subject;
      out.before = before;
    }
    if (out.proof && typeof out.proof === 'object') {
      const proof = Object.assign({}, out.proof);
      delete proof.target;
      out.proof = proof;
    }
    return out;
  }

  function sendExecuteAction(payload) {
    const lane = laneConnectorId(payload && payload.connectorId);
    if (!lane) return sendRuntime({ type: 'flow:execute-action', payload: payload });
    if (lane === 'gmailCompose') return sendGmailCompose(payload);
    return sendRuntime(Object.assign({ type: 'flow:google-write', connectorId: lane, input: payload }, laneAccountContext()));
  }

  function composeReadBack(page) {
    if (!page || page.ok !== true) return null;
    const back = page.seen || page.fields;
    if (!back || !back.to || !back.subject || !back.body) return null;
    return back;
  }

  function composeBodyOpen() {
    if (typeof FlowGoogleComposePage === 'undefined' || typeof FlowGoogleComposePage.findBody !== 'function') return false;
    return !!FlowGoogleComposePage.findBody(document);
  }

  // No compose window open: write through the lane (gmail.compose is enforced in core/google-drafts.js).
  async function saveReplyDraft(payload, input) {
    const planned = typeof FlowGoogleCompose !== 'undefined' && typeof FlowGoogleCompose.plan === 'function'
      ? FlowGoogleCompose.plan(input)
      : { ok: false };
    const threadId = (payload && payload.threadId) || '';
    if (!planned.ok || !threadId) {
      return { ok: false, reason: 'compose-closed', preview: true, closes: false, sent: false, error: glanceUiHebrew() ? 'לא הצלחתי להכין טיוטת תשובה בשרשור הזה.' : 'Could not prepare a reply draft in this thread.' };
    }
    return sendRuntime(Object.assign({
      type: 'flow:google-write',
      connectorId: 'googleReplyDraft',
      input: { to: planned.to, subject: planned.subject, body: planned.body, threadId: threadId }
    }, laneAccountContext()));
  }

  async function sendGmailCompose(payload) {
    if (payload && payload.contactCompose) {
      const composeIn = Object.assign({ useDraft: false }, payload.contactCompose);
      if (!composeBodyOpen()) {
        return {
          ok: false,
          reason: 'compose-closed',
          preview: true,
          closes: false,
          sent: false,
          error: glanceUiCopy('composeClosed') || (glanceUiHebrew() ? 'פתח קודם תשובה. Glance לא לוחץ על שליחה.' : 'Open Reply first. Glance does not press Send.')
        };
      }
      const swPromise = sendRuntime({ type: 'flow:gmail-compose', connectorId: 'gmailCompose', input: composeIn, payload: composeIn });
      let page = null;
      if (typeof FlowGoogleComposePage !== 'undefined' && typeof FlowGoogleComposePage.fill === 'function') {
        try { page = FlowGoogleComposePage.fill(composeIn); } catch (e) {
          page = { ok: false, reason: 'unavailable', preview: true, closes: false, sent: false, error: 'The compose window is still empty.' };
        }
      } else {
        page = { ok: false, reason: 'compose-closed', preview: true, closes: false, sent: false, error: 'Open Reply first. Glance does not press Send.' };
      }
      const sw = await swPromise;
      if (page && page.ok) {
        if (!composeReadBack(page)) {
          return { ok: false, reason: 'verify_failed', preview: true, closes: false, sent: false, error: 'The compose window is still empty.' };
        }
        if (sw && typeof sw === 'object') {
          if (sw.proof && !page.proof) page.proof = sw.proof;
        }
        const he = payload.lang === 'he' || glanceUiHebrew();
        page.written = composeIn.to && composeIn.body === payload.copyText
          ? (he ? 'הכתובת בטיוטה. אתה שולח.' : 'Address in the draft. You send it.')
          : (he ? 'ההעברה מוכנה. אתה שולח.' : 'Forward ready in compose. You send it.');
        if (payload.showCopy && payload.copyText) {
          page.showCopy = true;
          page.copyText = payload.copyText;
        }
        return page;
      }
      return page || { ok: false, reason: 'unavailable', preview: true, closes: false, sent: false, error: 'The compose window is still empty.' };
    }
    const email = (payload && payload.senderEmail) || '';
    const input = {
      to: email,
      subject: payload && payload.subject,
      senderName: payload && payload.senderName,
      senderEmail: email,
      quote: payload && payload.params && (payload.params.what || payload.params.quote),
      body: payload && payload.params && payload.params.body,
      shareUrl: payload && payload.params && payload.params.shareUrl,
      useDraft: true,
      draft: payload
    };
    // The service-worker message stays so the lane hears the fill. Its
    // in-memory object is not the compose window and is not the receipt.
    if (!composeBodyOpen()) return saveReplyDraft(payload, input);
    const swPromise = sendRuntime({ type: 'flow:gmail-compose', connectorId: 'gmailCompose', input: input, payload: input });
    let page = null;
    if (typeof FlowGoogleComposePage !== 'undefined' && typeof FlowGoogleComposePage.fill === 'function') {
      try { page = FlowGoogleComposePage.fill(input); } catch (e) {
        page = { ok: false, reason: 'unavailable', preview: true, closes: false, sent: false, error: 'The compose window is still empty.' };
      }
    } else {
      page = { ok: false, reason: 'compose-closed', preview: true, closes: false, sent: false, error: 'Open Reply first. Glance does not press Send.' };
    }
    await swPromise;
    if (page && page.ok) {
      if (!composeReadBack(page)) {
        return { ok: false, reason: 'verify_failed', preview: true, closes: false, sent: false, error: 'The compose window is still empty.' };
      }
      return page;
    }
    return page || { ok: false, reason: 'unavailable', preview: true, closes: false, sent: false, error: 'The compose window is still empty.' };
  }

  // Undo after a content-script reload has no in-memory receipt. The ids,
  // list and calendar ids, and contentHash live here, keyed by the Gmail
  // message id, until the expiry. A changed hash refuses. A match deletes.
  const LANE_UNDO_KEY = 'glanceLaneUndo';
  const LANE_UNDO_TTL_MS = 14 * 24 * 60 * 60 * 1000;
  const LANE_UNDO_FIELDS = ['taskId', 'externalId', 'taskListId', 'listId', 'contentHash', 'eventId', 'calendarId', 'documentId', 'fileId', 'spreadsheetId', 'snapshot', 'created', 'inserted', 'rangeName', 'draftId', 'threadId', 'to', 'unverified'];

  function laneUndoSnapshot(connectorId, ref) {
    if (!ref || typeof ref !== 'object') return null;
    const snap = {};
    LANE_UNDO_FIELDS.forEach((key) => {
      if (ref[key] != null && ref[key] !== '') snap[key] = ref[key];
    });
    if (connectorId === 'googleHold' && !snap.calendarId) snap.calendarId = 'primary';
    return Object.keys(snap).length ? snap : null;
  }

  function laneUndoLine(connectorId) {
    if (connectorId === 'googleHold' || connectorId === 'calendar') return glanceUiCopy('calendarRemoved');
    if (connectorId === 'googleLaneTask' || connectorId === 'googleTask' || connectorId === 'googleTasks') return glanceUiCopy('taskRemoved');
    return '';
  }

  function laneStepLine(connectorId, response) {
    const written = response && (response.written || response.where);
    if (written) return String(written);
    if (connectorId === 'googleHold' || connectorId === 'calendar') return 'Calendar';
    if (connectorId === 'googleLaneTask' || connectorId === 'googleTask' || connectorId === 'googleTasks') return 'Google Task';
    return connectorId || '';
  }

  function laneUndoStepsOf(succeeded) {
    return (succeeded || []).map((r) => {
      const kind = r && r.action && r.action.kind;
      const connectorId = laneConnectorId(kind) || kind;
      const ref = laneUndoSnapshot(connectorId, r && r.response && r.response.ref);
      if (!connectorId || !ref) return null;
      return {
        connectorId: connectorId,
        ref: ref,
        line: laneStepLine(connectorId, r && r.response),
        undoLine: laneUndoLine(connectorId)
      };
    }).filter(Boolean);
  }

  // Graph-style ids fold +/ to -_. A text hash (h plus digits) is not a
  // join key: two messages can share the first 120 characters. scan: is the
  // inbox snapshot, not this message.
  function laneCanon(id) {
    if (typeof id !== 'string' && typeof id !== 'number') return '';
    return String(id).trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function laneTextHash(id) {
    return /^h-?\d+$/.test(String(id || ''));
  }

  // Only a legacy message id or an rfc Message-ID. A text hash, a
  // scan: thread id, and a subject are not keys for this record.
  function laneStoreIds(messageId, extraIds) {
    const out = [];
    const seen = {};
    function add(id) {
      if (id == null) return;
      const text = String(id).trim();
      if (!text || text.indexOf('scan:') === 0 || text === 'h0' || laneTextHash(text)) return;
      if (seen[text]) return;
      seen[text] = true;
      out.push(text);
      const folded = laneCanon(text);
      if (folded && folded !== text && !seen[folded]) {
        seen[folded] = true;
        out.push(folded);
      }
    }
    add(messageId);
    (extraIds || []).forEach(add);
    return out;
  }

  function laneRowLive(row, now) {
    return !!(row && row.expires && row.expires >= now && Array.isArray(row.steps) && row.steps.length);
  }

  // A stored row matches only when its key IS this message's legacy id
  // or rfc Message-ID (or the canon fold of that same id). row.ids, the
  // thread id, and the subject never join a different mail.
  function findLaneRow(all, wanted) {
    if (!all || typeof all !== 'object') return null;
    const now = Date.now();
    const needles = {};
    (wanted || []).forEach((id) => {
      if (id == null) return;
      const text = String(id).trim();
      if (!text || text.indexOf('scan:') === 0 || laneTextHash(text)) return;
      needles[text] = true;
      const folded = laneCanon(text);
      if (folded) needles[folded] = true;
    });
    const names = Object.keys(needles);
    if (!names.length) return null;
    for (let i = 0; i < names.length; i++) {
      if (laneRowLive(all[names[i]], now)) return all[names[i]];
    }
    const keys = Object.keys(all);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.indexOf('scan:') === 0 || laneTextHash(key)) continue;
      if (!needles[key] && !needles[laneCanon(key)]) continue;
      if (laneRowLive(all[key], now)) return all[key];
    }
    return null;
  }

  function rememberLaneUndo(messageId, steps, extraIds, meta) {
    const keys = laneStoreIds(messageId, extraIds);
    if (!keys.length || !steps || !steps.length) return Promise.resolve();
    if (!chromeLive()) return Promise.resolve();
    const store = chrome.storage && chrome.storage.local;
    if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') return Promise.resolve();
    return Promise.resolve()
      .then(() => store.get(LANE_UNDO_KEY))
      .then((bag) => {
        const all = bag && bag[LANE_UNDO_KEY] && typeof bag[LANE_UNDO_KEY] === 'object' ? bag[LANE_UNDO_KEY] : {};
        const now = Date.now();
        Object.keys(all).forEach((key) => {
          if (!all[key] || !all[key].expires || all[key].expires < now) delete all[key];
        });
        const row = { expires: now + LANE_UNDO_TTL_MS, steps: steps, ids: keys };
        if (meta && meta.total > steps.length) { row.partial = true; row.total = meta.total; }
        keys.forEach((id) => { all[id] = row; });
        return store.set({ [LANE_UNDO_KEY]: all });
      })
      .catch(() => {});
  }

  function readLaneUndo(messageId, extraIds) {
    const wanted = [];
    if (messageId) wanted.push(messageId);
    (extraIds || []).forEach((id) => {
      if (wanted.indexOf(id) < 0) wanted.push(id);
    });
    if (!wanted.length) return Promise.resolve(null);
    if (!chromeLive()) return Promise.resolve(null);
    const store = chrome.storage && chrome.storage.local;
    if (!store || typeof store.get !== 'function') return Promise.resolve(null);
    return Promise.resolve()
      .then(() => store.get(LANE_UNDO_KEY))
      .then((bag) => findLaneRow(bag && bag[LANE_UNDO_KEY], wanted))
      .catch(() => null);
  }

  function laneFailLine(connectorId) {
    if (connectorId === 'googleHold' || connectorId === 'calendar') return glanceUiCopy('calendarFailed');
    if (connectorId === 'googleLaneTask' || connectorId === 'googleTask' || connectorId === 'googleTasks') return glanceUiCopy('still');
    const name = laneStepLine(connectorId);
    if (name && name !== connectorId) return glanceUiHebrew() ? (name + ' נכשל.') : (name + ' failed.');
    return glanceUiCopy('stepFailed');
  }

  function laneEditedReason(reason) {
    return reason === 'user-edited' || reason === 'range-edited';
  }

  function laneRefuseLine(result, connectorId) {
    const reason = result && result.reason;
    // Hebrew uses the shared edited line. English keeps the connector's
    // own refusal ("Undo stopped…") when it sent one. No Try again.
    if (laneEditedReason(reason)) {
      if (glanceUiHebrew()) return glanceUiCopy('edited');
      if (result && result.error) return String(result.error);
      return glanceUiCopy('edited');
    }
    if (result && result.error) return String(result.error);
    if (result && result.written && result.ok !== false) return String(result.written);
    return laneFailLine(connectorId);
  }

  function writeLaneUndoRow(messageId, steps, meta, extraIds) {
    if (!messageId || !chromeLive()) return Promise.resolve();
    const store = chrome.storage && chrome.storage.local;
    if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') return Promise.resolve();
    return Promise.resolve()
      .then(() => store.get(LANE_UNDO_KEY))
      .then((bag) => {
        const all = bag && bag[LANE_UNDO_KEY] && typeof bag[LANE_UNDO_KEY] === 'object' ? bag[LANE_UNDO_KEY] : {};
        const row = findLaneRow(all, [messageId]);
        const keys = laneStoreIds(messageId, extraIds);
        const drop = {};
        keys.forEach((id) => { drop[id] = true; const folded = laneCanon(id); if (folded) drop[folded] = true; });
        Object.keys(all).forEach((key) => {
          if (drop[key] || drop[laneCanon(key)]) drop[key] = true;
        });
        Object.keys(drop).forEach((key) => { delete all[key]; });
        if (steps && steps.length && keys.length) {
          all[keys[0]] = { expires: (row && row.expires) || (Date.now() + LANE_UNDO_TTL_MS), steps: steps, ids: keys };
          const partial = (meta && meta.partial) || (row && row.partial);
          if (partial) { all[keys[0]].partial = true; all[keys[0]].total = (meta && meta.total) || (row && row.total) || steps.length + 1; }
          keys.forEach((id) => { all[id] = all[keys[0]]; });
        }
        return store.set({ [LANE_UNDO_KEY]: all });
      })
      .catch(() => {});
  }

  // Stored steps are undone last-written first, so a task that landed after
  // the calendar hold is the first delete. A hash miss refuses that step
  // and the rest still run. The receipt names every step.
  function undoStoredLane(messageId, fallback) {
    return readLaneUndo(messageId).then((record) => {
      const steps = record
        ? record.steps.slice().reverse()
        : (fallback && fallback.connectorId ? [{
          connectorId: fallback.connectorId,
          ref: fallback.ref,
          line: fallback.writtenLine || '',
          undoLine: fallback.undoneLine || laneUndoLine(fallback.connectorId)
        }] : []);
      let chain = Promise.resolve([]);
      steps.forEach((step) => {
        chain = chain.then((outcomes) => {
          return sendLaneUndo(step.connectorId, step.ref).then((result) => {
            const ok = !!(result && result.ok);
            const line = ok ? (laneUndoLine(step.connectorId) || (result && result.written) || step.undoLine || '') : laneRefuseLine(result, step.connectorId);
            outcomes.push({
              ok: ok,
              connectorId: step.connectorId,
              line: step.line || '',
              reason: result && result.reason,
              error: ok ? '' : line,
              written: line
            });
            return outcomes;
          }, () => {
            const line = laneFailLine(step.connectorId);
            outcomes.push({ ok: false, connectorId: step.connectorId, line: step.line || '', error: line, written: line });
            return outcomes;
          });
        });
      });
      return chain.then((outcomes) => {
        const list = outcomes || [];
        const removed = list.filter((row) => row.ok);
        const refused = list.filter((row) => !row.ok);
        const written = list.map((row) => row.written).filter(Boolean).join(' ');
        const firstFail = refused[0] || null;
        const reversed = record && record.steps ? record.steps.slice().reverse() : [];
        const kept = [];
        list.forEach((row, i) => {
          if (!row.ok && reversed[i] && !laneEditedReason(row.reason)) kept.push(reversed[i]);
        });
        const remaining = kept.slice().reverse();
        const result = {
          ok: list.length > 0 && refused.length === 0,
          partial: removed.length > 0 && refused.length > 0,
          outcomes: list,
          written: written,
          remaining: remaining,
          reason: firstFail ? firstFail.reason : '',
          error: refused.length ? (removed.length ? written : (firstFail && firstFail.error)) : ''
        };
        if (!record || !messageId) return result;
        const total = record.total || record.steps.length;
        return writeLaneUndoRow(messageId, remaining, { partial: remaining.length < total, total: total }).then(() => result);
      });
    });
  }

  function noteLaneOutcome(results) {
    if (!chromeLive()) return;
    const store = chrome.storage && chrome.storage.local;
    if (!store) return;
    const lane = (results || []).filter((r) => r && r.action && laneConnectorId(r.action.kind));
    if (!lane.length) return;
    const ok = lane.some((r) => r.response && r.response.ok);
    const failed = lane.some((r) => !(r.response && r.response.ok));
    if (ok && failed && typeof store.set === 'function') {
      store.set({ googleLaneWarning: { needed: true } }).catch(() => {});
    } else if (ok && !failed && typeof store.remove === 'function') {
      store.remove('googleLaneWarning').catch(() => {});
    }
  }

  function sendLaneUndo(kind, ref) {
    const lane = laneConnectorId(kind);
    if (!lane) return sendRuntime({ type: 'flow:undo-action', connectorId: kind, ref: ref });
    if (lane === 'gmailCompose' && ref && ref.draftId) {
      return sendRuntime(Object.assign({ type: 'flow:google-undo', connectorId: 'googleReplyDraft', ref: ref }, laneAccountContext()));
    }
    if (lane === 'gmailCompose') {
      let page = null;
      if (typeof FlowGoogleComposePage !== 'undefined' && typeof FlowGoogleComposePage.undo === 'function') {
        try { page = FlowGoogleComposePage.undo(ref); } catch (e) {
          page = { ok: false, reason: 'unavailable', error: 'Undo stopped. The compose was not cleared.' };
        }
      } else {
        page = { ok: false, reason: 'compose-closed', error: 'Open Reply first. Glance does not press Send.' };
      }
      void sendRuntime(Object.assign({ type: 'flow:google-undo', connectorId: lane, ref: ref }, laneAccountContext()));
      return Promise.resolve(page);
    }
    return sendRuntime(Object.assign({ type: 'flow:google-undo', connectorId: lane, ref: ref }, laneAccountContext()));
  }

  // Drive export stays in the service worker. The match stays here, in
  // FlowFactReply, so a second cell never becomes a chip. A failed lookup
  // is silence — the same result as no match.
  function resolveReplyFact(factAsk) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          type: 'flow:fact-sources',
          payload: {
            factLabel: factAsk.factLabel,
            sourceKind: factAsk.sourceKind,
            sourceName: factAsk.sourceName
          }
        }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok || typeof FlowFactReply === 'undefined') {
            resolve(null);
            return;
          }
          resolve(FlowFactReply.resolve(factAsk, res.sources, { truncated: res.truncated }));
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Sequential, not parallel — keeps per-step error handling simple, keeps
  // the receipt's step order predictable, and avoids bursting multiple
  // simultaneous token requests at chrome.identity for what is, in the
  // common case, 1-3 steps completing in well under a second combined.
  //
  // Each step carries an explicit `dependsOn` (a prior step's id, or null —
  // see actions.js's buildStep). A step whose dependency didn't succeed is
  // never attempted — it's recorded as skipped so the receipt can say so
  // honestly, instead of quietly running a write that presumes a result
  // that never happened. A draft that only exists to share a Drive link
  // depends on the file step; if that file was not created, the draft
  // is not created either.
  //
  // onStepDone(result, doneCount, total), when given, fires once per step
  // (success, failure, or skip) as it resolves — this is what lets the chip
  // narrate progress while Do It is still running, not just before and
  // after (see onDoIt's own use of it).
  // The title that was sent is the title that landed. A mismatch is logged
  // and flagged on the response; the write itself is never retried.
  function assertWrittenTitle(action, payload, response) {
    if (!response || response.ok !== true || typeof response.title !== 'string') return;
    let expected = '';
    if (payload && payload.params && (payload.params.fileName || payload.params.fileTerm) && action.kind === 'calendar') expected = String(payload.params.fileName || payload.params.fileTerm);
    else if (payload && payload.params && typeof payload.params.title === 'string') expected = payload.params.title;
    else if (payload && typeof payload.label === 'string') expected = payload.label;
    expected = expected.replace(/[\r\n]+/g, ' ').trim();
    if (!expected) return;
    const limit = action.kind === 'calendar' ? 200 : 1024;
    if (response.title !== expected.slice(0, limit)) {
      response.titleMismatch = true;
      console.error('[Glance] written title differs from the card title', { card: expected, written: response.title });
    }
  }

  async function runActionsSequentially(actions, ctx, onStepDone) {
    const results = [];
    const okIds = new Set();
    const okById = new Map();
    for (const action of actions) {
      let result;
      if (action.dependsOn && !okIds.has(action.dependsOn)) {
        result = { action, response: { ok: false, skipped: true, reason: 'dependency-failed' } };
      } else {
        const prior = action.dependsOn ? okById.get(action.dependsOn) : null;
        const payload = await buildActionPayload(action, ctx, prior && prior.response);
        if (payload && payload.fail) {
          result = { action, response: Object.assign({ ok: false }, payload.fail) };
        } else if (!payload) {
          result = { action, response: { ok: false, reason: 'unclear' } };
        } else {
          const response = await sendExecuteAction(payload);
          if (ctx && ctx.previewOnly && response && response.ok === true) {
            response.preview = true;
            response.closes = false;
          }
          assertWrittenTitle(action, payload, response);
          result = { action, response };
          if (response && response.ok) {
            okIds.add(action.id);
            okById.set(action.id, result);
          }
        }
      }
      results.push(result);
      if (onStepDone) onStepDone(result, results.length, actions.length);
    }
    return results;
  }

  // Reverses the successful chain and undoes it one step at a time, stopping
  // at the first failure rather than firing every undo regardless — a
  // rollback that silently skips a broken link isn't a rollback. Reverse
  // order (not the original execution order, and not parallel) is the one
  // order that's always safe for a dependency chain: if a later step's write
  // referenced an earlier one's result, that later step must be undone
  // before the earlier one is touched. Today's catalog has no such
  // reference between steps, so the order only ever matters in principle —
  // but this is the version that stays correct the day it does.
  //
  // What this deliberately does NOT claim: true two-phase-commit atomicity.
  // Calendar, Gmail drafts, and Tasks are three independent Google APIs with
  // no shared transaction protocol between them, so if step 2 of 3 fails to
  // undo, steps that already reverted stay reverted rather than being
  // silently re-created — there is no "undo the undo" for an external write.
  // The honest contract is: stop immediately, report exactly what did and
  // didn't revert, and never leave the account guessing.
  async function rollbackChain(succeeded, ctx) {
    const reverseOrder = succeeded.slice().reverse();
    const undoneIds = [];
    for (const r of reverseOrder) {
      const result = await sendLaneUndo(r.action.kind, r.response.ref);
      if (!result || !result.ok) {
        return {
          ok: false,
          undoneIds,
          failedAt: r.action,
          keptWhere: (r.response && r.response.where) || null,
          reason: result && result.reason,
          error: result && (result.error || result.written)
        };
      }
      undoneIds.push(r.action.id);
    }
    return { ok: true, undoneIds, failedAt: null };
  }

  // Past-tense verbs for the receipt, keyed by connector kind (action.kind —
  // 'calendar'/'gmailDraft'/'googleTask' — not the catalog step id used by
  // Execution Memory). Deliberately what happened, not what kind of object
  // got created: "scheduled," not "Calendar."
  const STEP_DONE_VERB = {
    calendar: 'scheduled',
    gmailDraft: 'drafted a reply',
    googleTask: 'set a reminder',
    driveNewFile: 'created the file',
    calendarCallLink: 'added a call link',
    calendarRecurring: 'set a repeating reminder',
    driveDoc: 'wrote the doc',
    driveSheet: 'wrote the sheet',
    driveFile: 'saved the file'
  };

  function joinWithAnd(items) {
    if (items.length <= 1) return items[0] || '';
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  // The second half of "I'm going to close this for you": closingSentence()
  // says what's about to happen before Do It; this says what just closed,
  // in the same declarative voice — "Closed — scheduled and tracked.", not
  // "2 actions completed."
  //
  // When every step the chip actually proposed succeeded, this prefers the
  // catalog's own hand-written closedLine (actions.js's PROCESS_CATALOG —
  // e.g. "Scheduled, drafted, and tracked.") over the generic verb-join:
  // it's specific to what this exact PROCESS means when it fully closes,
  // not just a list of what happened to succeed. The dynamic verb-join
  // stays as the honest fallback for a partial success (some steps failed)
  // — closedLine describes the full process and would overclaim if only
  // some of it actually landed.
  function closedSummary(succeeded, ctx, results) {
    const failedStep = (results || []).some((r) => !stepHandled(r) && !(r.response && (r.response.ok || r.response.skipped)));
    const isFullClose = !failedStep && ctx && ctx.process.closedLine && succeeded.length === ctx.process.steps.length;
    if (isFullClose) return ctx.process.closedLine;
    const verbs = succeeded.map((r) => STEP_DONE_VERB[r.action.kind] || 'completed one step');
    // A process with a step that did not finish is not closed.
    const all = !failedStep && ctx && ctx.process;
    return (all ? 'Closed — ' : 'Partly done — ') + joinWithAnd(verbs) + '.';
  }

  // The chip's receipt for a closed process of 1-5 steps: the status word
  // ("Handled." or "Partly handled."), the process name, a closure-framed
  // summary of what actually happened, a link per successful write that
  // has one, and Undo (or "Undo all") that reverses every successful write
  // in the group together. A write that failed
  // silently contributes nothing to undo; it was never done. A successful
  // undo is recorded to Execution Memory as a rejection of those step kinds
  // — accepted-then-undone is a stronger "don't propose this" signal than a
  // pre-execution removal, since the user only learned they didn't want it
  // after seeing it actually happen.
  function taskKind(r) {
    const kind = r && r.action && r.action.kind;
    return kind === 'googleTask' || kind === 'googleTasks';
  }

  // Google Tasks is Handled only after fetchedBack. Other writers in this
  // slice are unchanged. If the proof module is missing, a task does not
  // count as closed.
  function stepHandled(r) {
    if (r && r.response && (r.response.preview === true || r.response.closes === false)) return false;
    const lane = r && r.action && laneConnectorId(r.action.kind);
    if (lane && lane !== 'gmailCompose') {
      if (typeof FlowProofOfClose === 'undefined' || typeof FlowProofOfClose.laneStepVerified !== 'function') return false;
      if (!FlowProofOfClose.laneStepVerified(r.response)) return false;
    }
    if (typeof FlowProofOfClose !== 'undefined') return FlowProofOfClose.stepCountsAsHandled(r);
    if (taskKind(r)) return false;
    return !!(r && r.response && r.response.ok && !r.response.skipped);
  }

  // Every step of this message's Do It, after a reload. The lines are the
  // ones stored with the ids. Undo runs last-written first.
  // A reload shows this receipt instead of the task-proof banner. Undo
  // still has to flip that task's Activity row from Handled to Undone.
  function noteLaneTaskUndone(messageNode, messageId, record) {
    if (!messageId || typeof FlowStorage === 'undefined' || typeof FlowStorage.markGoogleTaskUndone !== 'function') return;
    const steps = (record && record.steps) || [];
    const tasks = steps.filter((step) => {
      const id = step && step.connectorId;
      return id === 'googleLaneTask' || id === 'googleTask' || id === 'googleTasks';
    });
    if (!tasks.length) return;
    const threadId = messageNode && messageNode.getAttribute && messageNode.getAttribute('data-legacy-thread-id');
    Promise.all(tasks.map((step) => FlowStorage.markGoogleTaskUndone(messageId, step && step.ref, threadId)))
      .catch((e) => console.error('[Glance] failed to record an undone task — the task itself was already removed', e));
  }

  function laneVerifyCopy(kind) {
    const he = glanceUiHebrew();
    if (kind === 'unverified') return he ? 'לא ניתן לאמת' : "Can't verify";
    if (kind === 'missing') return he ? 'בוטל / נמחק' : 'Removed or deleted';
    if (kind === 'checking') return he ? 'בודק ב-Google…' : 'Checking Google…';
    return '';
  }

  // present | missing | unknown for each stored step, read from Google by id.
  async function verifyLaneSteps(steps) {
    const unknown = steps.map(() => 'unknown');
    let res = null;
    try {
      res = await sendRuntime(Object.assign({ type: 'flow:google-verify', steps: steps.map((s) => ({ connectorId: s.connectorId, ref: s.ref })) }, laneAccountContext()));
    } catch (e) { return unknown; }
    if (!res || res.ok !== true || !Array.isArray(res.states) || res.states.length !== steps.length) return unknown;
    return res.states.map((x) => (x === 'present' || x === 'missing' ? x : 'unknown'));
  }

  // A receipt repainted from storage is a claim about Google. It is a
  // checkmark only when Google returns every stored id.
  function mountLaneReceipt(messageNode, record, messageId) {
    if (!messageNode || messageNode.querySelector('.flow-chip-host')) return;
    const steps = (record && record.steps) || [];
    if (!steps.length) return;
    if (messageNode.getAttribute && messageNode.getAttribute('data-glance-lane-verifying') === '1') return;
    messageNode.setAttribute('data-glance-lane-verifying', '1');
    verifyLaneSteps(steps).then((states) => {
      messageNode.removeAttribute('data-glance-lane-verifying');
      if (!messageNode.isConnected || messageNode.querySelector('.flow-chip-host')) return;
      const present = steps.filter((st, i) => states[i] === 'present');
      const missing = states.filter((x) => x === 'missing').length;
      const everyPresent = present.length === steps.length;
      if (!everyPresent && missing > 0) {
        const keep = present;
        writeLaneUndoRow(messageId, keep, { partial: true, total: record.total || steps.length });
      }
      paintLaneReceipt(messageNode, record, messageId, states);
    }).catch(() => { messageNode.removeAttribute('data-glance-lane-verifying'); });
  }

  function paintLaneReceipt(messageNode, record, messageId, states) {
    if (!messageNode || messageNode.querySelector('.flow-chip-host')) return;
    const steps = (record && record.steps) || [];
    if (!steps.length) return;
    const verdict = states || steps.map(() => 'unknown');
    const allPresent = verdict.every((x) => x === 'present');
    const nothingLeft = verdict.every((x) => x === 'missing');
    const anyUnknown = verdict.some((x) => x === 'unknown');
    const total = (record && record.total) || steps.length;
    const partialReceipt = allPresent && total > steps.length && !!(record && record.partial);
    const host = el('div', 'flow-chip-host flow-chip-settled');
    host.setAttribute('dir', 'ltr');
    host.setAttribute('data-glance-chain', 'lane-proof');
    host.setAttribute('data-glance-message', messageId || '');
    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    done.setAttribute('role', 'status');
    if (allPresent) {
      const icon = el('span', 'flow-chip-done-icon', '✓');
      icon.setAttribute('aria-hidden', 'true');
      done.appendChild(icon);
    }
    const partialCopy = typeof FlowReceipt !== 'undefined' && FlowReceipt.confirmation
      ? FlowReceipt.confirmation({ succeeded: verdict.filter((x) => x === 'present').length, total: Math.max(total, steps.length), lang: glanceUiLang() }).status
      : null;
    let statusText = glanceUiCopy('handled');
    if (partialReceipt && partialCopy) statusText = glanceShow(partialCopy);
    else if (nothingLeft) statusText = laneVerifyCopy('missing');
    else if (!allPresent) statusText = anyUnknown ? laneVerifyCopy('unverified') : (partialCopy ? glanceShow(partialCopy) : laneVerifyCopy('missing'));
    const keepUndo = !nothingLeft;
    const statusEl = el('span', 'flow-chip-handled' + (allPresent && !partialReceipt ? '' : ' flow-chip-handled-partial'), statusText);
    statusEl.setAttribute('data-glance-verified', allPresent ? '1' : '0');
    done.appendChild(statusEl);
    steps.forEach((step, i) => {
      const text = step && (step.line || step.undoLine);
      if (!text) return;
      const note = verdict[i] === 'missing' ? ' — ' + laneVerifyCopy('missing') : (verdict[i] === 'unknown' ? ' — ' + laneVerifyCopy('unverified') : '');
      const span = el('span', 'flow-chip-written', text + note);
      if (step.undoLine) span.setAttribute('data-glance-undo-line', step.undoLine);
      done.appendChild(span);
    });
    const undoLabel = steps.length > 1 ? glanceUiCopy('undoAll') : glanceUiCopy('undo');
    const undo = el('button', 'flow-chip-undo', undoLabel);
    undo.type = 'button';
    const hint = el('span', 'flow-chip-undo-hint');
    hint.hidden = true;
    const actionsRow = el('span', 'flow-chip-actions');
    actionsRow.appendChild(undo);
    function paintLaneRetry(result) {
      if (done.replaceChildren) done.replaceChildren();
      else done.textContent = '';
      const outcomes = (result && result.outcomes) || [];
      outcomes.forEach((row) => {
        if (row && row.written) done.appendChild(el('span', 'flow-chip-written', row.written));
      });
      const retryable = outcomes.some((row) => row && row.ok === false && !laneEditedReason(row.reason));
      if (!retryable) return;
      const again = el('button', 'flow-chip-undo', glanceUiCopy('tryAgain'));
      again.type = 'button';
      again.addEventListener('click', () => {
        again.textContent = glanceUiCopy('undoing');
        again.disabled = true;
        undoStoredLane(messageId).then((next) => {
          if (next && next.ok) {
            if (done.replaceChildren) done.replaceChildren(el('span', 'flow-chip-label', next.written || ''));
            noteLaneTaskUndone(messageNode, messageId, record);
            return;
          }
          if (next && next.partial) {
            paintLaneRetry(next);
            return;
          }
          again.textContent = glanceUiCopy('tryAgain');
          again.disabled = false;
          hint.hidden = false;
          hint.textContent = (next && (next.error || next.written)) || glanceUiCopy('stepFailed');
          hint.className = 'flow-chip-undo-hint flow-chip-undo-failed';
          if (!hint.parentNode) done.appendChild(hint);
        }).catch(() => { tearDownOrphan(); });
      });
      const retryRow = el('span', 'flow-chip-actions');
      retryRow.appendChild(again);
      done.appendChild(retryRow);
      done.appendChild(hint);
    }
    undo.addEventListener('click', () => {
      undo.textContent = glanceUiCopy('undoing');
      undo.disabled = true;
      undoStoredLane(messageId).then((result) => {
        if (result && result.ok) {
          if (done.replaceChildren) done.replaceChildren(el('span', 'flow-chip-label', result.written || ''));
          noteLaneTaskUndone(messageNode, messageId, record);
          return;
        }
        if (result && result.partial) {
          paintLaneRetry(result);
          return;
        }
        undo.textContent = undoLabel;
        undo.disabled = false;
        hint.hidden = false;
        const edited = result && (result.reason === 'user-edited' || result.reason === 'range-edited') && glanceUiHebrew();
        hint.textContent = edited ? glanceUiCopy('edited') : ((result && (result.error || result.written)) || laneFailLine(''));
        hint.className = 'flow-chip-undo-hint flow-chip-undo-failed';
      }).catch(() => { tearDownOrphan(); });
    });
    if (keepUndo && !(record && record.noUndo)) {
      done.appendChild(actionsRow);
      done.appendChild(hint);
    }
    host.appendChild(done);
    if (messageNode.firstChild) messageNode.insertBefore(host, messageNode.firstChild);
    else messageNode.appendChild(host);
  }

  // The Handled banner after Gmail tears the message node down. Same
  // receipt as the Do It that just landed: status, written line, process
  // name, Undo (deletes the task by externalId), and View.
  function mountProvedTaskReceipt(messageNode, row, verified) {
    if (!messageNode || messageNode.querySelector('.flow-chip-host')) return;
    const copy = (typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.remountCopy)
      ? FlowProofOfClose.remountCopy(row)
      : null;
    if (!copy) return;
    const googleTask = copy.connectorId === 'googleTask' || copy.connectorId === 'googleTasks';
    const taskRef = copy.ref && copy.ref.taskListId && (copy.ref.taskId || copy.ref.externalId) ? copy.ref : null;
    if (googleTask && !verified) {
      // The Activity row says a task was written. Google is asked before a tick.
      if (messageNode.getAttribute('data-glance-lane-verifying') === '1') return;
      if (!taskRef) {
        paintLaneReceipt(messageNode, { steps: [{ connectorId: 'googleLaneTask', ref: {}, line: copy.writtenLine || 'Google Task', undoLine: '' }], noUndo: true }, row.messageId || '', ['unknown']);
        return;
      }
      messageNode.setAttribute('data-glance-lane-verifying', '1');
      const step = { connectorId: 'googleLaneTask', ref: taskRef, line: copy.writtenLine || 'Google Task', undoLine: '' };
      verifyLaneSteps([step]).then((states) => {
        messageNode.removeAttribute('data-glance-lane-verifying');
        if (!messageNode.isConnected || messageNode.querySelector('.flow-chip-host')) return;
        if (states[0] === 'present') { mountProvedTaskReceipt(messageNode, row, true); return; }
        paintLaneReceipt(messageNode, { steps: [step], noUndo: true }, row.messageId || '', states);
      }).catch(() => { messageNode.removeAttribute('data-glance-lane-verifying'); });
      return;
    }

    const host = el('div', 'flow-chip-host flow-chip-settled');
    host.setAttribute('dir', 'ltr');
    host.setAttribute('data-glance-chain', 'task-proof');
    host.setAttribute('data-glance-message', row.messageId || '');

    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    done.setAttribute('role', 'status');
    const icon = el('span', 'flow-chip-done-icon', '✓');
    icon.setAttribute('aria-hidden', 'true');
    done.appendChild(icon);
    done.appendChild(el('span', 'flow-chip-handled', glanceShow(copy.status)));
    if (copy.writtenLine) done.appendChild(el('span', 'flow-chip-written', copy.writtenLine));
    if (copy.processName || copy.closedLine) {
      const detail = el('span', 'flow-chip-detail');
      if (copy.processName) detail.appendChild(el('span', 'flow-chip-process-name', receiptProcessName(copy.processName)));
      if (copy.closedLine) detail.appendChild(el('span', 'flow-chip-label', glanceShow(copy.closedLine)));
      done.appendChild(detail);
    }

    const undoLabel = glanceUiCopy('undo');
    const undo = el('button', 'flow-chip-undo', glanceShow(undoLabel));
    undo.type = 'button';
    undo.setAttribute('aria-label', glanceShow(undoLabel));
    const hint = el('span', 'flow-chip-undo-hint');
    hint.hidden = true;
    if (copy.undoHint && copy.undoHint !== undoLabel) hint.textContent = glanceShow(copy.undoHint);
    const actionsRow = el('span', 'flow-chip-actions');
    actionsRow.appendChild(undo);
    if (copy.url) {
      const view = el('a', 'flow-chip-link', glanceChrome().view);
      view.href = copy.url;
      view.target = '_blank';
      view.rel = 'noopener';
      actionsRow.appendChild(view);
    }
    undo.addEventListener('click', () => {
      if (copy.connectorId === 'computerClose') {
        undo.textContent = glanceChrome().undoing;
        undo.disabled = true;
        const messageId = row.messageId;
        const mark = typeof FlowStorage.markComputerUndone === 'function'
          ? FlowStorage.markComputerUndone(messageId, copy.ref, row.threadId)
          : Promise.resolve({ hit: false, stayedHandled: true });
        mark.then((marked) => {
          if (!marked || !marked.hit || marked.stayedHandled !== false) {
            undo.textContent = copy.undoHint;
            undo.disabled = false;
            hint.hidden = false;
            hint.textContent = 'Undo unavailable.';
            hint.className = 'flow-chip-undo-hint flow-chip-undo-failed';
            return;
          }
          if (messageId && typeof FlowCloseMemory !== 'undefined') {
            FlowCloseMemory.forgetMessage(messageId).catch(() => {});
          }
          if (messageId) {
            FlowStorage.recordCloseQuality({ kind: 'falseDoIt', messageId: messageId, reason: 'undo' })
              .catch((e) => console.error('[Glance] failed to record an undo as a false-Do-It', e));
          }
          const Proof = typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null;
          const line = marked.available && marked.inverseVerified
            ? (Proof ? Proof.COMPUTER_UNDONE_LINE : copy.undoneLine)
            : (marked.available
              ? (Proof ? Proof.COMPUTER_ACTIVITY_CLEARED : 'Undone — Activity no longer says Handled.')
              : (Proof ? Proof.COMPUTER_UNDO_UNAVAILABLE : 'Undo unavailable.'));
          done.replaceChildren(el('span', 'flow-chip-label', line));
        }).catch((e) => {
          console.error('[Glance] failed to record an undone page step', e);
          undo.textContent = copy.undoHint;
          undo.disabled = false;
        });
        return;
      }
      undo.textContent = glanceChrome().undoing;
      undo.disabled = true;
      undoStoredLane(row.messageId, copy).then((result) => {
        if (result && result.partial) {
          done.replaceChildren(el('span', 'flow-chip-label', result.written || copy.undoneLine));
          return;
        }
        if (!(result && result.ok)) {
          undo.textContent = copy.undoHint;
          undo.disabled = false;
          hint.hidden = false;
          const edited = result && (result.reason === 'user-edited' || result.reason === 'range-edited') && glanceUiHebrew();
          hint.textContent = edited ? glanceUiCopy('edited') : ((result && (result.error || result.written)) || glanceUiCopy('still'));
          hint.className = 'flow-chip-undo-hint flow-chip-undo-failed';
          return;
        }
        const messageId = row.messageId;
        if (messageId && typeof FlowCloseMemory !== 'undefined') {
          FlowCloseMemory.forgetMessage(messageId).catch(() => {});
        }
        if (messageId) {
          FlowStorage.recordCloseQuality({ kind: 'falseDoIt', messageId: messageId, reason: 'undo' })
            .catch((e) => console.error('[Glance] failed to record an undo as a false-Do-It', e));
        }
        done.replaceChildren(el('span', 'flow-chip-label', (result && result.written) || copy.undoneLine));
        const mark = typeof FlowStorage.markGoogleTaskUndone === 'function'
          ? FlowStorage.markGoogleTaskUndone(messageId, copy.ref, row.threadId)
          : Promise.resolve({ hit: false });
        mark.then((marked) => {
          if (marked && marked.hit) return null;
          return FlowStorage.appendLog({
            kind: 'undone',
            label: row.label || 'Google Task',
            messageId: messageId,
            threadId: row.threadId || null,
            externalId: copy.externalId,
            app: SOURCE_APP,
            connectorId: copy.connectorId,
            undone: true
          });
        }).catch((e) => console.error('[Glance] failed to record an undone task — the task itself was already removed', e));
        chrome.runtime.sendMessage({ type: 'flow:track', event: 'action_undone', params: { domain: state && state.domainId } });
      }).catch(() => { tearDownOrphan(); });
    });
    done.appendChild(actionsRow);
    done.appendChild(hint);
    host.appendChild(done);
    messageNode.insertBefore(host, messageNode.firstChild);
  }

  // A filled compose is a preview. The person sends it. The receipt says
  // what was filled and offers Undo. It does not say Handled.
  // The Do It control is redrawn while the step runs, so the clicked button
  // is no longer in the page. The receipt replaces the card host, the same
  // place a proved write leaves its line.
  function placeReceipt(host, chip, done) {
    if (host && typeof host.replaceChildren === 'function') {
      host.classList.add('flow-chip-settled');
      host.replaceChildren(done);
      return;
    }
    if (chip && typeof chip.replaceWith === 'function') chip.replaceWith(done);
  }

  function showDocPreviewReceipt(host, chip, result, ctx) {
    const response = result.response || {};
    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('role', 'status');
    const he = glanceUiHebrew();
    done.appendChild(el('span', 'flow-chip-written', response.written || (he ? 'המסמך מוכן לעיון — לא נשלח.' : 'Document ready to preview — not sent.')));
    if (response.url) {
      const link = el('a', 'flow-chip-written', he ? 'פתח ב-Docs' : 'Open in Docs');
      link.href = response.url;
      link.target = '_blank';
      link.rel = 'noopener';
      done.appendChild(link);
    }
    const undo = el('button', 'flow-chip-undo', glanceShow(glanceUiCopy('undo') || 'Undo'));
    undo.type = 'button';
    undo.addEventListener('click', () => {
      undo.disabled = true;
      undo.textContent = he ? 'מבטל…' : 'Undoing…';
      sendLaneUndo('googleDoc', response.ref).then((undone) => {
        undo.textContent = undone && undone.ok ? (he ? 'בוטל' : 'Undone') : (undone && undone.error) || (he ? 'לא בוטל' : 'Undo failed');
        if (undone && undone.ok) {
          userContextEvent({ type: 'undo', partyKey: userContextParty(ctx), intentFamily: userContextFamily(ctx), at: new Date().toISOString() });
        }
      });
    });
    const actionsRow = el('div', 'flow-chip-actions-row');
    actionsRow.appendChild(undo);
    done.appendChild(actionsRow);
    placeReceipt(host, chip, done);
    if (response.proof && response.proof.fetchedBack === true) {
      userContextEvent({
        type: 'approved',
        partyKey: userContextParty(ctx),
        intentFamily: userContextFamily(ctx),
        fetchedBack: true,
        at: new Date().toISOString()
      });
    }
  }

  function showPreviewReceipt(host, chip, result, ctx) {
    const response = result.response || {};
    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('role', 'status');
    if (!composeReadBack(response)) {
      done.appendChild(el('span', 'flow-chip-label', reasonMessage(response, null)));
      placeReceipt(host, chip, done);
      return;
    }
    done.appendChild(el('span', 'flow-chip-written', response.written || 'Compose filled. You send it.'));
    if (response.showCopy && response.copyText) {
      const copyLabel = (typeof FlowDisplay !== 'undefined' && FlowDisplay.chrome)
        ? (FlowDisplay.chrome(glanceUiLang()).googleContactCopy || 'Copy')
        : 'Copy';
      const copyBtn = el('button', 'flow-chip-copy', copyLabel);
      copyBtn.type = 'button';
      copyBtn.addEventListener('click', () => {
        const text = String(response.copyText || '');
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(text).catch(() => {});
        }
      });
      done.appendChild(copyBtn);
    }
    const undo = el('button', 'flow-chip-undo', 'Undo');
    undo.type = 'button';
    undo.addEventListener('click', () => {
      undo.disabled = true;
      undo.textContent = 'Undoing…';
      sendLaneUndo('gmailCompose', response.ref).then((undone) => {
        if (undone && undone.ok) {
          done.replaceChildren(el('span', 'flow-chip-label', undone.written || 'Undone. Nothing was sent.'));
          return;
        }
        const line = (undone && (undone.error || undone.written)) || 'Undo stopped. The compose was not cleared.';
        done.replaceChildren(el('span', 'flow-chip-label', line));
      });
    });
    done.appendChild(undo);
    placeReceipt(host, chip, done);
    if (ctx && composeReadBack(response)) {
      FlowStorage.appendLog({
        kind: 'written',
        label: activityLabel(ctx),
        messageId: ctx.messageId,
        legacyMessageId: ctx.legacyMessageId || null,
        threadId: ctx.threadId || null,
        where: response.where,
        url: response.url,
        ref: activityLogRef(response.ref),
        connectorId: result.action && (laneConnectorId(result.action.kind) || result.action.kind),
        app: SOURCE_APP
      }).catch((e) => console.error('[Glance] failed to record a compose preview in the activity log', e));
    }
  }

  // A write Google accepted and has not shown back yet. It is in Google, so
  // it has to be undoable. It is never a checkmark and never Handled.
  function unverifiedOrphan(r) {
    return !!(r && r.response && r.response.reason === 'unverified' && r.response.ref && r.action && laneConnectorId(r.action.kind));
  }

  function savedReplyDraft(r) {
    const res = r && r.response;
    return !!(res && res.ok === true && res.ref && res.ref.draftId && r.action && laneConnectorId(r.action.kind) === 'gmailCompose');
  }

  function draftReadBackVerified(r) {
    if (!savedReplyDraft(r)) return false;
    const gate = typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null;
    const proof = r.response && r.response.proof;
    if (gate && typeof gate.isProof === 'function' && gate.isProof(proof)) return true;
    return r.response && r.response.fetchedBack === true;
  }

  function composeDraftClosed(r) {
    const res = r && r.response;
    if (!res || res.ok !== true || res.skipped) return false;
    if (!r.action || laneConnectorId(r.action.kind) !== 'gmailCompose') return false;
    if (draftReadBackVerified(r)) return true;
    return !!composeReadBack(res);
  }

  function receiptClosedStep(r) {
    if (stepHandled(r)) return true;
    return composeDraftClosed(r);
  }

  function orphanLine(r) {
    const line = laneStepLine(laneConnectorId(r.action.kind), r.response);
    return line + ' — ' + glanceUiCopy('notVerified');
  }

  // Only orphans on screen: no checkmark, "Not verified", the rows with the
  // same note, and Undo that deletes each one by its id. The ids are stored,
  // so the next open reads Google again before it says anything more.
  function showUnverifiedReceipt(host, chip, ctx, results, orphans) {
    const msgId = ctx.legacyMessageId || ctx.messageId;
    rememberLaneUndo(msgId, laneUndoStepsOf(orphans), ctx.laneIds, { total: results.length });
    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    done.setAttribute('role', 'status');
    const status = el('span', 'flow-chip-handled flow-chip-handled-partial', glanceShow(glanceUiCopy('notVerified')));
    status.setAttribute('data-glance-verified', '0');
    done.appendChild(status);
    orphans.forEach((r) => done.appendChild(el('span', 'flow-chip-written', glanceShow(orphanLine(r)))));
    done.appendChild(el('span', 'flow-chip-label', reasonMessage(orphans[0].response, ctx)));
    const undo = el('button', 'flow-chip-undo', glanceShow(orphans.length > 1 ? glanceUiCopy('undoAll') : glanceUiCopy('undo')));
    undo.type = 'button';
    const hint = el('span', 'flow-chip-undo-hint');
    hint.hidden = true;
    undo.addEventListener('click', () => {
      undo.textContent = glanceUiCopy('undoing');
      undo.disabled = true;
      rollbackChain(orphans, ctx).then((result) => {
        if (result.ok) {
          writeLaneUndoRow(msgId, [], { total: results.length }, ctx.laneIds);
          done.replaceChildren(el('span', 'flow-chip-label', glanceShow(laneUndoLine(laneConnectorId(orphans[0].action.kind)) || 'Undone.')));
          return;
        }
        undo.textContent = glanceUiCopy('undo');
        undo.disabled = false;
        hint.hidden = false;
        hint.textContent = glanceShow(result.error || laneFailLine(laneConnectorId(orphans[0].action.kind)));
        hint.className = 'flow-chip-undo-hint flow-chip-undo-failed';
      });
    });
    const actionsRow = el('span', 'flow-chip-actions');
    actionsRow.appendChild(undo);
    done.appendChild(actionsRow);
    done.appendChild(hint);
    placeReceipt(host, chip, done);
    noteLaneOutcome(results);
  }

  // A refused write: the account could not be verified, or is another one.
  // Nothing was written. A calendar event that was written and then removed
  // for the wrong account carries `expected` and is not this.
  function accountRefusal(r) {
    const x = r && r.response;
    return !!(x && !x.ok && !x.expected && x.needsReconnect && (x.reason === 'wrong-account' || x.reason === 'account-unverified'));
  }

  // The Reconnect button for the account the Gmail tab shows. It sits on the
  // card, next to the refusal line, and never ticks anything.
  function offerReconnect(host, chip, response) {
    if (!host || !response) return;
    host.querySelectorAll('.flow-chip-reconnect').forEach((n) => n.remove());
    const he = glanceUiHebrew();
    const label = glanceShow(glanceUiCopy('reconnect'));
    const btn = el('button', 'flow-chip-reconnect', label);
    btn.type = 'button';
    btn.setAttribute('data-glance-reconnect-account', response.reconnectAccount || '');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = he ? 'מתחבר…' : 'Connecting…';
      let res = null;
      try { res = await sendRuntime({ type: 'flow:google-reconnect', account: response.reconnectAccount || '' }); } catch (e) { res = null; }
      if (res && res.ok) {
        btn.remove();
        setChipState(chip, 'flow-chip-error', he ? 'החיבור התחדש. לחץ שוב על Do It.' : 'Reconnected. Press Do It again.');
        return;
      }
      btn.disabled = false;
      btn.textContent = label;
      const named = res && res.account ? res.account : '';
      const want = res && res.wanted ? res.wanted : (response.reconnectAccount || '');
      const line = res && res.reason === 'wrong-account' && named
        ? (he ? 'התחברת עם ' + named + ', אבל Gmail פתוח על ' + want + '. נסה שוב עם ' + want + '.' : 'You signed in as ' + named + ', but this Gmail tab is ' + want + '. Try again as ' + want + '.')
        : (he ? 'לא הצלחתי לאמת את החשבון — יש להתחבר מחדש. לא נכתב דבר.' : "Couldn't verify the account — reconnect Google. Nothing was written.");
      setChipState(chip, 'flow-chip-error', line);
    });
    host.appendChild(btn);
  }

  async function showMultiActionReceipt(host, chip, ctx, results) {
    const succeeded = results.filter(stepHandled);
    const orphans = results.filter((r) => unverifiedOrphan(r) && succeeded.indexOf(r) < 0);
    // A reply draft that was saved is prepared, not a close, so it is not a
    // success. It is still in Gmail, so it is on the receipt and Undo deletes
    // it by its id.
    const drafts = results.filter((r) => savedReplyDraft(r) && succeeded.indexOf(r) < 0 && orphans.indexOf(r) < 0);
    const extra = orphans.concat(drafts);

    if (!succeeded.length && orphans.length) {
      showUnverifiedReceipt(host, chip, ctx, results, orphans);
      return;
    }
    const refused = results.find(accountRefusal);
    if (!succeeded.length && refused) {
      setChipState(chip, 'flow-chip-error', reasonMessage(refused.response, ctx));
      offerReconnect(host, chip, refused.response);
      return;
    }
    if (!succeeded.length) {
      const docPreview = results.find((r) => r.response && r.response.ok === true && r.response.preview === true && r.action && r.action.kind === 'driveDoc');
      if (docPreview) {
        showDocPreviewReceipt(host, chip, docPreview, ctx);
        return;
      }
      const preview = results.find((r) => r.response && composeReadBack(r.response));
      if (preview) {
        showPreviewReceipt(host, chip, preview, ctx);
        return;
      }
      const composeTry = results.find((r) => r.action && !(r.response && r.response.skipped) && (r.action.kind === 'gmailDraft' || laneConnectorId(r.action.kind) === 'gmailCompose'));
      if (composeTry) {
        showPreviewReceipt(host, chip, composeTry, ctx);
        return;
      }
      const unverified = results.find((r) => r.response && (r.response.reason === 'verify_failed' || r.response.reason === 'proof_pending'));
      const firstFailed = results.find((r) => r.response && !r.response.skipped);
      setChipState(chip, 'flow-chip-error', reasonMessage((unverified && unverified.response) || (firstFailed && firstFailed.response) || (results[0] && results[0].response), ctx));
      return;
    }

    // The Magic Moment (see docs/magic-moment.md): read BEFORE this close's
    // own 'written' log entries land further down, so "how many things has
    // Glance ever closed for this account, before this one" is answered
    // against state prior to this call, not state this same call is about
    // to change. No new UI, no popup — the same receipt every close already
    // shows. The status word is always there. The extra magic-moment line
    // is only for the first three full closes, under that word, not
    // instead of it.
    const priorCloses = (await FlowStorage.get()).writeStats.total;
    // Status word and Undo label live in receipt-copy.js so a partial
    // close cannot say "Handled." and the first three closes cannot
    // replace that word with the longer magic-moment sentence. The
    // sentence, when it applies, is an extra line under the status.
    const taskSteps = results.filter(taskKind);
    const attempted = results.filter((r) => r && r.action && !(r.response && r.response.skipped));
    const closedSteps = attempted.filter(receiptClosedStep);
    const copy = FlowReceipt.confirmation({
      succeeded: closedSteps.length,
      total: attempted.length,
      priorCloses,
      lang: glanceUiLang(),
      requireProof: taskSteps.length > 0,
      proofs: taskSteps.length
        ? closedSteps.filter(taskKind).map((r) => r.response && r.response.proof)
        : undefined,
      verifyStatus: (taskSteps[0] && taskSteps[0].response && taskSteps[0].response.reason) || undefined
    });
    if (!copy.status) {
      const unverified = results.find((r) => r.response && (r.response.reason === 'verify_failed' || r.response.reason === 'proof_pending'));
      setChipState(chip, 'flow-chip-error', reasonMessage((unverified && unverified.response) || (results[0] && results[0].response), ctx));
      noteLaneOutcome(results);
      return;
    }

    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    done.setAttribute('role', 'status');
    if (!orphans.length) {
      const icon = el('span', 'flow-chip-done-icon', '✓');
      icon.setAttribute('aria-hidden', 'true');
      done.appendChild(icon);
    }

    const status = el('span', 'flow-chip-handled' + (copy.full ? '' : ' flow-chip-handled-partial'), glanceShow(copy.status));
    done.appendChild(status);
    if (copy.earlyLine) done.appendChild(el('span', 'flow-chip-first-close', glanceShow(copy.earlyLine)));

    // What landed, before the process badge. The written line is the
    // record ("Google Task · due Sep 21") — the same record Undo removes.
    const wheres = [];
    for (const r of succeeded) {
      if (r.response && r.response.where) wheres.push(r.response.where);
    }
    for (const line of FlowActions.receiptWrittenLines(succeeded)) {
      done.appendChild(el('span', 'flow-chip-written', line));
    }
    orphans.forEach((r) => done.appendChild(el('span', 'flow-chip-written', glanceShow(orphanLine(r)))));
    drafts.forEach((r) => done.appendChild(el('span', 'flow-chip-written', glanceUiHebrew() ? 'טיוטת תשובה נשמרה בשרשור הזה. השליחה בידיים שלך.' : glanceShow(String(r.response.written || '')))));
    const wroteAs = succeeded.map((r) => r.response && r.response.account).find((a) => typeof a === 'string' && a);
    if (wroteAs) {
      const account = el('span', 'flow-chip-account', (glanceUiHebrew() ? 'חשבון: ' : 'Account: ') + wroteAs);
      account.setAttribute('data-glance-account', wroteAs);
      done.appendChild(account);
    }

    const detail = el('span', 'flow-chip-detail');
    detail.appendChild(el('span', 'flow-chip-process-name', receiptProcessName(ctx.process.name)));
    detail.appendChild(el('span', 'flow-chip-label', glanceShow(closedSummary(succeeded, ctx, results))));
    done.appendChild(detail);

    const sole = succeeded.length === 1 && !extra.length ? succeeded[0].response : null;
    const undoHint = (sole && sole.undoHint) || FlowReceipt.undoHint(wheres.concat(extra.map((r) => r.response && r.response.where).filter(Boolean)));
    const undoLabel = glanceShow(copy.undoLabel || (attempted.length > 1 ? glanceUiCopy('undoAll') : glanceUiCopy('undo')));
    const undo = el('button', 'flow-chip-undo', undoLabel);
    undo.type = 'button';
    undo.setAttribute('aria-label', undoLabel);
    const hint = el('span', 'flow-chip-undo-hint');
    hint.hidden = true;
    if (undoHint) hint.textContent = glanceShow(undoHint);

    const actionsRow = el('span', 'flow-chip-actions');
    actionsRow.appendChild(undo);
    for (const r of succeeded) {
      if (!r.response.url) continue;
      const view = el('a', 'flow-chip-link', succeeded.length > 1 ? (glanceChrome().view + ' ' + r.response.where) : glanceChrome().view);
      view.href = r.response.url; view.target = '_blank'; view.rel = 'noopener';
      actionsRow.appendChild(view);
    }
    undo.addEventListener('click', () => {
      undo.textContent = glanceChrome().undoing;
      undo.disabled = true;
      rollbackChain(succeeded.concat(extra), ctx).then((result) => {
        // Recorded regardless of whether the whole rollback reported ok —
        // any step that genuinely reverted is a genuine "don't propose this
        // again" signal, even if a later step in the chain couldn't. Feeds
        // both memories: the step-level bias (recordUndo, already existed)
        // and now the intent-type threshold too (calibrate('undo', ...),
        // new) — an accepted-then-undone process is real, measured harm,
        // and the precision/harm audit's whole point was that harm has to
        // reach the confidence bar, not just Execution Memory's step bias.
        if (result.undoneIds.length) {
          // The stored receipt is the record a reopen repaints. What was taken
          // back leaves it now, so a reopen cannot tick a thing Google no
          // longer holds.
          const gone = new Set(result.undoneIds);
          const left = succeeded.concat(extra).filter((r) => !gone.has(r.action.id));
          writeLaneUndoRow(ctx.legacyMessageId || ctx.messageId, laneUndoStepsOf(left), { partial: left.length < results.length, total: results.length }, ctx.laneIds);
          FlowExecutionMemory.recordUndo(ctx.process.id, result.undoneIds, ctx.messageId);
          FlowStorage.calibrate('undo', ctx.intent.type);
          // The full close is no longer true, so a later message in this
          // matter may speak again. Independent of the receipt text below.
          if (typeof FlowCloseMemory !== 'undefined') {
            FlowCloseMemory.forgetMessage(ctx.messageId).catch(() => {});
          }
          // false-Do-It: the user took back a write that had landed.
          // Once per message, even if a later step in the chain could not
          // be undone — any real revert is the reject. Separate store
          // from personal close memory.
          FlowStorage.recordCloseQuality({ kind: 'falseDoIt', messageId: ctx.messageId, reason: 'undo' })
            .catch((e) => console.error('[Glance] failed to record an undo as a false-Do-It', e));
          if (ctx.surface === 'still-open') {
            FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: ctx.messageId })
              .catch((e) => console.error('[Glance] failed to record a Still Open undo', e));
          }
        }
        if (result.ok) {
          const undone = (sole && sole.undoneLine) || FlowReceipt.undoneLine(wheres.concat(extra.map((r) => r.response && r.response.where).filter(Boolean)));
          done.replaceChildren(el('span', 'flow-chip-label', glanceShow(undone)));
          const taskSteps = succeeded.filter(taskKind);
          const markTask = taskSteps.length && typeof FlowStorage.markGoogleTaskUndone === 'function'
            ? Promise.all(taskSteps.map((r) => FlowStorage.markGoogleTaskUndone(ctx.messageId, r.response && r.response.ref, ctx.threadId)))
            : Promise.resolve([]);
          markTask.then((marked) => {
            const covered = taskSteps.length > 0 && Array.isArray(marked) && marked.some((m) => m && (m.hit || m.ok));
            if (taskSteps.length === succeeded.length && covered) return null;
            return FlowStorage.appendLog({
              kind: 'undone',
              label: activityLabel(ctx),
              messageId: ctx.messageId,
              threadId: ctx.threadId || null,
              connectorId: taskSteps.length === succeeded.length ? 'googleTask' : undefined,
              undone: true,
              app: SOURCE_APP
            });
          }).catch((e) => console.error('[Glance] failed to record an undone task — the task itself was already removed', e));
          chrome.runtime.sendMessage({ type: 'flow:track', event: 'action_undone', params: { domain: state.domainId } });
        } else {
          // The button stays Undo. Replacing its label with the failure
          // sentence hid the only control that can finish the rollback.
          // The hint under it says what is still there — "some of this"
          // was a lie when nothing had moved.
          const note = FlowReceipt.reverseNote({
            reversed: result.undoneIds.length,
            remaining: succeeded.length - result.undoneIds.length,
            keptWhere: result.keptWhere
          });
          const refused = result.reason === 'user-edited' || result.reason === 'range-edited' || result.reason === 'range-missing' || result.reason === 'unconfirmed';
          undo.textContent = glanceShow(refused ? 'Undo' : copy.undoLabel);
          undo.disabled = refused;
          hint.hidden = false;
          hint.textContent = glanceShow((refused && result.error) ? result.error : note);
          hint.className = 'flow-chip-undo-hint flow-chip-undo-failed';
        }
      });
    });
    done.appendChild(actionsRow);
    done.appendChild(hint);

    // A partial success (some steps didn't complete) has to say which ones
    // and why, not just how many — "1 of 2 didn't complete" leaves the user
    // guessing whether to retry, reconnect something, or ignore it. Reuses
    // the same action.label the step's own pill already shows, and the same
    // reasonMessage() the fully-failed path (above) already uses, so a
    // failure reads the same whether it's the only thing that happened or
    // one line in a partial receipt.
    const failedNote = results.filter((r) => !stepHandled(r) && !(r.response && (r.response.ok || r.response.skipped)));
    if (failedNote.length) {
      const failed = failedNote;
      const detail = failed.map((r) => glanceShow(r.action.label) + ': ' + reasonMessage(r.response, ctx)).join(' · ');
      done.appendChild(el('span', 'flow-chip-partial-note', '(' + detail + ')'));
    }

    // The host is still the proposal card (blue frame on the chip, blue
    // row in the Brief). Drop that chrome so the receipt is the only
    // thing left on screen — a blue card around "Handled." reads as if
    // the proposal is still open.
    host.classList.add('flow-chip-settled');
    host.replaceChildren(done);

    // Awaited (and the caller — onDoIt — awaits this whole function) so
    // that by the time checkBrief() next reads FlowStorage fresh, these
    // writes have actually landed. The two used to fire without a caller
    // ever waiting on them, and checkBrief() ran immediately after on the
    // same tick — meaning the just-closed message could still read as
    // "pending" for one refresh cycle, showing a stale count on the badge,
    // the Brief indicator, and any Resurfacing card for exactly the message
    // that just closed.
    //
    // Each call is individually caught rather than left to a bare
    // Promise.all: the real writes above already succeeded by this point,
    // so a bookkeeping failure here must never surface as "Something went
    // wrong" on a process that actually closed — that would invite exactly
    // the retry-produces-a-duplicate-write scenario this product treats as
    // the one unacceptable failure. Losing this specific log entry is a
    // real, narrow residual risk (hasTerminalOutcome wouldn't yet know this
    // message is resolved), logged so it's at least visible, not silent.
    // A meeting that went on the Calendar is remembered (title and date only) so
    // the day after, the popup can ask what came out of it.
    const meetingIso = ctx.intent && ctx.intent.facts && ctx.intent.facts.date && ctx.intent.facts.date.iso;
    const calendarStep = succeeded.find((r) => r.action && r.action.kind === 'calendar');
    const meetingNote = calendarStep && meetingIso && typeof FlowStorage.recordMeeting === 'function'
      ? FlowStorage.recordMeeting({ id: ctx.messageId, title: ctx.intent.label, dateIso: meetingIso, threadUrl: window.location.href })
          .catch((e) => console.error('[Glance] failed to remember the meeting for its debrief', e))
      : null;
    const closedLine = closedSummary(succeeded, ctx, results);
    const bookkeeping = succeeded.map((r) => {
      const proof = r.response && r.response.proof;
      let proofFields = null;
      if (typeof FlowProofOfClose !== 'undefined') {
        proofFields = FlowProofOfClose.receiptLogFields
          ? FlowProofOfClose.receiptLogFields(proof, {
            writtenLine: r.response && r.response.written,
            processName: ctx.process && ctx.process.name,
            closedLine: closedLine,
            status: copy.status
          })
          : (FlowProofOfClose.activityFields(proof) || null);
      }
      return FlowStorage.appendLog(Object.assign({
        kind: 'written',
        label: activityLabel(ctx),
        messageId: ctx.messageId,
        legacyMessageId: ctx.legacyMessageId || null,
        threadId: ctx.threadId || null,
        where: r.response.where,
        url: r.response.url,
        ref: activityLogRef(r.response.ref),
        connectorId: r.action.kind,
        holdAt: (typeof FlowHeldHold !== 'undefined') ? FlowHeldHold.keyOf(ctx.intent) || undefined : undefined,
        holdSender: (ctx.sender && ctx.sender.email) || undefined,
        app: SOURCE_APP
      }, proofFields))
        .catch((e) => console.error('[Glance] failed to record a completed write — the write itself already succeeded', e));
    });
    if (meetingNote) bookkeeping.push(meetingNote);
    noteLaneOutcome(results);
    bookkeeping.push(rememberLaneUndo(ctx.legacyMessageId || ctx.messageId, laneUndoStepsOf(succeeded.concat(extra)), ctx.laneIds, { total: results.length }));
    // Personal close memory: only a Trusted Do It whose every attempted
    // step actually wrote. A partial chain is not a closed matter. This
    // does not touch the receipt copy above, and it does not share a
    // storage key with close-quality metrics.
    const closeResults = results.filter((r) => !(r && r.response && (r.response.preview === true || r.response.closes === false)));
    const trustedClose = typeof FlowProofOfClose !== 'undefined'
      ? FlowProofOfClose.shouldRecordTrustedClose(closeResults)
      : closeResults.length > 0 && !closeResults.some(taskKind) && closeResults.every((r) => r && r.response && r.response.ok === true && !r.response.skipped);
    if (typeof FlowCloseMemory !== 'undefined' && ctx.intent && ctx.intent.personalClose && FlowCloseMemory.fullWriteOf(results) && trustedClose) {
      bookkeeping.push(
        FlowCloseMemory.recordClose({
          personalClose: ctx.intent.personalClose,
          fullWrite: true,
          threadId: ctx.threadId,
          subject: ctx.subject,
          snippet: ctx.bodyText,
          messageId: ctx.messageId,
          targets: succeeded.map((r) => r.action && r.action.kind)
        }).catch((e) => console.error('[Glance] failed to remember a personal close — the write itself already succeeded', e))
      );
    }
    // success: every step the chip proposed actually wrote. Partials stay
    // out. This count does not follow the receipt string ("Handled." vs
    // "Partly handled."). Local only; not a flow:track event.
    if (typeof FlowCloseQuality !== 'undefined' && trustedClose && FlowCloseQuality.isFullWrite(ctx.process.steps.length, succeeded.length)) {
      bookkeeping.push(
        FlowStorage.recordCloseQuality({ kind: 'success', messageId: ctx.messageId })
          .catch((e) => console.error('[Glance] failed to record a full-close success', e))
      );
    }
    await Promise.all(bookkeeping);
    chrome.runtime.sendMessage({ type: 'flow:track', event: 'write_completed', params: { domain: state.domainId, actionCount: succeeded.length } });
    // The "opened vs closed" funnel pair with chip_shown — fired here and in
    // onDismiss's own decline path, since both are real ways a proposed
    // process stops being open (see storage.js's getPending/
    // hasTerminalOutcome, which treat them identically). method is the only
    // thing that tells the two apart downstream.
    chrome.runtime.sendMessage({ type: 'flow:track', event: 'process_closed', params: { domain: state.domainId, method: 'done' } });
  }

  async function onDoIt(host, chip, ctx, liveSteps) {
    // A guard against acting on stale UI, not a defensive nicety: this
    // product now has FOUR independent surfaces that can close the exact
    // same process (the live chip, a Brief panel row, a Contextual
    // Resurfacing card, and the popup's Open tab), each rendered from a
    // snapshot that can go stale the moment any OTHER surface resolves the
    // same message. Without this check, clicking Do It on a row that's
    // already been dismissed or written elsewhere performs a REAL duplicate
    // write — a second Google Task, a second Calendar event — which is the
    // one failure this product has never accepted as tolerable. See
    // storage.js's hasTerminalOutcome for the one shared definition of
    // "already decided."
    if (await FlowStorage.hasTerminalOutcome(ctx.messageId)) {
      setChipState(chip, 'flow-chip-error', 'Already closed elsewhere — nothing to do.');
      checkBrief();
      return;
    }
    if (ctx.intent && ctx.intent.removeHeld) return removeHeldHold(host, chip, ctx);

    // Every pill removed is a deliberate "do nothing" — the same outcome as
    // dismissing the chip, not a disabled button with no explanation. It also
    // reads to Execution Memory as a full rejection (onDismiss records it),
    // which is correct: the user saw the whole process and kept none of it.
    if (!liveSteps.length) { onDismiss(host, ctx); return; }
    if (host.dataset.collectorOpen === '1') return;
    const offered = ctx.app === 'gmail' && host.closest ? host.closest('[data-legacy-message-id], [role="listitem"], .adn') : null;
    if (offered && copiedOnlyNow(offered, ctx.bodyText || '', ownEmailFromThread() || lastOwnEmail || '')) {
      withdrawOffer(offered, ctx.messageId);
      return;
    }
    // Only a template create (a Doc or Sheet) has a body to build. Family B
    // (file-on-hold / file-on-task) has no template. artifactBody reports
    // that as blank, and returning here used to leave the Hold it card
    // exactly as it was: no Closing state, no activity row, no calendar write.
    if (!ctx.googleBuilt && ctx.intent && ctx.intent.googleClose && typeof FlowGoogleCloses !== 'undefined' &&
        typeof FlowGoogleCloses.needsArtifactBody === 'function' &&
        FlowGoogleCloses.needsArtifactBody(ctx.intent.googleClose)) {
      const fills = readSlotFills(host);
      const built = FlowGoogleCloses.artifactBody(ctx.intent.googleClose, fills);
      if (!built || built.blank) {
        const empty = host.querySelector('.flow-chip-field-input');
        if (empty) {
          empty.focus();
          return;
        }
        setChipState(chip, 'flow-chip-error', glanceChrome().nothingWritten);
        return;
      }
      ctx.slotFills = fills;
      ctx.googleBuilt = built;
    }

    // return: this is a real Do It use (the guards above already rejected
    // a stale row and an empty step list). The first one ever, and any
    // later one on the same local day, do not increment the counter.
    FlowStorage.recordCloseQuality({ kind: 'doIt', messageId: ctx.messageId })
      .catch((e) => console.error('[Glance] failed to record a Do It use for return', e));
    if (ctx.surface === 'still-open') {
      FlowStorage.recordStillOpenMetric({ kind: 'doIt', messageId: ctx.messageId })
        .catch((e) => console.error('[Glance] failed to record a Still Open Do It', e));
    }

    setChipState(chip, 'flow-chip-pending', 'Closing…');
    if (host.__glanceSteps) host.__glanceSteps.setAll('preparing');
    const slotFills = readSlotFills(host);
    if (slotFills && Object.keys(slotFills).length) {
      userContextEvent({ type: 'edited', partyKey: userContextParty(ctx), intentFamily: userContextFamily(ctx), at: new Date().toISOString() });
    }
    userContextEvent({
      type: 'approved',
      partyKey: userContextParty(ctx),
      intentFamily: userContextFamily(ctx),
      fetchedBack: false,
      at: new Date().toISOString()
    });
    FlowStorage.appendLog({ kind: 'clicked', label: activityLabel(ctx), messageId: ctx.messageId, score: ctx.intent.signals.score, app: SOURCE_APP });
    FlowStorage.calibrate('click', ctx.intent.type);
    chrome.runtime.sendMessage({ type: 'flow:track', event: 'chip_clicked', params: { domain: state.domainId } });

    // By catalog step id (ctx.process.steps' own ids — 'calendar'/'draft'/
    // 'task'), not by connector kind — this is the vocabulary Execution
    // Memory and actions.js's applyMemory() both key on. intentionId is the
    // message this specific process was proposed for.
    const liveIds = new Set(liveSteps.map((s) => s.id));
    const acceptedKinds = ctx.process.steps.filter((s) => liveIds.has(s.id)).map((s) => s.id);
    const removedKinds = ctx.process.steps.filter((s) => !liveIds.has(s.id)).map((s) => s.id);
    FlowExecutionMemory.recordDoIt(ctx.process.id, acceptedKinds, removedKinds, ctx.messageId);

    // Stepwise feedback while the chain is still running — "I'm going to
    // close this for you" has to keep feeling true mid-flight, not just
    // before and after. doneVerbs only ever grows with what actually
    // succeeded; a failed or dependency-skipped step never gets narrated as
    // done. Deliberately no "(1/2)" step counter here — a raw fraction
    // reads as a technical progress bar, not as someone telling you what
    // they're doing; the verbs alone already say exactly as much as the
    // user needs mid-flight, and the counter added nothing but arithmetic.
    const doneVerbs = [];
    function onStepDone(result) {
      if (host.__glanceSteps && result && result.action) {
        const proved = result.response && result.response.proof && result.response.proof.fetchedBack === true;
        const next = (result.response && result.response.ok) ? (proved ? 'verified' : 'verifying') : 'failed';
        host.__glanceSteps.setRow(result.action.id, next, next === 'failed' ? reasonMessage(result.response, ctx) : null);
      }
      if (result.response && result.response.ok) {
        doneVerbs.push(STEP_DONE_VERB[result.action.kind] || 'completed one step');
      }
      const progress = doneVerbs.length ? joinWithAnd(doneVerbs) : 'working';
      setChipState(chip, 'flow-chip-pending', 'Closing — ' + progress + '…');
    }

    runActionsSequentially(liveSteps, ctx, onStepDone)
      .then(async (results) => { await showMultiActionReceipt(host, chip, ctx, results); checkBrief(); })
      .catch(() => setChipState(chip, 'flow-chip-error', 'Something went wrong. Try again.'));
  }

  async function onDismiss(host, ctx) {
    host.remove();
    // Same staleness guard as onDoIt, for the same reason — just a lighter
    // consequence here: recording a second 'dismissed' outcome for an
    // already-closed message doesn't create a duplicate real-world write
    // (storage.js's own resolvedMessageIds dedup already absorbs that), but
    // it WOULD inflate Execution Memory's removed-count for these steps
    // with a event that isn't a real, new decision — skewing actions.js's
    // future bias toward dropping a step the user didn't actually reject
    // twice. The row is already gone from the screen either way.
    if (await FlowStorage.hasTerminalOutcome(ctx.messageId)) { checkBrief(); return; }
    // Awaited together before checkBrief() runs — same reasoning as
    // showMultiActionReceipt's own comment: checkBrief() reads FlowStorage
    // fresh, and used to run before this message's own dismissal had
    // necessarily landed, so it could still show up as "pending" for one
    // refresh cycle right after being dismissed.
    //
    // Each of the three is independently caught for the same reason
    // showMultiActionReceipt's write-logging is: these are three genuinely
    // separate stores (the display log, the calibration counters,
    // Execution Memory), and one failing must never take the other two
    // down with it via a shared Promise.all rejection, nor skip the
    // tracking/checkBrief() below that a real dismiss still deserves.
    await Promise.all([
      FlowStorage.appendLog({ kind: 'dismissed', label: activityLabel(ctx), messageId: ctx.messageId, score: ctx.intent.signals.score, app: SOURCE_APP })
        .catch((e) => console.error('[Glance] failed to record a dismiss in the activity log', e)),
      Promise.resolve(userContextEvent({ type: 'dismissed', partyKey: userContextParty(ctx), intentFamily: userContextFamily(ctx), at: new Date().toISOString() })),
      FlowStorage.calibrate('dismiss', ctx.intent.type)
        .catch((e) => console.error('[Glance] failed to update precision calibration for a dismiss', e)),
      FlowExecutionMemory.recordDismiss(ctx.process.id, ctx.process.steps.map((s) => s.id), ctx.messageId)
        .catch((e) => console.error('[Glance] failed to record a dismiss in Execution Memory', e)),
      // false-Do-It: dismissing the chip is the reject. The same message
      // from another surface is a no-op inside recordCloseQuality.
      FlowStorage.recordCloseQuality({ kind: 'falseDoIt', messageId: ctx.messageId, reason: 'dismiss' })
        .catch((e) => console.error('[Glance] failed to record a dismiss as a false-Do-It', e)),
      ctx.surface === 'still-open'
        ? FlowStorage.recordStillOpenMetric({ kind: 'falseClose', messageId: ctx.messageId, reason: 'dismiss' })
          .catch((e) => console.error('[Glance] failed to record a Still Open dismiss', e))
        : Promise.resolve()
    ]);
    chrome.runtime.sendMessage({ type: 'flow:track', event: 'chip_dismissed', params: { domain: state.domainId } });
    // See showMultiActionReceipt's own comment on process_closed — a decline
    // is a real closure of the loop too, just via the other method.
    chrome.runtime.sendMessage({ type: 'flow:track', event: 'process_closed', params: { domain: state.domainId, method: 'dismissed' } });
    checkBrief();
  }

  /* --------------------------------------------------- Morning Brief (Still Open) */
  //
  // The morning list: at most three personal closes that clear
  // core/still-open.js (a dated promise, an explicit follow-up, a confirmed
  // amount). Not every chip that was shown and ignored — a meeting or a
  // soft nudge never becomes a card here. The in-thread chip is unchanged.
  // Zero-Prompt: nothing renders when the list is empty, and the daily
  // auto-open (FlowStorage.consumeDailyBriefTrigger) is one chance per day,
  // only when there is something to close.
  //
  // Deliberately does NOT expose per-step removal pills the way the live
  // chip's "N steps" toggle does — a dense list of open items is not the
  // place to re-litigate which steps to keep; Do It here closes the process
  // exactly as it was proposed, or Dismiss closes it by declining. That's
  // what keeps this a quiet extension of the chip instead of a second,
  // heavier surface to manage.

  function ctxFromPendingEntry(entry) {
    // No DOM references (no message/messages node) — nothing in the
    // execution path below needs them. Same reconstructed shape injectChip's
    // own ctx already has for every field that matters to buildActionPayload,
    // runActionsSequentially, showMultiActionReceipt, onDoIt, and onDismiss.
    return {
      messageId: entry.messageId,
      threadUrl: entry.threadUrl,
      threadId: entry.threadId || null,
      sender: entry.sender,
      subject: entry.subject,
      intent: entry.intent,
      process: entry.process
    };
  }

  // Same shape as popup.js's own when() for the Activity tab and its Open
  // tab's row — kept as a small local copy rather than a shared import
  // since this file has no existing UI-formatting utility module to put it
  // in, and it's six lines. "Make unresolved processes harder to forget":
  // a process open for three weeks used to look identical, in this same
  // Brief panel, to one from ten minutes ago.
  function relativeAge(ts) {
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.ageLine === 'function') return FlowDisplay.ageLine(ts, glanceUiLang());
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return new Date(ts).toLocaleDateString();
  }

  function briefRowSubtitle(entry) {
    const who = (entry.sender && entry.sender.name) || (entry.sender && entry.sender.email) || '';
    const what = entry.subject || entry.intent.label || '';
    const base = who && what ? who + ' — ' + what : (what || who);
    const age = entry.ts ? relativeAge(entry.ts) : '';
    return age ? (base ? base + ' — ' + age : age) : base;
  }

  /* -------------------------------------------------- Contextual Resurfacing */
  //
  // A still-open process from EARLIER in the exact thread just opened —
  // never "same sender," never "looks related," only ever a genuine other
  // message in this one thread. That's deliberately narrow: this reuses the
  // Brief's own storage and row machinery (a message only ever gets here by
  // already being in FlowStorage.getPending()), so the risk isn't a wrong
  // process being invented, only surfacing the right one in a context looser
  // than intended — and thread-scoped is the tightest "related" this
  // extension can state honestly without a real thread id from Gmail to
  // match on (see threadUrl's own comment on what a legacy message id can
  // and can't promise).

  // The card and the side panel read one record. A mail that already has
  // its Handled receipt is not still open, and it does not get a second Do It.
  async function dropHandledMails(rows) {
    const kept = [];
    for (const row of rows || []) {
      const id = row && row.messageId;
      if (id) {
        let lane = null;
        try { lane = await readLaneUndo(id); } catch (e) { lane = null; }
        if (lane && lane.steps && lane.steps.length) continue;
      }
      kept.push(row);
    }
    return kept;
  }

  async function checkContextualResurface(threadMessages, excludeMessageId) {
    if (typeof FlowBrief === 'undefined') return;

    const freshState = await FlowStorage.get();
    // Same MVP scope gate checkBrief() applies — never resurface a Do It
    // that's guaranteed to fail because the connector it was proposed for
    // isn't the one currently wired up.
    if (freshState.connectorId && freshState.connectorId !== 'googleTasks') { FlowBrief.hideResurface(); return; }

    const threadIds = new Set();
    for (const m of threadMessages) {
      const id = m.getAttribute('data-legacy-message-id');
      if (id && id !== excludeMessageId) threadIds.add(id);
    }
    if (!threadIds.size) { FlowBrief.hideResurface(); return; }

    const pending = await dropHandledMails(await FlowStorage.getPending());
    // Oldest-still-open first (getPending's own order) — if more than one
    // other message in this thread is somehow still open, the same "oldest
    // first" bias the Brief panel uses applies here too.
    const match = pending.find((entry) => threadIds.has(entry.messageId));
    if (!match) { FlowBrief.hideResurface(); return; }

    if (typeof FlowBrief.setUiLang === 'function') FlowBrief.setUiLang(glanceUiLang());
    FlowBrief.showResurface({
      id: match.messageId,
      title: match.process.name,
      subtitle: briefRowSubtitle(match),
      onDoIt(rowHost, doItBtn) {
        const ctx = ctxFromPendingEntry(match);
        onDoIt(rowHost, doItBtn, ctx, ctx.process.steps);
      },
      onDismiss(rowHost) {
        onDismiss(rowHost, ctxFromPendingEntry(match));
        // onDismiss only ever removes the row it's handed — this cleans up
        // the resurface card's own wrapper (its "Still open" label) so
        // dismissing doesn't leave an orphaned, row-less shell on screen.
        FlowBrief.hideResurface();
      }
    });
  }

  function openBriefPanel(pending) {
    // Property names have to be exactly onDoIt/onDismiss — that's the row
    // contract FlowBrief.buildRow calls into (brief.js). Each shorthand
    // method here calls the file-level onDoIt/onDismiss functions above by
    // the same name — that resolves to the outer function, not a
    // self-reference, since an object method shorthand doesn't bind its own
    // name inside its own body the way a named function declaration would.
    const rows = pending.map((entry) => ({
      id: entry.messageId,
      title: (typeof FlowStillOpen !== 'undefined' && FlowStillOpen.whyLine(entry, Date.now(), glanceUiLang())) || entry.process.name,
      subtitle: briefRowSubtitle(entry),
      onDoIt(rowHost, doItBtn) {
        const ctx = ctxFromPendingEntry(entry);
        ctx.surface = 'still-open';
        onDoIt(rowHost, doItBtn, ctx, ctx.process.steps);
      },
      onDismiss(rowHost) {
        const ctx = ctxFromPendingEntry(entry);
        ctx.surface = 'still-open';
        onDismiss(rowHost, ctx);
      }
    }));
    // Re-check on manual close, not just on every resolution inside the
    // panel — closing it is the other moment the indicator's count (and its
    // very existence) might now be stale, e.g. every item was resolved
    // while the panel stayed open and nothing has re-triggered a check since.
    if (typeof FlowBrief.setUiLang === 'function') FlowBrief.setUiLang(glanceUiLang());
    FlowBrief.openPanel(rows, { onClose: () => { FlowBrief.closePanel(); checkBrief(); } });
  }

  // Called once when watching starts, and again right after anything that
  // could change the pending set (a new chip shown, a Do It, a Dismiss) —
  // deliberately not on every debounced Gmail DOM mutation, since the
  // pending set only ever changes at those specific moments, not on
  // arbitrary re-renders.
  // The one place this file tells background.js how many processes are
  // open, so the extension-icon badge (the Subtle Persistent Indicator) can
  // stay in sync without background.js ever computing that number itself —
  // see background.js's own updateBadge comment for why. Fire-and-forget:
  // there is no reply to wait for and nothing here depends on one.
  function reportPendingCount(n) {
    chrome.runtime.sendMessage({ type: 'flow:pending-count', count: n });
  }

  function publishStillOpenDigest(count) {
    const text = (typeof FlowStillOpen !== 'undefined') ? FlowStillOpen.notificationText(count) : '';
    chrome.storage.local.set({
      glanceStillOpenDigest: { count: count, text: text, updatedAt: Date.now() }
    });
  }

  // The morning list, not every unresolved chip. Empty is silence: no
  // indicator, no badge number, no digest that would ping later. The
  // in-thread chip does not go through here.
  async function checkBrief() {
    if (!watching) return;
    const freshState = await FlowStorage.get();
    // Same MVP scope gate as the live chip (scanReadingPane) — never
    // resurface something Do It is guaranteed to fail on because the
    // connector it was proposed for isn't the one currently wired up.
    if (freshState.connectorId && freshState.connectorId !== 'googleTasks') {
      FlowBrief.hide();
      reportPendingCount(0);
      publishStillOpenDigest(0);
      return;
    }

    const open = await dropHandledMails(await FlowStorage.getStillOpen());
    reportPendingCount(open.length);
    publishStillOpenDigest(open.length);
    if (!open.length) {
      // Don't yank an already-open panel out from under someone the instant
      // the last item in it resolves — they just watched it close and
      // deserve to see that, not have the whole surface vanish under the
      // receipt. Only fully hide when nothing is actively being looked at;
      // the panel's own close button re-runs this check, so a stale
      // indicator never outlives the panel that would have refreshed it.
      if (!FlowBrief.isPanelOpen()) FlowBrief.hide();
      return;
    }

    for (const item of open) {
      FlowStorage.recordStillOpenMetric({ kind: 'shown', messageId: item.messageId })
        .catch((e) => console.error('[Glance] failed to record a Still Open card as shown', e));
    }

    if (typeof FlowBrief.setUiLang === 'function') FlowBrief.setUiLang(glanceUiLang());
    FlowBrief.show(open.length, () => openBriefPanel(open));

    // The only thing resembling a daily ritual, and only spent on a day that
    // actually has something to show — see the field's own comment in
    // storage.js for why an empty day never consumes it. Opening the brief
    // is the morning reach, so the OS notification does not also fire.
    if (await FlowStorage.consumeDailyBriefTrigger()) {
      openBriefPanel(open);
      chrome.storage.local.set({ glanceStillOpenNotifiedDate: new Date().toDateString() });
    }
  }

  async function runStillOpenDoIt(messageId) {
    const open = await dropHandledMails(await FlowStorage.getStillOpen());
    const entry = open.find((row) => row.messageId === messageId);
    if (!entry) return;
    openBriefPanel(open);
    const ctx = ctxFromPendingEntry(entry);
    ctx.surface = 'still-open';
    const escaped = (window.CSS && CSS.escape) ? CSS.escape(messageId) : String(messageId).replace(/"/g, '');
    const row = document.querySelector('.flow-brief-row[data-message-id="' + escaped + '"]');
    const btn = row && row.querySelector('.flow-brief-doit');
    if (row && btn) onDoIt(row, btn, ctx, (entry.process && entry.process.steps) || []);
  }

  async function consumeStillOpenHandoff() {
    let got = {};
    try {
      got = await chrome.storage.local.get(['glanceStillOpenOpenBrief', 'glanceStillOpenPendingDoIt', 'glanceStillOpenNotifyDismissed']);
    } catch (e) {
      return;
    }
    if (got.glanceStillOpenNotifyDismissed) {
      chrome.storage.local.remove('glanceStillOpenNotifyDismissed');
      FlowStorage.recordStillOpenMetric({ kind: 'notifyDismiss', ts: got.glanceStillOpenNotifyDismissed })
        .catch((e) => console.error('[Glance] failed to record a notification dismiss', e));
    }
    if (got.glanceStillOpenPendingDoIt) {
      chrome.storage.local.remove('glanceStillOpenPendingDoIt');
      await runStillOpenDoIt(got.glanceStillOpenPendingDoIt);
      return;
    }
    if (got.glanceStillOpenOpenBrief) {
      chrome.storage.local.remove('glanceStillOpenOpenBrief');
      const open = await dropHandledMails(await FlowStorage.getStillOpen());
      if (open.length) openBriefPanel(open);
    }
  }

  /* ------------------------------------------------------- Feature 2: Draft-It */

  function messageBodyText(node) {
    return (node?.innerText || '').trim();
  }

  // Current message first, then up to 3 prior messages walking backward
  // through the thread — "current + up to 3 prior emails" is the spec as
  // written, and walking backward from the open message is the only order
  // that matches "the messages that led up to this one."
  function harvestThreadBodies(ctx) {
    const idx = Array.prototype.indexOf.call(ctx.messages, ctx.message);
    const bodies = [messageBodyText(ctx.message)];
    if (idx < 0) return bodies;
    for (let i = idx - 1, n = 0; i >= 0 && n < 3; i--, n++) bodies.push(messageBodyText(ctx.messages[i]));
    return bodies;
  }

  async function handleDraftIt() {
    if (typeof FlowSidebar === 'undefined') return;
    if (!currentContext || !currentContext.message) {
      FlowSidebar.renderDraft('error', { message: 'Open an email to draft a reply.', onDraft: handleDraftIt });
      return;
    }

    FlowSidebar.renderDraft('loading');
    const ctx = currentContext;
    const bodies = harvestThreadBodies(ctx);
    // maskBatch(), not N independent mask() calls — see privacyShield.js's
    // own comment on why the token space has to be shared across the whole
    // thread rather than per-message, or the same person named in two
    // messages could mint two different tokens (or worse, two different
    // people could collide on the same one).
    const batch = FlowPrivacyShield.maskBatch(bodies);
    const entries = batch.maskedTexts.map((maskedText, i) => ({ position: i === 0 ? 'current' : 'previous', maskedBody: maskedText }));
    const lang = FlowSidebar.isRTLText(bodies[0]) ? 'he' : 'en';

    // How this person opens and closes a note, as a fixed vocabulary only (core/style-profile.js): never text, never counts.
    let style = null;
    try { if (typeof FlowStyle !== 'undefined' && typeof FlowStorage !== 'undefined' && FlowStorage.getStyleProfile) style = FlowStyle.hints(FlowStyle.summary(await FlowStorage.getStyleProfile(), lang)); } catch (e) { style = null; }
    chrome.runtime.sendMessage({ type: 'flow:draft-reply', payload: { lang, entries, style } }, (response) => {
      if (!response || !response.ok) {
        FlowSidebar.renderDraft('error', { message: aiErrorMessage(response, 'Could not draft a reply.'), onDraft: handleDraftIt });
        return;
      }
      // The one place a real name/amount/date is reconstructed for this
      // feature — entirely client-side, from the tokenMap this tab built
      // and never sent anywhere. See glance-assist.js and privacyShield.js
      // for the two ends of this contract.
      const draftText = FlowPrivacyShield.unmask(response.draftText, batch.tokenMap);
      FlowSidebar.renderDraft('ready', { text: draftText, onInsert: insertDraftIntoReplyBox, onDraft: handleDraftIt });
      chrome.runtime.sendMessage({ type: 'flow:track', event: 'draft_generated', params: { domain: state.domainId } });
    });
  }

  // Gmail marks its own compose/reply editor with role="textbox" on a
  // contenteditable div — a stable, Gmail-set attribute, the same kind of
  // anchor this file already leans on for [email] above rather than one of
  // Gmail's internal, unstable class names.
  function findComposeBox() {
    const boxes = document.querySelectorAll('div[contenteditable="true"][role="textbox"]');
    return boxes.length ? boxes[boxes.length - 1] : null; // the most recently opened one is the active one
  }

  function insertDraftIntoReplyBox(text) {
    const box = findComposeBox();
    if (!box) {
      FlowSidebar.renderDraft('error', { message: 'Open Reply in Gmail first, then Insert into Reply.', onDraft: handleDraftIt });
      return;
    }
    const Edit = globalThis.FlowNativeEdit;
    const write = (node, value) => {
      node.focus();
      // execCommand is deprecated but still the one reliable way to make
      // Gmail's own editor notice the change — a raw textContent assignment
      // bypasses the input events its autosave and character counter are
      // listening for, so it's kept as a fallback rather than the first try.
      const inserted = document.execCommand && document.execCommand('insertText', false, value);
      if (!inserted) {
        node.textContent = value;
        node.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    };
    if (Edit && Edit.fillOnce) {
      const filled = Edit.fillOnce(box, text, { write: write });
      if (!filled.wrote) {
        FlowSidebar.renderDraft('error', { message: Edit.userEditedLine(), onDraft: handleDraftIt });
      }
      return;
    }
    write(box, text);
  }

  /* ------------------------------------------------- Feature 3: attachment X-ray */

  // Gmail marks a real attachment's download link with a `download_url`
  // attribute shaped "mime/type:filename.ext:https://...url" — a stable,
  // Gmail-set attribute, not one of Gmail's internal minified class names.
  function findAttachmentChips(messageNode) {
    return Array.from(messageNode.querySelectorAll('[download_url]'));
  }

  function parseDownloadUrl(raw) {
    const text = String(raw || '');
    const first = text.indexOf(':');
    const link = text.search(/:https?:\/\//i);
    const decodeName = (name) => {
      const rawName = String(name || '');
      if (!/%[0-9A-Fa-f]{2}/.test(rawName)) return rawName;
      try { return decodeURIComponent(rawName.replace(/\+/g, ' ')); } catch (e) { return rawName; }
    };
    if (first > 0 && link > first) {
      return { mimeType: text.slice(0, first), filename: decodeName(text.slice(first + 1, link)), url: text.slice(link + 1) };
    }
    const parts = text.split(':');
    if (parts.length < 3) return null;
    return { mimeType: parts[0], filename: decodeName(parts[1]), url: parts.slice(2).join(':') };
  }

  // Wired once per chip (chip.dataset.flowWired guards re-wiring on every
  // debounced re-scan) — a short hover delay before anything fires so a
  // cursor merely passing over a chip on its way elsewhere doesn't trigger a
  // fetch and a summarization call for every attachment in the message.
  function wireAttachmentHoverCards(messageNode) {
    if (typeof FlowSidebar === 'undefined') return;
    for (const chip of findAttachmentChips(messageNode)) {
      if (chip.dataset.flowWired) continue;
      chip.dataset.flowWired = '1';
      let hoverTimer = null;
      chip.addEventListener('mouseenter', () => {
        hoverTimer = setTimeout(() => onAttachmentHover(chip), 220);
      });
      chip.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimer);
        FlowSidebar.hideFloatingCard();
      });
    }
  }

  // download url -> { summary, entities } | 'unsupported', so re-hovering the
  // same chip in one session never refetches or re-summarizes it.
  const attachmentCache = new Map();

  async function onAttachmentHover(chip) {
    const meta = parseDownloadUrl(chip.getAttribute('download_url'));
    if (!meta) return;
    const rect = chip.getBoundingClientRect();

    const cached = attachmentCache.get(meta.url);
    if (cached === 'unsupported') {
      FlowSidebar.showFloatingCard(rect, { state: 'unsupported', message: 'Preview isn’t available for this file type yet.' });
      return;
    }
    if (cached) {
      FlowSidebar.showFloatingCard(rect, { state: 'ready', summary: cached.summary, entities: cached.entities });
      return;
    }

    const isDocx = /\.docx$/i.test(meta.filename) ||
      meta.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!isDocx) {
      // PDFs (and every other type) land here today — see docreader.js's own
      // header for why PDF text extraction isn't attempted rather than
      // attempted unreliably.
      attachmentCache.set(meta.url, 'unsupported');
      FlowSidebar.showFloatingCard(rect, { state: 'unsupported', message: 'Preview isn’t available for this file type yet.' });
      return;
    }

    FlowSidebar.showFloatingCard(rect, { state: 'loading' });
    try {
      const res = await fetch(meta.url, { credentials: 'include' });
      if (!res.ok) throw new Error('attachment download failed (' + res.status + ')');
      const blob = await res.blob();
      const rawText = await FlowDocReader.extractDocxText(blob);
      if (!rawText.trim()) throw new Error('empty document');

      const masked = FlowPrivacyShield.mask(rawText);
      chrome.runtime.sendMessage({ type: 'flow:summarize-attachment', payload: { maskedText: masked.maskedText } }, (response) => {
        if (!response || !response.ok) {
          FlowSidebar.showFloatingCard(rect, { state: 'error', message: aiErrorMessage(response, 'Couldn’t read this attachment.') });
          return;
        }
        const summary = FlowPrivacyShield.unmask(response.summary, masked.tokenMap);
        const entities = (response.entities || []).map(([k, v]) => [k, FlowPrivacyShield.unmask(v, masked.tokenMap)]);
        attachmentCache.set(meta.url, { summary, entities });
        FlowSidebar.showFloatingCard(rect, { state: 'ready', summary, entities });
        chrome.runtime.sendMessage({ type: 'flow:track', event: 'attachment_summarized', params: { domain: state.domainId } });
      });
    } catch (err) {
      FlowSidebar.showFloatingCard(rect, { state: 'error', message: 'Couldn’t read this attachment.' });
    }
  }

  if (typeof globalThis !== 'undefined') globalThis.glanceUndoStoredLane = undoStoredLane;

  // Two seconds from the first names-pending paint. A later scan does
  // not restart it. Mail is judged when it fires, names or none.
  const NAMES_HOLD_MS = 2000;
  let namesWaitDone = false;
  let namesHoldSince = 0;
  let namesWaitTimer = null;

  function armNamesHold() {
    if (namesWaitDone) return;
    if (!namesHoldSince) namesHoldSince = Date.now();
    if (namesWaitTimer) return;
    const left = Math.max(0, NAMES_HOLD_MS - (Date.now() - namesHoldSince));
    namesWaitTimer = setTimeout(() => {
      namesWaitTimer = null;
      namesWaitDone = true;
      scanReadingPane();
    }, left);
  }

  function releaseNamesPending(messageNode) {
    clearGmailWhy(messageNode);
    if (typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function' || typeof FlowStorage.set !== 'function') return;
    FlowStorage.get().then((bag) => {
      const why = bag && bag.glanceWhyCurrent;
      if (!why || why.reason !== 'names-pending') return;
      return FlowStorage.set({ glanceWhyCurrent: null });
    }).catch(() => {});
  }

  function ownNamesForChip(userName) {
    const aria = gmailAccountName();
    const known = (state && state.glanceOwnNames) || [];
    const extra = aria ? [].concat(known, [aria]) : known;
    if (typeof FlowIntent !== 'undefined' && typeof FlowIntent.readerNamesFrom === 'function') {
      return FlowIntent.readerNamesFrom({
        displayName: userName,
        profile: state && state.googleProfile,
        knownNames: extra
      });
    }
    return extra;
  }

  // glanceOwnNames is written after the first userinfo read. The account
  // button's name counts the same way, with no token. Until one of those
  // or a real display name exists, a greeting stays unjudged, for at most 2s.
  function readerNamesNotCached(userName) {
    if (gmailAccountName()) return false;
    const known = state && Array.isArray(state.glanceOwnNames) ? state.glanceOwnNames : [];
    for (let i = 0; i < known.length; i++) {
      const name = String(known[i] || '').trim().toLowerCase();
      if (name && name !== 'glance' && name !== 'me') return false;
    }
    const profile = state && state.googleProfile;
    if (profile) {
      const given = String(profile.givenName || profile.given_name || '').trim();
      const surname = String(profile.surname || profile.familyName || profile.family_name || '').trim();
      const display = String(profile.displayName || profile.name || '').trim().toLowerCase();
      if (given || surname || (display && display !== 'glance' && display !== 'me')) return false;
    }
    const shown = String(userName || '').trim().toLowerCase();
    if (shown && shown !== 'glance' && shown !== 'me') return false;
    return true;
  }

  if (chromeLive()) chrome.storage.onChanged.addListener((changes) => {
    if (!chromeLive()) return;
    if (changes.onboarded || changes.domainId || changes.connectorId) init();
    else if (changes.proLicense) applyProState();
    else if (changes.glanceOwnNames || changes.googleProfile || changes.googleWebAuth) {
      FlowStorage.get().then((next) => {
        state = next || state;
        scanReadingPane();
      }).catch(() => {});
    }
  });

  globalThis.__glanceGmailPage = {
    paintPlan: (ctx) => {
      const mount = document.createElement('div');
      document.body.appendChild(mount);
      injectChip(mount, ctx);
      return mount.querySelector('.flow-chip-host');
    },
    planContactsChip: async (c) => {
      const message = document.querySelector('[role="listitem"]');
      if (!message) return null;
      const shown = await showGoogleContactsChip(message, c);
      return shown ? message.querySelector('.flow-chip-host') : null;
    },
    rescan: () => scanReadingPane()
  };

  // An offer below the fold pops up in view on its own (src/chip-peek.js). It points at the card and writes nothing.
  try { if (typeof FlowChipPeek !== 'undefined') FlowChipPeek.start(document, window); } catch (e) { /* the card itself still works */ }

  init();
})();
