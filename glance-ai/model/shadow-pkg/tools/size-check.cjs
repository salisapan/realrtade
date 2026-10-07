'use strict';
// Total shipped size of the drop-in package (src/*.js + weights/*.glw + weights/manifest.json) vs the 871 KB on-device budget
// (shadow-logging-spec-v2.md §4). Budget read as 871,000 bytes (the stricter reading of "KB"). Writes test/out/size.json; exit 1 if over.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const D = path.join(__dirname, '..'), BUDGET = 871000;
const files = [].concat(fs.readdirSync(path.join(D, 'src')).filter((f) => f.endsWith('.js')).map((f) => 'src/' + f),
  fs.readdirSync(path.join(D, 'weights')).filter((f) => f.endsWith('.glw') || f === 'manifest.json').map((f) => 'weights/' + f));
const list = files.map((f) => { const b = fs.readFileSync(path.join(D, f)); return { file: f, bytes: b.length, gzip: zlib.gzipSync(b, { level: 9 }).length }; });
const total = list.reduce((a, x) => a + x.bytes, 0), gz = list.reduce((a, x) => a + x.gzip, 0);
const code = list.filter((x) => x.file.startsWith('src/')).reduce((a, x) => a + x.bytes, 0);
const out = { budgetBytes: BUDGET, totalBytes: total, totalGzipBytes: gz, codeBytes: code, weightsBytes: total - code, headroomBytes: BUDGET - total, pass: total <= BUDGET,
  contentScriptBytes: list.filter((x) => /gs-(text|features|prepare|hook)\.js$/.test(x.file)).reduce((a, x) => a + x.bytes, 0), files: list };
fs.mkdirSync(path.join(D, 'test', 'out'), { recursive: true });
fs.writeFileSync(path.join(D, 'test', 'out', 'size.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(Object.assign({}, out, { files: undefined })));
process.exit(out.pass ? 0 : 1);
