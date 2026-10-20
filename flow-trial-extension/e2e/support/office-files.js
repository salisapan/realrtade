// A real .docx and .xlsx, deflate-compressed the way Office writes them.
// Built with Node's zlib so the page reads the same bytes a live attachment has.
const zlib = require('zlib');

function u16(v) { return Buffer.from([v & 255, (v >>> 8) & 255]); }
function u32(v) { return Buffer.from([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]); }
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.from(f.data, 'utf8');
    const packed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0), u32(crc), u32(packed.length), u32(data.length), u16(name.length), u16(0), name, packed]);
    parts.push(local);
    central.push({ name, crc, size: packed.length, raw: data.length, offset });
    offset += local.length;
  }
  const cdStart = offset;
  for (const e of central) {
    const head = Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0), u32(e.crc), u32(e.size), u32(e.raw), u16(e.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset), e.name]);
    parts.push(head);
    offset += head.length;
  }
  parts.push(Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(offset - cdStart), u32(cdStart), u16(0)]));
  return Buffer.concat(parts);
}

function docx(lines) {
  const body = lines.map((l) => '<w:p><w:r><w:t xml:space="preserve">' + l + '</w:t></w:r></w:p>').join('');
  return zip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'word/document.xml', data: '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '</w:body></w:document>' }
  ]).toString('base64');
}

function xlsx(strings) {
  const sst = '<sst>' + strings.map((s) => '<si><t>' + s + '</t></si>').join('') + '</sst>';
  const rows = strings.map((_, i) => '<row r="' + (i + 1) + '"><c r="A' + (i + 1) + '" t="s"><v>' + i + '</v></c></row>').join('');
  return zip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'xl/sharedStrings.xml', data: sst },
    { name: 'xl/worksheets/sheet1.xml', data: '<worksheet><sheetData>' + rows + '</sheetData></worksheet>' }
  ]).toString('base64');
}

module.exports = { docx, xlsx };
