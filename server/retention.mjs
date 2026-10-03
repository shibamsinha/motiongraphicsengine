import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const HOUR_MS = 60 * 60 * 1000;

const TEMP_PREFIX = 'sheet-';
const TEMP_MAX_AGE_MS = HOUR_MS;

const bytesOf = async (dir) => {
  let total = 0;
  let files = 0;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return { bytes: 0, files: 0 };
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      const stat = await fsp.stat(path.join(dir, entry.name));
      total += stat.size;
      files += 1;
    } catch {}
  }
  return { bytes: total, files };
};

export const freeBytes = async (dir) => {
  try {
    const stat = await fsp.statfs(dir);
    return Number(stat.bavail) * Number(stat.bsize);
  } catch {
    return null;
  }
};

export const usage = async (config) => {
  const [out, uploads] = await Promise.all([
    bytesOf(config.outDir),
    bytesOf(config.uploadDir),
  ]);
  const free = await freeBytes(config.outDir);
  return {
    outBytes: out.bytes,
    outFiles: out.files,
    uploadBytes: uploads.bytes,
    uploadFiles: uploads.files,
    totalBytes: out.bytes + uploads.bytes,
    freeBytes: free,
  };
};

export const capacity = async (config) => {
  const stats = await usage(config);

  if (config.maxDiskGb > 0) {
    const limit = config.maxDiskGb * 1024 ** 3;
    if (stats.totalBytes >= limit) {
      return {
        ok: false,
        reason: 'Storage quota reached. Old renders must be cleared before new ones can start.',
        stats,
      };
    }
  }

  if (stats.freeBytes !== null && stats.freeBytes < 512 * 1024 * 1024) {
    return { ok: false, reason: 'The server is out of disk space.', stats };
  }

  return { ok: true, stats };
};

export const sweep = async (config, protectedNames = new Set()) => {
  const removed = { outputs: 0, temp: 0, bytes: 0 };
  const now = Date.now();

  let entries;
  try {
    entries = await fsp.readdir(config.outDir, { withFileTypes: true });
  } catch {
    return removed;
  }

  const maxAgeMs = config.retentionHours > 0 ? config.retentionHours * HOUR_MS : null;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name === '.gitkeep' || name.startsWith('.')) continue;
    if (protectedNames.has(name)) continue;

    const file = path.join(config.outDir, name);
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      continue;
    }
    const age = now - stat.mtimeMs;

    const isTemp = name.startsWith(TEMP_PREFIX);
    const expired = isTemp ? age > TEMP_MAX_AGE_MS : maxAgeMs !== null && age > maxAgeMs;
    if (!expired) continue;

    try {
      await fsp.rm(file, { force: true });
      removed[isTemp ? 'temp' : 'outputs'] += 1;
      removed.bytes += stat.size;
    } catch {}
  }

  return removed;
};

export const outputExists = (config, filename) => {
  if (typeof filename !== 'string' || filename === '') return false;
  return fs.existsSync(path.join(config.outDir, path.basename(filename)));
};
