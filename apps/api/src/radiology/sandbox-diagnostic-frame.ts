/**
 * Sprint 152 — Deterministic sandbox diagnostic frames (not DICOM Part 10).
 * Pure-JS PNG encoder for grayscale phantoms usable by the application viewer.
 * Production PACS Part 10 / DICOMweb remains EXTERNAL_GATED.
 */
import { createHash } from 'node:crypto';
import { deflateSync as zlibDeflateSync } from 'node:zlib';

export const SANDBOX_VIEWER_FRAME_WIDTH = 512;
export const SANDBOX_VIEWER_FRAME_HEIGHT = 512;
export const SANDBOX_VIEWER_DEFAULT_FRAME_COUNT = 8;

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode 8-bit grayscale PNG (no external deps). */
export function encodeGrayscalePng(width: number, height: number, pixels: Uint8Array): Buffer {
  if (pixels.length !== width * height) {
    throw new Error('pixel_buffer_size_mismatch');
  }
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const compressed = zlibDeflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0; // grayscale
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Build a deterministic chest/abdomen-like phantom for sandbox viewer demos.
 * Not clinical imagery — labeled for sandbox use only.
 */
export function renderSandboxDiagnosticFrame(input: {
  studyId: string;
  seriesId: string;
  frameIndex: number;
  frameCount: number;
  modalityCode?: string | null;
}): { png: Buffer; width: number; height: number; contentType: 'image/png' } {
  const width = SANDBOX_VIEWER_FRAME_WIDTH;
  const height = SANDBOX_VIEWER_FRAME_HEIGHT;
  const pixels = new Uint8Array(width * height);
  const seed = createHash('sha256')
    .update(`${input.studyId}:${input.seriesId}:${input.frameIndex}`)
    .digest();
  const cx = width / 2 + ((seed[0]! % 21) - 10);
  const cy = height / 2 + ((seed[1]! % 21) - 10);
  const sliceT = input.frameCount <= 1 ? 0.5 : input.frameIndex / (input.frameCount - 1);
  const radius = Math.min(width, height) * (0.28 + 0.08 * Math.sin(sliceT * Math.PI));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let v = 18 + (seed[(x + y) % 16]! % 12);
      if (dist < radius) {
        const n = dist / radius;
        v = Math.floor(40 + (1 - n) * 160 + Math.sin((x + input.frameIndex * 7) * 0.04) * 18);
      }
      // soft "ribs" / structure bands
      if (Math.abs(dy) < radius * 0.85 && Math.abs(Math.sin(dy * 0.09 + sliceT * 4)) > 0.92) {
        v = Math.min(255, v + 35);
      }
      pixels[y * width + x] = Math.max(0, Math.min(255, v));
    }
  }

  // burn-in sandbox watermark (bottom strip)
  const labelY0 = height - 18;
  for (let y = labelY0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] = 8;
    }
  }

  return {
    png: encodeGrayscalePng(width, height, pixels),
    width,
    height,
    contentType: 'image/png',
  };
}
