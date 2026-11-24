/**
 * PngCodec — Pure Zero-Dependency RGBA PNG Decoder & Encoder (Node.js)
 * =====================================================================
 * Uses only Node's built-in `node:zlib` to decode and encode standard 8-bit
 * RGBA (colorType 6) PNG images so headless Node tests can pixel-audit
 * `public/sprites/character_atlas.png` directly from disk without external
 * native dependencies (PIL, sharp, canvas).
 */

import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Precomputed CRC-32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Encode an RGBA Uint8Array/Uint8ClampedArray into a valid lossless 8-bit RGBA PNG Buffer.
 */
export function encodePngRGBA(rgba, width, height) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA bytes, got ${rgba.length}`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filter
  ihdr[12] = 0; // non-interlaced

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const dst = y * (stride + 1);
    raw[dst] = 0; // filter type 0 (None)
    const src = y * stride;
    for (let i = 0; i < stride; i++) {
      raw[dst + 1 + i] = rgba[src + i];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    PNG_SIGNATURE,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Decode an 8-bit RGBA (colorType 6) or RGB (colorType 2) non-interlaced PNG Buffer
 * into `{ width, height, colorType, data: Uint8Array (RGBA) }`.
 */
export function decodePngRGBA(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) {
    throw new Error('Invalid PNG buffer: too short');
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error(`Truncated PNG chunk: ${type}`);
    }

    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12];
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (width <= 0 || height <= 0) {
    throw new Error('Missing or invalid IHDR chunk');
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace})`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const expectedLen = (stride + 1) * height;
  if (inflated.length < expectedLen) {
    throw new Error(`Inflated PNG data too short: ${inflated.length} < ${expectedLen}`);
  }

  const reconstructed = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const rowIn = y * (stride + 1);
    const filter = inflated[rowIn];
    const rowOut = y * stride;
    const prevOut = (y - 1) * stride;

    for (let i = 0; i < stride; i++) {
      const rawByte = inflated[rowIn + 1 + i];
      const a = i >= bpp ? reconstructed[rowOut + i - bpp] : 0;
      const b = y > 0 ? reconstructed[prevOut + i] : 0;
      const c = y > 0 && i >= bpp ? reconstructed[prevOut + i - bpp] : 0;

      let val = rawByte;
      if (filter === 1) {
        val = (rawByte + a) & 0xff;
      } else if (filter === 2) {
        val = (rawByte + b) & 0xff;
      } else if (filter === 3) {
        val = (rawByte + ((a + b) >>> 1)) & 0xff;
      } else if (filter === 4) {
        val = (rawByte + paethPredictor(a, b, c)) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG scanline filter type: ${filter}`);
      }
      reconstructed[rowOut + i] = val;
    }
  }

  if (colorType === 6) {
    return { width, height, colorType, data: reconstructed };
  }

  // Expand RGB to RGBA
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = reconstructed[p * 3];
    rgba[p * 4 + 1] = reconstructed[p * 3 + 1];
    rgba[p * 4 + 2] = reconstructed[p * 3 + 2];
    rgba[p * 4 + 3] = 255;
  }
  return { width, height, colorType, data: rgba };
}

/**
 * Extract a rectangular sub-region (cell) from a decoded RGBA image.
 */
export function extractSubImageRGBA(atlasRgba, atlasWidth, x, y, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * atlasWidth + x) * 4;
    const dstStart = row * w * 4;
    out.set(atlasRgba.subarray(srcStart, srcStart + w * 4), dstStart);
  }
  return out;
}
