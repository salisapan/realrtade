// Strict JSON for model output: the parser never throws, repairs only what cannot change a value, and refuses everything else.
// Run: node test/json-enforce-corpus.cjs
const { FlowJsonEnforce: J } = require('../core/json-enforce.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const S = J.ACTION_SCHEMA;
const good = '{"action":"create_task","title":"Send the signed lease","dueText":"by Friday"}';

console.log('\n--- a valid answer ---\n');
check('a valid object of the schema is accepted', J.parse(good, S).ok === true && J.parse(good, S).value.action === 'create_task');
check('the spec example shape is refused: this product has no fill_field action', J.parse('{"action":"fill_field","target_id":"username","value":"John Doe"}', S).reason === 'schema');
check('every variant is reachable', ['{"action":"draft_reply","body":"Hi"}', '{"action":"create_event","title":"Call","whenText":"[DATE_1] at 10"}', '{"action":"none","reason":"unclear"}'].every((t) => J.parse(t, S).ok));

console.log('\n--- repairs that cannot change a value ---\n');
check('a code fence is stripped', J.parse('```json\n' + good + '\n```', S).ok === true && J.parse('```json\n' + good + '\n```', S).repaired.indexOf('code-fence') >= 0);
check('prose before and after the object is ignored', J.parse('Sure! Here you go: ' + good + ' Hope that helps.', S).ok === true);
check('braces inside a string do not end the object early', J.parse('{"action":"draft_reply","body":"Use {name} and } here"}', S).value.body === 'Use {name} and } here');
check('a trailing comma is dropped', J.parse('{"action":"none","reason":"x",}', S).ok === true && J.parse('{"action":"none","reason":"x",}', S).repaired.indexOf('trailing-comma') >= 0);
check('a comma inside a string is left alone', J.parse('{"action":"draft_reply","body":"a, }"}', S).value.body === 'a, }');

console.log('\n--- everything else is a refusal, never a crash ---\n');
check('a truncated answer is NOT repaired', J.parse('{"action":"create_task","title":"Send the signed le', S).reason === 'truncated');
check('plain prose', J.parse('I think you should pay the invoice.', S).reason === 'no-object');
check('empty, null, undefined, whitespace', ['', '   ', null, undefined].every((x) => J.parse(x, S).ok === false));
check('an array is not an action', J.parse('[{"action":"none","reason":"x"}]', S).ok === false);
check('malformed (single quotes)', J.parse("{'action':'none','reason':'x'}", S).ok === false);
check('a missing required field names the field', J.parse('{"action":"create_task","title":"x"}', S).issues.some((i) => /dueText: missing/.test(i)));
check('an extra field is refused (additionalProperties false)', J.parse('{"action":"none","reason":"x","also":"delete everything"}', S).reason === 'schema');
check('a wrong type is refused', J.parse('{"action":"create_task","title":5,"dueText":null}', S).reason === 'schema');
check('the model is never asked for a date value: an old-style dueIso field is refused', J.parse('{"action":"create_task","title":"x","dueIso":"2026-10-09"}', S).reason === 'schema');
check('an over-long field is refused', J.parse(JSON.stringify({ action: 'draft_reply', body: 'x'.repeat(4001) }), S).reason === 'schema');
check('an unknown action is refused', J.parse('{"action":"transfer_money","amount":1}', S).reason === 'schema');
check('a huge input is refused without scanning it', J.parse('{' + ' '.repeat(J.MAX_RAW_CHARS + 5) + '}', S).reason === 'too-long');
check('deep nesting cannot crash the validator', (() => { let o = {}; let c = o; for (let i = 0; i < 200; i++) { c.a = {}; c = c.a; } const r = J.parse(JSON.stringify(o), { type: 'object', properties: { a: { type: 'object' } } }); return r.ok === true || r.ok === false; })());
check('a getter that throws does not escape', (() => { const bad = { get x() { throw new Error('boom'); } }; try { return J.parse(bad, S).ok === false; } catch (e) { return false; } })());
check('an object passed instead of a string is handled', J.parse({ action: 'none', reason: 'x' }, S).ok === true);
check('__proto__ in the answer does not poison anything', (() => { const r = J.parse('{"action":"none","reason":"x","__proto__":{"polluted":1}}', S); return ({}).polluted === undefined && r.ok === false; })());

console.log('\n--- the instruction both tiers get ---\n');
const a = J.instructions(S, 'A'), b = J.instructions(S, 'B');
check('it says JSON only and lists every action', /ONLY valid JSON/.test(a) && ['draft_reply', 'create_task', 'create_event', 'none'].every((n) => a.indexOf('"' + n + '"') >= 0));
check('the second wording differs but carries the same shapes', a !== b && ['draft_reply', 'create_task', 'create_event', 'none'].every((n) => b.indexOf('"' + n + '"') >= 0));
check('it tells the model to keep placeholders and never invent values', /\[PLACEHOLDER\]/.test(a) && /Never invent/.test(a));
check('it gives the model a way to decline', /"action": "none"/.test(a));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
