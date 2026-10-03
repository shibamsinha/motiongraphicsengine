import { inflateSync } from 'node:zlib';
import fs from 'node:fs';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

export const readPng = (file) => {
  const buffer = fs.readFileSync(file);
  if (!buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error(`${file} is not a PNG.`);
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = offset + 8;

    if (type === 'IHDR') {
      width = buffer.readUInt32BE(body);
      height = buffer.readUInt32BE(body + 4);
      bitDepth = buffer[body + 8];
      colorType = buffer[body + 9];
      if (buffer[body + 12] !== 0) throw new Error('Interlaced PNGs are not supported.');
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(body, body + length));
    } else if (type === 'IEND') {
      break;
    }
    offset = body + length + 4;
  }

  if (bitDepth !== 8) throw new Error(`Only 8-bit PNGs are supported (got ${bitDepth}).`);
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}.`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const target = y * stride;

    for (let x = 0; x < stride; x++) {
      const value = raw[source + x];
      const left = x >= channels ? data[target + x - channels] : 0;
      const up = y > 0 ? data[target - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? data[target - stride + x - channels] : 0;

      let restored;
      switch (filter) {
        case 0: restored = value; break;
        case 1: restored = value + left; break;
        case 2: restored = value + up; break;
        case 3: restored = value + ((left + up) >> 1); break;
        case 4: restored = value + paeth(left, up, upLeft); break;
        default: throw new Error(`Unknown PNG filter ${filter} on row ${y}.`);
      }
      data[target + x] = restored & 0xff;
    }
  }

  return { width, height, channels, data };
};

export const pixelAt = (png, x, y) => {
  const at = y * png.width * png.channels + x * png.channels;
  return [png.data[at], png.data[at + 1], png.data[at + 2]];
};

export const inkColumns = (png, y, background, threshold = 40) => {
  const columns = [];
  for (let x = 0; x < png.width; x++) {
    const [r, g, b] = pixelAt(png, x, y);
    const distance =
      Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]);
    if (distance > threshold) columns.push(x);
  }
  return columns;
};
