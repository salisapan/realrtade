'use strict';
// Which kinds the NEXT wave would add: the held-out kind rows (v0 + v1) the product offers with every Labs switch on and does not offer with the first wave only (core/labs-seed.js).
// Lab only. usage: node scoreboard/capabilities/wave-diff.cjs
const { spawnSync } = require('child_process');
const run = (mode, flag) => JSON.parse(spawnSync(process.execPath, [__dirname + '/kind-frozen-run.cjs', '--json'].concat(flag ? [flag] : []), { encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { GLANCE_SHIPPED: mode }) }).stdout);
const gain = {}, lose = [];
for (const flag of ['', '--v1']) {
  const a = run('wave1', flag), b = run('', flag);
  a.detail.forEach((d, i) => { const e = b.detail[i]; if (d[3] === 'none') return; if (!d[7] && e[7]) gain[d[0]] = (gain[d[0]] || 0) + 1; if (d[7] && !e[7]) lose.push(d.slice(0, 5).join('|')); });
}
console.log('rows gained by switching every other Labs row on, by kind (row = text x surface):'); for (const [k, v] of Object.entries(gain).sort((x, y) => y[1] - x[1])) console.log(' ', k.padEnd(14), v);
console.log('rows lost:', lose.length);
