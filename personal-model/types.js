/** @typedef {'people'|'habits'|'style'|'work'|'places'|'identity'} GlancePersonalCategory */
/** @typedef {'observed'|'inferred'|'user_stated'} GlancePersonalSource */
/**
 * One bi-temporal personal-model fact. Updates insert a new id.
 * @typedef {object} GlancePersonalFact
 * @property {string} id
 * @property {string} subject_id
 * @property {string} predicate
 * @property {string} object
 * @property {GlancePersonalSource} source
 * @property {number} confidence
 * @property {string} valid_from
 * @property {string} [valid_to]
 * @property {string} learned_at
 * @property {string} [retired_at]
 * @property {GlancePersonalCategory} consent_category
 * @property {string} schema_ver
 */
/** Predicates: person.tie_strength, person.reply_latency_to, person.reply_latency_from, person.channel, person.language, person.relation, identity.name, identity.role, identity.org, work.org, work.works_on, work.client_of, work.commitment, habit.meeting_hour, habit.duration, habit.tool, habit.working_hours, place.city, style.greeting, style.signoff, style.length, style.formality, style.emoji, style.mixing, style.edit_distance, style.vector */
