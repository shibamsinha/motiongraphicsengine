import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBrowser } from '@remotion/renderer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const svg = readFileSync(path.join(PUBLIC, 'brand', 'mark.svg'), 'utf8');

const browser = await ensureBrowser();
if (!('path' in browser)) throw new Error('No headless browser available');

const work = mkdtempSync(path.join(tmpdir(), 'mge-brand-'));

// Small sizes drop the bezier handles and thicken the curve so it survives 16px.
const render = (size, { simple = size <= 48, background = 'transparent', radius = 15 } = {}) => {
  const page = path.join(work, `${size}.html`);
  const out = path.join(work, `${size}-${background}.png`);
  writeFileSync(page, `<!doctype html><style>
    html, body { margin: 0; background: ${background}; }
    svg { display: block; width: ${size}px; height: ${size}px; }
    svg > rect:first-of-type { rx: ${radius}px; }
    ${radius === 0 ? 'svg > rect:nth-of-type(2) { display: none; }' : ''}
    ${simple ? '#handles { display: none; } #path { stroke-width: 6px; }' : ''}
  </style>${svg}`);
  execFileSync(browser.path, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${out}`,
    `file://${page}`,
  ], { stdio: 'ignore' });
  return readFileSync(out);
};

const ico = (images) => {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
};

try {
  const outputs = {
    'favicon.png': render(512),
    'apple-touch-icon.png': render(180, { background: '#151925', radius: 0 }),
    'brand/logo-mark.png': render(256),
    'favicon.ico': ico([16, 32, 48].map((size) => ({ size, png: render(size) }))),
  };
  for (const [name, data] of Object.entries(outputs)) {
    writeFileSync(path.join(PUBLIC, name), data);
    console.log(`public/${name.padEnd(22)} ${(data.length / 1024).toFixed(1)} KB`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
