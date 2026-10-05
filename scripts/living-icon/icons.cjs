// Writes the static extension icons (icons/icon16.png, icon48.png, icon128.png) from the living icon's rest pose: the same ring,
// computed by core/living-icon.js, so the still icon and the moving one are one body. Run: node scripts/living-icon/icons.cjs
const fs = require('fs');
const path = require('path');
const { FlowLivingIcon: L } = require('../../flow-trial-extension/core/living-icon.js');
const { encode } = require('./png.cjs');
const dir = path.join(__dirname, '..', '..', 'flow-trial-extension', 'icons');
// t = 0 with breath 0: the ring exactly at rest, no sway, so the file is the same every run.
const rest = L.pose('ring', 0, { breath: 0 });
for (const n of [16, 48, 128]) {
  const file = path.join(dir, 'icon' + n + '.png');
  fs.writeFileSync(file, encode(L.render(rest, n), n, n));
  console.log('wrote', path.relative(process.cwd(), file));
}
