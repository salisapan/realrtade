'use strict';
// Power analysis for the scoreboard comparisons (plan 2, P1 and experiment table). Two-sided alpha = 0.05, power = 0.80, two independent proportions
// (a conservative bound: the scoreboard compares models on the SAME rows, and a paired test needs fewer rows when the models mostly agree).
//   node scoreboard/power.cjs
const Z = { a: 1.959964, b: 0.841621 };
const need = (p1, p2) => { const pb = (p1 + p2) / 2; return Math.ceil(((Z.a * Math.sqrt(2 * pb * (1 - pb)) + Z.b * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2) / ((p1 - p2) ** 2)); };
const mde = (p, n) => { for (let d = 0.005; d < 0.5; d += 0.0025) if (need(p, Math.max(0.0001, p - d)) <= n) return d; return null; };
console.log('Rows needed per arm to detect a drop from a base rate (alpha 0.05, power 0.8):\n');
console.log('| metric | base rate | drop to | rows per arm |\n|---|---|---|---|');
for (const [m, p, qs] of [['wrong Do It (of silent rows)', 0.064, [0.054, 0.044, 0.034, 0.02]], ['missed (of act rows)', 0.45, [0.40, 0.35, 0.30, 0.20]], ['wrong action (of offers)', 0.10, [0.08, 0.06, 0.05]]]) for (const q of qs) console.log(`| ${m} | ${(100 * p).toFixed(1)}% | ${(100 * q).toFixed(1)}% | ${need(p, q)} |`);
console.log('\nSmallest drop detectable with the rows we have (per arm, independent bound):\n');
console.log('| set | silent rows | act rows | wrong Do It: smallest drop | missed: smallest drop |\n|---|---|---|---|---|');
for (const [s, ns, na] of [['frozen agreement, all batches', 299, 266], ['hold-out batches 007 + 008', 81, 90], ['one batch of 100', 45, 45], ['a sealed batch of 100', 45, 45]]) {
  const a = mde(0.064, ns), b = mde(0.45, na);
  console.log(`| ${s} | ${ns} | ${na} | ${a == null ? 'none below 50 points' : (100 * a).toFixed(1) + ' points'} | ${b == null ? 'none below 50 points' : (100 * b).toFixed(1) + ' points'} |`);
}
console.log('\nReading: the full frozen set resolves a missed-rate difference of about 12 points and a wrong-Do-It difference of about 5 points (independent bound; a paired comparison on the same rows does better when the models mostly agree, which they do); one 100-row batch resolves neither. To settle a 2-point wrong-Do-It claim (6.4% to 4.4%) about 2,000 silent rows per arm are needed, so such claims wait for the own-use data and more sealed batches; claims of 10 points or more on misses are already resolvable.');
