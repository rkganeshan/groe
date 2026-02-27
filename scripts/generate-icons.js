// Icon generation script — run with: node scripts/generate-icons.js
// Creates simple placeholder PNG icons for the extension.
// For production, replace with proper designed icons.

const fs = require("fs");
const path = require("path");

const sizes = [16, 32, 48, 128];
const outDir = path.resolve(__dirname, "..", "public", "icons");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Minimal 1x1 magenta PNG as placeholder (we'll create proper SVG-based ones)
// For now, generate a simple BMP-like PNG for each size
function createMinimalPng(size) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let crc = 0xffffffff;
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) {
      crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const crcVal = crc32(typeAndData);
    const crc = Buffer.alloc(4);
    crc[0] = (crcVal >>> 24) & 0xff;
    crc[1] = (crcVal >>> 16) & 0xff;
    crc[2] = (crcVal >>> 8) & 0xff;
    crc[3] = crcVal & 0xff;
    return Buffer.concat([len, typeAndData, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT — simple uncompressed data using zlib stored blocks
  const rowBytes = 1 + size * 3; // filter byte + RGB
  const rawData = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 3;
      // Create a gradient purple/pink icon
      const r = Math.min(255, Math.floor(100 + (x / size) * 155));
      const g = Math.floor(50 + (y / size) * 50);
      const b = Math.min(255, Math.floor(180 + (y / size) * 75));
      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
    }
  }

  // Simple zlib wrapper (stored, no compression)
  const zlibData = [];
  let offset = 0;
  while (offset < rawData.length) {
    const remaining = rawData.length - offset;
    const blockSize = Math.min(65535, remaining);
    const isLast = offset + blockSize >= rawData.length;
    zlibData.push(Buffer.from([isLast ? 0x01 : 0x00]));
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt16LE(blockSize, 0);
    lenBuf.writeUInt16LE(blockSize ^ 0xffff, 2);
    zlibData.push(lenBuf);
    zlibData.push(rawData.subarray(offset, offset + blockSize));
    offset += blockSize;
  }

  // Adler32
  let a = 1,
    b = 0;
  for (let i = 0; i < rawData.length; i++) {
    a = (a + rawData[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = Buffer.alloc(4);
  const adlerVal = ((b << 16) | a) >>> 0;
  adler[0] = (adlerVal >>> 24) & 0xff;
  adler[1] = (adlerVal >>> 16) & 0xff;
  adler[2] = (adlerVal >>> 8) & 0xff;
  adler[3] = adlerVal & 0xff;

  // zlib header (no compression) + data + adler32
  const zlibHeader = Buffer.from([0x78, 0x01]);
  const compressedData = Buffer.concat([zlibHeader, ...zlibData, adler]);

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressedData),
    chunk("IEND", iend),
  ]);
}

for (const size of sizes) {
  const png = createMinimalPng(size);
  const filePath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created ${filePath} (${png.length} bytes)`);
}

console.log("Done! Replace these with proper icons for production.");
