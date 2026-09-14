// Reads plain text out of a .docx attachment entirely on-device, the mirror
// image of docwriter.js's hand-rolled writer. Feature 3 (the attachment
// hover card) needs the text INSIDE a Word attachment before anything —
// masking, summarizing — can happen to it, and Gmail never puts an
// attachment's content in the DOM; only its bytes, behind a download URL.
//
// Real-world .docx files from Word, Google Docs, and LibreOffice always
// deflate-compress their parts (unlike docwriter.js's own always-STORED
// output, which only has to be valid, not match what other tools produce).
// Reading them back means actually decompressing — Chrome's native
// DecompressionStream('deflate-raw') does that without bundling a library
// into the extension.
//
// PDF is NOT handled here. Extracting real text from a PDF means parsing
// compressed content streams and font encoding tables — a correct
// implementation is a library-sized undertaking (pdf.js is the standard
// one), not a few hundred lines alongside a ZIP reader. Rather than ship a
// PDF "extractor" likely to silently mis-read real documents, sidebar.js's
// floating card shows its already-built 'unsupported' state for PDFs. See
// content-gmail.js's attachment hover wiring for where that split happens.

const FlowDocReader = (() => {
  function u16(bytes, off) { return bytes[off] | (bytes[off + 1] << 8); }
  function u32(bytes, off) { return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0; }

  // The End Of Central Directory record is a fixed 22 bytes plus an optional
  // comment of unknown length, so it can only be found by walking backward
  // from the end of the file looking for its signature.
  function findEOCD(bytes) {
    const sig = 0x06054b50;
    const minPos = Math.max(0, bytes.length - 22 - 65535);
    for (let i = bytes.length - 22; i >= minPos; i--) {
      if (u32(bytes, i) === sig) return i;
    }
    return -1;
  }

  function parseCentralDirectory(bytes) {
    const eocd = findEOCD(bytes);
    if (eocd < 0) throw new Error('Not a valid ZIP/.docx file — no end-of-central-directory record found.');
    const count = u16(bytes, eocd + 10);
    const cdOffset = u32(bytes, eocd + 16);
    const entries = [];
    let pos = cdOffset;
    for (let i = 0; i < count; i++) {
      if (u32(bytes, pos) !== 0x02014b50) break; // central directory entry signature
      const method = u16(bytes, pos + 10);
      const compSize = u32(bytes, pos + 20);
      const nameLen = u16(bytes, pos + 28);
      const extraLen = u16(bytes, pos + 30);
      const commentLen = u16(bytes, pos + 32);
      const localOffset = u32(bytes, pos + 42);
      const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
      entries.push({ name, method, compSize, localOffset });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function readEntryData(bytes, entry) {
    const pos = entry.localOffset;
    if (u32(bytes, pos) !== 0x04034b50) throw new Error('Malformed ZIP local file header for ' + entry.name);
    const nameLen = u16(bytes, pos + 26);
    const extraLen = u16(bytes, pos + 28);
    const dataStart = pos + 30 + nameLen + extraLen;
    const compressed = bytes.subarray(dataStart, dataStart + entry.compSize);
    if (entry.method === 0) return compressed; // stored, no decompression needed
    if (entry.method === 8) {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('Unsupported ZIP compression method (' + entry.method + ') for ' + entry.name);
  }

  // Strips WordprocessingML down to plain text. Deliberately not a full OOXML
  // parser — a hover-card summary only needs the words a reader would see,
  // not reproduce styling, tables-as-tables, or embedded objects.
  //
  // Extracted per-paragraph rather than by flattening the whole document to
  // one string of <w:t> runs first: a paragraph boundary is a real line
  // break, but there is nothing between two adjacent <w:t> elements'
  // *captured groups* once join()'d — a marker written into the string
  // between them, rather than into the array of matches itself, is silently
  // dropped the moment the matches are joined without it. Walking paragraph
  // by paragraph keeps the break attached to the content it separates.
  function documentXmlToText(xml) {
    const paragraphs = [];
    const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
    let m;
    while ((m = paraRe.exec(xml)) !== null) {
      const body = m[1].replace(/<w:tab\s*\/>/g, '\t').replace(/<w:br\s*\/>/g, '\n');
      const runRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let line = '';
      let rm;
      while ((rm = runRe.exec(body)) !== null) line += rm[1];
      paragraphs.push(line);
    }
    return paragraphs.join('\n')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
      .split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
      .trim();
  }

  // `input` is whatever came back from fetching the attachment's own
  // download URL — a Blob, an ArrayBuffer, or already a Uint8Array.
  async function extractDocxText(input) {
    let bytes;
    if (typeof Blob !== 'undefined' && input instanceof Blob) bytes = new Uint8Array(await input.arrayBuffer());
    else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
    else bytes = input;

    const entries = parseCentralDirectory(bytes);
    const docEntry = entries.find((e) => e.name === 'word/document.xml');
    if (!docEntry) throw new Error('This .docx has no word/document.xml — not a standard Word document.');
    const data = await readEntryData(bytes, docEntry);
    const xml = new TextDecoder('utf-8').decode(data);
    return documentXmlToText(xml);
  }

  return { extractDocxText };
})();

if (typeof module !== 'undefined') module.exports = { FlowDocReader };
