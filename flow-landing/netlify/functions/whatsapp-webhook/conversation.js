// Inquiry state machine. Pure: (state, inbound, now, hours) -> next state,
// outbound session messages, and an optional handoff. No I/O here.
const { t, SECTORS, BOOKING_URL } = require('./copy');
const { isHandoffHours } = require('./hours');
const {
  detectLanguage,
  mentionsFischer,
  isPriceQuestion,
  isPersonRequest,
  isSensitivePaste,
  looksLikeEmail,
  extractEmail,
  extractName,
  matchSector,
  isYes,
  isNo,
} = require('./detect');

const STEPS = {
  START: 'start',
  SECTOR: 'sector',
  PROCESS: 'process',
  TEAM_SIZE: 'team_size',
  SENSITIVITY: 'sensitivity',
  DEMO: 'demo',
  CONTACT: 'contact',
  HANDED_OFF: 'handed_off',
};

const TRANSCRIPT_CAP = 40;

function emptyState(phone, lang, profileName) {
  return {
    phone,
    lang: lang || 'he',
    step: STEPS.START,
    sector: null,
    process: null,
    teamSize: null,
    sensitivity: null,
    name: profileName || null,
    email: null,
    asked: [],
    transcript: [],
    lastInboundAt: null,
    restricted: null,
    handoffReason: null,
  };
}

function noteAsked(state, tag) {
  if (!state.asked.includes(tag)) state.asked.push(tag);
}

function appendTranscript(state, dir, text, at) {
  const line = String(text || '').trim();
  if (!line) return;
  state.transcript.push({ dir, text: line.slice(0, 500), at });
  if (state.transcript.length > TRANSCRIPT_CAP) {
    state.transcript = state.transcript.slice(-TRANSCRIPT_CAP);
  }
}

function textMessage(body) {
  return { type: 'text', text: { body, preview_url: /https:\/\//.test(body) } };
}

function sectorListMessage(lang) {
  const c = t(lang);
  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: c.opening },
      action: {
        button: c.sectorListButton,
        sections: [
          {
            title: c.sectorListSection,
            rows: SECTORS.map((s) => ({
              id: s.id,
              title: lang === 'en' ? s.en : s.he,
            })),
          },
        ],
      },
    },
  };
}

function buttonMessage(body, lang, yesId, noId) {
  const c = t(lang);
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: [
          { type: 'reply', reply: { id: yesId, title: c.yes } },
          { type: 'reply', reply: { id: noId, title: c.no } },
        ],
      },
    },
  };
}

function closeMessage(lang) {
  return buttonMessage(t(lang).close, lang, 'demo_yes', 'demo_no');
}

function afterSensitivity(state) {
  const c = t(state.lang);
  state.step = STEPS.DEMO;
  return [textMessage(c.dataLocation), closeMessage(state.lang)];
}

function handoffMessages(state, now, hoursFn) {
  const c = t(state.lang);
  const inHours = (hoursFn || isHandoffHours)(now);
  // Outside the human window the scripted out-of-hours line replaces "בהקדם".
  return [textMessage(inHours ? c.handoff : c.outOfHours)];
}

function markHandedOff(state, reason, restricted) {
  state.step = STEPS.HANDED_OFF;
  state.handoffReason = reason;
  if (restricted) state.restricted = restricted;
}

function currentPrompt(state) {
  const c = t(state.lang);
  if (state.step === STEPS.SECTOR) return [sectorListMessage(state.lang)];
  if (state.step === STEPS.PROCESS) return [textMessage(c.qProcess)];
  if (state.step === STEPS.TEAM_SIZE) return [textMessage(c.qTeamSize)];
  if (state.step === STEPS.SENSITIVITY) return [textMessage(c.qSensitivity)];
  if (state.step === STEPS.DEMO) return [closeMessage(state.lang)];
  if (state.step === STEPS.CONTACT) return [textMessage(c.noPath)];
  return [];
}

function advanceFromSector(state, sectorId) {
  state.sector = sectorId;
  state.step = STEPS.PROCESS;
  return [textMessage(t(state.lang).qProcess)];
}

function acceptProcess(state, text) {
  state.process = String(text || '').trim().slice(0, 300);
  state.step = STEPS.TEAM_SIZE;
  return [textMessage(t(state.lang).qTeamSize)];
}

function acceptTeamSize(state, text) {
  state.teamSize = String(text || '').trim().slice(0, 80);
  state.step = STEPS.SENSITIVITY;
  return [textMessage(t(state.lang).qSensitivity)];
}

function acceptSensitivity(state, text) {
  state.sensitivity = String(text || '').trim().slice(0, 300);
  return afterSensitivity(state);
}

function acceptDemoYes(state, now, hoursFn) {
  const c = t(state.lang);
  markHandedOff(state, 'qualified_demo');
  return [textMessage(c.booking), ...handoffMessages(state, now, hoursFn)];
}

function acceptDemoNo(state) {
  state.step = STEPS.CONTACT;
  return [textMessage(t(state.lang).noPath)];
}

function acceptContact(state, text, now, hoursFn) {
  const c = t(state.lang);
  const email = extractEmail(text);
  const name = extractName(text);
  if (email) state.email = email;
  if (name) state.name = name;
  if (!email && !name) return [textMessage(c.noPath)];
  markHandedOff(state, 'no_path_contact');
  return [textMessage(c.thanksContact), ...handoffMessages(state, now, hoursFn)];
}

function inboundText(inbound) {
  return (
    inbound.text ||
    inbound.buttonTitle ||
    inbound.listTitle ||
    ''
  );
}

function inboundChoiceId(inbound) {
  return inbound.buttonId || inbound.listId || null;
}

function isUsableText(inbound) {
  return Boolean(String(inboundText(inbound) || inboundChoiceId(inbound) || '').trim());
}

function step(state, inbound, now, hoursFn) {
  const messages = [];
  const phone = inbound.from;
  const rawText = inboundText(inbound);
  const choiceId = inboundChoiceId(inbound);
  const inspect = [rawText, choiceId].filter(Boolean).join(' ');

  let current = state ? JSON.parse(JSON.stringify(state)) : emptyState(phone, 'he', inbound.profileName);
  if (!current.phone) current.phone = phone;
  if (inbound.profileName && !current.name) current.name = inbound.profileName;
  current.lastInboundAt = inbound.timestamp || now;

  const previousLang = current.lang || 'he';
  // Button/list titles are localised by us; they should not flip the language.
  if (inbound.type === 'text') {
    current.lang = detectLanguage(rawText, previousLang);
  }

  const safeTranscript = isSensitivePaste(rawText) ? '[redacted sensitive paste]' : rawText;
  appendTranscript(current, 'in', safeTranscript || (choiceId || ''), current.lastInboundAt);

  let handoff = null;

  function emitHandoff(reason, restricted) {
    markHandedOff(current, reason, restricted || null);
    handoff = { reason, restricted: restricted || null };
    messages.push(...handoffMessages(current, now, hoursFn));
  }

  // Restricted firm: no engagement, straight human handoff, flagged.
  if (mentionsFischer(inspect)) {
    emitHandoff('restricted_fischer', 'FISCHER');
    return done();
  }

  if (current.step === STEPS.HANDED_OFF) {
    // Already with a person. Do not restart the script.
    return { state: current, messages: [], handoff: null };
  }

  if (isSensitivePaste(rawText)) {
    messages.push(textMessage(t(current.lang).sensitive));
    if (current.step === STEPS.START) {
      current.step = STEPS.SECTOR;
      messages.push(sectorListMessage(current.lang));
    }
    return done();
  }

  if (isPriceQuestion(rawText)) {
    noteAsked(current, 'price');
    messages.push(textMessage(t(current.lang).price));
    if (current.step === STEPS.START) {
      current.step = STEPS.SECTOR;
      messages.push(sectorListMessage(current.lang));
      return done();
    }
    // Stay on the current question so a price aside does not stall the flow.
    messages.push(...currentPrompt(current));
    return done();
  }

  if (isPersonRequest(rawText)) {
    noteAsked(current, 'person');
    emitHandoff('asked_for_person');
    return done();
  }

  if (current.step === STEPS.START) {
    const sectorId = matchSector(rawText, choiceId);
    current.step = STEPS.SECTOR;
    if (sectorId) {
      messages.push(...advanceFromSector(current, sectorId));
    } else {
      messages.push(sectorListMessage(current.lang));
    }
    return done();
  }

  if (current.step === STEPS.SECTOR) {
    const sectorId = matchSector(rawText, choiceId);
    if (sectorId) {
      messages.push(...advanceFromSector(current, sectorId));
    } else if (!isUsableText(inbound)) {
      messages.push(textMessage(t(current.lang).nudge));
      messages.push(sectorListMessage(current.lang));
    } else {
      // Free-text that is not a known sector still counts as "other" only when
      // they picked Other; otherwise re-prompt with the list (max 3 buttons
      // cannot hold four sectors, so this stays a list message).
      messages.push(sectorListMessage(current.lang));
    }
    return done();
  }

  if (current.step === STEPS.PROCESS) {
    if (!String(rawText || '').trim() && !choiceId) {
      messages.push(textMessage(t(current.lang).nudge));
      messages.push(...currentPrompt(current));
      return done();
    }
    messages.push(...acceptProcess(current, rawText || (choiceId || '')));
    return done();
  }

  if (current.step === STEPS.TEAM_SIZE) {
    if (!String(rawText || '').trim()) {
      messages.push(textMessage(t(current.lang).nudge));
      messages.push(...currentPrompt(current));
      return done();
    }
    messages.push(...acceptTeamSize(current, rawText));
    return done();
  }

  if (current.step === STEPS.SENSITIVITY) {
    if (!String(rawText || '').trim()) {
      messages.push(textMessage(t(current.lang).nudge));
      messages.push(...currentPrompt(current));
      return done();
    }
    messages.push(...acceptSensitivity(current, rawText));
    return done();
  }

  if (current.step === STEPS.DEMO) {
    if (isYes(rawText, choiceId)) {
      messages.push(...acceptDemoYes(current, now, hoursFn));
      handoff = { reason: current.handoffReason, restricted: null };
      return done();
    }
    if (isNo(rawText, choiceId)) {
      messages.push(...acceptDemoNo(current));
      return done();
    }
    messages.push(closeMessage(current.lang));
    return done();
  }

  if (current.step === STEPS.CONTACT) {
    if (!String(rawText || '').trim()) {
      messages.push(textMessage(t(current.lang).nudge));
      messages.push(...currentPrompt(current));
      return done();
    }
    messages.push(...acceptContact(current, rawText, now, hoursFn));
    if (current.step === STEPS.HANDED_OFF) {
      handoff = { reason: current.handoffReason, restricted: null };
    }
    return done();
  }

  return done();

  function done() {
    for (const msg of messages) {
      const line =
        (msg.type === 'text' && msg.text && msg.text.body) ||
        (msg.interactive && msg.interactive.body && msg.interactive.body.text) ||
        '';
      appendTranscript(current, 'out', line, now);
    }
    return { state: current, messages, handoff };
  }
}

module.exports = {
  STEPS,
  BOOKING_URL,
  emptyState,
  step,
  sectorListMessage,
  textMessage,
};
