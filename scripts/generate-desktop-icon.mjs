// Original ReHUB monogram, generated without external artwork or dependencies.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
const size = 256;
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type);
  const n = Buffer.alloc(4);
  n.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([n, t, data, crc]);
}
const pixels = Buffer.alloc(size * (1 + size * 4));
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const i = y * (1 + size * 4) + 1 + x * 4;
    const inBox = (a, b, c, d) => x >= a && x < c && y >= b && y < d;
    const mark =
      inBox(48, 56, 72, 200) ||
      inBox(72, 56, 128, 80) ||
      inBox(108, 80, 132, 116) ||
      inBox(72, 108, 128, 132) ||
      (y >= 125 &&
        y < 200 &&
        x >= 76 + (y - 125) * 0.48 &&
        x < 102 + (y - 125) * 0.48) ||
      inBox(150, 56, 174, 200) ||
      inBox(194, 56, 218, 200) ||
      inBox(174, 116, 194, 140);
    const edge = x < 12 || y < 12 || x >= 244 || y >= 244;
    pixels[i] = mark ? 255 : 24;
    pixels[i + 1] = mark ? 105 : 24;
    pixels[i + 2] = mark ? 0 : 24;
    pixels[i + 3] = edge ? 0 : 255;
  }
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(pixels)),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../electron/icon.png", import.meta.url), png);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
writeFileSync(
  new URL("../electron/icon.ico", import.meta.url),
  Buffer.concat([ico, png]),
);
