import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { DATA_DIR, ROOT } from './engine.mjs';
import { unavailable, validationError } from './errors.mjs';

const CACHE_DIR = path.join(DATA_DIR, 'analysis');

const SAMPLE_RATE = 22050;
const WINDOW = 1024;
const HOP = 256;
const MIN_BPM = 60;
const MAX_BPM = 200;
const MAX_SECONDS = 15 * 60;

let resolved = null;

export const resolveFfmpeg = () => {
  if (resolved) return resolved;

  const bundledDir = path.join(
    ROOT, 'node_modules', '@remotion',
    `compositor-${process.platform}-${process.arch}`,
  );

  const candidates = [
    {
      bin: path.join(bundledDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
      env: { ...process.env, DYLD_LIBRARY_PATH: bundledDir, LD_LIBRARY_PATH: bundledDir },
      label: 'bundled with Remotion',
    },
    { bin: 'ffmpeg', env: process.env, label: 'on PATH' },
  ];

  const failures = [];
  for (const candidate of candidates) {
    if (candidate.bin.includes(path.sep) && !fs.existsSync(candidate.bin)) {
      failures.push(`${candidate.label}: not installed`);
      continue;
    }
    const probe = spawnSync(candidate.bin, ['-version'], { env: candidate.env, encoding: 'utf8' });
    if (probe.status === 0) {
      resolved = candidate;
      return resolved;
    }
    failures.push(`${candidate.label}: ${(probe.stderr || probe.error?.message || 'failed to start').split('\n')[0]}`);
  }

  throw unavailable(
    `No usable ffmpeg found. Tried — ${failures.join('; ')}. Install ffmpeg on PATH ` +
      '(e.g. `brew install ffmpeg`) to enable audio analysis.',
  );
};

const parseWav = (buffer) => {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw validationError('ffmpeg produced something that is not a WAV stream.');
  }

  let bitsPerSample = 16;
  let formatTag = 1;
  let offset = 12;
  let data = null;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ') {
      formatTag = buffer.readUInt16LE(body);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (id === 'data') {
      data = buffer.subarray(body, Math.min(body + size, buffer.length));
      break;
    }
    offset = body + size + (size % 2);
  }

  if (!data) throw validationError('The decoded WAV stream has no data chunk.');

  if (formatTag === 3 && bitsPerSample === 32) {
    const samples = new Float32Array(data.length >> 2);
    for (let i = 0; i < samples.length; i++) samples[i] = data.readFloatLE(i * 4);
    return samples;
  }
  if (bitsPerSample === 16) {
    const samples = new Float32Array(data.length >> 1);
    for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
    return samples;
  }

  throw validationError(
    `Unsupported PCM format from ffmpeg (${bitsPerSample}-bit, tag ${formatTag}).`,
  );
};

const decodePcm = (file) => {
  const { bin, env } = resolveFfmpeg();
  let raw;
  try {
    raw = execFileSync(
      bin,
      [
        '-v', 'error',
        '-i', file,
        '-t', String(MAX_SECONDS),
        '-vn',
        '-f', 'wav',
        '-acodec', 'pcm_s16le',
        '-ac', '1',
        '-ar', String(SAMPLE_RATE),
        '-',
      ],
      { env, maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const detail = error.stderr ? String(error.stderr).trim().split('\n').pop() : error.message;
    throw validationError(`ffmpeg could not decode this audio file: ${detail}`, { file: path.basename(file) });
  }

  return parseWav(raw);
};

const fft = (re, im) => {
  const n = re.length;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < half; j++) {
        const ur = re[i + j];
        const ui = im[i + j];
        const xr = re[i + j + half];
        const xi = im[i + j + half];
        const vr = xr * cr - xi * ci;
        const vi = xr * ci + xi * cr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + half] = ur - vr;
        im[i + j + half] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
};

const onsetEnvelope = (samples) => {
  const frames = Math.max(0, Math.floor((samples.length - WINDOW) / HOP) + 1);
  if (frames < 4) return { flux: new Float32Array(0), frames: 0 };

  const window = new Float32Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (WINDOW - 1)));
  }

  const bins = WINDOW >> 1;
  const flux = new Float32Array(frames);
  let previous = new Float32Array(bins);
  const re = new Float32Array(WINDOW);
  const im = new Float32Array(WINDOW);

  for (let f = 0; f < frames; f++) {
    const offset = f * HOP;
    for (let i = 0; i < WINDOW; i++) {
      re[i] = samples[offset + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);

    let sum = 0;
    const current = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      const magnitude = Math.log1p(Math.hypot(re[b], im[b]));
      current[b] = magnitude;
      const delta = magnitude - previous[b];
      if (delta > 0) sum += delta;
    }
    flux[f] = sum;
    previous = current;
  }

  return { flux, frames };
};

const adaptiveThreshold = (flux, radius = 8) => {
  const out = new Float32Array(flux.length);
  for (let i = 0; i < flux.length; i++) {
    const from = Math.max(0, i - radius);
    const to = Math.min(flux.length, i + radius + 1);
    let sum = 0;
    for (let j = from; j < to; j++) sum += flux[j];
    out[i] = Math.max(0, flux[i] - sum / (to - from));
  }
  return out;
};

const estimateTempo = (envelope, framesPerSecond) => {
  const minLag = Math.floor((60 / MAX_BPM) * framesPerSecond);
  const maxLag = Math.ceil((60 / MIN_BPM) * framesPerSecond);
  if (envelope.length < maxLag * 2) return null;

  let bestLag = 0;
  let bestScore = -Infinity;
  let total = 0;
  let count = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < envelope.length; i++) sum += envelope[i] * envelope[i + lag];
    const score = sum / (envelope.length - lag);
    total += score;
    count += 1;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  if (bestLag === 0) return null;
  const mean = total / count;
  const confidence = mean > 0 ? Math.min(1, Math.max(0, (bestScore / mean - 1) / 2)) : 0;

  let bpm = (60 * framesPerSecond) / bestLag;

  let period = bestLag;
  while (bpm < 90 && bpm * 2 <= MAX_BPM) { bpm *= 2; period /= 2; }
  while (bpm > 180 && bpm / 2 >= MIN_BPM) { bpm /= 2; period *= 2; }

  return { period, bpm, confidence };
};

const layBeats = (envelope, period, framesPerSecond, durationSeconds) => {
  const whole = Math.max(1, Math.round(period));
  let bestPhase = 0;
  let bestScore = -Infinity;

  for (let phase = 0; phase < whole; phase++) {
    let score = 0;
    for (let i = phase; i < envelope.length; i += whole) score += envelope[i];
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }

  const beats = [];
  for (let frame = bestPhase; frame < envelope.length; frame += whole) {
    const time = frame / framesPerSecond;
    if (time > durationSeconds) break;
    beats.push({
      time: Number(time.toFixed(3)),
      strength: envelope[frame],
    });
  }

  const loudest = beats.reduce((max, beat) => Math.max(max, beat.strength), 0);
  return beats.map((beat) => ({
    time: beat.time,
    strength: Number((loudest > 0 ? beat.strength / loudest : 0).toFixed(3)),
  }));
};

export const readDuration = (file) => {
  const { bin, env } = resolveFfmpeg();

  const probe = bin.includes(path.sep)
    ? path.join(path.dirname(bin), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
    : 'ffprobe';

  if (!bin.includes(path.sep) || fs.existsSync(probe)) {
    const result = spawnSync(
      probe,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
      { env, encoding: 'utf8' },
    );
    const seconds = Number(String(result.stdout ?? '').trim());
    if (result.status === 0 && Number.isFinite(seconds) && seconds > 0) return seconds;
  }

  const result = spawnSync(bin, ['-hide_banner', '-i', file, '-f', 'null', '-'], {
    env, encoding: 'utf8',
  });
  const match = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(result.stderr ?? '');
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
};

export const cachedAnalysis = async (file) => {
  try {
    const bytes = await fsp.readFile(file);
    const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 16);
    const cacheFile = path.join(CACHE_DIR, `${hash}.json`);
    if (!fs.existsSync(cacheFile)) return null;
    return JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
  } catch {
    return null;
  }
};

export const analyzeAudio = async (file, { force = false } = {}) => {
  if (!fs.existsSync(file)) {
    throw validationError(`No audio file at ${file}.`, { file });
  }

  const bytes = await fsp.readFile(file);
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 16);
  const cacheFile = path.join(CACHE_DIR, `${hash}.json`);

  if (!force && fs.existsSync(cacheFile)) {
    try {
      return JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
    } catch {}
  }

  const samples = decodePcm(file);
  const durationSeconds = samples.length / SAMPLE_RATE;
  if (durationSeconds <= 0) {
    throw validationError('That file decodes to no audio at all.', { file: path.basename(file) });
  }

  const framesPerSecond = SAMPLE_RATE / HOP;
  const { flux, frames } = onsetEnvelope(samples);

  let result;
  if (frames < 8) {
    result = {
      duration: Number(durationSeconds.toFixed(3)),
      sampleRate: SAMPLE_RATE,
      bpm: null,
      confidence: 0,
      quality: 'estimated',
      method: 'spectral-flux + autocorrelation',
      beats: [],
      note: 'Too short to estimate a tempo.',
    };
  } else {
    const envelope = adaptiveThreshold(flux);
    const tempo = estimateTempo(envelope, framesPerSecond);

    result = tempo
      ? {
          duration: Number(durationSeconds.toFixed(3)),
          sampleRate: SAMPLE_RATE,
          bpm: Number(tempo.bpm.toFixed(2)),
          confidence: Number(tempo.confidence.toFixed(3)),
          quality: 'estimated',
          method: 'spectral-flux + autocorrelation + comb-filter phase',
          beats: layBeats(envelope, tempo.period, framesPerSecond, durationSeconds),
        }
      : {
          duration: Number(durationSeconds.toFixed(3)),
          sampleRate: SAMPLE_RATE,
          bpm: null,
          confidence: 0,
          quality: 'estimated',
          method: 'spectral-flux + autocorrelation',
          beats: [],
          note: 'No periodic pulse found — the track may be ambient, rubato or speech.',
        };
  }

  await fsp.mkdir(CACHE_DIR, { recursive: true });
  await fsp.writeFile(cacheFile, JSON.stringify(result));
  return result;
};

export { SAMPLE_RATE, MIN_BPM, MAX_BPM };
