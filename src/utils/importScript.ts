import type { VisualStyleConfig, VisualStyleName } from './visualStyle';
import type {
  Alignment,
  CanvasFormat,
  AnimationStyle,
  BackgroundName,
  CompositionPreset,
  OverlayImage,
  PaletteName,
  PositionPreset,
  Scene,
  BackgroundMotion,
  SceneElement,
  TextFit,
  WordStagger,
  SceneImage,
  SizePreset,
  SlideDirection,
  TextCase,
  TextRole,
} from '../types/scene';
import type { FontRole } from './typography';
import { makeElementId, makeSceneId } from '../data/defaultScenes';
import { parseObjects, serialiseObject, type ObjectIssue } from './importObjects';
import {
  CANVAS,
  DEFAULT_FORMAT,
  MAX_SCENE_DURATION,
  MIN_SCENE_DURATION,
  canvasFor,
} from './timing';
import type { FieldOverrides } from './typography';
import type { ProjectAudio } from '../types/audio';

export type ImportSeverity = 'error' | 'warning';

export type ImportIssue = {
  path: string;
  message: string;
  severity: ImportSeverity;
};

export type ImportedProject = {
  title: string | null;
  palette: PaletteName;
  format: CanvasFormat;
  fields: FieldOverrides;
  ink: FieldOverrides;
  accent: string | null;
  overlay: OverlayImage | null;
  audio: ProjectAudio | null;
  scenes: Scene[];
  durationInFrames: number;
  durationSeconds: number;
};

export type ImportResult =
  | { ok: true; project: ImportedProject; issues: ImportIssue[] }
  | { ok: false; issues: ImportIssue[] };

const readFit = (
  raw: unknown,
  fail: (path: string, message: string) => void,
  path: string,
): TextFit | undefined => {
  if (raw === undefined || raw === null) return undefined;

  const fromWidth = (value: unknown): TextFit | undefined => {
    const width = asNumber(value);
    if (width === null) {
      fail(path, 'Expected a fraction of the frame width, e.g. 0.88.');
      return undefined;
    }
    if (width <= 0 || width > 1) {
      fail(path, `Must be between 0 and 1 (got ${width}).`);
      return undefined;
    }
    return { mode: 'width', maxWidth: width };
  };

  if (typeof raw === 'number') return fromWidth(raw);
  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const mode = typeof record.mode === 'string' ? record.mode.toLowerCase() : 'width';
    if (mode !== 'width') {
      fail(path, `Unknown fit mode "${record.mode}". Only WIDTH is supported.`);
      return undefined;
    }
    return fromWidth(record.maxWidth ?? record.width ?? record.value);
  }
  fail(path, 'Expected a number or an object.');
  return undefined;
};

const FONT_ROLE_WORDS: Record<string, FontRole> = {
  primary: 'primary',
  sans: 'primary',
  default: 'primary',
  accent: 'accent',
  serif: 'accent',
  italic: 'accent',
};

const readFontRole = (
  raw: unknown,
  fail: (path: string, message: string) => void,
  path: string,
): FontRole | undefined => {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') {
    fail(path, 'Expected PRIMARY or ACCENT.');
    return undefined;
  }
  const found = FONT_ROLE_WORDS[raw.trim().toLowerCase()];
  if (!found) {
    fail(path, `Unknown font role "${raw}". Use PRIMARY or ACCENT.`);
    return undefined;
  }
  return found;
};

const readStagger = (
  raw: unknown,
  fail: (path: string, message: string) => void,
  path: string,
): WordStagger | undefined => {
  if (raw === undefined || raw === null) return undefined;

  const build = (frames: unknown, order: unknown): WordStagger | undefined => {
    const delayFrames = asNumber(frames);
    if (delayFrames === null) {
      fail(path, 'Expected a number of frames between words.');
      return undefined;
    }
    if (delayFrames < 0) {
      fail(path, `Must not be negative (got ${delayFrames}).`);
      return undefined;
    }
    if (!Number.isInteger(delayFrames)) {
      fail(path, `Must be a whole number of frames (got ${delayFrames}).`);
      return undefined;
    }
    let direction: 'forward' | 'reverse' | undefined;
    if (order !== undefined && order !== null) {
      const word = String(order).trim().toLowerCase();
      if (word === 'forward' || word === 'reverse') direction = word;
      else {
        fail(`${path}.order`, `Unknown order "${order}". Use FORWARD or REVERSE.`);
        return undefined;
      }
    }
    return {
      type: 'word',
      delayFrames,
      ...(direction && direction !== 'forward' ? { order: direction } : {}),
    };
  };

  if (typeof raw === 'number') return build(raw, undefined);
  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type.toLowerCase() : 'word';
    if (type !== 'word') {
      fail(path, `Unknown stagger type "${record.type}". Only WORD is supported.`);
      return undefined;
    }
    return build(record.delayFrames ?? record.frames ?? record.delay, record.order);
  }
  fail(path, 'Expected a number or an object.');
  return undefined;
};

const readBackgroundMotion = (
  raw: unknown,
  fail: (path: string, message: string) => void,
  path: string,
): BackgroundMotion | undefined => {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') {
    fail(path, 'Expected an object such as { "mode": "ALTERNATE", "everyFrames": 4 }.');
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const mode = typeof record.mode === 'string' ? record.mode.toLowerCase() : 'alternate';
  if (mode !== 'alternate') {
    fail(path, `Unknown background mode "${record.mode}". Only ALTERNATE is supported.`);
    return undefined;
  }
  const everyFrames = asNumber(record.everyFrames ?? record.every ?? record.frames);
  if (everyFrames === null || everyFrames < 1 || !Number.isInteger(everyFrames)) {
    fail(`${path}.everyFrames`, 'Expected a whole number of frames, at least 1.');
    return undefined;
  }
  const times = asNumber(record.times);
  if (times !== null && (times < 0 || !Number.isInteger(times))) {
    fail(`${path}.times`, 'Expected a whole, non-negative number of flips.');
    return undefined;
  }
  return {
    mode: 'alternate',
    everyFrames,
    ...(times !== null ? { times } : {}),
  };
};

const STYLES: Record<string, AnimationStyle> = {
  massive: 'massive',
  punch: 'punch',
  stack: 'stack',
  slide: 'slide',
  rapid: 'rapid',
  none: 'none',
  static: 'none',
  hold: 'none',
};

const BACKGROUNDS: Record<string, BackgroundName> = {
  green: 'green',
  cream: 'cream',
  black: 'black',
};

const FORMATS: Record<string, CanvasFormat> = {
  portrait: 'portrait',
  vertical: 'portrait',
  '9:16': 'portrait',
  landscape: 'landscape',
  horizontal: 'landscape',
  wide: 'landscape',
  '16:9': 'landscape',
};

const ALIGNMENTS: Record<string, Alignment> = {
  left: 'left',
  center: 'center',
  centre: 'center',
  right: 'right',
};

const DIRECTIONS: Record<string, SlideDirection | null> = {
  left: 'left',
  right: 'right',
  top: 'top',
  up: 'top',
  bottom: 'bottom',
  down: 'bottom',
  center: null,
  centre: null,
  none: null,
};

const CASES: Record<string, TextCase> = {
  lower: 'lower',
  lowercase: 'lower',
  upper: 'upper',
  uppercase: 'upper',
  'as-typed': 'as-typed',
  astyped: 'as-typed',
  typed: 'as-typed',
  original: 'as-typed',
  none: 'as-typed',
};

const ROLES: Record<string, TextRole> = {
  primary: 'primary',
  secondary: 'secondary',
  emphasis: 'emphasis',
  support: 'support',
};

const SIZES: Record<string, SizePreset> = {
  xs: 'xs',
  small: 'small',
  medium: 'medium',
  large: 'large',
  huge: 'huge',
  oversized: 'oversized',
};

const POSITIONS: Record<string, PositionPreset> = {
  'top-left': 'top-left',
  'top-center': 'top-center',
  'top-centre': 'top-center',
  'top-right': 'top-right',
  'center-left': 'center-left',
  'centre-left': 'center-left',
  center: 'center',
  centre: 'center',
  'center-right': 'center-right',
  'centre-right': 'center-right',
  'bottom-left': 'bottom-left',
  'bottom-center': 'bottom-center',
  'bottom-centre': 'bottom-center',
  'bottom-right': 'bottom-right',
  'edge-left': 'edge-left',
  'edge-right': 'edge-right',
  'edge-top': 'edge-top',
  'edge-bottom': 'edge-bottom',
  'offscreen-left': 'offscreen-left',
  'offscreen-right': 'offscreen-right',
  'offscreen-top': 'offscreen-top',
  'offscreen-bottom': 'offscreen-bottom',
};

const VISUAL_STYLES_IN: Record<string, VisualStyleName> = {
  solid: 'solid',
  outline: 'outline',
  gradient: 'gradient',
  split: 'split',
};

const COMPOSITIONS_IN: Record<string, CompositionPreset> = {
  center: 'center',
  centre: 'center',
  'left-stack': 'left-stack',
  'right-stack': 'right-stack',
  'top-statement': 'top-statement',
  'bottom-statement': 'bottom-statement',
  split: 'split',
  'oversized-center': 'oversized-center',
  'oversized-centre': 'oversized-center',
  corner: 'corner',
};

const vocab = (value: string): string =>
  value.trim().toLowerCase().replace(/[\s_]+/g, '-');

const canon = (record: Record<string, string>): string =>
  [...new Set(Object.values(record))].join(', ');

const PLACEMENTS = new Set(['full', 'panel', 'split']);
const SIDES = new Set(['top', 'bottom']);

const list = (record: Record<string, unknown>): string =>
  [...new Set(Object.keys(record))].join(', ');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const normaliseHex = (value: string): string | null => {
  const match = HEX.exec(value.trim());
  if (!match) return null;
  const body = match[1];
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body;
  return `#${full.toUpperCase()}`;
};

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const readStyleConfig = (
  raw: unknown,
  path: string,
  type: VisualStyleName | undefined,
  push: (issue: ImportIssue) => void,
): { config?: VisualStyleConfig; failed: boolean } => {
  if (raw === undefined || raw === null) return { failed: false };
  if (!isRecord(raw)) {
    push({ path, message: 'Must be an object of style settings.', severity: 'error' });
    return { failed: true };
  }

  let failed = false;
  const declared = asString(raw.type);
  let resolved = type;
  if (declared !== null && declared.trim() !== '') {
    const found = VISUAL_STYLES_IN[vocab(declared)];
    if (!found) {
      push({
        path: `${path}.type`,
        message: `"${declared}" is not a valid visual style. Expected one of: ${canon(VISUAL_STYLES_IN)}.`,
        severity: 'error',
      });
      failed = true;
    } else resolved = found;
  }

  const config: VisualStyleConfig = { type: resolved ?? 'solid' };
  const fill = asString(raw.fillColor ?? raw.color);
  if (fill) config.fillColor = fill.trim();
  const strokeColor = asString(raw.strokeColor);
  if (strokeColor) config.strokeColor = strokeColor.trim();

  const strokeWidth = asNumber(raw.strokeWidth);
  if (strokeWidth !== null) {
    if (strokeWidth <= 0) {
      push({ path: `${path}.strokeWidth`, message: `Must be greater than zero (got ${strokeWidth}).`, severity: 'error' });
      failed = true;
    } else {
      if (strokeWidth > 1) {
        push({
          path: `${path}.strokeWidth`,
          message: `${strokeWidth} is a fraction of the type size, not pixels — read as ${(strokeWidth / 100).toFixed(3)}.`,
          severity: 'warning',
        });
        config.strokeWidth = strokeWidth / 100;
      } else config.strokeWidth = strokeWidth;
    }
  }

  const opacity = asNumber(raw.opacity);
  if (opacity !== null) {
    if (opacity < 0 || opacity > 1) {
      push({ path: `${path}.opacity`, message: `Must be between 0 and 1 (got ${opacity}).`, severity: 'error' });
      failed = true;
    } else config.opacity = opacity;
  }

  const splitBy = asString(raw.splitBy);
  if (splitBy) {
    const key = vocab(splitBy);
    if (key !== 'auto' && key !== 'word' && key !== 'letter') {
      push({ path: `${path}.splitBy`, message: `"${splitBy}" is not a split unit. Expected one of: auto, word, letter.`, severity: 'error' });
      failed = true;
    } else config.splitBy = key;
  }

  if (raw.gradient !== undefined && raw.gradient !== null) {
    if (!isRecord(raw.gradient) || !Array.isArray(raw.gradient.colors)) {
      push({ path: `${path}.gradient`, message: 'Must be an object with a `colors` array.', severity: 'error' });
      failed = true;
    } else {
      const colors = raw.gradient.colors.filter((c): c is string => typeof c === 'string');
      if (colors.length === 0) {
        push({ path: `${path}.gradient.colors`, message: 'Needs at least one colour.', severity: 'error' });
        failed = true;
      } else {
        config.gradient = { colors, angle: asNumber(raw.gradient.angle) ?? 90 };
      }
    }
  }

  if (Array.isArray(raw.parts)) {
    const parts: VisualStyleConfig[] = [];
    raw.parts.forEach((part, index) => {
      const read = readStyleConfig(part, `${path}.parts[${index}]`, undefined, push);
      if (read.failed) failed = true;
      else if (read.config) parts.push(read.config);
    });
    if (parts.length > 0) config.parts = parts;
  }

  return { config, failed };
};

const readAudio = (
  raw: unknown,
  push: (issue: ImportIssue) => void,
): { audio: ProjectAudio | null; failed: boolean } => {
  if (raw === undefined || raw === null) return { audio: null, failed: false };
  const fail = (field: string, message: string) => {
    push({ path: `audio.${field}`, message, severity: 'error' });
  };

  if (!isRecord(raw)) {
    push({ path: 'audio', message: 'Must be an object with at least a `src`.', severity: 'error' });
    return { audio: null, failed: true };
  }

  const src = asString(raw.src ?? raw.url ?? raw.source);
  if (src === null || src.trim() === '') {
    fail('src', 'Missing. An audio track needs a `src` path or URL.');
    return { audio: null, failed: true };
  }

  const sourceStart = Math.max(0, asNumber(raw.sourceStart) ?? 0);
  const sourceEnd = asNumber(raw.sourceEnd);
  if (sourceEnd === null) {
    fail('sourceEnd', 'Missing. Say where the selected section of the file ends, in seconds.');
    return { audio: null, failed: true };
  }
  if (sourceEnd <= sourceStart) {
    fail('sourceEnd', `Must be after sourceStart (${sourceStart}s).`);
    return { audio: null, failed: true };
  }

  const volume = asNumber(raw.volume);
  if (volume !== null && (volume < 0 || volume > 1)) {
    push({ path: 'audio.volume', message: `${volume} is outside 0–1 — clamped.`, severity: 'warning' });
  }

  return {
    audio: {
      src: src.trim(),
      ...(asString(raw.name) ? { name: asString(raw.name)!.trim() } : {}),
      ...(asNumber(raw.sourceDuration) ? { sourceDuration: asNumber(raw.sourceDuration)! } : {}),
      sourceStart,
      sourceEnd,
      timelineStart: Math.max(0, asNumber(raw.timelineStart) ?? 0),
      volume: Math.min(1, Math.max(0, volume ?? 1)),
      ...(raw.muted === true ? { muted: true } : {}),
      ...((asNumber(raw.fadeIn) ?? 0) > 0 ? { fadeIn: asNumber(raw.fadeIn)! } : {}),
      ...((asNumber(raw.fadeOut) ?? 0) > 0 ? { fadeOut: asNumber(raw.fadeOut)! } : {}),
      ...(raw.loop === true ? { loop: true } : {}),
    },
    failed: false,
  };
};

const readWordColors = (
  raw: unknown,
  path: string,
  push: (issue: ImportIssue) => void,
): Record<string, string> | undefined => {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    push({ path, message: 'Expected an object of word → colour.', severity: 'warning' });
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [word, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || value.trim() === '') {
      push({ path: `${path}.${word}`, message: 'Expected a colour string — ignored.', severity: 'warning' });
      continue;
    }
    out[word.toLowerCase()] = value.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const readOverlay = (
  raw: unknown,
  push: (issue: ImportIssue) => void,
): { overlay: OverlayImage | null; failed: boolean } => {
  if (raw === undefined || raw === null) return { overlay: null, failed: false };
  const fail = (field: string, message: string) => {
    push({ path: `overlay.${field}`, message, severity: 'error' });
  };

  if (!isRecord(raw)) {
    push({
      path: 'overlay',
      message: 'Must be an object with at least a `src`.',
      severity: 'error',
    });
    return { overlay: null, failed: true };
  }

  const src = asString(raw.src ?? raw.url);
  if (src === null || src.trim() === '') {
    fail('src', 'Missing. A static image needs a `src` path or URL.');
    return { overlay: null, failed: true };
  }

  const fit = asString(raw.fit)?.trim().toLowerCase();
  if (fit !== undefined && fit !== 'contain' && fit !== 'cover') {
    fail('fit', `"${fit}" is not a fit. Expected one of: contain, cover.`);
    return { overlay: null, failed: true };
  }

  const opacity = asNumber(raw.opacity);
  if (opacity !== null && (opacity < 0 || opacity > 1)) {
    fail('opacity', `Must be between 0 and 1 (got ${opacity}).`);
    return { overlay: null, failed: true };
  }

  return {
    overlay: {
      src: src.trim(),
      x: asNumber(raw.x) ?? 0.08,
      y: asNumber(raw.y) ?? 0.05,
      width: Math.max(0.03, asNumber(raw.width) ?? 0.26),
      height: Math.max(0.03, asNumber(raw.height) ?? 0.09),
      fit: (fit as OverlayImage['fit']) ?? 'contain',
      opacity: opacity ?? 1,
    },
    failed: false,
  };
};

type RawScene = Record<string, unknown>;

const readElement = (
  raw: unknown,
  sceneIndex: number,
  index: number,
  push: (issue: ImportIssue) => void,
): SceneElement | null => {
  const at = (field: string) => `scenes[${sceneIndex}].elements[${index}].${field}`;
  let failed = false;
  const fail = (field: string, message: string) => {
    push({ path: at(field), message, severity: 'error' });
    failed = true;
  };

  if (!isRecord(raw)) {
    push({
      path: `scenes[${sceneIndex}].elements[${index}]`,
      message: 'Must be an object with at least a `text`.',
      severity: 'error',
    });
    return null;
  }

  const text = asString(raw.text ?? raw.copy ?? raw.line);
  if (text === null || text.trim() === '') {
    fail('text', 'Missing or empty. Every element needs a `text` string.');
  }

  const element: SceneElement = {
    id: asString(raw.id)?.trim() || `${sceneIndex}-${index}`,
    text: (text ?? '').trim(),
  };

  const elementWordColors = readWordColors(
    raw.wordColors,
    `scenes[${sceneIndex}].elements[${index}].wordColors`,
    push,
  );
  if (elementWordColors) element.wordColors = elementWordColors;

  const enumField = <T extends string>(
    field: string,
    value: unknown,
    table: Record<string, T>,
    label: string,
  ): T | undefined => {
    const rawValue = asString(value);
    if (rawValue === null || rawValue.trim() === '') return undefined;
    const found = table[vocab(rawValue)];
    if (!found) {
      fail(field, `"${rawValue}" is not a valid ${label}. Expected one of: ${canon(table)}.`);
      return undefined;
    }
    return found;
  };

  const role = enumField('role', raw.role, ROLES, 'role');
  if (role) element.role = role;
  const size = enumField('size', raw.size, SIZES, 'size');
  if (size) element.size = size;
  const position = enumField('position', raw.position, POSITIONS, 'position');
  if (position) element.position = position;
  const from = enumField('from', raw.from, POSITIONS, 'position');
  if (from) element.from = from;
  const animation = enumField('animation', raw.animation ?? raw.style, STYLES, 'animation');
  if (animation) element.animation = animation;
  const align = enumField('align', raw.align ?? raw.alignment, ALIGNMENTS, 'alignment');
  if (align) element.align = align;
  const textCase = enumField('case', raw.case ?? raw.textCase, CASES, 'case');
  if (textCase) element.case = textCase;

  const visual = enumField(
    'visualStyle',
    raw.visualStyle ?? raw.style,
    VISUAL_STYLES_IN,
    'visual style',
  );
  if (visual) element.visualStyle = visual;
  const styleConfig = readStyleConfig(
    raw.styleConfig,
    at('styleConfig'),
    visual,
    push,
  );
  if (styleConfig.failed) failed = true;
  else if (styleConfig.config) element.styleConfig = styleConfig.config;

  const scale = asNumber(raw.scale ?? raw.fontSize);
  if (scale !== null) {
    if (scale <= 0) fail('scale', `Must be greater than zero (got ${scale}).`);
    else element.scale = scale;
  }

  const delay = asNumber(raw.delay);
  if (delay !== null) {
    if (delay < 0) fail('delay', `Must not be negative (got ${delay}).`);
    else element.delay = delay;
  }

  const rawExit = asString(raw.exit);
  if (rawExit !== null && rawExit.trim() !== '') {
    const found = STYLES[vocab(rawExit)];
    if (!found) fail('exit', `"${rawExit}" is not a valid exit. Expected one of: ${canon(STYLES)}.`);
    else element.exit = found;
  }

  const elementStagger = readStagger(raw.stagger, fail, 'stagger');
  if (elementStagger) element.stagger = elementStagger;

  const elementFit = readFit(raw.fit ?? raw.fitWidth, fail, 'fit');
  if (elementFit) element.fit = elementFit;

  const elementFace = readFontRole(raw.fontRole ?? raw.face, fail, 'fontRole');
  if (elementFace) element.fontRole = elementFace;

  const enterFrames = asNumber(raw.enterFrames);
  if (enterFrames !== null) {
    if (enterFrames < 1) fail('enterFrames', `Must be at least one frame (got ${enterFrames}).`);
    else if (!Number.isInteger(enterFrames))
      fail('enterFrames', `Must be a whole number of frames (got ${enterFrames}).`);
    else element.enterFrames = enterFrames;
  }

  const rawEmphasis = raw.emphasis;
  if (Array.isArray(rawEmphasis)) {
    element.emphasis = rawEmphasis.filter((w): w is string => typeof w === 'string');
  } else if (typeof rawEmphasis === 'string') {
    element.emphasis = rawEmphasis.split(/\s+/).filter(Boolean);
  }

  const x = asNumber(raw.x);
  const y = asNumber(raw.y);
  if ((x === null) !== (y === null)) {
    fail('x/y', 'Manual placement needs both `x` and `y`, as fractions of the frame.');
  } else if (x !== null && y !== null) {
    element.x = x;
    element.y = y;
  }

  return failed ? null : element;
};

const readScene = (
  raw: RawScene,
  index: number,
  push: (issue: ImportIssue) => void,
): { scene: Scene; declaredStart: number | null } | null => {
  const at = (field: string) => `scenes[${index}].${field}`;
  let failed = false;
  const fail = (field: string, message: string) => {
    push({ path: at(field), message, severity: 'error' });
    failed = true;
  };

  let elements: SceneElement[] | undefined;
  if (raw.elements !== undefined && raw.elements !== null) {
    if (!Array.isArray(raw.elements)) {
      fail('elements', 'Must be an array of text elements.');
    } else if (raw.elements.length === 0) {
      fail('elements', 'Empty. Drop the field, or give the scene something to show.');
    } else {
      const read = raw.elements.map((entry, entryIndex) =>
        readElement(entry, index, entryIndex, push),
      );
      if (read.every((entry): entry is SceneElement => entry !== null)) {
        elements = read;
      } else {
        failed = true;
      }
    }
  }

  let composition: CompositionPreset | undefined;
  const rawComposition = asString(raw.composition ?? raw.layout);
  if (rawComposition !== null && rawComposition.trim() !== '') {
    const found = COMPOSITIONS_IN[vocab(rawComposition)];
    if (!found)
      fail(
        'composition',
        `"${rawComposition}" is not a valid composition. Expected one of: ${canon(COMPOSITIONS_IN)}.`,
      );
    else composition = found;
  }
  if (composition !== undefined && elements === undefined && !failed) {
    push({
      path: at('composition'),
      message:
        'A composition only has an effect on a scene with `elements` — ignored here.',
      severity: 'warning',
    });
  }

  let visualStyle: VisualStyleName | undefined;
  const rawVisual = asString(raw.visualStyle);
  if (rawVisual !== null && rawVisual.trim() !== '') {
    const found = VISUAL_STYLES_IN[vocab(rawVisual)];
    if (!found)
      fail(
        'visualStyle',
        `"${rawVisual}" is not a valid visual style. Expected one of: ${canon(VISUAL_STYLES_IN)}.`,
      );
    else visualStyle = found;
  }
  const sceneStyleConfig = readStyleConfig(
    raw.styleConfig,
    at('styleConfig'),
    visualStyle,
    push,
  );
  if (sceneStyleConfig.failed) failed = true;

  const objectIssues: ObjectIssue[] = [];
  const objects = parseObjects(raw.objects, at('objects'), objectIssues, makeElementId);
  for (const issue of objectIssues) {
    push(issue);
    if (issue.severity === 'error') failed = true;
  }

  const suppliedElements = Array.isArray(raw.elements) && raw.elements.length > 0;
  const suppliedObjects = objects !== null && objects.length > 0;
  const text = asString(raw.text ?? raw.copy ?? raw.line);
  const derived = elements?.map((element) => element.text).join('\n') ?? null;
  if (!suppliedElements && !suppliedObjects) {
    if (text === null)
      fail('text', 'Missing. Every scene needs a `text` string, `elements`, or `objects`.');
    else if (text.trim() === '')
      fail('text', 'Empty. A scene needs words, elements or objects to render.');
  }

  const rawStyle = asString(raw.animation ?? raw.style);
  let style: AnimationStyle = 'punch';
  if (rawStyle === null) {
    fail('animation', `Missing. Expected one of: ${list(STYLES)}.`);
  } else {
    const found = STYLES[rawStyle.trim().toLowerCase()];
    if (!found)
      fail(
        'animation',
        `"${rawStyle}" is not an animation. Expected one of: ${list(STYLES)}.`,
      );
    else style = found;
  }

  const rawBackground = asString(raw.background ?? raw.field);
  let background: BackgroundName = 'green';
  if (rawBackground === null) {
    fail('background', `Missing. Expected one of: ${list(BACKGROUNDS)}.`);
  } else {
    const found = BACKGROUNDS[rawBackground.trim().toLowerCase()];
    if (!found)
      fail(
        'background',
        `"${rawBackground}" is not a background. Expected one of: ${list(BACKGROUNDS)}.`,
      );
    else background = found;
  }

  let alignment: Alignment = 'center';
  const rawAlignment = asString(raw.alignment ?? raw.align);
  if (rawAlignment !== null) {
    const found = ALIGNMENTS[rawAlignment.trim().toLowerCase()];
    if (!found)
      fail(
        'alignment',
        `"${rawAlignment}" is not an alignment. Expected one of: ${list(ALIGNMENTS)}.`,
      );
    else alignment = found;
  }

  let direction: SlideDirection | undefined;
  const rawDirection = asString(raw.direction);
  if (rawDirection !== null && rawDirection.trim() !== '') {
    const key = rawDirection.trim().toLowerCase();
    if (!(key in DIRECTIONS)) {
      fail(
        'direction',
        `"${rawDirection}" is not a direction. Expected one of: ${list(DIRECTIONS)}.`,
      );
    } else {
      direction = DIRECTIONS[key] ?? undefined;
      if (style === 'slide' && direction === undefined) {
        push({
          path: at('direction'),
          message: `SLIDE has no travel with direction "${rawDirection}" — falling back to BOTTOM.`,
          severity: 'warning',
        });
      }
    }
  }

  const declaredStart = asNumber(raw.start);
  let duration = asNumber(raw.duration ?? raw.seconds ?? raw.length);
  if (duration === null) {
    fail('duration', 'Missing. Every scene needs a `duration` in seconds.');
  } else if (duration <= 0) {
    fail('duration', `Must be greater than zero (got ${duration}).`);
  } else {
    if (duration < MIN_SCENE_DURATION) {
      push({
        path: at('duration'),
        message: `${duration}s is below the ${MIN_SCENE_DURATION}s minimum — clamped.`,
        severity: 'warning',
      });
      duration = MIN_SCENE_DURATION;
    }
    if (duration > MAX_SCENE_DURATION) {
      push({
        path: at('duration'),
        message: `${duration}s is above the ${MAX_SCENE_DURATION}s maximum — clamped.`,
        severity: 'warning',
      });
      duration = MAX_SCENE_DURATION;
    }
  }

  const emphasis: string[] = [];
  const sceneWordColors = readWordColors(raw.wordColors, at('wordColors'), push);

  const rawEmphasis = raw.emphasis ?? raw.emphasise ?? raw.emphasize;
  if (rawEmphasis !== undefined && rawEmphasis !== null) {
    const entries = Array.isArray(rawEmphasis)
      ? rawEmphasis
      : typeof rawEmphasis === 'string'
        ? [rawEmphasis]
        : null;
    if (entries === null) {
      fail('emphasis', 'Must be an array of words or phrases.');
    } else {
      entries.forEach((entry, entryIndex) => {
        const value = asString(entry);
        if (value === null) {
          push({
            path: `${at('emphasis')}[${entryIndex}]`,
            message: 'Must be a string.',
            severity: 'warning',
          });
          return;
        }
        value
          .split(/\s+/)
          .map((word) => word.trim())
          .filter(Boolean)
          .forEach((word) => {
            if (!emphasis.includes(word)) emphasis.push(word);
          });
      });
    }
  }

  let textCase: TextCase = 'as-typed';
  const rawCase = asString(raw.case ?? raw.textCase);
  if (rawCase !== null) {
    const found = CASES[rawCase.trim().toLowerCase()];
    if (!found)
      fail('case', `"${rawCase}" is not a case. Expected one of: ${list(CASES)}.`);
    else textCase = found;
  }

  let fontSize: number | undefined;
  const rawScale = asNumber(raw.scale ?? raw.fontSize ?? raw.typeScale);
  if (rawScale !== null) {
    if (rawScale <= 0) fail('scale', `Must be greater than zero (got ${rawScale}).`);
    else fontSize = rawScale;
  }

  let sceneExit: AnimationStyle | undefined;
  const rawSceneExit = asString(raw.exit);
  if (rawSceneExit !== null && rawSceneExit.trim() !== '') {
    const found = STYLES[vocab(rawSceneExit)];
    if (!found) fail('exit', `"${rawSceneExit}" is not a valid exit. Expected one of: ${canon(STYLES)}.`);
    else sceneExit = found;
  }

  let sceneExitFrames: number | undefined;
  const rawExitFrames = asNumber(raw.exitFrames);
  if (rawExitFrames !== null) {
    if (rawExitFrames < 0) fail('exitFrames', `Must not be negative (got ${rawExitFrames}).`);
    else if (!Number.isInteger(rawExitFrames))
      fail('exitFrames', `Must be a whole number of frames (got ${rawExitFrames}).`);
    else sceneExitFrames = rawExitFrames;
  }

  const sceneStagger = readStagger(raw.stagger, fail, 'stagger');
  const sceneBackgroundMotion = readBackgroundMotion(raw.backgroundMotion, fail, 'backgroundMotion');

  const sceneFit = readFit(raw.fit ?? raw.fitWidth, fail, 'fit');
  const sceneFace = readFontRole(raw.fontRole ?? raw.face, fail, 'fontRole');

  let sceneEnterFrames: number | undefined;
  const rawEnter = asNumber(raw.enterFrames);
  if (rawEnter !== null) {
    if (rawEnter < 1) fail('enterFrames', `Must be at least one frame (got ${rawEnter}).`);
    else if (!Number.isInteger(rawEnter))
      fail('enterFrames', `Must be a whole number of frames (got ${rawEnter}).`);
    else sceneEnterFrames = rawEnter;
  }

  const flipBackground =
    typeof raw.flipBackground === 'boolean' ? raw.flipBackground : undefined;

  const hideOverlay = raw.hideOverlay === true ? true : undefined;

  let image: SceneImage | undefined;
  if (raw.image !== undefined && raw.image !== null) {
    if (!isRecord(raw.image)) {
      fail('image', 'Must be an object with at least a `src`.');
    } else {
      const src = asString(raw.image.src ?? raw.image.url);
      const placement = (asString(raw.image.placement) ?? 'full').trim().toLowerCase();
      const side = (asString(raw.image.side) ?? 'top').trim().toLowerCase();
      if (src === null || src.trim() === '') {
        fail('image.src', 'Missing. An image needs a `src` path or URL.');
      } else if (!PLACEMENTS.has(placement)) {
        fail(
          'image.placement',
          `"${placement}" is not a placement. Expected one of: ${[...PLACEMENTS].join(', ')}.`,
        );
      } else if (!SIDES.has(side)) {
        fail('image.side', `"${side}" is not a side. Expected one of: ${[...SIDES].join(', ')}.`);
      } else {
        image = {
          src: src.trim(),
          placement: placement as SceneImage['placement'],
          side: side as SceneImage['side'],
          ...(asNumber(raw.image.size) !== null ? { size: asNumber(raw.image.size)! } : {}),
          ...(asNumber(raw.image.scrim) !== null ? { scrim: asNumber(raw.image.scrim)! } : {}),
          ...(asNumber(raw.image.focusX) !== null ? { focusX: asNumber(raw.image.focusX)! } : {}),
          ...(asNumber(raw.image.focusY) !== null ? { focusY: asNumber(raw.image.focusY)! } : {}),
        };
      }
    }
  }

  if (failed) return null;

  const note = asString(raw.visualNote ?? raw.note ?? raw.direction_note);
  const id = asString(raw.id);

  return {
    declaredStart,
    scene: {
      id: id && id.trim() ? id.trim() : makeSceneId(),
      duration: duration as number,
      text: (text ?? derived ?? '').trim(),
      style,
      background,
      alignment,
      emphasis,
      ...(sceneWordColors ? { wordColors: sceneWordColors } : {}),
      case: textCase,
      ...(composition !== undefined ? { composition } : {}),
      ...(visualStyle !== undefined ? { visualStyle } : {}),
      ...(sceneStyleConfig.config !== undefined
        ? { styleConfig: sceneStyleConfig.config }
        : {}),
      ...(elements !== undefined ? { elements } : {}),
      ...(fontSize !== undefined ? { fontSize } : {}),
      ...(sceneEnterFrames !== undefined ? { enterFrames: sceneEnterFrames } : {}),
      ...(sceneExit ? { exit: sceneExit } : {}),
      ...(sceneExitFrames !== undefined ? { exitFrames: sceneExitFrames } : {}),
      ...(sceneStagger ? { stagger: sceneStagger } : {}),
      ...(sceneBackgroundMotion ? { backgroundMotion: sceneBackgroundMotion } : {}),
      ...(sceneFit ? { fit: sceneFit } : {}),
      ...(sceneFace ? { fontRole: sceneFace } : {}),
      ...(direction !== undefined ? { direction } : {}),
      ...(flipBackground !== undefined ? { flipBackground } : {}),
      ...(hideOverlay !== undefined ? { hideOverlay } : {}),
      ...(image !== undefined ? { image } : {}),
      ...(note && note.trim() ? { note: note.trim() } : {}),
      ...(objects && objects.length > 0 ? { objects } : {}),
    },
  };
};

const snapToFrames = (scenes: Scene[], fps: number): Scene[] => {
  let elapsed = 0;
  let placed = 0;
  return scenes.map((scene) => {
    elapsed += scene.duration;
    const boundary = Math.round(elapsed * fps);
    const frames = Math.max(1, boundary - placed);
    placed += frames;
    return { ...scene, duration: round3(frames / fps) };
  });
};

export const parseProjectScript = (input: string): ImportResult => {
  const issues: ImportIssue[] = [];
  const push = (issue: ImportIssue) => issues.push(issue);
  const errors = () => issues.filter((issue) => issue.severity === 'error');

  if (input.trim() === '') {
    return {
      ok: false,
      issues: [{ path: '', message: 'Nothing to import.', severity: 'error' }],
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          path: '',
          message: `Not valid JSON — ${
            error instanceof Error ? error.message : String(error)
          }`,
          severity: 'error',
        },
      ],
    };
  }

  const doc: Record<string, unknown> = Array.isArray(raw) ? { scenes: raw } : isRecord(raw) ? raw : {};

  if (!isRecord(raw) && !Array.isArray(raw)) {
    return {
      ok: false,
      issues: [
        {
          path: '',
          message: 'Expected an object with a `scenes` array (or a bare array of scenes).',
          severity: 'error',
        },
      ],
    };
  }

  const rawScenes = doc.scenes;
  if (!Array.isArray(rawScenes)) {
    return {
      ok: false,
      issues: [{ path: 'scenes', message: 'Missing or not an array.', severity: 'error' }],
    };
  }
  if (rawScenes.length === 0) {
    return {
      ok: false,
      issues: [{ path: 'scenes', message: 'Empty — there is nothing to render.', severity: 'error' }],
    };
  }

  const width = asNumber(doc.width);
  const height = asNumber(doc.height);
  const fps = asNumber(doc.fps);

  let format: CanvasFormat = DEFAULT_FORMAT;
  const rawFormat = asString(doc.format ?? doc.orientation);
  if (rawFormat !== null && rawFormat.trim() !== '') {
    const found = FORMATS[vocab(rawFormat)];
    if (!found) {
      push({
        path: 'format',
        message: `"${rawFormat}" is not a valid format. Expected one of: ${canon(FORMATS)}.`,
        severity: 'error',
      });
    } else format = found;
  } else if (width !== null && height !== null) {
    format = width >= height ? 'landscape' : 'portrait';
  }

  const canvas = canvasFor(format);
  if (width !== null && height !== null) {
    const declared = width / height;
    const engine = canvas.width / canvas.height;
    if (Math.abs(declared - engine) > 0.01) {
      push({
        path: 'width/height',
        message: `${width}×${height} is not ${format === 'landscape' ? '16:9' : '9:16'} — the reel will still render at ${canvas.width}×${canvas.height}.`,
        severity: 'warning',
      });
    } else if (width !== canvas.width || height !== canvas.height) {
      push({
        path: 'width/height',
        message: `${width}×${height} scaled to ${canvas.width}×${canvas.height} (same aspect).`,
        severity: 'warning',
      });
    }
  }
  if (fps !== null && fps !== canvas.fps) {
    push({
      path: 'fps',
      message: `${fps}fps requested — the engine renders at ${canvas.fps}fps, and durations are mapped onto that grid.`,
      severity: 'warning',
    });
  }

  const fields: FieldOverrides = {};
  const rawPalette = doc.backgroundPalette ?? doc.palette ?? doc.colors ?? doc.colours;
  if (rawPalette !== undefined && rawPalette !== null) {
    if (!isRecord(rawPalette)) {
      push({
        path: 'backgroundPalette',
        message: 'Must be an object of field name → hex colour.',
        severity: 'warning',
      });
    } else {
      Object.entries(rawPalette).forEach(([key, value]) => {
        const name = BACKGROUNDS[key.trim().toLowerCase()];
        const hexValue = asString(value);
        if (!name) {
          push({
            path: `backgroundPalette.${key}`,
            message: `Unknown field "${key}" — ignored. Known fields: ${list(BACKGROUNDS)}.`,
            severity: 'warning',
          });
          return;
        }
        const hex = hexValue ? normaliseHex(hexValue) : null;
        if (!hex) {
          push({
            path: `backgroundPalette.${key}`,
            message: `"${String(value)}" is not a hex colour — ignored.`,
            severity: 'warning',
          });
          return;
        }
        fields[name] = hex;
      });
    }
  }

  const ink: FieldOverrides = {};
  const rawInk = doc.inkPalette ?? doc.textPalette ?? doc.foreground;
  if (rawInk !== undefined && rawInk !== null) {
    if (!isRecord(rawInk)) {
      push({
        path: 'inkPalette',
        message: 'Must be an object of field name → hex colour.',
        severity: 'warning',
      });
    } else {
      Object.entries(rawInk).forEach(([key, value]) => {
        const name = BACKGROUNDS[key.trim().toLowerCase()];
        const hexValue = asString(value);
        if (!name) {
          push({
            path: `inkPalette.${key}`,
            message: `Unknown field "${key}" — ignored. Known fields: ${list(BACKGROUNDS)}.`,
            severity: 'warning',
          });
          return;
        }
        const hex = hexValue ? normaliseHex(hexValue) : null;
        if (!hex) {
          push({
            path: `inkPalette.${key}`,
            message: `"${String(value)}" is not a hex colour — ignored.`,
            severity: 'warning',
          });
          return;
        }
        ink[name] = hex;
      });
    }
  }

  let accent: string | null = null;
  const rawAccent = asString(doc.accentColor ?? doc.accent);
  if (rawAccent) {
    const hex = normaliseHex(rawAccent);
    if (!hex) {
      push({
        path: 'accentColor',
        message: `"${rawAccent}" is not a hex colour — ignored.`,
        severity: 'warning',
      });
    } else accent = hex;
  }

  const { overlay } = readOverlay(doc.overlay ?? doc.staticImage, push);
  const { audio } = readAudio(doc.audio ?? doc.music, push);

  const parsed: { scene: Scene; declaredStart: number | null }[] = [];
  rawScenes.forEach((entry, index) => {
    if (!isRecord(entry)) {
      push({ path: `scenes[${index}]`, message: 'Must be an object.', severity: 'error' });
      return;
    }
    const result = readScene(entry, index, push);
    if (result) parsed.push(result);
  });

  if (errors().length > 0) return { ok: false, issues };

  let running = 0;
  parsed.forEach((entry, index) => {
    if (entry.declaredStart !== null && Math.abs(entry.declaredStart - running) > 0.051) {
      push({
        path: `scenes[${index}].start`,
        message: `Declared start ${entry.declaredStart}s but the durations before it add up to ${round3(running)}s. The engine derives timing from durations, so this scene plays at ${round3(running)}s.`,
        severity: 'warning',
      });
    }
    running += entry.scene.duration;
  });

  const authored = round3(running);
  const scenes = snapToFrames(
    parsed.map((entry) => entry.scene),
    CANVAS.fps,
  );
  const durationInFrames = scenes.reduce(
    (total, scene) => total + Math.max(1, Math.round(scene.duration * CANVAS.fps)),
    0,
  );
  const durationSeconds = round3(durationInFrames / CANVAS.fps);

  if (Math.abs(durationSeconds - authored) > 0.001) {
    push({
      path: 'scenes',
      message: `Authored ${authored}s snapped to ${durationSeconds}s (${durationInFrames} frames at ${CANVAS.fps}fps).`,
      severity: 'warning',
    });
  }

  const estimated = asNumber(doc.estimatedDuration ?? doc.duration);
  if (estimated !== null && Math.abs(estimated - authored) > 0.1) {
    push({
      path: 'estimatedDuration',
      message: `Says ${estimated}s but the scene durations add up to ${authored}s.`,
      severity: 'warning',
    });
  }

  const seen = new Set<string>();
  scenes.forEach((scene, index) => {
    if (seen.has(scene.id)) {
      push({
        path: `scenes[${index}].id`,
        message: `Duplicate id "${scene.id}" — a fresh one was generated.`,
        severity: 'warning',
      });
      scene.id = makeSceneId();
    }
    seen.add(scene.id);
  });

  const usesBlack = scenes.some((scene) => scene.background === 'black');

  return {
    ok: true,
    issues,
    project: {
      title: asString(doc.title)?.trim() || null,
      palette: usesBlack ? 'ink' : 'forest',
      format,
      fields,
      ink,
      accent,
      overlay,
      audio,
      scenes,
      durationInFrames,
      durationSeconds,
    },
  };
};

const shout = (value: string): string => value.replace(/-/g, '_').toUpperCase();

const serialiseElement = (element: SceneElement) => ({
  text: element.text,
  ...(element.role ? { role: shout(element.role) } : {}),
  ...(element.size ? { size: shout(element.size) } : {}),
  ...(element.position ? { position: shout(element.position) } : {}),
  ...(element.animation ? { animation: shout(element.animation) } : {}),
  ...(element.align ? { align: shout(element.align) } : {}),
  ...(element.case ? { case: element.case } : {}),
  ...(element.visualStyle ? { visualStyle: shout(element.visualStyle) } : {}),
  ...(element.styleConfig ? { styleConfig: element.styleConfig } : {}),
  ...(element.emphasis && element.emphasis.length > 0
    ? { emphasis: element.emphasis }
    : {}),
  ...(element.wordColors && Object.keys(element.wordColors).length > 0
    ? { wordColors: element.wordColors }
    : {}),
  ...(element.scale !== undefined && element.scale !== 1
    ? { scale: element.scale }
    : {}),
  ...(element.delay ? { delay: element.delay } : {}),
  ...(element.enterFrames ? { enterFrames: element.enterFrames } : {}),
  ...(element.exit ? { exit: shout(element.exit) } : {}),
  ...(element.stagger
    ? { stagger: {
        type: 'WORD',
        delayFrames: element.stagger.delayFrames,
        ...(element.stagger.order && element.stagger.order !== 'forward'
          ? { order: shout(element.stagger.order) }
          : {}),
      } }
    : {}),
  ...(element.fit ? { fit: { mode: 'WIDTH', maxWidth: element.fit.maxWidth } } : {}),
  ...(element.fontRole ? { fontRole: shout(element.fontRole) } : {}),
  ...(element.from ? { from: shout(element.from) } : {}),
  ...(element.x !== undefined && element.y !== undefined
    ? { x: element.x, y: element.y }
    : {}),
});

export const serialiseProject = (
  scenes: Scene[],
  title: string | null,
  fields: FieldOverrides,
  overlay: OverlayImage | null = null,
  format: CanvasFormat = DEFAULT_FORMAT,
  audio: ProjectAudio | null = null,
  ink: FieldOverrides = {},
  accent: string | null = null,
): string => {
  const canvas = canvasFor(format);
  let start = 0;
  const body = {
    title: title ?? 'Untitled reel',
    format: format === 'landscape' ? '16:9' : '9:16',
    width: canvas.width,
    height: canvas.height,
    fps: canvas.fps,
    estimatedDuration: round3(
      scenes.reduce((total, scene) => total + scene.duration, 0),
    ),
    ...(Object.keys(fields).length > 0 ? { backgroundPalette: fields } : {}),
    ...(Object.keys(ink).length > 0 ? { inkPalette: ink } : {}),
    ...(accent ? { accentColor: accent } : {}),
    ...(overlay ? { overlay } : {}),
    ...(audio
      ? {
          audio: {
            src: audio.src,
            ...(audio.name ? { name: audio.name } : {}),
            ...(audio.sourceDuration ? { sourceDuration: round3(audio.sourceDuration) } : {}),
            sourceStart: round3(audio.sourceStart),
            sourceEnd: round3(audio.sourceEnd),
            timelineStart: round3(audio.timelineStart),
            volume: audio.volume,
            ...(audio.muted ? { muted: true } : {}),
            ...(audio.fadeIn ? { fadeIn: round3(audio.fadeIn) } : {}),
            ...(audio.fadeOut ? { fadeOut: round3(audio.fadeOut) } : {}),
            ...(audio.loop ? { loop: true } : {}),
          },
        }
      : {}),
    scenes: scenes.map((scene) => {
      const entry = {
        id: scene.id,
        start: round3(start),
        duration: scene.duration,
        text: scene.text,
        emphasis: scene.emphasis ?? [],
        ...(scene.wordColors && Object.keys(scene.wordColors).length > 0
          ? { wordColors: scene.wordColors }
          : {}),
        animation: scene.style.toUpperCase(),
        direction: (scene.direction ?? 'center').toUpperCase(),
        alignment: scene.alignment.toUpperCase(),
        background: scene.background.toUpperCase(),
        case: scene.case ?? 'lower',
        ...(scene.composition
          ? { composition: shout(scene.composition) }
          : {}),
        ...(scene.visualStyle ? { visualStyle: shout(scene.visualStyle) } : {}),
        ...(scene.styleConfig ? { styleConfig: scene.styleConfig } : {}),
        ...(scene.elements && scene.elements.length > 0
          ? { elements: scene.elements.map(serialiseElement) }
          : {}),
        ...(scene.enterFrames !== undefined ? { enterFrames: scene.enterFrames } : {}),
        ...(scene.exit ? { exit: shout(scene.exit) } : {}),
        ...(scene.exitFrames !== undefined ? { exitFrames: scene.exitFrames } : {}),
        ...(scene.stagger
          ? { stagger: {
              type: 'WORD',
              delayFrames: scene.stagger.delayFrames,
              ...(scene.stagger.order && scene.stagger.order !== 'forward'
                ? { order: shout(scene.stagger.order) }
                : {}),
            } }
          : {}),
        ...(scene.backgroundMotion
          ? { backgroundMotion: {
              mode: 'ALTERNATE',
              everyFrames: scene.backgroundMotion.everyFrames,
              ...(scene.backgroundMotion.times !== undefined
                ? { times: scene.backgroundMotion.times }
                : {}),
            } }
          : {}),
        ...(scene.fit ? { fit: { mode: 'WIDTH', maxWidth: scene.fit.maxWidth } } : {}),
        ...(scene.fontRole ? { fontRole: shout(scene.fontRole) } : {}),
        ...(scene.fontSize !== undefined && scene.fontSize !== 1
          ? { scale: scene.fontSize }
          : {}),
        ...(scene.flipBackground ? { flipBackground: true } : {}),
        ...(scene.hideOverlay ? { hideOverlay: true } : {}),
        ...(scene.image ? { image: scene.image } : {}),
        ...(scene.note ? { visualNote: scene.note } : {}),
        ...(scene.objects && scene.objects.length > 0
          ? { objects: scene.objects.map(serialiseObject) }
          : {}),
      };
      start += scene.duration;
      return entry;
    }),
  };
  return JSON.stringify(body, null, 2);
};
