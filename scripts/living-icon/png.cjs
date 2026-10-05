// A minimal PNG encoder (RGBA, 8 bit, no filter), so the living icon can be written to files without a dependency.
const zlib = require('zlib');
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// rgba: Uint8ClampedArray / Buffer of w*h*4
function encode(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// Paste tiles (each w*w RGBA) into one sheet, `cols` per row.
function sheet(tiles, w, cols, bg) {
  const rows = Math.ceil(tiles.length / cols), W = w * cols, Hh = w * rows;
  const out = new Uint8ClampedArray(W * Hh * 4);
  for (let i = 0; i < out.length; i += 4) { out[i] = bg[0]; out[i + 1] = bg[1]; out[i + 2] = bg[2]; out[i + 3] = 255; }
  tiles.forEach((t, k) => {
    const ox = (k % cols) * w, oy = Math.floor(k / cols) * w;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = ((oy + y) * W + ox + x) * 4, a = t[s + 3] / 255;
      out[d] = t[s] * a + out[d] * (1 - a); out[d + 1] = t[s + 1] * a + out[d + 1] * (1 - a); out[d + 2] = t[s + 2] * a + out[d + 2] * (1 - a);
    }
  });
  return { rgba: out, w: W, h: Hh };
}
module.exports = { encode, sheet, crc32 };
