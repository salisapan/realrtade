// Serves or records the living icon demo (design/living-icon/index.html) with the engine next to it, the way the Artifact publishes it.
//   node scripts/living-icon/demo.cjs serve [port]        open http://localhost:8765/
//   node scripts/living-icon/demo.cjs record [out.webm]   a WebM of the stage (Playwright + the pre-installed Chromium), ~26 s, the full story
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PAGE = path.join(ROOT, 'design', 'living-icon', 'index.html');
const ENGINE = path.join(ROOT, 'flow-trial-extension', 'core', 'living-icon.js');

function server(port) {
  return http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/' || u === '/index.html') {
      // The Artifact host wraps the page in this skeleton; do the same so the local page renders in standards mode.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + fs.readFileSync(PAGE, 'utf8') + '</body></html>');
    }
    if (u === '/living-icon.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fs.readFileSync(ENGINE)); }
    res.writeHead(404); res.end();
  }).listen(port);
}

async function record(out) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright'))); }
  const srv = server(0); await new Promise((r) => srv.on('listening', r));
  const port = srv.address().port;
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'living-'));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
  const size = 640;
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, recordVideo: { dir, size: { width: size, height: size } } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:' + port + '/');
  // Only the stage, on white, filling the frame: the video is the creature, not the page.
  await page.addStyleTag({ content: 'header,.controls,section,.notes,.perf,.state{display:none!important} body{padding:0!important;background:#fff!important} main{max-width:none!important;gap:0!important} .stage{max-width:none!important;width:' + size + 'px!important}' });
  await page.evaluate(() => document.getElementById('auto').click() || document.getElementById('auto').click());
  await page.waitForTimeout(26500);
  const video = page.video();
  await ctx.close(); await browser.close(); srv.close();
  fs.copyFileSync(await video.path(), out);
  console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
}

const [mode, arg] = process.argv.slice(2);
if (mode === 'record') record(arg || path.join(process.cwd(), 'living-icon.webm')).catch((e) => { console.error(e); process.exit(1); });
else { const port = Number(arg) || 8765; server(port); console.log('http://localhost:' + port + '/'); }
