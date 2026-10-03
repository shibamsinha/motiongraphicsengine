import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src');

export const DATA_DIR = process.env.MGE_HOME
  ? path.resolve(process.env.MGE_HOME)
  : path.join(ROOT, '.mge');

const CACHE_DIR = path.join(ROOT, '.mge', 'cache');
const ESBUILD = path.join(ROOT, 'node_modules', '.bin', 'esbuild');

const ENTRY_SOURCE = `
export {
  serialiseProject,
  parseProjectScript,
} from ${JSON.stringify(path.join(SRC, 'utils/importScript'))};

export {
  buildTimeline,
  totalFrames,
  totalSeconds,
  sceneFrames,
  secondsToFrames,
  framesToSeconds,
  canvasFor,
  CANVAS_FORMATS,
  MIN_SCENE_DURATION,
  MAX_SCENE_DURATION,
} from ${JSON.stringify(path.join(SRC, 'utils/timing'))};

export {
  blankScene,
  blankElement,
  element,
  makeSceneId,
  makeElementId,
  defaultScenes,
} from ${JSON.stringify(path.join(SRC, 'data/defaultScenes'))};

export {
  TEXT_ROLES,
  SIZE_PRESETS,
  POSITION_PRESETS,
  COMPOSITION_PRESETS,
} from ${JSON.stringify(path.join(SRC, 'utils/composition'))};

export { VISUAL_STYLE_NAMES } from ${JSON.stringify(path.join(SRC, 'utils/visualStyle'))};

export {
  ENTER_NAMES,
  EMPHASIS_NAMES,
  EXIT_NAMES,
} from ${JSON.stringify(path.join(SRC, 'utils/objectMotion'))};

export {
  newObject,
  addObject,
  updateObject,
  removeObject,
  findObject,
  flattenObjects,
  duplicateObject,
  reorderObject,
  objectTitle,
  OBJECT_KIND_LABELS,
} from ${JSON.stringify(path.join(SRC, 'data/objects'))};

export { PRESETS } from ${JSON.stringify(path.join(SRC, 'data/presets'))};

export {
  buildPhraseScenes,
  splitPhrases,
  pacePhrases,
} from ${JSON.stringify(path.join(SRC, 'data/phraseBuild'))};

export {
  DEFAULT_PALETTE,
  DEFAULT_ACCENT,
  PALETTE_NAMES,
  FONT_ROLES,
  FACES,
  faceFor,
  themeFor,
  contrastRatio,
  FIELDS,
} from ${JSON.stringify(path.join(SRC, 'utils/typography'))};

export { ANIMATION_STYLES, MOTION_STYLES } from ${JSON.stringify(path.join(SRC, 'components/motion/registry'))};

export { DEFAULT_FORMAT } from ${JSON.stringify(path.join(SRC, 'utils/timing'))};

export {
  audioSelectionLength,
  defaultSelection,
} from ${JSON.stringify(path.join(SRC, 'types/audio'))};

export {
  saveProject,
  loadProject,
  clearProject,
} from ${JSON.stringify(path.join(SRC, 'utils/persistence'))};
`;

const sourceSignature = async () => {
  const stack = [SRC];
  let newest = 0;
  let count = 0;
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        const stat = await fsp.stat(full);
        newest = Math.max(newest, stat.mtimeMs);
        count += 1;
      }
    }
  }
  return createHash('sha1')
    .update(`${count}:${Math.round(newest)}:${ENTRY_SOURCE.length}`)
    .digest('hex')
    .slice(0, 16);
};

let cached = null;

export const loadEngine = async () => {
  if (cached) return cached;

  const signature = await sourceSignature();
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  const bundlePath = path.join(CACHE_DIR, `engine-${signature}.cjs`);

  if (!fs.existsSync(bundlePath)) {
    const work = await fsp.mkdtemp(path.join(CACHE_DIR, 'build-'));
    const entry = path.join(work, 'entry.ts');
    await fsp.writeFile(entry, ENTRY_SOURCE);
    try {
      execFileSync(
        ESBUILD,
        [
          entry,
          '--bundle',
          '--platform=node',
          '--format=cjs',
          '--loader:.ts=ts',
          '--loader:.tsx=tsx',
          '--log-level=error',
          `--outfile=${bundlePath}`,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
    } finally {
      await fsp.rm(work, { recursive: true, force: true });
    }

    for (const name of await fsp.readdir(CACHE_DIR)) {
      if (name.startsWith('engine-') && name !== path.basename(bundlePath)) {
        await fsp.rm(path.join(CACHE_DIR, name), { force: true });
      }
    }
  }

  cached = require(bundlePath);
  return cached;
};
