import { fitText, measureText } from '@remotion/layout-utils';
import type {
  BackgroundName,
  PaletteName,
  TextCase,
  TextFit,
} from '../types/scene';
import { CANVAS } from './timing';
import type { VideoConfig } from '../types/scene';

export type Theme = {
  background: string;
  ink: string;
  accent: string;
};

export const DEFAULT_ACCENT = '#4ADE6A';

export const FIELDS: Record<BackgroundName, string> = {
  green: '#13581D',
  cream: '#EEEEEE',
  black: '#0F0F0F',
};

export type PaletteDefinition = {
  id: PaletteName;
  label: string;
  dark: BackgroundName;
  creamInk: string;
};

export const PALETTES: Record<PaletteName, PaletteDefinition> = {
  forest: {
    id: 'forest',
    label: 'Green · Cream',
    dark: 'green',
    creamInk: '#214E1B',
  },
  ink: {
    id: 'ink',
    label: 'Black · Cream',
    dark: 'black',
    creamInk: '#121212',
  },
};

export const PALETTE_NAMES: PaletteName[] = ['forest', 'ink'];

export const DEFAULT_PALETTE: PaletteName = 'forest';

export const paletteFor = (palette: PaletteName = DEFAULT_PALETTE): PaletteDefinition =>
  PALETTES[palette] ?? PALETTES[DEFAULT_PALETTE];

export type FieldOverrides = Partial<Record<BackgroundName, string>>;

const channel = (value: number): number =>
  value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);

const luminance = (hex: string): number => {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) return 0;
  const r = channel(((value >> 16) & 255) / 255);
  const g = channel(((value >> 8) & 255) / 255);
  const b = channel((value & 255) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export const themeFor = (
  background: BackgroundName,
  palette: PaletteName = DEFAULT_PALETTE,
  overrides?: FieldOverrides,
  inkOverrides?: FieldOverrides,
  accent: string = DEFAULT_ACCENT,
): Theme => {
  const definition = paletteFor(palette);
  const field = overrides?.[background] ?? FIELDS[background] ?? FIELDS.green;

  const chosen = inkOverrides?.[background];
  if (chosen) return { background: field, ink: chosen, accent };

  const natural =
    background === 'cream'
      ? definition.creamInk
      : background === 'black'
        ? FIELDS.cream
        : '#FFFFFF';

  if (contrastRatio(field, natural) >= 3) return { background: field, ink: natural, accent };

  const light = '#FFFFFF';
  const dark = '#111111';
  return {
    background: field,
    ink: contrastRatio(field, light) >= contrastRatio(field, dark) ? light : dark,
    accent,
  };
};

export const flipBackground = (
  background: BackgroundName,
  palette: PaletteName = DEFAULT_PALETTE,
): BackgroundName =>
  background === 'cream' ? paletteFor(palette).dark : 'cream';

export const fieldsOf = (palette: PaletteName = DEFAULT_PALETTE): BackgroundName[] => [
  paletteFor(palette).dark,
  'cream',
];

export const remapBackground = (
  background: BackgroundName,
  palette: PaletteName,
): BackgroundName => (background === 'cream' ? 'cream' : paletteFor(palette).dark);

export const FONT_FAMILY = 'Engine Sans';

export const FONT_STACK = `'${FONT_FAMILY}', 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif`;

export const FONT_FACES = [
  { weight: 500, file: 'fonts/inter-500.woff2' },
  { weight: 700, file: 'fonts/inter-700.woff2' },
  { weight: 800, file: 'fonts/inter-800.woff2' },
  { weight: 900, file: 'fonts/inter-900.woff2' },
] as const;

export const HERO_WEIGHT = 800;
export const KICKER_WEIGHT = 800;

export const FONT_METRICS = {
  ascender: 0.96875,
  descender: 0.24148,
  capHeight: 0.72727,
  xHeight: 0.54545,
  overshootDescender: 0.215,
} as const;

export const BASELINE_FROM_TOP =
  FONT_METRICS.ascender - (FONT_METRICS.ascender + FONT_METRICS.descender - 1) / 2;

const TALL = /[A-Z0-9bdfhijklt!?ÀÁÂÄÅÈÉÊËÌÍÎÏÑÒÓÔÖÙÚÛÜ]/;
const DEEP = /[gjpqy,;]/;

export const inkTop = (text: string, fontSize: number): number =>
  fontSize *
  (TALL.test(text)
    ? BASELINE_FROM_TOP - FONT_METRICS.capHeight
    : BASELINE_FROM_TOP - FONT_METRICS.xHeight);

export const inkBottom = (text: string, fontSize: number): number =>
  fontSize *
  (DEEP.test(text)
    ? BASELINE_FROM_TOP + FONT_METRICS.overshootDescender
    : BASELINE_FROM_TOP);

export const trackingFor = (fontSize: number, canvas: VideoConfig = CANVAS): string => {
  const w = canvas.width;
  if (fontSize >= 0.3 * w) return '-0.05em';
  if (fontSize >= 0.18 * w) return '-0.04em';
  if (fontSize >= 0.1 * w) return '-0.032em';
  return '-0.024em';
};

export const sideMargin = (canvas: VideoConfig = CANVAS): number => 0.08 * canvas.width;

export type SizingRule = {
  target: number;
  max: number;
  min: number;
  shortTarget?: number;
  shortMaxChars?: number;
};

export const SIZING: Record<string, SizingRule> = {
  massive: {
    target: 0.94,
    max: 0.98,
    min: 0.14,
    shortTarget: 1.08,
    shortMaxChars: 5,
  },
  punch: { target: 0.835, max: 0.345, min: 0.1 },
  stack: { target: 0.82, max: 0.38, min: 0.09 },
  slide: { target: 0.815, max: 0.345, min: 0.1 },
  rapid: { target: 0.835, max: 0.345, min: 0.1 },
};

export const rapidBaseSize = (canvas: VideoConfig = CANVAS): number => 0.19 * canvas.width;

export const KICKER_RATIO = 0.265;
export const kickerMin = (canvas: VideoConfig = CANVAS): number => 0.078 * canvas.width;
export const kickerMax = (canvas: VideoConfig = CANVAS): number => 0.105 * canvas.width;

export const LINE_GAP_EM = 0.042;

export type FontRole = 'primary' | 'accent';

export const ACCENT_FONT_STACK =
  `Georgia, 'Times New Roman', 'Liberation Serif', 'DejaVu Serif', Times, serif`;

export type TypeFace = {
  role: FontRole;
  family: string;
  italic: boolean;
};

export const FACES: Record<FontRole, TypeFace> = {
  primary: { role: 'primary', family: FONT_STACK, italic: false },
  accent: { role: 'accent', family: ACCENT_FONT_STACK, italic: true },
};

export const FONT_ROLES: FontRole[] = ['primary', 'accent'];

export const faceFor = (role: FontRole | undefined): TypeFace =>
  FACES[role ?? 'primary'] ?? FACES.primary;

export const faceStyles = (face: TypeFace): { fontStyle?: 'italic' } =>
  face.italic ? { fontStyle: 'italic' } : {};

const fitCache = new Map<string, number>();

export const fitToWidth = (
  text: string,
  withinWidth: number,
  weight: number = HERO_WEIGHT,
  canvas: VideoConfig = CANVAS,
  face: TypeFace = FACES.primary,
): number => {
  if (!text.trim()) return 0;
  const key = `${text}|${Math.round(withinWidth)}|${weight}|${canvas.width}|${face.role}`;
  const hit = fitCache.get(key);
  if (hit !== undefined) return hit;

  const extra = faceStyles(face);

  let size = fitText({
    text,
    withinWidth,
    fontFamily: face.family,
    fontWeight: weight,
    letterSpacing: trackingFor(withinWidth * 0.4, canvas),
    additionalStyles: extra,
  }).fontSize;

  size = fitText({
    text,
    withinWidth,
    fontFamily: face.family,
    fontWeight: weight,
    letterSpacing: trackingFor(size, canvas),
    additionalStyles: extra,
  }).fontSize;

  fitCache.set(key, size);
  return size;
};

const widthCache = new Map<string, number>();

export const widthOf = (
  text: string,
  fontSize: number,
  weight: number = HERO_WEIGHT,
  canvas: VideoConfig = CANVAS,
  face: TypeFace = FACES.primary,
): number => {
  if (!text.trim()) return 0;
  const key = `${text}|${Math.round(fontSize * 100)}|${weight}|${canvas.width}|${face.role}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  const { width } = measureText({
    text,
    fontFamily: face.family,
    fontSize,
    fontWeight: weight,
    letterSpacing: trackingFor(fontSize, canvas),
    additionalStyles: faceStyles(face),
  });
  widthCache.set(key, width);
  return width;
};

export const resolveHeroSize = (
  text: string,
  rule: SizingRule,
  scale = 1,
  weight: number = HERO_WEIGHT,
  canvas: VideoConfig = CANVAS,
  face: TypeFace = FACES.primary,
  fit?: TextFit,
): number => {
  const w = canvas.width;

  if (fit) {
    const width = Math.max(0.05, Math.min(1, fit.maxWidth));
    const exact = fitToWidth(text, width * w, weight, canvas, face);
    return exact * Math.min(1, Math.max(0, scale || 1));
  }

  const short =
    rule.shortTarget !== undefined &&
    text.replace(/\s+/g, '').length <= (rule.shortMaxChars ?? 5);
  const target = short ? (rule.shortTarget as number) : rule.target;
  const fitted = fitToWidth(text, target * w, weight, canvas, face);
  return Math.max(rule.min * w, Math.min(rule.max * w, fitted)) * scale;
};

export const applyCase = (text: string, mode: TextCase = 'lower'): string => {
  if (mode === 'upper') return text.toUpperCase();
  if (mode === 'as-typed') return text;
  return text.toLowerCase();
};

export const splitLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export const splitWords = (text: string): string[] =>
  text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

const normalise = (word: string): string =>
  word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

export const isEmphasised = (word: string, emphasis?: string[]): boolean => {
  if (!emphasis || emphasis.length === 0) return false;
  const target = normalise(word);
  if (!target) return false;
  return emphasis.some((candidate) => normalise(candidate) === target);
};
