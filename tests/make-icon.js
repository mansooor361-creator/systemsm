'use strict';

/* Generates build/icon.png (512x512) without external deps: dark rounded square,
 * gold document outline + knowledge-network nodes. */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const W = 512, H = 512;
const px = Buffer.alloc(W * H * 4);

function put(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const na = a / 255;
  px[i] = Math.round(r * na + px[i] * (1 - na));
  px[i + 1] = Math.round(g * na + px[i + 1] * (1 - na));
  px[i + 2] = Math.round(b * na + px[i + 2] * (1 - na));
  px[i + 3] = Math.max(px[i + 3], a);
}

function inRoundedRect(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + rad, Math.min(x, x1 - rad));
  const cy = Math.max(y0 + rad, Math.min(y, y1 - rad));
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad || (x >= x0 + rad && x <= x1 - rad) || (y >= y0 + rad && y <= y1 - rad);
}

function dist(x0, y0, x1, y1, px_, py_) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px_ - x0) * dx + (py_ - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + t * dx, cy = y0 + t * dy;
  return Math.hypot(px_ - cx, py_ - cy);
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (inRoundedRect(x, y, 16, 16, 496, 496, 104)) {
      const t = (x + y) / (W + H);
      put(x, y, Math.round(24 + t * 6), Math.round(34 + t * 6), Math.round(56 + t * 8), 255);
    }
    const S = 512 / 128;
    const doc = dist(40 * S, 26 * S, 40 * S, 108 * S, x, y) < 2 * S && y > 26 * S && y < 108 * S && x > 34 * S && x < 90 * S;
    const top = dist(40 * S, 26 * S, 74 * S, 26 * S, x, y) < 2 * S && x > 34 * S && x < 74 * S && y > 20 * S && y < 32 * S;
    const diag = dist(74 * S, 26 * S, 90 * S, 42 * S, x, y) < 2 * S;
    const right = dist(90 * S, 42 * S, 90 * S, 108 * S, x, y) < 2 * S && x > 84 * S && x < 96 * S;
    const bottom = dist(40 * S, 108 * S, 90 * S, 108 * S, x, y) < 2 * S && x > 34 * S && x < 96 * S && y > 102 * S && y < 114 * S;
    if (doc || top || diag || right || bottom) put(x, y, 212, 169, 78, 255);

    const cx = 64 * S, cy = 72 * S;
    const nodes = [
      [cx, cy, 7, [240, 212, 138]],
      [44 * S, 58 * S, 5, [95, 180, 217]],
      [84 * S, 58 * S, 5, [95, 180, 217]],
      [52 * S, 92 * S, 5, [199, 146, 234]],
      [78 * S, 90 * S, 5, [126, 201, 143]]
    ];
    const links = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2]];
    for (const [a, b] of links) {
      if (dist(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1], x, y) < 1.6 * S) {
        put(x, y, 147, 161, 184, 210);
      }
    }
    for (const [nx, ny, nr, col] of nodes) {
      const d = Math.hypot(x - nx, y - ny);
      if (d <= nr * S) put(x, y, col[0], col[1], col[2], 255);
    }
  }
}

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const crcTable = [...Array(256)].map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
]);

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
