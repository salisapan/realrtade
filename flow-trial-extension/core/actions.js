// The decision layer: given a classified Intent (from intent.js), a little
// context about the message (thread URL, attachment), and this account's
// own Execution Memory (execution-memory.js), decides on ONE short,
// named PROCESS to close the intention — never a loose pile of
// independent actions. Execution lives in background.js; this file only
// ever returns a plan for the chip to render and, on click, hand to
// background.js one step at a time.
//
// "You intend — we execute": a process is what a person would describe as
// one outcome ("scheduled, confirmed, and a follow-up is set"), not three
// separate things that happen to have appeared together. planFor()
// returns { id, name, closingLine, steps } or null — never a bare array —
// specifically so nothing downstream can drift back into treating this as
// an unrelated grab-bag of pills.
//
// This is the middle of the three-layer split the spec requires
// (Classification -> Decision -> Execution). Adding a platform later
// (Outlook, WhatsApp) means adding new step kinds here and a matching
// executor in background.js — this file's shape does not change.
//
// Each step also carries an explicit `dependsOn` (a prior step's id, or
// null — see buildStep below) — the process is an atomic, ordered chain,
// not an unordered set, and content-gmail.js's sequencer/rollback
// (runActionsSequentially / rollbackChain) is built to honor that ordering
// rather than assume steps are independent just because today's catalog
// happens to make them so.

const FlowActions = (() => {
  const MAX_ACTIONS = 5;
  // A step this process has been actively rejected on (removed before
  // confirming, or accepted and then undone) more often than kept, across
  // at least this many real occurrences, stops being proposed by default.
  // Below this sample size a couple of removals reads as noise, not
  // preference — one dismissal on a novel process is not a verdict.
  const DEMOTE_THRESHOLD = 3;

  function calendarAction(intent, e, ctx) {
    // A calendar hold's title is the sentence being closed. The schedule
    // processes keep the short "Meeting Sep 18" label — that path is a
    // meeting, and the sentence can be the whole invite.
    const mutate = e.calendarOp === 'delete' || e.calendarOp === 'update';
    const hold = intent.personalClose === 'calendar-hold' || mutate;
    const title = (hold ? (e.what || intent.label) : (intent.label || e.what)) || (hold ? 'Hold' : 'Meeting');
    const hint = e.calendarOp === 'delete' ? 'Remove from Calendar: '
      : e.calendarOp === 'update' ? 'Move on Calendar: '
      : 'Add to Calendar: ';
    return {
      id: 'calendar',
      kind: 'calendar',
      // Short — this is a collapsed-by-default step label, not the whole
      // sentence describing the step (see content-gmail.js's injectChip:
      // only surfaced at all once someone opens the step list). The full
      // description still exists, as `hint`, for the step's title/aria-label.
      label: 'Calendar',
      hint: hint + (intent.label || 'Meeting'),
      params: {
        title: String(title).slice(0, 200),
        dateIso: e.dateIso, hour: e.hour, minute: e.minute,
        calendarOp: mutate ? e.calendarOp : null,
        fromDateIso: e.calendarOp === 'update' ? e.fromDateIso : null,
        fromHour: e.calendarOp === 'update' ? e.fromHour : null,
        fromMinute: e.calendarOp === 'update' ? e.fromMinute : null,
        // The sentence the event is about. The title stays short ("Meeting
        // Sep 18 15:00"); without this, View opens a Calendar event that
        // never says what was scheduled. "Meeting" is the classifier's
        // fallback when no sentence was found — not a quote. A hold's
        // fallback title is "Hold", which is the same kind of placeholder.
        quote: (e.what && e.what !== 'Meeting' && e.what !== 'Hold') ? String(e.what).slice(0, 400) : null,
        // A hold was only proposed because a clock time resolved. The
        // writer must not fall back to an all-day event if that time is
        // missing by the time Do It runs.
        requireTime: hold || mutate,
        threadUrl: ctx.threadUrl
      }
    };
  }

  function draftAction(intent, e, ctx, hasAttachment) {
    // Reply-with-facts: the draft is the one fact, nothing else. No
    // attachment search, no "write your reply here", no task beside it.
    if (intent.type === 'fact' || (intent.signals && intent.signals.factReply)) {
      const factLine = e.factLine ? String(e.factLine).replace(/[\r\n]+/g, ' ').trim() : '';
      if (!factLine) return null;
      return {
        id: 'draft',
        kind: 'gmailDraft',
        label: 'Reply draft',
        hint: 'Insert ' + (e.factValue || 'the fact') + ' into a reply draft',
        params: {
          intentType: 'fact',
          replyFact: true,
          what: factLine,
          factLine: factLine,
          factValue: e.factValue || null,
          includeAttachment: false
        }
      };
    }
    // For the SCHEDULED_EVENT + handoff combined process (a meeting invite
    // that also asks the reader to confirm), entities.what is the MEETING
    // sentence — the right title for the Calendar step above, but not what
    // this draft should be replying to. entities.requestWhat (set by
    // intent.js whenever a handoff signal is present, independent of which
    // type won) is the actual ask; falling back to entities.what keeps
    // REQUEST/COMMITMENT_OF_READER unchanged, since their own `what` is
    // already the request/commitment sentence.
    const what = (intent.type === FlowIntent.TYPES.SCHEDULED_EVENT && e.requestWhat) ? e.requestWhat : e.what;
    // A named noun in the email is not permission to attach whatever Drive
    // search returns. The file is attached only when the caller already
    // resolved exactly one high-confidence match (core/file-attach.js) and
    // passed it in as ctx.attachFile. A thread attachment the user can
    // already see is the other honest case. Anything else stays a plain
    // reply draft — promising "+ file" before that match exists is how a
    // wrong file gets onto a sendable draft.
    if (intent.inviteFile) {
      const fileOnDraft = Boolean(ctx.attachFile && ctx.attachFile.id);
      const plan = (typeof FlowIntent !== 'undefined' && FlowIntent.attachToInvitePlan)
        ? FlowIntent.attachToInvitePlan(ctx.text || '', { attached: fileOnDraft })
        : null;
      const he = /[\u0590-\u05FF]/.test(String((plan && plan.label) || intent.label || ctx.text || ''));
      const honest = he ? 'אצרף בהקדם.' : "I'll attach it shortly.";
      return {
        id: 'draft',
        kind: 'gmailDraft',
        label: 'Draft',
        hint: fileOnDraft ? 'Short note that the file is attached' : 'Short note that the file is still to attach',
        params: {
          intentType: intent.type,
          what: (plan && plan.label) || intent.label || null,
          inviteFile: true,
          body: (plan && plan.draft) || intent.inviteDraft || honest,
          lang: he ? 'he' : 'en',
          threadUrl: ctx.threadUrl,
          includeAttachment: fileOnDraft,
          fileAttached: fileOnDraft,
          requestedObjectTerm: null
        }
      };
    }
    const found = ctx.attachFile && ctx.attachFile.id ? ctx.attachFile : null;
    const mayFindFile = hasAttachment || Boolean(found);
    return {
      id: 'draft',
      kind: 'gmailDraft',
      label: mayFindFile ? 'Draft reply + file' : 'Draft reply',
      hint: 'Prepare reply draft' + (mayFindFile ? ' with attachment' : ''),
      params: {
        intentType: intent.type,
        what, when: e.when, amount: e.amount,
        threadUrl: ctx.threadUrl,
        includeAttachment: mayFindFile,
        requestedObjectTerm: e.requestedObjectTerm || null,
        driveFileId: found ? found.id : null,
        driveFileName: found ? found.name : null,
        driveMimeType: found ? found.mimeType : null,
        attachSource: found ? 'found' : null
      }
    };
  }

  function taskAction(intent, e, ctx) {
    return {
      id: 'task',
      kind: 'googleTask',
      label: 'Task',
      hint: 'Create task: ' + (intent.label || e.what || intent.type),
      params: {
        title: intent.label || e.what,
        dateIso: e.dateIso,
        amount: e.amount,
        // The sentence this close is about. The writer quotes it even when
        // the later caller only still has the step (a Brief replay stores
        // steps, and used to drop intent.entities).
        what: e.what || null,
        threadUrl: ctx.threadUrl
      }
    };
  }

  function buildStep(kind, intent, e, ctx, hasAttachment) {
    const step = kind === 'calendar' ? calendarAction(intent, e, ctx)
      : kind === 'draft' ? draftAction(intent, e, ctx, hasAttachment)
      : taskAction(intent, e, ctx);
    if (!step) return null;
    // Explicit dependency slot: null for every step in today's catalog,
    // since Calendar/Draft/Task each write independently from the same
    // source intent/entities rather than from one another's results — there
    // is no real "step B needs step A's output" case yet. The field exists
    // so a step that DOES need a prior step's result (e.g. a future draft
    // that quotes the calendar invite it was scheduled against) has
    // somewhere real to declare it, and so content-gmail.js's executor
    // (runActionsSequentially) and its rollback (rollbackChain) have
    // something concrete to honor rather than being retrofitted later.
    step.dependsOn = null;
    return step;
  }

  // ---------------------------------------------------------------- catalog
  //
  // A small, fixed library of named, closing-oriented processes — not a
  // rules engine, and deliberately not extensible from outside this file.
  // `anchor` is the one step Execution Memory below may never demote or
  // reorder: it's the concrete evidence the process exists on at all (a
  // real date+time for a schedule process, the ask itself for a reply) —
  // memory bias only ever touches the secondary steps around it.
  //
  // Exported as-is (see the return statement below) so anything that needs
  // to describe a process's fixed shape from just its id — popup.js's
  // Execution Memory insight card, most notably — reads the exact same
  // table processFor() selects from, instead of a second, hand-copied list
  // that could quietly drift out of sync with it.
  const PROCESS_CATALOG = {
    // One event, no reminder. planFor chooses this when a meeting noun, a
    // date, and a time are present and the mail does not ask for a reply.
    // A meeting noun and a date with no time stays schedule.
    'hold': {
      name: 'Hold It',
      closingLine: 'Putting this on your calendar.',
      closedLine: 'On your calendar.',
      anchor: 'calendar',
      stepKinds: ['calendar']
    },
    // A named slot that is cancelled. One delete, after the writer finds
    // exactly one event at that time. Not a new event.
    'clear-it': {
      name: 'Clear It',
      closingLine: 'Taking this off your calendar.',
      closedLine: 'Off your calendar.',
      anchor: 'calendar',
      stepKinds: ['calendar']
    },
    // A named slot moved to a different named clock. One update.
    'move-it': {
      name: 'Move It',
      closingLine: 'Moving this on your calendar.',
      closedLine: 'Moved on your calendar.',
      anchor: 'calendar',
      stepKinds: ['calendar']
    },
    'schedule-confirm': {
      name: 'Schedule & Confirm',
      // "replying to confirm" / "confirmed" would both overclaim: the draft
      // step (gmailDraftWrite, background.js) only ever creates a Gmail
      // draft — never sends — as a deliberate safety choice, never on the
      // user's behalf without their own review. Saying "confirmed" here
      // would tell the user this process already sent something it
      // didn't, which is the one thing worse than an honest "still needs
      // you to hit send": believing it's done when it isn't.
      closingLine: 'Scheduling this, drafting a reply to confirm, and setting a follow-up.',
      closedLine: 'Scheduled, drafted, and tracked.',
      anchor: 'calendar',
      stepKinds: ['calendar', 'draft', 'task']
    },
    'schedule': {
      name: 'Schedule It',
      closingLine: 'Scheduling this and setting a reminder to prepare.',
      closedLine: 'Scheduled, with a reminder set.',
      anchor: 'calendar',
      stepKinds: ['calendar', 'task']
    },
    'reply-track': {
      name: 'Reply & Track',
      closingLine: 'Drafting your reply and tracking it as a task.',
      // Same accuracy fix as schedule-confirm above: the draft step never
      // sends, so "Replied" claimed a step this process doesn't take.
      closedLine: 'Drafted and tracked.',
      anchor: 'draft',
      stepKinds: ['draft', 'task']
    },
    // A file asked onto an invite that already exists. The task is the
    // work. The draft says the file is attached only when a file is on it.
    'attach-invite': {
      name: 'Attach it',
      closingLine: 'Tracking the file on the invite, with a short draft.',
      closedLine: 'Drafted and tracked.',
      anchor: 'task',
      stepKinds: ['task', 'draft']
    },
    'follow-through': {
      name: 'Follow Through',
      closingLine: 'Setting a reminder to follow through, with a reply ready.',
      closedLine: 'Reminder set, reply ready.',
      anchor: 'task',
      stepKinds: ['task', 'draft']
    },
    // One trusted Sheet cell or Doc paragraph, inserted into a reply draft.
    // The user still sends. No task, no attachment, no second step.
    'reply-fact': {
      name: 'Reply with it',
      closingLine: 'Putting this fact into a reply draft.',
      closedLine: 'The fact is in a reply draft.',
      anchor: 'draft',
      stepKinds: ['draft']
    },
    // DECISION_TO_LOG / FOLLOW_UP — the chip's original job, narrowed to
    // its own named process rather than a type-less default.
    'log-it': {
      name: 'Log It',
      closingLine: 'Logging this so it stays tracked.',
      // "Logged." alone read thinner than every sibling closedLine here
      // (all the others state two things that happened) now that this
      // string is actually shown in the receipt — see content-gmail.js's
      // closedSummary(). "and tracked" also matches reply-track's own
      // vocabulary for the same underlying step (a Google Task).
      closedLine: 'Logged and tracked.',
      anchor: 'task',
      stepKinds: ['task']
    },
    // Google Drive / Doc / Sheet closes. The anchor is the file itself.
    // Memory may not drop it; a close with no file is not a close.
    'file-on-hold': {
      name: 'Hold it',
      closingLine: 'Putting the file on your calendar.',
      closedLine: 'On your calendar, with the file.',
      anchor: 'calendar',
      stepKinds: ['calendar']
    },
    'file-on-task': {
      name: 'Note it',
      closingLine: 'Noting the file on the task.',
      closedLine: 'On the task, with the file.',
      anchor: 'task',
      stepKinds: ['task']
    },
    'file-it': {
      name: 'File it',
      closingLine: 'Saving the attached file to Drive.',
      closedLine: 'Saved to Drive, link drafted.',
      anchor: 'file',
      stepKinds: ['file', 'draft']
    },
    'create-missing': {
      name: 'Draft it',
      closingLine: "Didn't find it — draft from template.",
      closedLine: 'Drafted from the template, link ready.',
      anchor: 'doc',
      stepKinds: ['doc', 'sheet', 'calendar', 'draft']
    }
  };

  function processFor(intent) {
    const sig = intent.signals || {};
    let id;
    if (intent.type === 'fact' || (intent.signals && intent.signals.factReply)) {
      id = 'reply-fact';
    } else if (intent.personalClose === 'calendar-cancel') {
      id = 'clear-it';
    } else if (intent.personalClose === 'calendar-move') {
      id = 'move-it';
    } else if (intent.personalClose === 'calendar-hold') {
      id = 'hold';
    } else if (intent.type === FlowIntent.TYPES.SCHEDULED_EVENT) {
      id = sig.handoff ? 'schedule-confirm' : 'schedule';
    } else if (intent.type === FlowIntent.TYPES.REQUEST) {
      // "No need to reply" is the task, not Reply & Track.
      // A file onto an existing invite is the task plus the short draft.
      id = intent.inviteFile ? 'attach-invite' : (intent.noReplyDraft ? 'log-it' : 'reply-track');
    } else if (intent.type === FlowIntent.TYPES.COMMITMENT_OF_READER) {
      id = 'follow-through';
    } else {
      id = 'log-it';
    }
    return Object.assign({ id }, PROCESS_CATALOG[id]);
  }

  // ----------------------------------------------------------- memory bias
  //
  // A step is net-rejected once it's been removed-or-undone more often than
  // accepted, across a real sample size — below DEMOTE_THRESHOLD a couple of
  // removals reads as noise, not preference, and one dismissal on a novel
  // process is not a verdict. `pinned` overrides this unconditionally: it's
  // set only by an explicit "No, keep proposing it" click on the popup's
  // Execution Memory insight card (see FlowExecutionMemory.recordPin) — a
  // human's direct answer to a direct question always outranks the
  // algorithm's own inference from indirect signals.
  //
  // Exported (see the return statement below) so that same insight card can
  // ask "is this actually being demoted right now" using the identical
  // predicate applyMemory acts on, rather than a second copy of this math
  // that could silently disagree with what the live chip is really doing.
  function isNetRejected(stats) {
    if (!stats || stats.pinned) return false;
    const rejected = (stats.removed || 0) + (stats.undone || 0);
    return rejected >= DEMOTE_THRESHOLD && rejected > (stats.accepted || 0);
  }

  // Within the non-anchor steps only: drop a step kind isNetRejected() flags,
  // and otherwise order the rest by historical acceptance rate —
  // most-reliably-kept first. No history for a step yet -> neutral 0.5 rate,
  // which keeps the catalog's own default order for ties.
  function applyMemory(stepKinds, anchor, memoryForProcess) {
    const rest = stepKinds.filter((k) => k !== anchor);
    const stats = (memoryForProcess && memoryForProcess.steps) || {};

    const kept = rest.filter((k) => !isNetRejected(stats[k]));

    const scored = kept.map((k, i) => {
      const s = stats[k];
      if (!s) return { k, rate: 0.5, i };
      const total = s.accepted + s.removed + s.undone;
      return { k, rate: total > 0 ? s.accepted / total : 0.5, i };
    });
    scored.sort((a, b) => b.rate - a.rate || a.i - b.i);

    const ordered = scored.map((x) => x.k);
    return stepKinds.includes(anchor) ? [anchor, ...ordered] : ordered;
  }

  // ctx.executionMemory, when present, is the FULL memory blob keyed by
  // process id (FlowExecutionMemory.getAll()'s own shape) — fetched once by
  // content-gmail.js per scan, not per process, since which process this
  // message needs isn't known until after classification.
  function withThread(step, ctx) {
    if (step.params && ctx.threadUrl) step.params.threadUrl = ctx.threadUrl;
    return step;
  }

  // A Drive / Doc / Sheet close planned by google-closes.js. One process,
  // reversible writes only. The draft shares the link of the file this
  // same click created; it does not search Drive (that search belongs to
  // the find-and-attach path).
  function planGoogle(intent, ctx) {
    const g = intent.googleClose;
    if (!g) return null;
    const e = intent.entities || {};
    if (g.personalClose === 'file-on-hold') {
      if (!Number.isInteger(e.hour) || !Number.isInteger(e.minute)) return null;
      return {
        id: 'file-on-hold',
        name: 'Hold it',
        closingLine: g.cardLine,
        closedLine: 'On your calendar, with the file.',
        steps: [withThread({
          id: 'calendar',
          kind: 'calendar',
          label: 'Calendar',
          hint: 'Add to Calendar with the file',
          dependsOn: null,
          params: {
            title: String(e.what || g.fileTerm || 'Hold').slice(0, 200),
            dateIso: e.dateIso,
            hour: e.hour,
            minute: e.minute,
            quote: e.what || null,
            requireTime: true,
            fileTerm: g.fileTerm
          }
        }, ctx)]
      };
    }
    if (g.personalClose === 'file-on-task') {
      return {
        id: 'file-on-task',
        name: 'Note it',
        closingLine: g.cardLine,
        closedLine: 'On the task, with the file.',
        steps: [withThread({
          id: 'task',
          kind: 'googleTask',
          label: 'Task',
          hint: 'Task note with the file',
          dependsOn: null,
          params: {
            title: e.what || g.fileTerm,
            dateIso: e.dateIso,
            amount: e.amount,
            what: e.what || null,
            fileTerm: g.fileTerm
          }
        }, ctx)]
      };
    }
    if (g.personalClose === 'drive-file') {
      const onedrive = g.target === 'onedrive';
      const fileStep = {
        id: 'file',
        kind: 'driveFile',
        label: onedrive ? 'OneDrive' : 'Drive',
        hint: onedrive ? 'Save the attached file to OneDrive' : 'Save the attached file',
        dependsOn: null,
        params: { copyAttachment: true, googleClose: g }
      };
      const draftStep = {
        id: 'draft',
        kind: 'gmailDraft',
        label: 'Draft link',
        hint: 'Draft a reply with the file link',
        dependsOn: 'file',
        params: { what: g.cardLine, shareLink: true, includeAttachment: false, requestedObjectTerm: null }
      };
      return {
        id: 'file-it',
        name: 'File it',
        closingLine: g.cardLine,
        closedLine: onedrive ? 'Saved on OneDrive.' : 'Saved to Drive, link drafted.',
        steps: [fileStep, draftStep]
      };
    }
    if (g.personalClose !== 'create-missing') return null;
    const createId = g.kind === 'sheet' ? 'sheet' : 'doc';
    const createKind = g.kind === 'sheet' ? 'driveSheet' : 'driveDoc';
    const steps = [{
      id: createId,
      kind: createKind,
      label: g.kind === 'sheet' ? 'Sheet' : 'Doc',
      hint: g.templateName || 'Create from the template',
      dependsOn: null,
      params: { googleClose: g }
    }];
    if (g.destination === 'calendar' && Number.isInteger(e.hour) && Number.isInteger(e.minute)) {
      steps.push(withThread({
        id: 'calendar',
        kind: 'calendar',
        label: 'Calendar',
        hint: 'Add to Calendar with the new file',
        dependsOn: createId,
        params: {
          title: String(e.what || g.cardLine || 'Hold').slice(0, 200),
          dateIso: e.dateIso,
          hour: e.hour,
          minute: e.minute,
          quote: e.what || null,
          requireTime: true,
          shareLink: true
        }
      }, ctx));
    }
    steps.push({
      id: 'draft',
      kind: 'gmailDraft',
      label: 'Draft link',
      hint: 'Draft a reply with the file link',
      dependsOn: createId,
      params: { what: g.cardLine, shareLink: true, includeAttachment: false, requestedObjectTerm: null }
    });
    return {
      id: 'create-missing',
      name: 'Draft it',
      closingLine: g.cardLine,
      closedLine: 'Drafted from the template, link ready.',
      steps: steps
    };
  }

  function dateChoicesOf(intent) {
    const e = intent && intent.entities;
    if (e && Array.isArray(e.dateChoices) && e.dateChoices.length >= 2) return e.dateChoices;
    const d = intent && intent.facts && intent.facts.date;
    if (d && Array.isArray(d.choices) && d.choices.length >= 2) return d.choices;
    return null;
  }

  // The only hold-versus-schedule decision. It runs only after the judge
  // has already decided to offer, and only for a meeting noun plus an
  // explicit date and a clock. A weekday alone stays the schedule process.
  // An absolute date does not decide the calendar. "Call Tom" and
  // "I will call the bank" stay tasks. "I'll call you" is the two-party
  // call. meetingPlanVeto removes the meeting plan. The judge calls that
  // same function before this one runs.
  function meetingClock(intent) {
    const e = intent && intent.entities;
    return Boolean(e && Number.isInteger(e.hour) && Number.isInteger(e.minute));
  }
  function writtenDayNumber(intent) {
    const raw = intent && intent.facts && intent.facts.date && intent.facts.date.raw;
    return /\d/.test(String(raw || ''));
  }
  // A solo phone task is not an event noun. "Call Tom October 19 at 10:00"
  // and "I will call the bank October 19 at 3pm" stay tasks even when the
  // date is absolute. "I'll call you" is the two-party call, so this
  // returns false and the meeting noun can still hold that slot.
  function soloPhoneTask(text) {
    if (typeof FlowIntent !== 'undefined' && typeof FlowIntent.soloPhoneTask === 'function') return FlowIntent.soloPhoneTask(text);
    return false;
  }
  function meetingNarrow(intent, text) {
    if (!intent || intent.type !== 'event' || intent.googleClose) return false;
    if (soloPhoneTask(text)) return false;
    const close = intent.personalClose;
    if (close === 'calendar-cancel' || close === 'calendar-move' || close === 'file-on-hold') return false;
    const sig = intent.signals || {};
    const e = intent.entities || {};
    if (!e.dateIso || !meetingClock(intent)) return false;
    if (close !== 'calendar-hold' && !writtenDayNumber(intent)) return false;
    return Boolean(sig.hasMeetingNoun || close === 'calendar-hold');
  }
  function meetingPlan(intent, proc) {
    if (!intent || intent.type !== 'event' || intent.googleClose) return proc;
    const close = intent.personalClose;
    if (close === 'calendar-cancel' || close === 'calendar-move' || close === 'file-on-hold') return proc;
    const sig = intent.signals || {};
    if (sig.handoff) return proc;
    const e = intent.entities || {};
    const choices = dateChoicesOf(intent);
    const openChoice = Boolean(choices && !e.dateIso);
    const hasDate = Boolean(e.dateIso) || openChoice;
    if (!hasDate) return proc;
    const timed = meetingClock(intent);
    if (openChoice) return Object.assign({ id: 'hold' }, PROCESS_CATALOG.hold);
    if (!sig.hasMeetingNoun) return proc;
    if (!timed) return proc;
    if (close !== 'calendar-hold' && !writtenDayNumber(intent)) return proc;
    return Object.assign({ id: 'hold' }, PROCESS_CATALOG.hold);
  }

  // The person's tap. Only one of the two offered dates is accepted, and
  // until that happens the plan still has no date.
  function chooseDate(plan, iso) {
    const want = String(iso || '');
    const choices = plan && plan.dateChoices;
    if (!want || !Array.isArray(choices) || !choices.some((c) => c && c.iso === want)) return false;
    (plan.steps || []).forEach((step) => {
      if (step && step.kind === 'calendar' && step.params) step.params.dateIso = want;
    });
    plan.needsDateChoice = false;
    return true;
  }

  // A task ask or a commitment that only borrowed a meeting word
  // ("call the accountant", "book the venue", "אתה מעביר את ה-deck")
  // is not a Meeting. A Meeting needs a noun, an explicit date, and a clock.
  function taskNotMeeting(intent, text) {
    if (!intent || intent.type !== 'event' || intent.googleClose) return false;
    const close = intent.personalClose;
    if (close === 'calendar-hold' || close === 'calendar-cancel' || close === 'calendar-move' || close === 'file-on-hold') return false;
    const src = String(text || '');
    if (/\b(?:please\s+)?create a task\b|\badd this to my tasks\b|\bremember to\b/i.test(src)) return true;
    if (soloPhoneTask(src)) return true;
    if (/\bi(?:'|’)ll call\b|\bi will call\b/i.test(src)) return true;
    if (/\byou(?:'|’)ll\s+(?:book|update|call|send)\b|\byou will\s+(?:book|update|call|send)\b|\byou(?:'|’)?re\s+sending\b/i.test(src)) return true;
    if (/אתה\s*מעב[יר]+/.test(src) || /אתם\s+מעבירים/.test(src)) return true;
    return false;
  }

  function planForRaw(intent, ctx) {
    ctx = ctx || {};
    if (!intent || !intent.type) return null;
    if (intent.googleClose && !intent.selfTask) return planGoogle(intent, ctx);
    // The classifier lives on the intent, and planFor calls it again when
    // the mail text is in hand. Either one vetoes the meeting plan.
    const vetoText = ctx.text;
    const vetoed = Boolean(intent.signals && intent.signals.meetingVeto) ||
      Boolean(vetoText && typeof FlowIntent !== 'undefined' && typeof FlowIntent.meetingPlanVeto === 'function' && FlowIntent.meetingPlanVeto(vetoText));
    if (intent.type === 'event' && vetoed) return null;

    const e = intent.entities || {};
    const hasAttachment = Boolean(ctx.hasThreadAttachment);
    // baseOnly is the plan the base judge would build. The show decision
    // uses it. A hedge ("perhaps", "possibly") stays that plan. A Meeting
    // hold needs a noun, an explicit date, and a clock. A task keeps a task.
    const hedged = /\b(?:perhaps|possibly|not sure|maybe|might)\b/i.test(String(vetoText || ''));
    const useMeeting = !ctx.baseOnly && !hedged && meetingNarrow(intent, vetoText);
    const taskInstead = !ctx.baseOnly && !useMeeting && taskNotMeeting(intent, vetoText);
    let proc = useMeeting
      ? meetingPlan(intent, processFor(intent))
      : taskInstead
        ? Object.assign({ id: 'log-it' }, PROCESS_CATALOG['log-it'])
        : processFor(intent);
    // A calendar step needs a clock the time parser actually resolved.
    // A date with no parsed time is a task. A delete or a move of a named
    // slot is still that calendar write.
    const calendarOp = e.calendarOp;
    const untimedCalendar = proc && Array.isArray(proc.stepKinds) && proc.stepKinds.indexOf('calendar') !== -1
      && !meetingClock(intent)
      && calendarOp !== 'delete' && calendarOp !== 'update'
      && intent.personalClose !== 'calendar-cancel'
      && intent.personalClose !== 'calendar-move';
    // No parsed clock. The order is the CTO's:
    // a first-person send promise is Log commitment, and an untimed
    // statement is quiet; "Please create a task:" is a task ahead of
    // a reply; coordinating a meeting is Schedule meeting, and a
    // request for an answer is the reply; a call reminder is Call.
    const untimedSrc = String(vetoText || '');
    const heMail = /[\u0590-\u05FF]/.test(untimedSrc);
    const ownPromise = /\b(?:i|we)(?:'|’)?ll\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete)\b/i.test(untimedSrc)
      || /\b(?:i|we)\s+will\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete)\b/i.test(untimedSrc)
      || /(?:^|[^\u0590-\u05FF])(?:(?:אני|אנחנו)\s+)?(?:אשלח|נשלח|אעביר|נעביר|אשלם|נשלם|אגיש|נגיש|אכין|נכין|אחזיר|נחזיר)/.test(untimedSrc);
    const createTaskAsk = /\bplease\s+create\s+a\s+task\b/i.test(untimedSrc) || /\badd this to my tasks\b/i.test(untimedSrc);
    // "Per our call" and "following up on our call" name the conversation.
    // The word call there is not a reminder to phone someone.
    const callBody = untimedSrc
      .replace(/\bfollowing up on (?:our|the|that) call\b/ig, ' ')
      .replace(/\bper our call\b/ig, ' ')
      .replace(/\bper our chat\b/ig, ' ');
    // The sender is the one calling. That promise is Log commitment.
    // "I'll join the call" at a clock stays a Meeting. "I will call the
    // bank" stays the call reminder. A subject line "Reminder" must not
    // retitle either of those two sentences as Call.
    const senderCallYou = /\b(?:i|we)(?:'|’)?ll\s+call\s+you\b|\b(?:i|we)\s+will\s+call\s+you\b/i.test(untimedSrc);
    const senderJoinCall = /\b(?:i|we)(?:'|’)?ll\s+join\s+(?:the\s+)?call\b|\b(?:i|we)\s+will\s+join\s+(?:the\s+)?call\b/i.test(untimedSrc);
    // "Per our call, you'll …" is this person's commitment. "Per our chat,
    // you're sending …" and "לפי מה שסגרנו, אתם מעבירים" are that same
    // commitment. The chat or the call already happened.
    const readerWill = /\byou(?:'|’)?ll\b|\byou will\b|\byou(?:'|’)?re\s+sending\b|\byou are sending\b/i.test(untimedSrc)
      || /אתה\s*מעב/.test(untimedSrc)
      || /אתם\s+מעבירים/.test(untimedSrc)
      || /לפי מה שסגרנו,?\s*אתם מעבירים/.test(untimedSrc);
    const readerSaid = /\byou (?:said|committed|mentioned|agreed|promised)\b/i.test(untimedSrc);
    // Call is a reminder to phone someone. "I'll call you" is the sender's
    // own promise, and "you would call the bank" is the reader's commitment.
    // "I'll join the call" names the meeting they are attending.
    const callReminder = !senderCallYou && !senderJoinCall && (
      (/\bcall\b/i.test(callBody) && /\b(?:task|reminder|remember|day after tomorrow)\b/i.test(callBody) && !readerSaid)
      || /^\s*call the day after tomorrow\b/i.test(callBody)
      || (/\b(?:i|we)(?:'|’)?ll\s+call\b|\b(?:i|we)\s+will\s+call\b/i.test(callBody))
    );
    // "Let me know if you have any questions" offers help. It is not an ask.
    // "Let me know by Friday who will" still is.
    const helpOffer = /\blet me know if you (?:have|need|want)\b/i.test(untimedSrc)
      || /\blet me know if (?:i|we) can\b/i.test(untimedSrc);
    const answerAsk = !helpOffer && (/\b(?:let me know|who will|will you be|are you (?:free|available)|confirm the|please confirm)\b/i.test(untimedSrc)
      || /פנוי|מי יגיע/.test(untimedSrc));
    const letsMeet = /\blet'?s\s+meet\b/i.test(untimedSrc) || /(?:בואו|בוא)\s+ניפגש|נתאם\s+פגישה|נקבע\s+פגישה/.test(untimedSrc);
    const coordinate = letsMeet
      || /\blet'?s\s+(?:do|set up|schedule|book)\b/i.test(untimedSrc)
      || /\b(?:can|could|would)\s+(?:you|we)\s+(?:schedule|set up|book)\b/i.test(untimedSrc)
      || /\bbook a time\b/i.test(untimedSrc)
      || /\b(?:schedule|set up)\s+a\b/i.test(untimedSrc)
      || /(?:בואו|בוא)\s+(?:ניפגש|נקבע)|(?:^|[^\u0590-\u05FF])(?:נתאם|נקבע|לתאם|לקבוע)(?![\u0590-\u05FF])|אפשר\s+לתאם/.test(untimedSrc)
      || (/\?/.test(untimedSrc) && !answerAsk && !/\b(?:send|attach|forward|share|pay)\b/i.test(untimedSrc));
    const handoff = Boolean(intent.signals && intent.signals.handoff);
    let replyInstead = false;
    const logIt = Object.assign({ id: 'log-it' }, PROCESS_CATALOG['log-it']);
    // A note the user sent is a task. An attach on that note keeps its
    // title and drops the draft. It is not the inbound file track.
    // "gimme a call October 19 at 9am" and "Shall we hop on a call
    // October 19 at 3pm" are tasks: Call about / שיחה בנושא.
    // The calendar-as-base rule for those two is cancelled.
    // A hold stays a hold. The other dated call stays schedule.
    const callNamesADate = /\bcall\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june|july|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(String(vetoText || ''));
    // A note the user sent to themself is a task, including a dated call
    // and a save that would otherwise write Drive plus a draft.
    if (intent.selfTask) proc = logIt;
    // "I'll call you" is already the task. The untimed block would retitle
    // it Call when the subject says Reminder, and would return null when
    // the day has no clock ("I will call you on Friday.").
    if (!intent.selfTask && !senderCallYou && (untimedCalendar || createTaskAsk || callReminder) && !(intent.inviteFile)) {
      if (ownPromise && !createTaskAsk && !callReminder && !coordinate && !answerAsk && !readerSaid) {
        proc = logIt;
      } else if ((createTaskAsk || callReminder) && !readerSaid) {
        proc = logIt;
        if (callReminder && !intent.selfTask) intent.label = heMail ? 'שיחה' : 'Call';
        else if (/^Reply requested\b/.test(String(intent.label || ''))) {
          const named = untimedSrc.match(/\bplease\s+create\s+a\s+task\s*:\s*([^\n.]+)/i);
          const when = e.when ? String(e.when).replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, '').trim() : '';
          intent.label = named ? named[1].replace(/\s+/g, ' ').trim() : (when ? ('Log commitment for ' + when) : 'Log this decision');
        }
      } else if (coordinate) {
        proc = logIt;
        intent.label = heMail ? 'לתאם פגישה' : 'Schedule meeting';
      } else if ((readerWill || readerSaid) && !intent.selfTask) {
        proc = logIt;
      } else if ((answerAsk || handoff) && !intent.selfTask) {
        proc = Object.assign({ id: 'reply-track' }, PROCESS_CATALOG['reply-track']);
        replyInstead = true;
        const when = e.when ? String(e.when).replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, '').trim() : '';
        intent.label = 'Reply requested' + (when ? ' by ' + when : '');
      } else if (untimedCalendar && !intent.selfTask) {
        return null;
      } else if (untimedCalendar) {
        proc = logIt;
      }
    }
    // A note to self is verb plus object. Log commitment is the promise
    // sent to someone else.
    if (senderCallYou && !intent.inviteFile && !intent.selfTask) {
      proc = logIt;
      const when = e.when ? String(e.when).replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, '').trim() : '';
      intent.label = when ? ('Log commitment for ' + when) : 'Log this decision';
    }
    const taskPlan = taskInstead || senderCallYou || (intent.selfTask && !intent.inviteFile) || (untimedCalendar && !replyInstead);
    // The card and the task title follow the plan that will actually run.
    // A Meeting label on a task-only plan is the copy bug: the date was
    // copied off the event classifier after the calendar step was dropped.
    // A self-sent phone task already named the person. Putting Call back
    // would drop that object. Inbound "add this to my tasks: call …" stays Call.
    if (taskPlan && soloPhoneTask(vetoText) && !readerSaid && !intent.selfTask) {
      intent.label = /[\u0590-\u05FF]/.test(String(vetoText || '')) ? 'שיחה' : 'Call';
    } else if (taskPlan && !intent.selfTask && (/^Meeting\b/.test(String(intent.label || '')) || intent.label === 'פגישה')) {
      // "call October 19" named the month as a person. A dated call with
      // no person keeps the meeting title, and the calendar step stays.
      if (!callNamesADate || intent.selfTask) {
        const when = e.when ? String(e.when).replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, '').trim() : '';
        const dateText = when || null;
        intent.label = (typeof FlowJudgment !== 'undefined' && typeof FlowJudgment.neutralTitle === 'function')
          ? FlowJudgment.neutralTitle({ dateText: dateText })
          : (dateText ? ('Log commitment for ' + dateText) : 'Log this decision');
      }
    }
    const memoryForProcess = ctx.executionMemory ? ctx.executionMemory[proc.id] : null;
    const orderedKinds = applyMemory(proc.stepKinds, proc.anchor, memoryForProcess).slice(0, MAX_ACTIONS);

    let steps = orderedKinds
      .map((kind) => buildStep(kind, intent, e, ctx, hasAttachment))
      .filter(Boolean);
    // "No need to reply" drops the draft. The task stays.
    if (intent.noReplyDraft) steps = steps.filter((s) => s && s.kind !== 'gmailDraft' && s.kind !== 'outlookDraft');
    if (!steps.length) return null; // every non-anchor step demoted AND no anchor in this catalog entry — never happens today, but never silently propose nothing described

    const choices = useMeeting ? dateChoicesOf(intent) : null;
    const needsDateChoice = Boolean(choices && !e.dateIso);
    if (needsDateChoice) {
      steps.forEach((step) => {
        if (step && step.kind === 'calendar' && step.params) {
          step.params.dateIso = null;
          step.params.dateChoices = choices;
        }
      });
    }

    return {
      id: proc.id,
      name: proc.name,
      closingLine: proc.closingLine,
      closedLine: proc.closedLine,
      needsDateChoice: needsDateChoice,
      dateChoices: needsDateChoice ? choices : null,
      steps: steps
    };
  }

  // One guard, right before render, for every card type. A title is a short
  // action, never the sentence the mail said. When the written title equals
  // a sentence of the body, is nearly all of one, or runs past six words,
  // the card falls back to a fixed short action title in the mail's language.
  const TITLE_MAX_WORDS = 6;
  function titleNorm(value) {
    return String(value || '')
      .replace(/[\u00A0\u200B-\u200F\u2060\uFEFF]/g, ' ')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}$₪€%\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function titleWords(value) { return String(value || '').trim().split(/\s+/).filter(Boolean); }
  function bodySentences(text) {
    const out = [];
    String(text || '').split(/\r?\n+|(?<=[.!?])\s+/).forEach((part) => {
      const n = titleNorm(part);
      if (n) out.push(n);
    });
    return out;
  }
  const DECISION_NOTE = /הוחלט|החלטנו|החלטתי|החלטה|(?:^|[^\p{L}])סופי(?![\p{L}])|\bdecision\b|\bdecided\b|\bgoing with\b|\bfinal\b/iu;
  function titleIsBody(title, sentences) {
    const words = titleWords(title).length;
    const norm = titleNorm(title);
    if (!norm) return false;
    // A decision is Decision: Name. A decision statement longer than that
    // is the sentence pasted in.
    if (words > TITLE_MAX_WORDS && DECISION_NOTE.test(title)) return true;
    if (words < 3) return false;
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (s === norm) return true;
      if (words >= 6 && s.indexOf(norm) !== -1 && norm.split(' ').length >= 0.9 * s.split(' ').length) return true;
    }
    return false;
  }
  const FALLBACK_TITLE = {
    decision: ['Log decision', 'לתעד החלטה'],
    commitment: ['Log commitment', 'לתעד התחייבות'],
    task: ['Handle this note', 'לטפל בהערה'],
    reply: ['Reply requested', 'נדרשת תשובה'],
    event: ['Meeting', 'פגישה'],
    file: ['Save the file', 'לשמור את הקובץ'],
    followup: ['Follow up', 'מעקב']
  };
  function fallbackKind(intent, process, title) {
    const pid = process && process.id;
    if (pid === 'file-it' || pid === 'suggest-save') return 'file';
    if (DECISION_NOTE.test(String(title || '')) || intent.type === 'decision') return 'decision';
    if (pid === 'reply-track') return 'reply';
    if (intent.selfTask || pid === 'log-it') return 'task';
    if (intent.type === 'event') return 'event';
    if (intent.type === 'commitment') return 'commitment';
    if (intent.type === 'followup') return 'followup';
    return intent.type === 'request' ? 'reply' : 'task';
  }
  function guardTitles(intent, process, ctx) {
    if (!intent || !process) return process;
    const text = String((ctx && ctx.text) || '');
    if (!text) return process;
    const hold = intent.personalClose === 'calendar-hold' || process.id === 'hold';
    const sentences = bodySentences(text);
    const he = /[\u0590-\u05FF]/.test(text);
    const shortFor = (title) => FALLBACK_TITLE[fallbackKind(intent, process, title)][he ? 1 : 0];
    if (!hold && intent.label && titleIsBody(intent.label, sentences)) intent.label = shortFor(intent.label);
    (process.steps || []).forEach((step) => {
      if (!step || !step.params || !step.params.title) return;
      if (step.kind === 'calendar') return;
      if (titleIsBody(step.params.title, sentences)) step.params.title = shortFor(step.params.title);
    });
    return process;
  }

  function planFor(intent, ctx) {
    const process = planForRaw(intent, ctx);
    return guardTitles(intent, process, ctx);
  }

  // The receipt lines for writes that actually landed. A failed step can
  // still carry a `written` string from a partial attempt — it must not
  // show up, because the receipt is the claim that the thing exists.
  function receiptWrittenLines(results) {
    const lines = [];
    for (const r of results || []) {
      const response = r && r.response;
      if (!response || !response.ok || typeof response.written !== 'string') continue;
      const line = response.written.trim();
      if (!line || lines.indexOf(line) !== -1) continue;
      lines.push(line);
    }
    return lines;
  }

  return { planFor, chooseDate, MAX_ACTIONS, PROCESS_CATALOG, isNetRejected, receiptWrittenLines };
})();

if (typeof module !== 'undefined') module.exports = { FlowActions };
