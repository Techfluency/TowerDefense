/**
 * Generates placeholder PNG sprites for development.
 *
 * Creates minimal valid PNG files -- solid colored rectangles at the
 * specified dimensions. These exercise the asset loading pipeline
 * end-to-end and are replaced by final art in Phase 2.
 *
 * Run: tsx scripts/generate-placeholders.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = resolve(__dirname, '..', 'public', 'assets', 'sprites');

mkdirSync(SPRITES_DIR, { recursive: true });

/**
 * Creates a minimal valid PNG file with a solid color fill.
 * Uses DEFLATE compression for the image data (required by PNG spec).
 *
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param r - Red channel (0-255).
 * @param g - Green channel (0-255).
 * @param b - Blue channel (0-255).
 * @returns Buffer containing a valid PNG file.
 */
function createPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  /* Build raw pixel data: filter byte (0 = None) + RGB triplets per row. */
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    rawData[rowOffset] = 0; // Filter byte: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
    }
  }

  const compressed = deflateSync(rawData);

  /* Build PNG file structure. */
  const chunks: Buffer[] = [];

  /* PNG signature. */
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  /* IHDR chunk: width, height, bit depth, color type (2 = RGB). */
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // Bit depth
  ihdr[9] = 2;  // Color type: RGB
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  chunks.push(createChunk('IHDR', ihdr));

  /* IDAT chunk: compressed pixel data. */
  chunks.push(createChunk('IDAT', compressed));

  /* IEND chunk: end marker. */
  chunks.push(createChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

/**
 * Creates a PNG chunk with length, type, data, and CRC.
 */
function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBytes = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBytes, data]);

  /* CRC-32 calculation per PNG specification. */
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < crcData.length; i++) {
    crc ^= crcData[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  crc ^= 0xFFFFFFFF;
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBytes, data, crcBuf]);
}

/* Sprite definitions: name, width, height, RGB color. */
const sprites: Array<[string, number, number, number, number, number]> = [
  ['tower-ranged',      32, 32, 0x4a, 0x90, 0xd9], // Blue
  ['tower-focused',     32, 32, 0x3a, 0x70, 0xc9], // Darker blue
  ['enemy-runner',      24, 24, 0xd9, 0x4a, 0x4a], // Red (#D94A4A)
  ['enemy-tank',        32, 32, 0x8b, 0x20, 0x20], // Dark Red (#8B2020)
  ['enemy-fast',        20, 20, 0xff, 0x6b, 0x35], // Orange (#FF6B35)
  ['enemy-flyer',       24, 24, 0x4a, 0xc8, 0xd9], // Cyan (#4AC8D9)
  ['enemy-swarm',       16, 16, 0xd9, 0x4a, 0x8b], // Pink (#D94A8B)
  ['projectile-arrow',   8, 16, 0xd9, 0xc7, 0x4a], // Yellow
  ['projectile-blast',  12, 12, 0xd9, 0xb0, 0x4a], // Orange-yellow
  ['tile-path',         64, 64, 0x8B, 0x69, 0x14], // Brown
  ['tile-buildable',    64, 64, 0x4a, 0x9e, 0x4a], // Green
  ['tile-blocked',      64, 64, 0x44, 0x44, 0x44], // Dark gray
  ['tile-spawn',        64, 64, 0xd9, 0x8c, 0x4a], // Orange
  ['tile-objective',    64, 64, 0x9b, 0x4a, 0xd9], // Purple
];

for (const [name, width, height, r, g, b] of sprites) {
  const png = createPng(width, height, r, g, b);
  const filePath = resolve(SPRITES_DIR, `${name}.png`);
  writeFileSync(filePath, png);
  console.log(`Created ${name}.png (${width}x${height})`);
}

console.log(`\nGenerated ${sprites.length} placeholder sprites in ${SPRITES_DIR}`);
