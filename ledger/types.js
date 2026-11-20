/** @typedef {string} GlanceIntentType */
/** @typedef {'high'|'medium'|'low'|'unknown'} GlanceConfidence */
/**
 * CloudEvents 1.0 envelope for one ledger event.
 * @typedef {object} GlanceLedgerEvent
 * @property {'1.0'} specversion
 * @property {string} id UUIDv7
 * @property {string} source urn:glance:<surface>:<install_uuid>
 * @property {string} type
 * @property {string} time RFC3339 with a numeric offset
 * @property {string} dataschema
 * @property {string} subject intent id
 * @property {number} seq
 * @property {object} data
 */
/** Intent types: send_quote, create_event, create_task, draft_reply, create_document, save_file, other */
