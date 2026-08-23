/**
 * Generates apps/desktop/build/icon.png (1024×1024 RGBA).
 * Dependency-free: only node:fs and node:zlib. PNG encoded by hand.
 *
 * Usage: node apps/desktop/scripts/generate-icon.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT_SIZE = 1024;
const SS = 4; // supersampling factor
const HI = OUT_SIZE * SS; // 4096

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "build", "icon.png");

// --- CRC32 (PNG) -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// --- PNG writer ------------------------------------------------------------

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePngRGBA(width, height, rgba) {
  // Filter type 0 (None) per scanline
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Geometry helpers ------------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Signed distance to rounded rectangle centered at (cx,cy) with half-size (hw,hh) and corner radius r. */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  const outside = Math.hypot(ax, ay);
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - r;
}

function cover(dist) {
  // Anti-alias at ~1px in supersampled space (will average down)
  const aa = 1.0;
  if (dist <= -aa) return 1;
  if (dist >= aa) return 0;
  return 0.5 - dist / (2 * aa);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixRgb(c0, c1, t) {
  return [
    Math.round(lerp(c0[0], c1[0], t)),
    Math.round(lerp(c0[1], c1[1], t)),
    Math.round(lerp(c0[2], c1[2], t)),
  ];
}

// --- Draw at supersampled resolution ---------------------------------------

function renderHiRes() {
  const top = hexToRgb("#6366f1");
  const bot = hexToRgb("#4338ca");
  const white = [255, 255, 255];

  // All dimensions in OUT_SIZE units, then scaled by SS when sampling.
  const bgR = 180;
  const bgHalf = OUT_SIZE / 2;
  const bgCx = bgHalf;
  const bgCy = bgHalf;
  const bgHw = bgHalf;
  const bgHh = bgHalf;

  // Document glyph: ~460×560, radius ~48, centered
  const docW = 460;
  const docH = 560;
  const docR = 48;
  const docCx = bgHalf;
  const docCy = bgHalf;
  const docHw = docW / 2;
  const docHh = docH / 2;

  // Lines inside glyph (in OUT coords relative to glyph)
  const lineH = 36;
  const lineW = docW * 0.62;
  const lineLeft = docCx - docHw + docW * 0.24;
  const lineFracYs = [0.32, 0.5, 0.68];

  const rgba = Buffer.alloc(HI * HI * 4);

  for (let y = 0; y < HI; y++) {
    const oy = (y + 0.5) / SS; // continuous OUT-space coord
    const gradT = oy / OUT_SIZE;
    const bgColor = mixRgb(top, bot, gradT);

    for (let x = 0; x < HI; x++) {
      const ox = (x + 0.5) / SS;
      const i = (y * HI + x) * 4;

      const bgCov = cover(sdRoundRect(ox, oy, bgCx, bgCy, bgHw, bgHh, bgR));
      if (bgCov <= 0) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
        continue;
      }

      let r = bgColor[0];
      let g = bgColor[1];
      let b = bgColor[2];

      const docCov = cover(
        sdRoundRect(ox, oy, docCx, docCy, docHw, docHh, docR)
      );
      if (docCov > 0) {
        // Start as white document, then punch gradient-colored lines
        let dr = white[0];
        let dg = white[1];
        let db = white[2];

        for (const fy of lineFracYs) {
          const ly = docCy - docHh + docH * fy;
          const lineCx = lineLeft + lineW / 2;
          const lineHw = lineW / 2;
          const lineHh = lineH / 2;
          const lineCov = cover(
            sdRoundRect(ox, oy, lineCx, ly, lineHw, lineHh, lineHh)
          );
          if (lineCov > 0) {
            dr = Math.round(lerp(dr, bgColor[0], lineCov));
            dg = Math.round(lerp(dg, bgColor[1], lineCov));
            db = Math.round(lerp(db, bgColor[2], lineCov));
          }
        }

        r = Math.round(lerp(r, dr, docCov));
        g = Math.round(lerp(g, dg, docCov));
        b = Math.round(lerp(b, db, docCov));
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = Math.round(255 * bgCov);
    }
  }

  return rgba;
}

function downsample(hi) {
  const out = Buffer.alloc(OUT_SIZE * OUT_SIZE * 4);
  const ss2 = SS * SS;

  for (let y = 0; y < OUT_SIZE; y++) {
    for (let x = 0; x < OUT_SIZE; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const sx = x * SS + dx;
          const sy = y * SS + dy;
          const si = (sy * HI + sx) * 4;
          r += hi[si];
          g += hi[si + 1];
          b += hi[si + 2];
          a += hi[si + 3];
        }
      }
      const oi = (y * OUT_SIZE + x) * 4;
      out[oi] = Math.round(r / ss2);
      out[oi + 1] = Math.round(g / ss2);
      out[oi + 2] = Math.round(b / ss2);
      out[oi + 3] = Math.round(a / ss2);
    }
  }
  return out;
}

function main() {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const hi = renderHiRes();
  const lo = downsample(hi);
  const png = encodePngRGBA(OUT_SIZE, OUT_SIZE, lo);
  writeFileSync(OUT_PATH, png);
  console.log(
    `Wrote ${OUT_PATH} (${OUT_SIZE}×${OUT_SIZE}, ${png.length} bytes)`
  );
}

main();
