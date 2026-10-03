import type {
  Alignment,
  CompositionPreset,
  PositionPreset,
  SizePreset,
  TextRole,
  VideoConfig,
  TextFit,
} from '../types/scene';
import { CANVAS } from './timing';
import { FACES, fitToWidth, sideMargin } from './typography';
import type { TypeFace } from './typography';

export const TEXT_ROLES: TextRole[] = ['primary', 'secondary', 'emphasis', 'support'];

export const ROLE_LABEL: Record<TextRole, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  emphasis: 'Emphasis',
  support: 'Support',
};

export const ROLE_WEIGHT: Record<TextRole, number> = {
  emphasis: 4,
  primary: 3,
  secondary: 2,
  support: 1,
};

export const ROLE_SIZE: Record<TextRole, SizePreset> = {
  emphasis: 'huge',
  primary: 'large',
  secondary: 'medium',
  support: 'small',
};

export const ROLE_CEILING: Record<TextRole, number> = {
  emphasis: 1,
  primary: 1,
  secondary: 0.46,
  support: 0.3,
};

export const ROLE_FLOOR: Record<TextRole, number> = {
  emphasis: 0.12,
  primary: 0.1,
  secondary: 0.07,
  support: 0.055,
};

export const ROLE_WEIGHT_FACE: Record<TextRole, number> = {
  emphasis: 900,
  primary: 800,
  secondary: 800,
  support: 700,
};

export const ROLE_MOTION: Record<TextRole, number> = {
  emphasis: 1.25,
  primary: 1,
  secondary: 0.85,
  support: 0.68,
};

export const SIZE_PRESETS: SizePreset[] = [
  'xs',
  'small',
  'medium',
  'large',
  'huge',
  'oversized',
];

export const SIZE_LABEL: Record<SizePreset, string> = {
  xs: 'Extra small',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  huge: 'Huge',
  oversized: 'Oversized',
};

export type SizeDefinition = {
  target: number;
  bleed: number;
  bleedSpan: number;
  max: number;
  min: number;
  bandRoom: number;
  minVisible: number;
};

export const SIZE_RULES: Record<SizePreset, SizeDefinition> = {
  xs: { target: 0.32, bleed: 0, bleedSpan: 1, max: 0.072, min: 0.038, bandRoom: 1, minVisible: 0.995 },
  small: { target: 0.46, bleed: 0, bleedSpan: 1, max: 0.105, min: 0.058, bandRoom: 1, minVisible: 0.995 },
  medium: { target: 0.64, bleed: 0, bleedSpan: 1, max: 0.2, min: 0.075, bandRoom: 1, minVisible: 0.99 },
  large: { target: 0.84, bleed: 0, bleedSpan: 1, max: 0.345, min: 0.1, bandRoom: 1.04, minVisible: 0.97 },
  huge: {
    target: 0.965,
    bleed: 0.14,
    bleedSpan: 12,
    max: 0.66,
    min: 0.13,
    bandRoom: 1.35,
    minVisible: 0.74,
  },
  oversized: {
    target: 0.965,
    bleed: 0.42,
    bleedSpan: 14,
    max: 0.98,
    min: 0.16,
    bandRoom: 1.9,
    minVisible: 0.5,
  },
};

export const sizeRule = (size: SizePreset): SizeDefinition =>
  SIZE_RULES[size] ?? SIZE_RULES.large;

export const targetWidth = (size: SizePreset, chars: number): number => {
  const rule = sizeRule(size);
  if (rule.bleed <= 0) return rule.target;
  const decay = Math.max(0, 1 - Math.max(0, chars - 1) / rule.bleedSpan);
  return rule.target + rule.bleed * decay;
};

export const resolveSize = (
  text: string,
  size: SizePreset,
  scale = 1,
  weight = 800,
  canvas: VideoConfig = CANVAS,
  face: TypeFace = FACES.primary,
  fit?: TextFit,
): number => {
  const rule = sizeRule(size);
  const chars = text.replace(/\s+/g, '').length;
  if (chars === 0) return 0;
  const W = canvas.width;

  if (fit) {
    const width = Math.max(0.05, Math.min(1, fit.maxWidth));
    const exact = fitToWidth(text, width * W, weight, canvas, face);
    return exact * Math.min(1, Math.max(0, scale || 1));
  }

  const fitted = fitToWidth(text, targetWidth(size, chars) * W, weight, canvas, face);

  const fills = fitToWidth(text, W, weight, canvas, face);
  const floor = Math.min(rule.min * W, fills);

  return Math.max(floor, Math.min(rule.max * W, fitted)) * scale;
};

export const bleeds = (size: SizePreset): boolean =>
  size === 'huge' || size === 'oversized';

export const POSITION_PRESETS: PositionPreset[] = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'edge-left',
  'edge-right',
  'edge-top',
  'edge-bottom',
  'offscreen-left',
  'offscreen-right',
  'offscreen-top',
  'offscreen-bottom',
];

export const POSITION_LABEL = (position: PositionPreset): string => {
  const words = position.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export type HAnchor = 'left' | 'center' | 'right' | 'edge-left' | 'edge-right' | 'off-left' | 'off-right';
export type VAnchor = 'top' | 'center' | 'bottom' | 'edge-top' | 'edge-bottom' | 'off-top' | 'off-bottom';

export type Anchors = { h: HAnchor; v: VAnchor };

const POSITION_ANCHORS: Record<PositionPreset, Anchors> = {
  'top-left': { h: 'left', v: 'top' },
  'top-center': { h: 'center', v: 'top' },
  'top-right': { h: 'right', v: 'top' },
  'center-left': { h: 'left', v: 'center' },
  center: { h: 'center', v: 'center' },
  'center-right': { h: 'right', v: 'center' },
  'bottom-left': { h: 'left', v: 'bottom' },
  'bottom-center': { h: 'center', v: 'bottom' },
  'bottom-right': { h: 'right', v: 'bottom' },
  'edge-left': { h: 'edge-left', v: 'center' },
  'edge-right': { h: 'edge-right', v: 'center' },
  'edge-top': { h: 'center', v: 'edge-top' },
  'edge-bottom': { h: 'center', v: 'edge-bottom' },
  'offscreen-left': { h: 'off-left', v: 'center' },
  'offscreen-right': { h: 'off-right', v: 'center' },
  'offscreen-top': { h: 'center', v: 'off-top' },
  'offscreen-bottom': { h: 'center', v: 'off-bottom' },
};

export const anchorsFor = (position: PositionPreset): Anchors =>
  POSITION_ANCHORS[position] ?? POSITION_ANCHORS.center;

const edgeBleed = (extent: number, frameExtent: number): number =>
  Math.min(extent * 0.16, frameExtent * 0.07);

export type Band = { top: number; bottom: number };

export const bandCentre = (band: Band): number => (band.top + band.bottom) / 2;

export const anchorX = (h: HAnchor, inkWidth: number, canvas: VideoConfig = CANVAS): number => {
  const W = canvas.width;
  const margin = sideMargin(canvas);
  const half = inkWidth / 2;
  switch (h) {
    case 'left':
      return margin + half;
    case 'right':
      return W - margin - half;
    case 'edge-left':
      return half - edgeBleed(inkWidth, W);
    case 'edge-right':
      return W - half + edgeBleed(inkWidth, W);
    case 'off-left':
      return -half - margin;
    case 'off-right':
      return W + half + margin;
    case 'center':
    default:
      return W / 2;
  }
};

export const anchorY = (
  v: VAnchor,
  inkHeight: number,
  band: Band,
  canvas: VideoConfig = CANVAS,
): number => {
  const H = canvas.height;
  const margin = sideMargin(canvas);
  const half = inkHeight / 2;
  switch (v) {
    case 'top':
      return band.top + margin + half;
    case 'bottom':
      return band.bottom - margin - half;
    case 'edge-top':
      return half - edgeBleed(inkHeight, H);
    case 'edge-bottom':
      return H - half + edgeBleed(inkHeight, H);
    case 'off-top':
      return -half - margin;
    case 'off-bottom':
      return H + half + margin;
    case 'center':
    default:
      return bandCentre(band);
  }
};

export const alignForAnchor = (h: HAnchor): Alignment => {
  if (h === 'left' || h === 'edge-left' || h === 'off-left') return 'left';
  if (h === 'right' || h === 'edge-right' || h === 'off-right') return 'right';
  return 'center';
};

export const COMPOSITION_PRESETS: CompositionPreset[] = [
  'center',
  'left-stack',
  'right-stack',
  'top-statement',
  'bottom-statement',
  'split',
  'oversized-center',
  'corner',
];

export type CompositionDefinition = {
  id: CompositionPreset;
  label: string;
  description: string;
  vertical: 'top' | 'center' | 'bottom';
  gap: number;
  column: (offset: number, index: number) => HAnchor;
  absolute?: Anchors[];
};

const HOUSE_GRAMMAR = (offset: number): HAnchor =>
  offset === 0 ? 'left' : offset < 0 ? 'left' : 'right';

export const COMPOSITIONS: Record<CompositionPreset, CompositionDefinition> = {
  center: {
    id: 'center',
    label: 'Centre',
    description: 'Centred type. Statements, hooks, punchlines.',
    vertical: 'center',
    gap: 0.02,
    column: () => 'center',
  },
  'left-stack': {
    id: 'left-stack',
    label: 'Left stack',
    description: 'Everything hangs off the left margin. Editorial, asymmetric.',
    vertical: 'center',
    gap: 0.02,
    column: () => 'left',
  },
  'right-stack': {
    id: 'right-stack',
    label: 'Right stack',
    description: 'Everything hangs off the right margin.',
    vertical: 'center',
    gap: 0.02,
    column: () => 'right',
  },
  'top-statement': {
    id: 'top-statement',
    label: 'Top statement',
    description: 'Statement in the upper region, support below it.',
    vertical: 'top',
    gap: 0.026,
    column: HOUSE_GRAMMAR,
  },
  'bottom-statement': {
    id: 'bottom-statement',
    label: 'Bottom statement',
    description: 'Statement anchored low, with air above it.',
    vertical: 'bottom',
    gap: 0.026,
    column: HOUSE_GRAMMAR,
  },
  split: {
    id: 'split',
    label: 'Split',
    description: 'Elements thrown to opposite margins with real air between them.',
    vertical: 'center',
    gap: 0.055,
    column: (_offset, index) => (index % 2 === 0 ? 'left' : 'right'),
  },
  'oversized-center': {
    id: 'oversized-center',
    label: 'Oversized centre',
    description: 'One word owns the frame. Everything else gets out of its way.',
    vertical: 'center',
    gap: 0.03,
    column: (offset) => (offset === 0 ? 'center' : offset < 0 ? 'left' : 'right'),
  },
  corner: {
    id: 'corner',
    label: 'Corner',
    description: 'Type pushed into opposite corners. Maximum negative space.',
    vertical: 'center',
    gap: 0.03,
    column: () => 'left',
    absolute: [
      { h: 'left', v: 'top' },
      { h: 'right', v: 'bottom' },
      { h: 'right', v: 'top' },
      { h: 'left', v: 'bottom' },
    ],
  },
};

export const compositionDefinition = (
  preset: CompositionPreset | undefined,
): CompositionDefinition => COMPOSITIONS[preset ?? 'center'] ?? COMPOSITIONS.center;

export const suggestComposition = (
  count: number,
  dominantSize: SizePreset,
): CompositionPreset => {
  if (count <= 1) return bleeds(dominantSize) ? 'oversized-center' : 'center';
  if (count === 2) return 'left-stack';
  return 'split';
};

export type FlowItem = {
  width: number;
  height: number;
  anchors: Anchors | null;
  fixed?: { cx: number; cy: number };
  flows: boolean;
};

export type Placement = { cx: number; cy: number };

export const layOut = (
  items: FlowItem[],
  definition: CompositionDefinition,
  band: Band,
  canvas: VideoConfig = CANVAS,
): Placement[] => {
  const placements: Placement[] = items.map(() => ({ cx: 0, cy: 0 }));
  const margin = sideMargin(canvas);

  const flowing = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.flows);

  items.forEach((item, index) => {
    if (item.flows) return;
    if (item.fixed) {
      placements[index] = item.fixed;
      return;
    }
    const anchors = item.anchors ?? { h: 'center', v: 'center' };
    placements[index] = {
      cx: anchorX(anchors.h, item.width, canvas),
      cy: anchorY(anchors.v, item.height, band, canvas),
    };
  });

  if (flowing.length === 0) return placements;

  const gap = definition.gap * canvas.height;
  const stack =
    flowing.reduce((total, { item }) => total + item.height, 0) +
    gap * (flowing.length - 1);

  const available = band.bottom - band.top - margin * 2;
  let cursor: number;
  if (stack > available) {
    cursor = bandCentre(band) - stack / 2;
  } else if (definition.vertical === 'top') {
    cursor = band.top + margin;
  } else if (definition.vertical === 'bottom') {
    cursor = band.bottom - margin - stack;
  } else {
    cursor = bandCentre(band) - stack / 2;
  }

  for (const { item, index } of flowing) {
    const anchors = item.anchors ?? { h: 'center', v: 'center' };
    placements[index] = {
      cx: anchorX(anchors.h, item.width, canvas),
      cy: cursor + item.height / 2,
    };
    cursor += item.height + gap;
  }

  return placements;
};

export const separate = (
  items: FlowItem[],
  placements: Placement[],
  canvas: VideoConfig = CANVAS,
): Placement[] => {
  const out = placements.map((placement) => ({ ...placement }));
  const AIR = canvas.height * 0.012;

  for (let i = 1; i < items.length; i++) {
    if (items[i].fixed) continue;
    for (let j = 0; j < i; j++) {
      const a = items[j];
      const b = items[i];
      const overlapX =
        Math.abs(out[i].cx - out[j].cx) < (a.width + b.width) / 2;
      const gapY = Math.abs(out[i].cy - out[j].cy);
      const needed = (a.height + b.height) / 2 + AIR;
      if (!overlapX || gapY >= needed) continue;

      const below = out[i].cy >= out[j].cy;
      out[i].cy = out[j].cy + (below ? needed : -needed);
    }
  }

  return out;
};
