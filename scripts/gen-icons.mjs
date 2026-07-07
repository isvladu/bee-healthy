// Generates simple placeholder PNG app icons (amber "bee" theme) for the PWA.
// No image-library dependency — builds valid PNGs directly with zlib.
// Regenerate with: npm run gen:icons
// Replace these with real designed icons before shipping.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(outDir, { recursive: true });

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw pixels: one filter byte (0) per row, then RGB triples.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  const stripeW = size * 0.12;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // Amber background (#f59e0b) with dark vertical stripes in the middle band.
      let r = 245;
      let g = 158;
      let b = 11;
      const inBand = y > size * 0.3 && y < size * 0.7;
      if (inBand && Math.floor(x / stripeW) % 2 === 0) {
        r = 31;
        g = 41;
        b = 55; // #1f2937
      }
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['apple-touch-icon-180x180.png', 180],
];

for (const [name, size] of targets) {
  writeFileSync(join(outDir, name), makePng(size));
  console.log(`wrote public/${name} (${size}x${size})`);
}
