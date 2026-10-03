import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { config } from '../../server/config.mjs';
import { ROOT } from './engine.mjs';
import { validationError } from './errors.mjs';

const UPLOAD_DIR = config.uploadDir;

const PUBLIC_DIR = path.join(ROOT, 'public');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.weba', '.flac']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);

const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_BYTES = 24 * 1024 * 1024;

export const importAsset = async (sourcePath, kind = 'audio') => {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    throw validationError('Supply the path to a file on this machine.');
  }

  const absolute = path.resolve(sourcePath.trim());
  const extension = path.extname(absolute).toLowerCase();
  const allowed = kind === 'audio' ? AUDIO_EXTENSIONS : IMAGE_EXTENSIONS;
  const limit = kind === 'audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;

  if (!allowed.has(extension)) {
    throw validationError(
      `"${extension || 'no extension'}" is not a supported ${kind} type. ` +
        `Use one of: ${[...allowed].join(', ')}.`,
      { path: path.basename(absolute), supported: [...allowed] },
    );
  }

  let stat;
  try {
    stat = await fsp.stat(absolute);
  } catch {
    throw validationError(`No file at ${absolute}.`, { path: absolute });
  }
  if (!stat.isFile()) {
    throw validationError(`${absolute} is not a file.`, { path: absolute });
  }
  if (stat.size === 0) {
    throw validationError('That file is empty.', { path: absolute });
  }
  if (stat.size > limit) {
    throw validationError(
      `That ${kind} is ${Math.round(stat.size / 1024 / 1024)}MB, over the ` +
        `${Math.round(limit / 1024 / 1024)}MB limit.`,
      { bytes: stat.size, limit },
    );
  }

  const bytes = await fsp.readFile(absolute);
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 16);
  const filename = `${hash}${extension === '.jpeg' ? '.jpg' : extension}`;

  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  const target = path.join(UPLOAD_DIR, filename);
  const created = !fs.existsSync(target);
  if (created) await fsp.writeFile(target, bytes);

  return {
    src: `uploads/${filename}`,
    absolutePath: target,
    name: path.basename(absolute),
    bytes: stat.size,
    created,
  };
};

export const discardAsset = async (asset) => {
  if (!asset?.created || !asset.absolutePath) return false;
  try {
    await fsp.rm(asset.absolutePath, { force: true });
    return true;
  } catch {
    return false;
  }
};

export const resolveAssetPath = (src) => {
  if (typeof src !== 'string' || src.trim() === '') {
    throw validationError('That project has no usable audio source.');
  }
  if (/^https?:\/\//i.test(src)) {
    throw validationError(
      'That audio is a remote URL. Analysis needs a local file — re-add it with add_audio ' +
        'pointing at a file on this machine.',
      { src },
    );
  }

  const relative = src.replace(/^\/+/, '');
  const inUploads = relative.startsWith('uploads/');
  const root = inUploads ? UPLOAD_DIR : PUBLIC_DIR;
  const rest = inUploads ? relative.slice('uploads/'.length) : relative;

  const absolute = path.resolve(root, rest);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw validationError('That audio path points outside the project.', { src });
  }
  if (!fs.existsSync(absolute)) {
    throw validationError(
      `The audio file ${src} is missing from the project. It may have been deleted from ` +
        'the upload directory; re-add it with add_audio.',
      { src },
    );
  }
  return absolute;
};

export { UPLOAD_DIR, AUDIO_EXTENSIONS, IMAGE_EXTENSIONS };
