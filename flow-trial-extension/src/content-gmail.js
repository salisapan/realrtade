// Runs on mail.google.com. Watches the message open in the reading pane and,
// when the on-device judgment engine finds a real reason, injects a single
// Do It chip — never a popup, never a second confirmation step, never a
// paragraph to read.
//
// Honesty about fragility: Gmail's DOM has no public contract and changes
// without notice. The selectors below read the current structure (role="main"
// reading pane, div[role="listitem"] messages, the `email` attribute on the
// sender span, h2.hP for the subject). If Gmail changes, this degrades to "the
// chip stops appearing" — never to a crash and never to a wrong write, because
// judgment only ever reads text and the write path only ever adds a record.

(function flowGmailWatcher() {
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
  let watching = false;
  let observer = null;
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
    state = await FlowStorage.get();
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
    FlowWeekly.showSummary(summary, {
      onOpenList: async () => {
        // Re-read at click time. This opens the same Still Open list the
        // morning brief uses, not every unresolved chip.
        const open = await FlowStorage.getStillOpen();
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

  async function considerInboxRow(row, executionMemory, freshState) {
    const threadId = row.getAttribute('data-legacy-thread-id') || row.getAttribute('data-thread-id');
    if (!threadId) return false;
    const subject = ((row.querySelector('span.bog') || {}).textContent || '').trim();
    const snippet = ((row.querySelector('span.y2') || {}).textContent || '').replace(/^\s*-\s*/, '').trim();
    const text = [subject, snippet].filter(Boolean).join('\n');
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
      calibrationByType: freshState.calibrationByType
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
    const process = FlowActions.planFor(intent, {
      threadUrl: threadLink,
      hasThreadAttachment: false,
      executionMemory: executionMemory
    });
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
    const onMutate = debounce(() => {
      maybeScanInbox()
        .catch((e) => console.error('[Glance] inbox scan failed', e))
        .then(() => scanReadingPane());
    }, 400);
    observer = new MutationObserver(onMutate);
    observer.observe(document.body, { childList: true, subtree: true });
    onMutate();
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function extractSender(messageNode) {
    const el = messageNode.querySelector('[email]');
    if (!el) return { email: null, name: null };
    return { email: el.getAttribute('email'), name: el.getAttribute('name') || el.textContent.trim() };
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

  // Returns only the text that renders before the first quote container —
  // never the quoted history sitting after it. Matches messageNode's own
  // innerText computation (rather than a DOM Range) specifically so the
  // whitespace/line-break shape of what's returned is identical to what
  // every other caller of .innerText in this file already expects; a
  // second, differently-shaped text-extraction method here would risk
  // corrupting the word-boundary-sensitive regexes downstream.
  function ownMessageText(messageNode) {
    const full = (messageNode?.innerText || '').trim();
    if (!messageNode) return full;
    const quoteBlock = messageNode.querySelector(QUOTE_CONTAINER_SELECTOR);
    if (!quoteBlock) return full;
    const quoted = (quoteBlock.innerText || '').trim();
    if (!quoted) return full;
    const idx = full.lastIndexOf(quoted);
    // Not found at all (a rendering mismatch between the isolated block's
    // own innerText and its innerText as read within the full message) —
    // fall back to the unfiltered text rather than guess where to cut.
    if (idx < 0) return full;
    // idx === 0 (the quote is the entire visible message, nothing new was
    // written) correctly yields an empty string here, same treatment as
    // judgment.js's own newContent() gives that case.
    return full.slice(0, idx).trim();
  }

  // Gmail renders any recipient who is the signed-in account as the literal
  // text "me" rather than their name, on every message that arrived TO them.
  // That gives a way to read the account's own address without any
  // account-detection hack: scan the thread for a "me"-labeled [email] node.
  function ownEmailFromThread(messages) {
    for (const m of messages) {
      const els = m.querySelectorAll('[email]');
      for (const el of els) {
        if ((el.textContent || '').trim() === 'me') return el.getAttribute('email');
      }
    }
    return null;
  }

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
  function threadIdFrom(message) {
    let node = message;
    while (node && node.getAttribute) {
      const id = node.getAttribute('data-legacy-thread-id');
      if (id) return id;
      node = node.parentElement;
    }
    return null;
  }

  // Prefer silence when this open message clearly continues a personal
  // matter Glance already fully closed. No effect when memory is absent,
  // the message is not one of the three trusted closes, or the match is
  // not clear — the chip then decides as usual. A storage failure must
  // never be the reason a real chip disappears.
  async function personalCloseSaysSilence(intent, threadId, subject) {
    if (!intent || !intent.personalClose || typeof FlowCloseMemory === 'undefined') return false;
    try {
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
    try {
      const { flowOwnEmailByAccount } = await chrome.storage.local.get(OWN_EMAIL_STORAGE_KEY);
      return (flowOwnEmailByAccount && flowOwnEmailByAccount[accountIndex()]) || null;
    } catch (e) {
      return null;
    }
  }

  function rememberOwnEmail(email) {
    chrome.storage.local.get(OWN_EMAIL_STORAGE_KEY).then(({ flowOwnEmailByAccount }) => {
      const map = Object.assign({}, flowOwnEmailByAccount);
      const idx = accountIndex();
      if (map[idx] === email) return; // already cached, avoid a needless write on every scan
      map[idx] = email;
      chrome.storage.local.set({ [OWN_EMAIL_STORAGE_KEY]: map });
    }).catch(() => {});
  }

  async function readCompanyTemplate() {
    try {
      const bag = await chrome.storage.local.get('glanceCompanyTemplate');
      return (bag && bag.glanceCompanyTemplate) || null;
    } catch (e) {
      return null;
    }
  }

  function driveFindOne(term) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'flow:drive-find-one', term: term }, (res) => {
        resolve(res && res.match ? res.match : 'unknown');
      });
    });
  }

  // A Drive / Doc / Sheet close has to know whether exactly one file
  // already matches before the chip can claim "didn't find it". The
  // check is one name lookup, not a picker and not a Drive browser.
  async function classifyForChip(text, base) {
    const template = await readCompanyTemplate();
    const ctx = Object.assign({}, base, { companyTemplate: template });
    let intent = FlowIntent.classify(text, ctx);
    if (intent && intent.googleWait && intent.googleWait.fileTerm) {
      const usingGoogle = state.onboarded && state.connectorId === 'googleTasks';
      if (!usingGoogle) await ensureGoogleAutoConnect();
      const match = await driveFindOne(intent.googleWait.fileTerm);
      intent = FlowIntent.classify(text, Object.assign({}, ctx, { fileMatch: match }));
    }
    return intent || { type: null };
  }

  async function scanReadingPane() {
    if (!watching) return;
    const main = document.querySelector('div[role="main"]');
    if (!main) return;

    const messages = main.querySelectorAll('div[role="listitem"]');
    if (!messages.length) return;

    // Only the newest message in the thread — this mirrors "an email arrived",
    // not "re-judge the entire history on every DOM mutation". But the newest
    // *node* is your own reply the moment you send one, and judging it as an
    // incoming decision meant Flow looked up your own address as the sender
    // and re-offered to log whatever the thread was already about. Walking
    // backward for the newest message that isn't from the account itself
    // finds the thing this scanner exists to react to: mail that arrived.
    let ownEmail = ownEmailFromThread(messages);
    if (ownEmail) {
      rememberOwnEmail(ownEmail);
    } else {
      ownEmail = await getCachedOwnEmail();
    }
    // Without a resolved own-email, "the last visible message" can't be told
    // apart from "the reader's own outbound message to someone else" — and
    // misreading something the reader asked of a third party as a request
    // made OF the reader is a wrong classification, not just a missed one.
    // Staying silent here is deliberate: the cache above fills in on the
    // very next ordinary (multi-recipient) thread, so this only ever costs
    // a missed chip once per account, never a wrong one.
    if (!ownEmail) return;

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

    let message = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const candidate = messages[i];
      const candidateSender = extractSender(candidate);
      if (candidateSender.email && candidateSender.email.toLowerCase() === ownEmail.toLowerCase()) continue;
      message = candidate;
      break;
    }
    if (!message) return; // every visible message in the thread is the account's own outbound mail

    const legacyId = message.getAttribute('data-legacy-message-id');

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
      messageId: legacyId || hashNode(message),
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
    } else if (message.querySelector('.flow-chip-host')) return;

    const messageId = legacyId || hashNode(message);
    if (!messageId) return;

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
    const openedThreadId = threadIdFrom(message);
    if (openedThreadId && await FlowStorage.hasTerminalOutcome('scan:' + openedThreadId)) {
      await FlowStorage.markAlreadyClosed(messageId);
    }
    if (await FlowStorage.hasTerminalOutcome(messageId)) return;

    // ownMessageText (not a bare .innerText) both guards against Gmail
    // detaching or replacing this exact node between the synchronous work
    // above and this line (the awaits above this point yield back to the
    // event loop — a crash here would violate this file's own "never
    // crash, just stop showing the chip" contract) and — the actual point
    // of the "quoted text" fix — never lets a long quoted contract sitting
    // below a one-line "Sounds good!" reply count toward "is there enough
    // new content to judge" in the first place.
    const text = ownMessageText(message);
    // A fact ask can be one short Hebrew sentence ("מה הסכום בגיליון?").
    // The 20-character floor stays for everything else — this does not
    // lower the scorer, it only lets a fully-formed fact ask through.
    const factProbe = (text.length >= 12 && typeof FlowFactReply !== 'undefined') ? FlowFactReply.detect(text) : null;
    if (text.length < 20 && !factProbe) return; // still rendering, or genuinely nothing new was written

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
    let chosenAttachment = attachment;
    let intent = await classifyForChip(text, {
      senderEmail: sender.email,
      senderName: sender.name,
      subject: subject,
      calibration: state.calibration,
      calibrationByType: state.calibrationByType,
      attachmentCount: attachments.length
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
    if (!FlowIntent.shouldShowChip(intent)) {
      // Named silence only. An ordinary miss stays the classification
      // counter above — it is not given a reason it did not earn.
      const reason = (typeof FlowQuietMetrics !== 'undefined' && FlowQuietMetrics.reasonFor(intent))
        || (factOwns && !intent.type ? 'fact' : null);
      recordSilence(messageId, reason);
      return;
    }

    // A file-shaped message that is not one clear object (two files, a
    // hedge, a "don't send") must not become a Do It. Other closes are
    // left alone — this only stops a REQUEST chip that would otherwise
    // offer to attach or draft around an unclear file.
    const fileGate = typeof FlowFileAttach !== 'undefined' ? FlowFileAttach.gate(text) : { kind: 'ignore' };
    if (fileGate.kind === 'block' && intent.type === FlowIntent.TYPES.REQUEST) {
      recordSilence(messageId, 'file');
      return;
    }
    // A request for something that certifies a payment (a receipt) takes more than one step: whether it already exists,
    // whether the payment is real, who issues it, and only a real attachment closes it (core/resolution.js). The loop card
    // from src/follow.js owns that message, so no Do It chip appears and none claims "Handled" for a draft.
    if (fileGate.kind === 'clear' && intent.type === FlowIntent.TYPES.REQUEST && typeof FlowResolution !== 'undefined' && typeof FlowFollow !== 'undefined' && FlowResolution.owns(fileGate.ask.id)) {
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
    if (!usingGoogle && !(await ensureGoogleAutoConnect())) return;

    let attachFile = null;
    if (fileGate.kind === 'clear' && intent.type === FlowIntent.TYPES.REQUEST && typeof FlowFileAttach !== 'undefined') {
      const searched = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'flow:search-drive', query: FlowFileAttach.driveQuery(fileGate.ask.query) }, resolve);
      });
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
          watching,
          evidence: {
            driveScope: 'account',
            connected: { drive: true, thread: true, gmail: false, outlook: false, docs: false, sheets: false, calendar: false },
            driveFiles: searched && searched.ok ? (searched.files || []) : null,
            threadFiles
          }
        });
        if (chain && chain.move === 'needs-you') {
          injectNeedsYou(message, {
            messageId, intent, sender, subject, attachment, attachments,
            threadUrl: threadUrl(legacyId), threadId, bodyText: text, chain
          });
          return;
        }
        if (chain && (chain.move === 'watch' || chain.reason === 'conflict' || chain.reason === 'unclear')) {
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
          recordSilence(messageId, 'file');
          return;
        }
        attachFile = decision.file;
      }
    }

    const process = FlowActions.planFor(intent, {
      threadUrl: threadUrl(legacyId),
      hasThreadAttachment: Boolean(chosenAttachment) || Boolean(attachFile),
      executionMemory,
      attachFile
    });
    if (!process) return; // defensive only — every catalog entry has at least an anchor step

    injectChip(message, {
      messageId, intent, process, sender, subject, attachment: chosenAttachment, attachments,
      threadUrl: threadUrl(legacyId),
      threadId: threadId,
      // Snapshotted now, not re-read from the DOM at click time — by the
      // time "Do It" is clicked the chip's own ctx has no live node
      // reference to this message, and Gmail may have long since rebuilt or
      // removed it anyway.
      bodyText: text
    });
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
        kind: 'shown', label: intent.label, messageId, score: intent.signals.score, signals: intent.signals,
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
    if (messageNode.querySelector('.flow-chip-host')) return;
    const chain = ctx.chain || {};
    const card = chain.card || {};
    const he = chain.requirement && chain.requirement.lang === 'he';
    const host = el('div', 'flow-chip-host');
    host.setAttribute('data-glance-chain', 'needs-you');
    host.setAttribute('data-checked-at', String(Date.now()));
    host.setAttribute('dir', he ? 'auto' : 'ltr');
    const textEl = el('p', 'flow-chip-text');
    textEl.appendChild(loopMark());
    textEl.appendChild(el('span', 'flow-chip-brand', 'Glance'));
    textEl.appendChild(document.createTextNode(' ' + [card.line, card.searched, card.why, card.skipped].filter(Boolean).join(' ')));
    if (he) textEl.setAttribute('dir', 'auto');
    host.appendChild(textEl);

    const cardCtx = Object.assign({}, ctx, {
      process: { id: 'reply-track', name: 'Reply & Track', steps: [] }
    });
    const mainRow = el('div', 'flow-chip-main-row');
    mainRow.setAttribute('dir', 'ltr');
    const dismiss = el('button', 'flow-chip-dismiss', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.addEventListener('click', (e) => { e.stopPropagation(); onDismiss(host, cardCtx); });
    mainRow.appendChild(dismiss);
    const chip = el('button', 'flow-chip');
    chip.type = 'button';
    chip.appendChild(el('span', 'shell'));
    chip.appendChild(el('span', 'ring'));
    chip.appendChild(el('span', 'shine'));
    chip.appendChild(el('span', 'flow-chip-do-label', he ? 'טיוטת תשובת ביניים' : 'Draft a holding reply'));
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
      done.appendChild(el('span', 'flow-chip-label', he ? 'הטיוטה מוכנה. לא נשלח.' : 'Draft ready. Not sent.'));
      const undo = el('button', 'flow-chip-undo', 'Undo');
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
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.addEventListener('click', (e) => { e.stopPropagation(); onDismiss(host, cardCtx); });
    mainRow.appendChild(dismiss);

    const chip = el('button', 'flow-chip');
    chip.type = 'button';
    chip.appendChild(el('span', 'shell'));
    chip.appendChild(el('span', 'ring'));
    chip.appendChild(el('span', 'shine'));
    chip.appendChild(el('span', 'flow-chip-do-label', 'Do It'));
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

  function injectChip(messageNode, ctx) {
    if (messageNode.querySelector('.flow-chip-host')) return;

    const host = el('div', 'flow-chip-host');
    host.setAttribute('dir', 'ltr');

    // The process name as its own small, quiet label — "this is one named
    // thing Glance is closing," stated before the sentence explains what
    // that means, not left for the user to infer from a pile of pills.
    host.appendChild(el('span', 'flow-chip-process-name', ctx.process.name));

    // loop mark + gradient "Glance" + the rest of the sentence as its own
    // text node — three children in that DOM order, mark first, right
    // before the brand name, same as before this was translated to
    // English (see closingSentence's own header comment for why it no
    // longer needs a dir="rtl" host).
    const textEl = el('p', 'flow-chip-text');
    textEl.appendChild(loopMark());
    textEl.appendChild(el('span', 'flow-chip-brand', 'Glance'));
    textEl.appendChild(document.createTextNode(' ' + closingSentence(ctx.process, ctx.intent)));
    if (ctx.intent && ctx.intent.googleClose && ctx.intent.googleClose.lang === 'he') textEl.setAttribute('dir', 'auto');
    host.appendChild(textEl);

    // liveSteps is the mutable working copy Do It actually reads;
    // ctx.process.steps (what actions.js proposed) is left untouched so a
    // re-scan of this same message always starts from the full process
    // again, and so onDoIt can diff against it to tell Execution Memory
    // which steps were kept vs. stripped off.
    const liveSteps = ctx.process.steps.slice();
    const multi = ctx.process.steps.length > 1;

    let pillRow = null;
    if (multi) {
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

    if (multi) {
      const stepCount = ctx.process.steps.length;
      const toggle = el('button', 'flow-chip-more-toggle', stepCount + ' steps');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanding = !host.classList.contains('flow-chip-expanded');
        host.classList.toggle('flow-chip-expanded', expanding);
        pillRow.inert = !expanding;
        toggle.setAttribute('aria-expanded', String(expanding));
        toggle.textContent = expanding ? 'Hide steps' : stepCount + ' steps';
      });
      mainRow.appendChild(toggle);
    }

    const dismiss = el('button', 'flow-chip-dismiss', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.addEventListener('click', (e) => { e.stopPropagation(); onDismiss(host, ctx); });
    mainRow.appendChild(dismiss);

    const chip = el('button', 'flow-chip');
    chip.type = 'button';
    chip.appendChild(el('span', 'shell'));
    chip.appendChild(el('span', 'ring'));
    chip.appendChild(el('span', 'shine'));
    chip.appendChild(el('span', 'flow-chip-do-label', 'Do It'));
    chip.addEventListener('click', () => onDoIt(host, chip, ctx, liveSteps));
    mainRow.appendChild(chip);

    host.appendChild(mainRow);
    if (pillRow) host.appendChild(pillRow);
    mountGoogleDetail(host, ctx);

    messageNode.insertBefore(host, messageNode.firstChild);
  }

  function setChipState(chip, cls, text) {
    chip.className = 'flow-chip ' + cls;
    chip.replaceChildren(el('span', 'flow-chip-label', text));
  }

  function reasonMessage(response, ctx) {
    if (!response) return 'Something went wrong. Try again.';
    if (response.reason === 'connector-not-live') return 'That action isn’t wired up yet.';
    if (response.reason === 'not-connected') return 'Connect Google in the Glance popup first.';
    if (response.reason === 'unclear') return response.error || 'Nothing was written.';
    if (response.reason === 'no-matching-contact') return 'No matching contact for ' + (ctx.sender.email || 'this sender') + '.';
    if (response.skipped) return 'Skipped — an earlier step in this process didn’t complete.';
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
    try {
      const res = await fetch(meta.url, { credentials: 'include' });
      if (!res.ok) return null;
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

    if (action.kind === 'driveFile') {
      const only = ctx.attachments && ctx.attachments.length === 1 ? ctx.attachments[0] : null;
      if (!only) return null;
      const fetched = await fetchAttachmentBase64(only);
      if (!fetched) return null;
      return Object.assign(base, { attachment: fetched, params: { copyAttachment: true } });
    }

    if (action.kind === 'calendar') {
      const params = Object.assign({}, action.params);
      if (params.shareLink && priorUrl) params.shareUrl = priorUrl;
      return Object.assign(base, { params: params });
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
          params: Object.assign({}, cleanParams, { shareUrl: priorUrl, shareLink: true, includeAttachment: false, requestedObjectTerm: null }),
          senderEmail: ctx.sender.email,
          senderName: ctx.sender.name,
          subject: ctx.subject
        });
      }
      const payload = Object.assign(base, {
        params: driveFileId ? Object.assign({}, cleanParams, { driveFileId, driveFileName, driveMimeType }) : cleanParams,
        senderEmail: ctx.sender.email,
        senderName: ctx.sender.name,
        subject: ctx.subject
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
      label: action.params.title || action.label,
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
  function recordSilence(messageId, reason) {
    if (!messageId || !reason || typeof FlowStorage.recordSilence !== 'function') return;
    FlowStorage.recordSilence({ messageId: messageId, reason: reason })
      .catch((e) => console.error('[Glance] failed to record a silence decision', e));
  }

  function sendExecuteAction(payload) {
    return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'flow:execute-action', payload }, resolve));
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
        if (!payload) {
          result = { action, response: { ok: false, reason: 'unclear' } };
        } else {
          const response = await sendExecuteAction(payload);
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
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'flow:undo-action', connectorId: r.action.kind, ref: r.response.ref }, resolve);
      });
      if (!result || !result.ok) {
        return { ok: false, undoneIds, failedAt: r.action, keptWhere: (r.response && r.response.where) || null };
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
  function closedSummary(succeeded, ctx) {
    const isFullClose = ctx && ctx.process.closedLine && succeeded.length === ctx.process.steps.length;
    if (isFullClose) return ctx.process.closedLine;
    const verbs = succeeded.map((r) => STEP_DONE_VERB[r.action.kind] || 'completed one step');
    return 'Closed — ' + joinWithAnd(verbs) + '.';
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
  async function showMultiActionReceipt(host, chip, ctx, results) {
    const succeeded = results.filter((r) => r.response && r.response.ok);

    if (!succeeded.length) {
      setChipState(chip, 'flow-chip-error', reasonMessage(results[0] && results[0].response, ctx));
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
    const he = /[\u0590-\u05FF]/.test(
      ((ctx && ctx.subject) || '') + ((ctx && ctx.bodyText) || '') + ((ctx && ctx.intent && ctx.intent.label) || '')
    );
    const copy = FlowReceipt.confirmation({
      succeeded: succeeded.length,
      total: results.length,
      priorCloses,
      lang: he ? 'he' : 'en'
    });

    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    done.setAttribute('role', 'status');
    const icon = el('span', 'flow-chip-done-icon', '✓');
    icon.setAttribute('aria-hidden', 'true');
    done.appendChild(icon);

    const status = el('span', 'flow-chip-handled' + (copy.full ? '' : ' flow-chip-handled-partial'), copy.status);
    done.appendChild(status);
    if (copy.earlyLine) done.appendChild(el('span', 'flow-chip-first-close', copy.earlyLine));

    // What landed, before the process badge. The written line is the
    // record ("Google Task · due Sep 21") — the same record Undo removes.
    const wheres = [];
    for (const r of succeeded) {
      if (r.response && r.response.where) wheres.push(r.response.where);
    }
    for (const line of FlowActions.receiptWrittenLines(succeeded)) {
      done.appendChild(el('span', 'flow-chip-written', line));
    }

    const detail = el('span', 'flow-chip-detail');
    detail.appendChild(el('span', 'flow-chip-process-name', ctx.process.name));
    detail.appendChild(el('span', 'flow-chip-label', closedSummary(succeeded, ctx)));
    done.appendChild(detail);

    const sole = succeeded.length === 1 ? succeeded[0].response : null;
    const undoHint = (sole && sole.undoHint) || FlowReceipt.undoHint(wheres);
    // The sentence is the control. A filled pill would be a second Do It.
    const undo = el('button', 'flow-chip-undo', undoHint);
    undo.type = 'button';
    const hint = el('span', 'flow-chip-undo-hint');
    hint.hidden = true;

    const actionsRow = el('span', 'flow-chip-actions');
    actionsRow.appendChild(undo);
    for (const r of succeeded) {
      if (!r.response.url) continue;
      const view = el('a', 'flow-chip-link', succeeded.length > 1 ? 'View ' + r.response.where : 'View');
      view.href = r.response.url; view.target = '_blank'; view.rel = 'noopener';
      actionsRow.appendChild(view);
    }
    undo.addEventListener('click', () => {
      undo.textContent = 'Undoing…';
      undo.disabled = true;
      rollbackChain(succeeded, ctx).then((result) => {
        // Recorded regardless of whether the whole rollback reported ok —
        // any step that genuinely reverted is a genuine "don't propose this
        // again" signal, even if a later step in the chain couldn't. Feeds
        // both memories: the step-level bias (recordUndo, already existed)
        // and now the intent-type threshold too (calibrate('undo', ...),
        // new) — an accepted-then-undone process is real, measured harm,
        // and the precision/harm audit's whole point was that harm has to
        // reach the confidence bar, not just Execution Memory's step bias.
        if (result.undoneIds.length) {
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
          const undone = (sole && sole.undoneLine) || FlowReceipt.undoneLine(wheres);
          done.replaceChildren(el('span', 'flow-chip-label', undone));
          FlowStorage.appendLog({ kind: 'undone', label: ctx.intent.label, messageId: ctx.messageId, app: SOURCE_APP });
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
          undo.textContent = copy.undoLabel;
          undo.disabled = false;
          hint.hidden = false;
          hint.textContent = note;
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
    if (results.length > succeeded.length) {
      const failed = results.filter((r) => !(r.response && r.response.ok));
      const detail = failed.map((r) => r.action.label + ': ' + reasonMessage(r.response, ctx)).join(' · ');
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
    const bookkeeping = succeeded.map((r) =>
      FlowStorage.appendLog({ kind: 'written', label: ctx.intent.label, messageId: ctx.messageId, where: r.response.where, url: r.response.url, ref: r.response.ref, connectorId: r.action.kind, app: SOURCE_APP })
        .catch((e) => console.error('[Glance] failed to record a completed write — the write itself already succeeded', e))
    );
    if (meetingNote) bookkeeping.push(meetingNote);
    // Personal close memory: only a Trusted Do It whose every attempted
    // step actually wrote. A partial chain is not a closed matter. This
    // does not touch the receipt copy above, and it does not share a
    // storage key with close-quality metrics.
    if (typeof FlowCloseMemory !== 'undefined' && ctx.intent && ctx.intent.personalClose && FlowCloseMemory.fullWriteOf(results)) {
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
    if (typeof FlowCloseQuality !== 'undefined' && FlowCloseQuality.isFullWrite(ctx.process.steps.length, succeeded.length)) {
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

    // Every pill removed is a deliberate "do nothing" — the same outcome as
    // dismissing the chip, not a disabled button with no explanation. It also
    // reads to Execution Memory as a full rejection (onDismiss records it),
    // which is correct: the user saw the whole process and kept none of it.
    if (!liveSteps.length) { onDismiss(host, ctx); return; }
    if (host.dataset.collectorOpen === '1') return;
    if (ctx.intent && ctx.intent.googleClose && !ctx.intent.googleClose.copyAttachment && typeof FlowGoogleCloses !== 'undefined') {
      const fills = readSlotFills(host);
      const built = FlowGoogleCloses.artifactBody(ctx.intent.googleClose, fills);
      if (!built || built.blank) {
        const empty = host.querySelector('.flow-chip-field-input');
        if (empty) empty.focus();
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
    FlowStorage.appendLog({ kind: 'clicked', label: ctx.intent.label, messageId: ctx.messageId, score: ctx.intent.signals.score, app: SOURCE_APP });
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
      FlowStorage.appendLog({ kind: 'dismissed', label: ctx.intent.label, messageId: ctx.messageId, score: ctx.intent.signals.score, app: SOURCE_APP })
        .catch((e) => console.error('[Glance] failed to record a dismiss in the activity log', e)),
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

    const pending = await FlowStorage.getPending();
    // Oldest-still-open first (getPending's own order) — if more than one
    // other message in this thread is somehow still open, the same "oldest
    // first" bias the Brief panel uses applies here too.
    const match = pending.find((entry) => threadIds.has(entry.messageId));
    if (!match) { FlowBrief.hideResurface(); return; }

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
      title: (typeof FlowStillOpen !== 'undefined' && FlowStillOpen.whyLine(entry)) || entry.process.name,
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

    const open = await FlowStorage.getStillOpen();
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
    const open = await FlowStorage.getStillOpen();
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
      const open = await FlowStorage.getStillOpen();
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
    box.focus();
    // execCommand is deprecated but still the one reliable way to make
    // Gmail's own editor notice the change — a raw textContent assignment
    // bypasses the input events its autosave and character counter are
    // listening for, so it's kept as a fallback rather than the first try.
    const inserted = document.execCommand && document.execCommand('insertText', false, text);
    if (!inserted) {
      box.textContent = text;
      box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  /* ------------------------------------------------- Feature 3: attachment X-ray */

  // Gmail marks a real attachment's download link with a `download_url`
  // attribute shaped "mime/type:filename.ext:https://...url" — a stable,
  // Gmail-set attribute, not one of Gmail's internal minified class names.
  function findAttachmentChips(messageNode) {
    return Array.from(messageNode.querySelectorAll('[download_url]'));
  }

  function parseDownloadUrl(raw) {
    const parts = String(raw || '').split(':');
    if (parts.length < 3) return null;
    return { mimeType: parts[0], filename: parts[1], url: parts.slice(2).join(':') };
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

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.onboarded || changes.domainId || changes.connectorId) init();
    else if (changes.proLicense) applyProState();
  });

  init();
})();
