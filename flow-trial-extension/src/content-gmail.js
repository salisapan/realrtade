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

  // The reading pane's currently open thread, refreshed on every
  // scanReadingPane() pass — this is what Feature 2 (Draft-It) and Feature 4
  // (Next-Step) act on, independent of whether the on-device judgment engine
  // found anything worth a chip for. A user asking Glance to draft a reply
  // isn't asking "was this a decision" — they're asking about whatever
  // message is in front of them right now.
  let currentContext = null; // { message, messages, sender, subject, legacyId }

  async function init() {
    state = await FlowStorage.get();
    // Disconnecting a connector in the popup flips onboarded back to false
    // and fires the onChanged listener below, which calls init() again —
    // this is the only place that transition is handled, so it has to
    // actually tear the observer down, not just decline to start a new one.
    // Without this, the observer created by observe() below keeps running
    // forever: watching never goes back to false, so scanReadingPane's own
    // guard never trips, and Flow keeps injecting chips whose "Do It" click
    // is now guaranteed to fail (state.connectorId is null once disconnected).
    if (!state.onboarded) { stopWatching(); return; }
    if (!watching) { watching = true; observe(); }
    // mountSidebar() is off — see the note at wireAttachmentHoverCards()'s
    // call site in scanReadingPane() for why the whole sidebar surface
    // (badge, Draft-It, attachment X-ray) is cut, not just styled.
    if (typeof FlowBrief !== 'undefined') checkBrief();
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
        // Pending is re-fetched at click time, not reused from whatever was
        // true when the banner rendered — could be minutes or days later.
        const pending = await FlowStorage.getPending();
        if (pending.length) openBriefPanel(pending);
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

  function stopWatching() {
    if (observer) { observer.disconnect(); observer = null; }
    watching = false;
    currentContext = null;
    if (typeof FlowSidebar !== 'undefined') FlowSidebar.unmount();
    if (typeof FlowBrief !== 'undefined') FlowBrief.hide();
  }

  // Mounted once per tab, idempotent (FlowSidebar.mount() itself no-ops if
  // already attached). Feature 1's badge appears the moment the sidebar
  // mounts — it isn't gated behind the judgment engine finding anything,
  // since "the shield is active" is true for every message Glance ever
  // reads, not only the ones that clear the chip threshold.
  function mountSidebar() {
    if (typeof FlowSidebar === 'undefined') return; // degrade silently, same policy as the chip system below
    FlowSidebar.mount();
    FlowSidebar.renderDraft('idle', { onDraft: handleDraftIt });
  }

  function observe() {
    observer = new MutationObserver(debounce(scanReadingPane, 400));
    observer.observe(document.body, { childList: true, subtree: true });
    scanReadingPane();
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
    if (messageChanged) checkContextualResurface(messages, currentContext.messageId);
    // wireAttachmentHoverCards(message) is off — Draft-It and the attachment
    // X-ray both depend on the same glance-assist backend call, and that call
    // isn't reliably configured yet ("This feature is not configured yet"
    // reaching the card in practice). Cutting the whole sidebar surface
    // (badge, Draft-It, this hover card) rather than shipping a feature that
    // errors on click — the chip's own write is the one path proven to work
    // end to end. Re-enable both this call and mountSidebar() in init() once
    // glance-assist is confirmed working.

    // A live chip already sitting in this exact node means there is nothing
    // to do — this is the fast path that avoids re-running judgment on every
    // debounced mutation while a chip is already showing.
    if (message.querySelector('.flow-chip-host')) return;

    const messageId = legacyId || hashNode(message);
    if (!messageId) return;

    // A message can reach "seen" with no live chip in front of you two very
    // different ways: you dismissed it, or Gmail rebuilt the DOM out from
    // under it. Those call for opposite responses, so the check below asks
    // "did the user ever take a final action on this message" rather than
    // "have we looked at this message before" — see hasTerminalOutcome for
    // why "seen" alone used to make a rebuilt node's chip unrecoverable.
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
    if (text.length < 20) return; // still rendering, or genuinely nothing new was written

    // Captured before markSeen flips it, so it still answers "is this the
    // first time," which is what decides whether to log 'shown' below.
    const alreadyLoggedShown = await FlowStorage.wasSeen(messageId);
    await FlowStorage.markSeen(messageId);

    state = await FlowStorage.get();

    // The action-planning pipeline below only ever writes to Google
    // (Calendar, Gmail, Tasks) — Notion/HubSpot/Salesforce/Slack/Monday.com
    // are the MVP-paused connectors (connectors.js's mvp:true filter
    // already limits onboarding to Google Tasks only, and background.js's
    // WRITERS/UNDOERS entries for the others exist purely so a direct API
    // caller isn't broken, not because the live chip still routes to them).
    // A connectorId stored before that scope cut would otherwise get a
    // chip that's guaranteed to fail with a confusing "connect Google"
    // message for a system it never asked them to connect — stay silent
    // until they reconnect through the popup instead, the same treatment
    // as "not onboarded".
    if (state.connectorId && state.connectorId !== 'googleTasks') return;

    const sender = extractSender(message);
    const subject = currentSubject();

    // Classification (intent.js) -> Decision (actions.js) -> Execution
    // (background.js's writer functions, dispatched by step.kind). This
    // file only ever sits at the two ends of that chain: it hands intent.js
    // the raw text, hands actions.js the classified Intent, and later hands
    // background.js one step at a time — it never re-derives what "this is
    // a request" or "this should become a Calendar event" means.
    const intent = FlowIntent.classify(text, {
      senderEmail: sender.email,
      senderName: sender.name,
      calibration: state.calibration,
      calibrationByType: state.calibrationByType
    });
    if (!intent.type) return;

    const attachments = allRealAttachments(message);
    const attachment = attachments[0] || null;
    // Execution Memory is fetched once here, not once per process — which
    // process this message needs isn't known until after classification,
    // and actions.js's planFor() does the per-process lookup itself from
    // this same full blob.
    const executionMemory = await FlowExecutionMemory.getAll();
    const process = FlowActions.planFor(intent, {
      threadUrl: threadUrl(legacyId),
      hasThreadAttachment: Boolean(attachment),
      executionMemory
    });
    if (!process) return; // defensive only — every catalog entry has at least an anchor step

    injectChip(message, {
      messageId, intent, process, sender, subject, attachment, attachments,
      threadUrl: threadUrl(legacyId),
      // Snapshotted now, not re-read from the DOM at click time — by the
      // time "Do It" is clicked the chip's own ctx has no live node
      // reference to this message, and Gmail may have long since rebuilt or
      // removed it anyway.
      bodyText: text
    });
    // Re-injecting after Gmail rebuilds the node is now expected behaviour,
    // not a rare edge case — logging 'shown' again every time would fill the
    // 200-entry cap with duplicates for one message and evict real history
    // for others. Only record it the first time.
    if (!alreadyLoggedShown) {
      // The extra fields below (process/threadUrl/sender/subject/intent) are
      // what let the Morning Brief re-run Do It / Dismiss on this exact
      // process later, without this message node — or even this tab — still
      // existing. Every field is already a plain value at this point (no
      // DOM references, nothing that depends on the live node), the same
      // snapshot discipline injectChip's own ctx already follows.
      FlowStorage.appendLog({
        kind: 'shown', label: intent.label, messageId, score: intent.signals.score, signals: intent.signals,
        process: { id: process.id, name: process.name, steps: process.steps },
        threadUrl: threadUrl(legacyId), sender, subject,
        intent: { type: intent.type, label: intent.label, facts: intent.facts, signals: { score: intent.signals.score } },
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
  // that separately as a styled brand mark (sparkle + gradient wordmark),
  // so this function only ever has to answer "what is about to happen,"
  // not "how should the brand name look."
  function closingSentence(process, intent) {
    const e = intent.entities || {};
    const when = e.when ? ', ' + e.when : '';
    const amount = e.amount ? ', ' + e.amount : '';
    switch (process.id) {
      case 'schedule-confirm':
        return 'is scheduling the meeting' + when + ', sending a confirmation, and opening a follow-up task.';
      case 'schedule':
        return 'is scheduling the meeting' + when + ' and opening a reminder to prepare.';
      case 'reply-track':
        return 'is replying to the request' + when + ' and opening a follow-up task.';
      case 'follow-through':
        return 'is opening a reminder for your commitment' + when + amount + ', with a reply ready.';
      default: // log-it
        return 'is logging the decision' + amount + when + '.';
    }
  }

  // The one AI-forward visual signature on the card: a small sparkle mark
  // ahead of a gradient-text "Flow" — the same blue family the Do It
  // button's own ring/shell already use (see chip.css), not a new palette,
  // and confined to a single word rather than a page-level gradient wash.
  function sparkleIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 16 16', class: 'flow-chip-sparkle', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('path', { d: 'M8 1 L9.4 6.6 L15 8 L9.4 9.4 L8 15 L6.6 9.4 L1 8 L6.6 6.6 Z' }));
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
  let drivePickerSeq = 0;
  const pendingDrivePickerResolvers = new Map(); // requestId -> resolve(file|null)

  function openDrivePicker() {
    const requestId = 'dp_' + Date.now() + '_' + (++drivePickerSeq);
    return new Promise((resolve) => {
      pendingDrivePickerResolvers.set(requestId, resolve);
      chrome.runtime.sendMessage({ type: 'flow:open-drive-picker', payload: { requestId } }, (response) => {
        if (response && response.ok) return; // the real result arrives later via flow:drive-file-result
        pendingDrivePickerResolvers.delete(requestId);
        resolve(null);
      });
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'flow:drive-file-result') return;
    const resolve = pendingDrivePickerResolvers.get(msg.requestId);
    if (!resolve) return; // already resolved (e.g. background.js's open-ack already failed), or a stale message
    pendingDrivePickerResolvers.delete(msg.requestId);
    resolve(msg.cancelled ? null : (msg.file || null));
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

  // Zero-Prompt, deliberately: the idle card is one process badge, one
  // sentence, and one button. actions.js already picked exactly one named
  // process (never a loose action list) — when it has more than one step,
  // that shows up as a quiet "N steps" toggle next to Do It, not a row of
  // pills sitting open competing with the button for attention. Do It
  // always closes the full process either way; opening the toggle is
  // purely for someone who wants to look before confirming, or prune one
  // step out — a real control, not the headline of the interaction.
  function injectChip(messageNode, ctx) {
    if (messageNode.querySelector('.flow-chip-host')) return;

    const host = el('div', 'flow-chip-host');
    host.setAttribute('dir', 'ltr');

    // The process name as its own small, quiet label — "this is one named
    // thing Glance is closing," stated before the sentence explains what
    // that means, not left for the user to infer from a pile of pills.
    host.appendChild(el('span', 'flow-chip-process-name', ctx.process.name));

    // sparkle + gradient "Glance" + the rest of the sentence as its own
    // text node — three children in that DOM order, sparkle first, right
    // before the brand name, same as before this was translated to
    // English (see closingSentence's own header comment for why it no
    // longer needs a dir="rtl" host).
    const textEl = el('p', 'flow-chip-text');
    textEl.appendChild(sparkleIcon());
    textEl.appendChild(el('span', 'flow-chip-brand', 'Glance'));
    textEl.appendChild(document.createTextNode(' ' + closingSentence(ctx.process, ctx.intent)));
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
        if (step.kind === 'gmailDraft' && step.params && step.params.includeAttachment) {
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
    if (response.reason === 'no-matching-contact') return 'No matching contact for ' + (ctx.sender.email || 'this sender') + '.';
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
  async function buildActionPayload(action, ctx) {
    const base = { connectorId: action.kind, threadUrl: ctx.threadUrl };

    if (action.kind === 'calendar') {
      return Object.assign(base, { params: action.params });
    }

    if (action.kind === 'gmailDraft') {
      // selectedAttachment/driveFileId are only ever set by the attach
      // chooser (buildAttachChooser, above) — if the user never opened it,
      // both stay undefined and this falls back to exactly the old
      // single-attachment behaviour: the thread's first real attachment.
      const { selectedAttachment, driveFileId, driveFileName, driveMimeType, ...cleanParams } = action.params;
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

    // googleTask — background.js's existing googleTasksWrite(p) predates
    // actions.js and still expects the old top-level shape (label/facts),
    // not params. Reusing it unmodified rather than reshaping a write path
    // that already works.
    return Object.assign(base, {
      label: action.params.title || action.label,
      facts: ctx.intent.facts,
      senderName: ctx.sender.name,
      senderEmail: ctx.sender.email,
      subject: ctx.subject,
      // Same non-third-party use as the old single-action flow: only ever
      // read locally in background.js to match a Notion select column's own
      // option names, never sent anywhere as free text by this action kind.
      bodyText: (ctx.bodyText || '').slice(0, 20000)
    });
  }

  function sendExecuteAction(payload) {
    return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'flow:execute-action', payload }, resolve));
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
  // that never happened. Today's catalog gives every step `dependsOn: null`
  // (Calendar/Draft/Task each write independently from the same source
  // facts), so this branch is inert in practice — but the chain is treated
  // as one ordered, atomic unit either way, and the mechanism is real for
  // the day a step does need one.
  //
  // onStepDone(result, doneCount, total), when given, fires once per step
  // (success, failure, or skip) as it resolves — this is what lets the chip
  // narrate progress while Do It is still running, not just before and
  // after (see onDoIt's own use of it).
  async function runActionsSequentially(actions, ctx, onStepDone) {
    const results = [];
    const okIds = new Set();
    for (const action of actions) {
      let result;
      if (action.dependsOn && !okIds.has(action.dependsOn)) {
        result = { action, response: { ok: false, skipped: true, reason: 'dependency-failed' } };
      } else {
        const payload = await buildActionPayload(action, ctx);
        const response = await sendExecuteAction(payload);
        if (response && response.ok) okIds.add(action.id);
        result = { action, response };
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
      if (!result || !result.ok) return { ok: false, undoneIds, failedAt: r.action };
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
    googleTask: 'set a reminder'
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
  // e.g. "Scheduled, confirmed, and tracked.") over the generic verb-join:
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

  // The chip's receipt for a closed process of 1-5 steps: the process name,
  // a closure-framed summary of what actually happened, a link per
  // successful write that has one, and a single "Undo all" that reverses
  // every successful write in the group together. A write that failed
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
    // shows, with one extra, concrete line, for however many of the first
    // few closes actually need it.
    //
    // Covers the first THREE closes, not just the very first: the first
    // close is the moment of discovery, but a new user's trust in "this
    // actually works" isn't fully earned on one data point — the second
    // and third closes are what confirm it wasn't a fluke. The line stays
    // exactly the same across all three rather than escalating or varying
    // it: repeating the same concrete claim is reinforcement, while three
    // different lines for three closes a day or two apart would read as a
    // script, not a system telling the truth about what it just did. From
    // the fourth close on, the receipt goes back to just closedSummary()
    // alone — by then the pattern is established and restating it would
    // cheapen it into a slogan.
    const priorCloses = (await FlowStorage.get()).writeStats.total;
    const isEarlyClose = priorCloses < 3;

    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    const icon = el('span', 'flow-chip-done-icon', '✓');
    icon.setAttribute('aria-hidden', 'true');
    done.appendChild(icon);
    done.appendChild(el('span', 'flow-chip-process-name', ctx.process.name));
    done.appendChild(el('span', 'flow-chip-label', closedSummary(succeeded, ctx)));
    if (isEarlyClose) {
      done.appendChild(el('span', 'flow-chip-first-close', 'Nothing else to open, nothing else to check — that’s handled.'));
    }

    const actionsRow = el('span', 'flow-chip-actions');
    for (const r of succeeded) {
      if (!r.response.url) continue;
      const view = el('a', 'flow-chip-link', succeeded.length > 1 ? 'View ' + r.response.where : 'View');
      view.href = r.response.url; view.target = '_blank'; view.rel = 'noopener';
      actionsRow.appendChild(view);
    }

    const undo = el('button', 'flow-chip-link', succeeded.length > 1 ? 'Undo all' : 'Undo');
    undo.type = 'button';
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
        }
        if (result.ok) {
          done.replaceChildren(el('span', 'flow-chip-label', 'Undone — nothing was kept'));
          FlowStorage.appendLog({ kind: 'undone', label: ctx.intent.label, messageId: ctx.messageId, app: SOURCE_APP });
          chrome.runtime.sendMessage({ type: 'flow:track', event: 'action_undone', params: { domain: state.domainId } });
        } else {
          undo.textContent = 'Some actions couldn’t be undone';
          undo.disabled = false;
        }
      });
    });
    actionsRow.appendChild(undo);
    done.appendChild(actionsRow);

    if (results.length > succeeded.length) {
      done.appendChild(el('span', 'flow-chip-partial-note', '(' + (results.length - succeeded.length) + ' of ' + results.length + ' didn’t complete)'));
    }

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
    await Promise.all(succeeded.map((r) =>
      FlowStorage.appendLog({ kind: 'written', label: ctx.intent.label, messageId: ctx.messageId, where: r.response.where, url: r.response.url, ref: r.response.ref, connectorId: r.action.kind, app: SOURCE_APP })
        .catch((e) => console.error('[Glance] failed to record a completed write — the write itself already succeeded', e))
    ));
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
        .catch((e) => console.error('[Glance] failed to record a dismiss in Execution Memory', e))
    ]);
    chrome.runtime.sendMessage({ type: 'flow:track', event: 'chip_dismissed', params: { domain: state.domainId } });
    // See showMultiActionReceipt's own comment on process_closed — a decline
    // is a real closure of the loop too, just via the other method.
    chrome.runtime.sendMessage({ type: 'flow:track', event: 'process_closed', params: { domain: state.domainId, method: 'dismissed' } });
    checkBrief();
  }

  /* --------------------------------------------------- Morning Brief (proactive closing) */
  //
  // The one habit-loop surface this extension has: a small, silent-by-default
  // indicator for processes that were shown and never closed — not a second
  // "you missed something" alert system, just the same Do It / Dismiss the
  // live chip already offers, reachable for something that's no longer the
  // message currently open in Gmail. Zero-Prompt rules apply here exactly as
  // everywhere else: nothing renders at all when nothing is open, there is no
  // settings screen, and the daily auto-open (see FlowStorage.
  // consumeDailyBriefTrigger) is the only thing resembling a ritual — one
  // real chance per day, never repeated, never forced if there's nothing to
  // show.
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
      sender: entry.sender,
      subject: entry.subject,
      intent: entry.intent,
      process: entry.process
    };
  }

  function briefRowSubtitle(entry) {
    const who = (entry.sender && entry.sender.name) || (entry.sender && entry.sender.email) || '';
    const what = entry.subject || entry.intent.label || '';
    return who && what ? who + ' — ' + what : (what || who);
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
      title: entry.process.name,
      subtitle: briefRowSubtitle(entry),
      onDoIt(rowHost, doItBtn) {
        const ctx = ctxFromPendingEntry(entry);
        onDoIt(rowHost, doItBtn, ctx, ctx.process.steps);
      },
      onDismiss(rowHost) {
        onDismiss(rowHost, ctxFromPendingEntry(entry));
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

  async function checkBrief() {
    if (!watching) return;
    const freshState = await FlowStorage.get();
    // Same MVP scope gate as the live chip (scanReadingPane) — never
    // resurface something Do It is guaranteed to fail on because the
    // connector it was proposed for isn't the one currently wired up.
    if (freshState.connectorId && freshState.connectorId !== 'googleTasks') { FlowBrief.hide(); reportPendingCount(0); return; }

    const pending = await FlowStorage.getPending();
    reportPendingCount(pending.length);
    if (!pending.length) {
      // Don't yank an already-open panel out from under someone the instant
      // the last item in it resolves — they just watched it close and
      // deserve to see that, not have the whole surface vanish under the
      // receipt. Only fully hide when nothing is actively being looked at;
      // the panel's own close button re-runs this check, so a stale
      // indicator never outlives the panel that would have refreshed it.
      if (!FlowBrief.isPanelOpen()) FlowBrief.hide();
      return;
    }

    FlowBrief.show(pending.length, () => openBriefPanel(pending));

    // The only thing resembling a daily ritual, and only spent on a day that
    // actually has something to show — see the field's own comment in
    // storage.js for why an empty day never consumes it.
    if (await FlowStorage.consumeDailyBriefTrigger()) openBriefPanel(pending);
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

    chrome.runtime.sendMessage({ type: 'flow:draft-reply', payload: { lang, entries } }, (response) => {
      if (!response || !response.ok) {
        FlowSidebar.renderDraft('error', { message: (response && response.error) || 'Could not draft a reply.', onDraft: handleDraftIt });
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
          FlowSidebar.showFloatingCard(rect, { state: 'error', message: (response && response.error) || 'Couldn’t read this attachment.' });
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
  });

  init();
})();
