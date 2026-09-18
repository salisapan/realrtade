// docreader.js corpus — the hand-rolled ZIP reader + WordprocessingML text
// extractor behind Feature 3 (the attachment hover card).
//
// This file had zero test coverage before this corpus, and the gap mattered:
// docreader.js's own header comment says real Word/Google Docs/LibreOffice
// files always DEFLATE-compress their parts, but docwriter.js — the only
// other thing in this codebase that produces a .docx — always writes STORED
// (uncompressed) entries. So every .docx this codebase had ever generated or
// consumed before this corpus took the STORED branch; the DEFLATE branch,
// which is the ONLY branch a real attachment ever takes, had never once run
// against anything but hand-inspection. Fixtures here are built with Node's
// zlib (genuine raw deflate, decoded back with the same DecompressionStream
// the real code uses) specifically to exercise that untested path, plus a
// few structural wrinkles real Office tooling actually produces that a
// self-authored writer would never think to generate — a local file header's
// extra field genuinely differing in length from the central directory's
// extra field for the same entry, tab/break elements as run siblings (never
// nested in a <w:t>, which is how Word actually writes them), and runs split
// across multiple <w:t> elements the way Word's own spell-check revision
// markers do it.
//
// Run: node test/docreader-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const sandbox = { module: undefined, console, Blob, Response, DecompressionStream, TextDecoder, ArrayBuffer };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'docreader.js'), 'utf8'), sandbox, { filename: 'docreader.js' });
const FlowDocReader = vm.runInContext('FlowDocReader', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// ---- a small ZIP builder, independent of docwriter.js, so this corpus
// tests docreader.js against ZIPs shaped like what OTHER tools produce, not
// against docreader's own sibling writer (which would just prove the two
// agree with each other, not that either is right). ----

function u16(v) { return Buffer.from([v & 0xFF, (v >>> 8) & 0xFF]); }
function u32(v) { return Buffer.from([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]); }
function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
}
const CT = crcTable();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CT[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

// files: [{ name, data: Buffer, method: 0|8, localExtra?, centralExtra? }]
function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const method = f.method || 0;
    const compData = method === 8 ? zlib.deflateRawSync(f.data) : f.data;
    const crc = crc32(f.data);
    const localExtra = f.localExtra || Buffer.alloc(0);
    const centralExtra = f.centralExtra || Buffer.alloc(0);

    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(method),
      u16(0), u16(0), u32(crc), u32(compData.length), u32(f.data.length),
      u16(nameBuf.length), u16(localExtra.length),
      nameBuf, localExtra, compData
    ]);
    chunks.push(local);
    central.push({ nameBuf, crc, compSize: compData.length, uncompSize: f.data.length, offset, centralExtra, method });
    offset += local.length;
  }
  const cdStart = offset;
  for (const e of central) {
    const header = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(e.method),
      u16(0), u16(0), u32(e.crc), u32(e.compSize), u32(e.uncompSize),
      u16(e.nameBuf.length), u16(e.centralExtra.length), u16(0),
      u16(0), u16(0), u32(0), u32(e.offset),
      e.nameBuf, e.centralExtra
    ]);
    chunks.push(header);
    offset += header.length;
  }
  const cdSize = offset - cdStart;
  chunks.push(Buffer.concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(cdSize), u32(cdStart), u16(0)
  ]));
  return Buffer.concat(chunks);
}

function docxWith(bodyXml, opts) {
  opts = opts || {};
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
  const files = [
    { name: '[Content_Types].xml', data: Buffer.from('<Types/>', 'utf8'), method: opts.method },
    { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8'), method: opts.method,
      localExtra: opts.localExtra, centralExtra: opts.centralExtra },
  ];
  return new Uint8Array(buildZip(files));
}

async function run() {
  console.log('\n--- docreader.js: the DEFLATE path (the one real attachments actually take) ---\n');
  {
    const body = '<w:p><w:r><w:t xml:space="preserve">Amount</w:t></w:r><w:r><w:t xml:space="preserve">: $3,900</w:t></w:r></w:p>';
    const bytes = docxWith(body, { method: 8 });
    const text = await FlowDocReader.extractDocxText(bytes);
    check('a genuinely deflate-compressed run round-trips intact', text === 'Amount: $3,900', text);
  }

  console.log('\n--- docreader.js: local vs central extra-field length can legitimately differ ---\n');
  {
    // Real Office tooling routinely writes a different (often larger) extra
    // field in the local header than in the central directory for the same
    // entry (extended-timestamp / Info-ZIP UT extras are the common case).
    // dataStart must be computed from the LOCAL header's own extra length,
    // never the central directory's.
    const body = '<w:p><w:r><w:t xml:space="preserve">still readable</w:t></w:r></w:p>';
    const bytes = docxWith(body, {
      method: 8,
      localExtra: Buffer.from([0x55, 0x54, 0x05, 0x00, 0x03, 0x01, 0x02, 0x03, 0x04]), // 9 bytes
      centralExtra: Buffer.from([0x55, 0x54, 0x05, 0x00, 0x03]) // 5 bytes
    });
    const text = await FlowDocReader.extractDocxText(bytes);
    check('a local extra field longer than the central one still reads correctly', text === 'still readable', text);
  }

  console.log('\n--- docreader.js: <w:br/> becomes a real line break ---\n');
  {
    const body = '<w:p><w:r><w:t xml:space="preserve">Line one</w:t></w:r><w:r><w:br/><w:t xml:space="preserve">Line two after a break</w:t></w:r></w:p>';
    const bytes = docxWith(body, { method: 8 });
    const text = await FlowDocReader.extractDocxText(bytes);
    check('the two sides of a manual line break land on separate lines',
      text === 'Line one\nLine two after a break', text);
  }

  console.log('\n--- docreader.js: <w:tab/> becomes a real tab, inline ---\n');
  {
    const body = '<w:p><w:r><w:t xml:space="preserve">Col1</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">Col2</w:t></w:r></w:p>';
    const bytes = docxWith(body, { method: 8 });
    const text = await FlowDocReader.extractDocxText(bytes);
    check('a tab between two runs is preserved, not dropped, and does not split the line',
      text === 'Col1\tCol2', text);
  }

  console.log('\n--- docreader.js: <w:tab/> does not get eaten by the <w:t> pattern ---\n');
  {
    // <w:t[^>]*> is loose enough to also match "<w:tab/>" itself -- "tab/"
    // satisfies [^>]* as if it were attribute content on a same-prefixed
    // <w:t> tag. Multiple tabs and breaks in sequence, and a tab immediately
    // followed by another element, are exactly where that would show up.
    const body = '<w:p><w:r><w:t xml:space="preserve">A</w:t></w:r><w:r><w:tab/></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">B</w:t></w:r><w:r><w:br/></w:r><w:r><w:t xml:space="preserve">C</w:t></w:r></w:p>';
    const bytes = docxWith(body, { method: 8 });
    const text = await FlowDocReader.extractDocxText(bytes);
    check('consecutive tabs/breaks, and a bare break with no following text, all land correctly',
      text === 'A\t\tB\nC', text);
    check('no raw "<w:t" markup leaked into the extracted text', !text.includes('<w:t'), text);
  }

  console.log('\n--- docreader.js: a run split across multiple <w:t> elements ---\n');
  {
    // Word splits one logical word into several runs when a spell-check (or
    // revision) marker sits in the middle of it -- "Meridian" as two runs
    // must still read as one word, with nothing inserted between them.
    const body = '<w:p><w:r><w:t xml:space="preserve">Meri</w:t></w:r><w:r><w:t xml:space="preserve">dian Tower</w:t></w:r></w:p>';
    const bytes = docxWith(body, { method: 8 });
    const text = await FlowDocReader.extractDocxText(bytes);
    check('a word split across runs concatenates with no inserted space', text === 'Meridian Tower', text);
  }

  console.log('\n--- docreader.js: multiple paragraphs, tabs, breaks, and Hebrew together ---\n');
  {
    const body =
      '<w:p><w:r><w:t xml:space="preserve">Amount</w:t></w:r><w:r><w:t xml:space="preserve">: </w:t></w:r><w:r><w:t xml:space="preserve">$3,900</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">Line one</w:t></w:r><w:r><w:br/><w:t xml:space="preserve">Line two after a break</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">Col1</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">Col2</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">שלום עולם</w:t></w:r></w:p>';
    const bytes = docxWith(body, { method: 8 });
    const text = await FlowDocReader.extractDocxText(bytes);
    check('the full realistic document extracts exactly as expected',
      text === 'Amount: $3,900\nLine one\nLine two after a break\nCol1\tCol2\nשלום עולם', text);
  }

  console.log('\n--- docreader.js: XML entities decode without a double-decode ---\n');
  {
    // The literal text the user actually typed was "&lt;" and "AT&T" -- an
    // XML encoder escapes the user's own "&" as "&amp;", giving "&amp;lt;"
    // and "AT&amp;T" on the wire. Decoding lt/gt/quot/apos before amp (the
    // order this file uses) must not re-interpret the "&amp;"-produced "&"
    // as the start of a second entity.
    const body = '<w:p><w:r><w:t xml:space="preserve">Literal entity text: &amp;lt; and an ampersand: AT&amp;T</w:t></w:r></w:p>';
    const bytes = docxWith(body, { method: 8 });
    const text = await FlowDocReader.extractDocxText(bytes);
    check('entities decode to exactly what the user typed, not further',
      text === 'Literal entity text: &lt; and an ampersand: AT&T', text);
  }

  console.log('\n--- docreader.js: the STORED path (method 0) still works ---\n');
  {
    const body = '<w:p><w:r><w:t xml:space="preserve">stored, not compressed</w:t></w:r></w:p>';
    const bytes = docxWith(body, { method: 0 });
    const text = await FlowDocReader.extractDocxText(bytes);
    check('an uncompressed entry reads correctly too', text === 'stored, not compressed', text);
  }

  console.log('\n--- docreader.js: malformed input fails loudly, not silently ---\n');
  {
    let threw = null;
    try { await FlowDocReader.extractDocxText(new Uint8Array([1, 2, 3, 4])); }
    catch (e) { threw = e.message; }
    check('garbage bytes throw a clear error rather than returning empty/garbage text',
      threw !== null && /end-of-central-directory/i.test(threw), threw);
  }

  console.log('\n--- docreader.js: a ZIP with no word/document.xml fails loudly ---\n');
  {
    const files = [{ name: '[Content_Types].xml', data: Buffer.from('<Types/>', 'utf8'), method: 0 }];
    const bytes = new Uint8Array(buildZip(files));
    let threw = null;
    try { await FlowDocReader.extractDocxText(bytes); }
    catch (e) { threw = e.message; }
    check('a .zip that is not a .docx (no word/document.xml) is reported, not silently empty',
      threw !== null && /document\.xml/i.test(threw), threw);
  }

  console.log('\n--- docreader.js: an empty paragraph does not produce a stray blank line ---\n');
  {
    const body = '<w:p><w:r><w:t xml:space="preserve">Before</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">After</w:t></w:r></w:p>';
    const bytes = docxWith(body, { method: 8 });
    const text = await FlowDocReader.extractDocxText(bytes);
    check('an empty paragraph between two real ones collapses rather than leaving a gap',
      text === 'Before\nAfter', text);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
