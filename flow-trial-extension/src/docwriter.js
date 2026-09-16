// Generates a real, Word-openable .docx entirely on-device — no server call,
// no third-party library. A .docx is just a ZIP of a few small XML parts;
// this writes that ZIP by hand using STORED (uncompressed) entries, which is
// fully valid per the ZIP spec and needs no DEFLATE implementation. The XML
// itself is the minimum OOXML WordprocessingML a real Word/LibreOffice/Google
// Docs will open without repair: [Content_Types].xml, _rels/.rels, and
// word/document.xml.
//
// This is Feature 4 Path B: the local document half of "Do It: Log to [CRM]
// & Generate Next Step Document" — built from the same extracted facts
// (amount, date, quote, sender) that Path A already writes to the connected
// CRM, so the two halves can never disagree about what happened.

const FlowDocWriter = (() => {
  const enc = new TextEncoder();

  // ---- CRC-32 (needed by the ZIP format; not provided by any Web API) -----
  let CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    CRC_TABLE = t;
    return t;
  }
  function crc32(bytes) {
    const table = crcTable();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ---- minimal ZIP writer (stored/uncompressed entries only) ---------------

  function dosDateTime(d) {
    d = d || new Date();
    const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
    const year = Math.max(0, d.getFullYear() - 1980);
    const date = ((year & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);
    return { time, date };
  }

  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

  function buildZip(files) {
    // files: [{ name: 'word/document.xml', data: Uint8Array }]
    const { time, date } = dosDateTime();
    const chunks = [];
    const centralEntries = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;

      const local = [
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
        ...u16(time), ...u16(date), ...u32(crc), ...u32(size), ...u32(size),
        ...u16(nameBytes.length), ...u16(0)
      ];
      const localHeader = new Uint8Array(local);
      chunks.push(localHeader, nameBytes, f.data);

      centralEntries.push({
        nameBytes, crc, size, offset,
        header: [
          ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
          ...u16(time), ...u16(date), ...u32(crc), ...u32(size), ...u32(size),
          ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
          ...u32(0), ...u32(offset)
        ]
      });

      offset += localHeader.length + nameBytes.length + f.data.length;
    }

    const cdStart = offset;
    let cdSize = 0;
    for (const e of centralEntries) {
      const header = new Uint8Array(e.header);
      chunks.push(header, e.nameBytes);
      cdSize += header.length + e.nameBytes.length;
    }

    const eocd = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0),
      ...u16(files.length), ...u16(files.length),
      ...u32(cdSize), ...u32(cdStart), ...u16(0)
    ]);
    chunks.push(eocd);

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
  }

  // ---- WordprocessingML -----------------------------------------------------

  function escXml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
    ));
  }

  function paragraph(text, opts) {
    opts = opts || {};
    const runProps = [];
    if (opts.bold) runProps.push('<w:b/>');
    if (opts.size) runProps.push('<w:sz w:val="' + (opts.size * 2) + '"/>');
    const rPr = runProps.length ? '<w:rPr>' + runProps.join('') + '</w:rPr>' : '';
    const pPr = opts.spacingAfter != null ? '<w:pPr><w:spacing w:after="' + opts.spacingAfter + '"/></w:pPr>' : '';
    return '<w:p>' + pPr + '<w:r>' + rPr + '<w:t xml:space="preserve">' + escXml(text) + '</w:t></w:r></w:p>';
  }

  function heading(text) {
    return '<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">' + escXml(text) + '</w:t></w:r></w:p>';
  }

  function factRow(label, value) {
    return paragraph(label + ':  ' + value, { spacingAfter: 60 });
  }

  const TEMPLATES = {
    'contract-mod': {
      title: 'Contract Modification — Acknowledgment',
      intro: 'This memorandum records a modification to the terms referenced below, as reflected in correspondence dated the same day.'
    },
    receipt: {
      title: 'Acknowledgment of Receipt',
      intro: 'This memorandum confirms receipt and acknowledgment of the item referenced below.'
    },
    'confirmation-memo': {
      title: 'Confirmation Memo',
      intro: 'This memorandum confirms the agreement described below, for the record.'
    }
  };

  // ctx: { label, facts: { moneyText, dateText, quote }, senderName, senderEmail,
  //        subject, threadUrl, connectorLabel, where }
  function buildDocumentXml(kind, ctx) {
    const tpl = TEMPLATES[kind] || TEMPLATES.receipt;
    const facts = ctx.facts || {};
    const body = [];

    body.push(heading(tpl.title));
    body.push(paragraph(tpl.intro, { spacingAfter: 200 }));
    body.push(paragraph(ctx.label || 'Decision', { bold: true, spacingAfter: 120 }));

    if (facts.moneyText) body.push(factRow('Amount', facts.moneyText));
    if (facts.dateText) body.push(factRow('Date', facts.dateText));
    const from = [ctx.senderName, ctx.senderEmail].filter(Boolean).join(' ');
    if (from) body.push(factRow('Counterparty', from));
    if (ctx.subject) body.push(factRow('Reference', ctx.subject));

    if (facts.quote) {
      body.push(paragraph('', { spacingAfter: 120 }));
      body.push(paragraph('"' + facts.quote + '"', { spacingAfter: 200 }));
    }

    body.push(paragraph('', { spacingAfter: 120 }));
    body.push(paragraph(
      'Logged to ' + (ctx.where || ctx.connectorLabel || 'the connected system') +
      ' and generated by Glance (theflow-ai.com/trial) — one click, from the message itself.',
      { spacingAfter: 0 }
    ));

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + body.join('') + '<w:sectPr/></w:body></w:document>';
  }

  const CONTENT_TYPES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';

  const ROOT_RELS_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  // Returns a real .docx as a Blob, ready to hand to an <a download> link.
  // `kind`: 'contract-mod' | 'receipt' | 'confirmation-memo'.
  function generate(kind, ctx) {
    const documentXml = buildDocumentXml(kind, ctx || {});
    const files = [
      { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES_XML) },
      { name: '_rels/.rels', data: enc.encode(ROOT_RELS_XML) },
      { name: 'word/document.xml', data: enc.encode(documentXml) }
    ];
    const bytes = buildZip(files);
    return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function suggestedFilename(kind, ctx) {
    const base = (kind || 'document').replace(/[^a-z-]/gi, '');
    const who = (ctx && (ctx.senderName || ctx.senderEmail) || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    const stamp = new Date().toISOString().slice(0, 10);
    return ['glance', base, who, stamp].filter(Boolean).join('-') + '.docx';
  }

  return { generate, suggestedFilename, TEMPLATES };
})();

if (typeof module !== 'undefined') module.exports = { FlowDocWriter };
