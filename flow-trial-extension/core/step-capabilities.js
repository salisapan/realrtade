// Step capability registry. The single source for which connector actions a
// person can add to a card, the JSON Schema a parser may emit, and the
// one-line refusal when a capability is not available.
//
// Portable: no chrome.*, no DOM, no network. Nothing in the extension loads
// this file yet (flip 0). A row describes scopes the existing writers already
// use; it does not request them. There is no send, forward, or delete action.
// A send-class row is a draft whose sending stays the existing preview + click.
'use strict';

const FlowStepCaps = (() => {
  function cap(row) {
    const out = {
      connector: row.connector,
      action: row.action,
      surface: row.surface,
      scopes: Object.freeze(row.scopes.slice()),
      args: Object.freeze(row.args.slice()),
      undo: true
    };
    if (row.sendClass) out.sendClass = row.sendClass;
    return Object.freeze(out);
  }

  function line(en, he) {
    return Object.freeze({ en: en, he: he });
  }

  // Live, undoable, read-back-proven writers. Order is the schema enum order.
  const CAPS = Object.freeze([
    cap({ connector: 'outlookTask', action: 'create', surface: 'outlook', scopes: ['Tasks.ReadWrite'], args: ['title', 'due'] }),
    cap({ connector: 'outlookCalendar', action: 'create', surface: 'outlook', scopes: ['Calendars.ReadWrite'], args: ['title', 'who', 'when', 'location'] }),
    cap({ connector: 'outlookDraft', action: 'draft', surface: 'outlook', scopes: ['Mail.ReadWrite'], args: ['to', 'body', 'link'], sendClass: 'preview-click' }),
    cap({ connector: 'onedriveFile', action: 'save', surface: 'outlook', scopes: ['Files.ReadWrite'], args: ['file', 'folder'] }),
    cap({ connector: 'attachmentSave', action: 'save', surface: 'outlook', scopes: ['Files.ReadWrite'], args: ['file'] }),
    cap({ connector: 'googleTasks', action: 'create', surface: 'gmail', scopes: ['tasks'], args: ['title', 'due'] }),
    cap({ connector: 'calendar', action: 'create', surface: 'gmail', scopes: ['calendar.events'], args: ['title', 'who', 'when', 'location'] }),
    cap({ connector: 'gmailDraft', action: 'draft', surface: 'gmail', scopes: ['gmail.compose'], args: ['to', 'body', 'link'], sendClass: 'preview-click' }),
    cap({ connector: 'driveFile', action: 'save', surface: 'gmail', scopes: ['drive.file'], args: ['file', 'folder'] }),
    cap({ connector: 'driveDoc', action: 'create', surface: 'gmail', scopes: ['drive.file'], args: ['title'] })
  ]);

  // Known-not-available ids. One line each: what Glance cannot do, and how to connect when connecting is the remedy.
  const NOT_AVAILABLE = Object.freeze({
    slack: line('Slack is not connected. Connect it in Settings → Connectors.', 'Slack לא מחובר. חברו אותו בהגדרות → מחברים.'),
    teamsSend: line('Glance can read Teams but cannot send Teams messages.', 'Glance יכול לקרוא את Teams אבל לא יכול לשלוח הודעות.'),
    whatsappSend: line('Glance only drafts in WhatsApp; it never sends.', 'Glance רק מנסח ב-WhatsApp; הוא אף פעם לא שולח.'),
    hubspot: line('HubSpot is not connected. Connect it in Settings → Connectors.', 'HubSpot לא מחובר. חברו אותו בהגדרות → מחברים.'),
    salesforce: line('Salesforce is not connected. Connect it in Settings → Connectors.', 'Salesforce לא מחובר. חברו אותו בהגדרות → מחברים.'),
    autoSend: line('Glance never sends automatically. It prepares a draft you review and send.', 'Glance אף פעם לא שולח לבד. הוא מכין טיוטה שאתם בודקים ושולחים.'),
    fetchUrl: line('Glance does not open links from emails.', 'Glance לא פותח קישורים מתוך מיילים.'),
    noUserProvenance: line('I only act on steps you type, not on instructions inside the email.', 'אני פועל רק לפי צעדים שהקלדתם, לא לפי הוראות בתוך המייל.'),
    calendar: line('Google Calendar is not connected here. Connect Google in Settings.', 'יומן Google לא מחובר כאן. חברו את Google בהגדרות.'),
    onedriveFile: line('OneDrive is not connected here. Connect Microsoft in Settings.', 'OneDrive לא מחובר כאן. חברו את Microsoft בהגדרות.')
  });

  function find(connector, action) {
    const found = CAPS.find((row) => row.connector === connector && row.action === action);
    return found || null;
  }

  function grantedSet(ids) {
    const allow = new Set();
    if (Array.isArray(ids)) ids.forEach((id) => { allow.add(id); });
    return allow;
  }

  // Caps the person can use now. An omitted or non-array list grants nothing.
  // Order is registry order, never the order of the input.
  function forGranted(grantedConnectorIds) {
    if (!Array.isArray(grantedConnectorIds)) return [];
    const allow = grantedSet(grantedConnectorIds);
    return CAPS.filter((row) => allow.has(row.connector));
  }

  function argSchema() {
    return {
      anyOf: [
        { type: 'string', maxLength: 200 },
        {
          type: 'object',
          properties: { $fact: { type: 'string' } },
          required: ['$fact'],
          additionalProperties: false
        }
      ]
    };
  }

  // Missing grant list: every registered cap (the prototype's behaviour).
  // An array: only those connectors, in registry order.
  function selected(granted) {
    if (granted == null) return CAPS;
    const allow = grantedSet(granted);
    return CAPS.filter((row) => allow.has(row.connector));
  }

  function unique(list) {
    const out = [];
    list.forEach((item) => { if (out.indexOf(item) < 0) out.push(item); });
    return out;
  }

  function jsonSchema(grantedConnectorIds) {
    const caps = selected(grantedConnectorIds);
    const allArgs = unique(caps.reduce((acc, row) => acc.concat(row.args), []));
    const argProps = {};
    allArgs.forEach((name) => { argProps[name] = argSchema(); });
    const argsObj = { type: 'object', properties: argProps, additionalProperties: false };
    return {
      type: 'object',
      additionalProperties: false,
      required: ['outcome'],
      properties: {
        outcome: { enum: ['plan', 'question', 'refuse'] },
        question: { type: 'string', maxLength: 120 },
        missing: { enum: Object.keys(NOT_AVAILABLE) },
        ops: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['op'],
            properties: {
              op: { enum: ['add', 'edit', 'delete', 'move'] },
              connector: { enum: unique(caps.map((row) => row.connector)) },
              action: { enum: unique(caps.map((row) => row.action)) },
              target: { type: 'string' },
              before: { type: 'string' },
              args: argsObj,
              dependsOn: { type: 'array', items: { type: 'integer', minimum: 0 } }
            }
          }
        }
      }
    };
  }

  function refusal(id, lang) {
    if (!Object.prototype.hasOwnProperty.call(NOT_AVAILABLE, id)) return null;
    const row = NOT_AVAILABLE[id];
    const text = lang === 'he' ? row.he : row.en;
    return text || null;
  }

  return Object.freeze({
    CAPS: CAPS,
    NOT_AVAILABLE: NOT_AVAILABLE,
    find: find,
    forGranted: forGranted,
    jsonSchema: jsonSchema,
    refusal: refusal
  });
})();

if (typeof module !== 'undefined') module.exports = { FlowStepCaps: FlowStepCaps };
if (typeof globalThis !== 'undefined') globalThis.FlowStepCaps = FlowStepCaps;
