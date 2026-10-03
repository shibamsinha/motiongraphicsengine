import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');

const DATA_DIR = process.env.MGE_DATA_DIR
  ? path.resolve(process.env.MGE_DATA_DIR)
  : path.join(ROOT, '.mge-data');

const dir = (value, fallback) => (value ? path.resolve(value) : fallback);

const num = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const config = Object.freeze({
  root: ROOT,
  dataDir: DATA_DIR,

  outDir: dir(process.env.MGE_OUT_DIR, path.join(ROOT, 'out')),
  uploadDir: dir(process.env.MGE_UPLOAD_DIR, path.join(DATA_DIR, 'uploads')),
  stateDir: path.join(DATA_DIR, 'state'),
  remotionPublicDir: path.join(DATA_DIR, 'remotion-public'),
  distDir: dir(process.env.MGE_DIST_DIR, path.join(ROOT, 'dist')),
  publicDir: path.join(ROOT, 'public'),

  host: process.env.MGE_HOST ?? '0.0.0.0',
  port: Number(process.env.MGE_RENDER_PORT ?? 5311),

  maxConcurrentRenders: Math.max(1, Math.round(num(process.env.MGE_MAX_CONCURRENT_RENDERS, 1))),
  maxTotalFrames: Math.max(1, Math.round(num(process.env.MGE_MAX_TOTAL_FRAMES, 3600))),
  maxScenes: Math.max(1, Math.round(num(process.env.MGE_MAX_SCENES, 100))),
  maxSceneSeconds: num(process.env.MGE_MAX_SCENE_SECONDS, 12),
  maxJsonBytes: Math.round(num(process.env.MGE_MAX_JSON_MB, 8) * 1024 * 1024),

  maxUploadBytes: Math.round(num(process.env.MGE_MAX_UPLOAD_MB, 24) * 1024 * 1024),
  maxAudioBytes: Math.round(num(process.env.MGE_MAX_AUDIO_MB, 64) * 1024 * 1024),
  maxSheetFrames: 36,

  retentionHours: num(process.env.MGE_RETENTION_HOURS, 0),
  maxDiskGb: num(process.env.MGE_MAX_DISK_GB, 0),
  sweepMinutes: Math.max(1, num(process.env.MGE_SWEEP_MINUTES, 30)),

  accessToken: process.env.MGE_ACCESS_TOKEN || null,
  sessionHours: Math.max(1, num(process.env.MGE_SESSION_HOURS, 720)),

  rateLimitRenders: num(process.env.MGE_RATE_LIMIT_RENDERS, 60),
  rateLimitUploads: num(process.env.MGE_RATE_LIMIT_UPLOADS, 120),
  rateWindowMinutes: Math.max(1, num(process.env.MGE_RATE_WINDOW_MINUTES, 1)),
  trustProxy: process.env.MGE_TRUST_PROXY === '1' ||
    process.env.MGE_TRUST_PROXY === 'true',
});

export const ensureDirs = async () => {
  for (const target of [config.outDir, config.uploadDir, config.stateDir]) {
    await fsp.mkdir(target, { recursive: true });
  }
};

export const migrateLegacyUploads = async (log) => {
  const legacy = path.join(config.publicDir, 'uploads');
  if (legacy === config.uploadDir) return 0;
  if (!fs.existsSync(legacy)) return 0;

  let moved = 0;
  for (const name of await fsp.readdir(legacy)) {
    if (name === '.gitkeep' || name.startsWith('.')) continue;
    const from = path.join(legacy, name);
    const to = path.join(config.uploadDir, name);
    try {
      if (!(await fsp.stat(from)).isFile()) continue;
      if (fs.existsSync(to)) {
        await fsp.rm(from, { force: true });
      } else {
        await fsp.rename(from, to);
      }
      moved += 1;
    } catch (error) {
      log?.('upload.migrate.failed', { name, message: String(error?.message ?? error) });
    }
  }
  return moved;
};

export const ensureRemotionPublicDir = async () => {
  const base = config.remotionPublicDir;
  await fsp.mkdir(base, { recursive: true });

  const links = [
    ['fonts', path.join(config.publicDir, 'fonts')],
    ['brand', path.join(config.publicDir, 'brand')],
    ['uploads', config.uploadDir],
  ];

  for (const [name, target] of links) {
    const link = path.join(base, name);
    let current = null;
    try {
      current = await fsp.readlink(link);
    } catch {}
    if (current === target) continue;
    await fsp.rm(link, { recursive: true, force: true });
    if (fs.existsSync(target)) await fsp.symlink(target, link);
  }

  return base;
};

export { DATA_DIR };
