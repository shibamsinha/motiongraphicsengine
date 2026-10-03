const FPS = 30;

const UPLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const BRAND_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const assetSrcProblem = (src) => {
  if (typeof src !== 'string') return 'must be a string';
  if (src === '') return null;

  if (src.length > 256) return 'is too long';
  if (/[%\\]/.test(src)) return 'must not contain percent-encoding or backslashes';
  if (/[\x00-\x1f\x7f]/.test(src)) return 'must not contain control characters';
  if (src.includes('..')) return 'must not contain ".."';
  if (src.includes('//')) return 'must not contain "//"';
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return 'must not be a URL';

  const trimmed = src.startsWith('/') ? src.slice(1) : src;
  const slash = trimmed.indexOf('/');
  if (slash === -1) return 'must be an uploaded asset (uploads/…)';

  const folder = trimmed.slice(0, slash);
  const name = trimmed.slice(slash + 1);

  if (folder === 'uploads') {
    return UPLOAD_NAME.test(name) ? null : 'is not a valid uploaded filename';
  }
  if (folder === 'brand') {
    return BRAND_NAME.test(name) ? null : 'is not a valid brand asset';
  }
  return 'must be an uploaded asset (uploads/…) or a bundled brand asset';
};

class Invalid extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}

const MAX_DEPTH = 24;
const MAX_NODES = 200_000;

const checkTree = (root) => {
  let nodes = 0;
  const walk = (value, depth, path) => {
    if (depth > MAX_DEPTH) throw new Invalid('is nested too deeply', path);
    if ((nodes += 1) > MAX_NODES) throw new Invalid('contains too many values', 'scenes');

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Invalid('must be a finite number', path);
      }
      return;
    }
    if (value === null || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) walk(value[i], depth + 1, `${path}[${i}]`);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const here = path ? `${path}.${key}` : key;
      if (key === 'src') {
        const problem = assetSrcProblem(child);
        if (problem) throw new Invalid(problem, here);
        continue;
      }
      walk(child, depth + 1, here);
    }
  };
  walk(root, 0, '');
};

const secondsToFrames = (seconds) => Math.max(1, Math.round(seconds * FPS));

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const validateRenderBody = (body, config) => {
  try {
    if (!isPlainObject(body)) throw new Invalid('must be a JSON object', 'body');

    const { scenes } = body;
    if (!Array.isArray(scenes)) throw new Invalid('must be an array', 'scenes');
    if (scenes.length === 0) throw new Invalid('must not be empty', 'scenes');
    if (scenes.length > config.maxScenes) {
      throw new Invalid(
        `has ${scenes.length} scenes; the limit is ${config.maxScenes}`,
        'scenes',
      );
    }

    checkTree(body);

    let frames = 0;
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!isPlainObject(scene)) throw new Invalid('must be an object', `scenes[${i}]`);

      const { duration } = scene;
      if (typeof duration !== 'number' || !Number.isFinite(duration)) {
        throw new Invalid('must be a finite number of seconds', `scenes[${i}].duration`);
      }
      if (duration <= 0) {
        throw new Invalid('must be greater than zero', `scenes[${i}].duration`);
      }
      if (duration > config.maxSceneSeconds) {
        throw new Invalid(
          `is ${duration}s; the limit is ${config.maxSceneSeconds}s`,
          `scenes[${i}].duration`,
        );
      }
      frames += secondsToFrames(duration);
    }

    if (frames > config.maxTotalFrames) {
      throw new Invalid(
        `would render ${frames} frames; the limit is ${config.maxTotalFrames}`,
        'scenes',
      );
    }

    if (body.format !== undefined && body.format !== 'portrait' && body.format !== 'landscape') {
      throw new Invalid('must be "portrait" or "landscape"', 'format');
    }
    if (body.palette !== undefined && body.palette !== 'forest' && body.palette !== 'ink') {
      throw new Invalid('must be "forest" or "ink"', 'palette');
    }

    if (body.audio !== undefined && body.audio !== null) {
      const audio = body.audio;
      if (!isPlainObject(audio)) throw new Invalid('must be an object or null', 'audio');
      if (typeof audio.src !== 'string' || audio.src.trim() === '') {
        throw new Invalid('must name an uploaded audio file', 'audio.src');
      }
      const start = audio.sourceStart ?? 0;
      const end = audio.sourceEnd;
      if (typeof start !== 'number' || !Number.isFinite(start) || start < 0) {
        throw new Invalid('must be a non-negative number', 'audio.sourceStart');
      }
      if (typeof end !== 'number' || !Number.isFinite(end)) {
        throw new Invalid('must be a finite number', 'audio.sourceEnd');
      }
      if (end <= start) {
        throw new Invalid('must be greater than audio.sourceStart', 'audio.sourceEnd');
      }
      for (const key of ['timelineStart', 'fadeIn', 'fadeOut']) {
        const value = audio[key];
        if (value === undefined) continue;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          throw new Invalid('must be a non-negative number', `audio.${key}`);
        }
      }
      if (audio.volume !== undefined) {
        const { volume } = audio;
        if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1) {
          throw new Invalid('must be between 0 and 1', 'audio.volume');
        }
      }
    }

    if (body.overlay !== undefined && body.overlay !== null) {
      if (!isPlainObject(body.overlay)) {
        throw new Invalid('must be an object or null', 'overlay');
      }
      if (typeof body.overlay.src !== 'string' || body.overlay.src.trim() === '') {
        throw new Invalid('must name an uploaded image', 'overlay.src');
      }
    }

    return { ok: true, frames, scenes };
  } catch (problem) {
    if (problem instanceof Invalid) {
      return {
        ok: false,
        field: problem.field,
        error: `${problem.field || 'request'} ${problem.message}.`,
      };
    }
    throw problem;
  }
};

export const validateSheetFrames = (frames, totalFrames, config) => {
  if (!Array.isArray(frames) || frames.length === 0) {
    return { ok: false, error: 'frames must be a non-empty array.' };
  }
  if (frames.length > config.maxSheetFrames) {
    return { ok: false, error: `At most ${config.maxSheetFrames} frames in one sheet.` };
  }
  for (const frame of frames) {
    if (typeof frame !== 'number' || !Number.isFinite(frame) || frame < 0) {
      return { ok: false, error: 'frames must be non-negative finite numbers.' };
    }
  }
  return {
    ok: true,
    frames: frames.map((value) =>
      Math.min(Math.max(0, totalFrames - 1), Math.max(0, Math.round(value)))),
  };
};

export { FPS, secondsToFrames };
