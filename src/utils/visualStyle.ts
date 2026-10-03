import type { Theme } from './typography';

export type VisualStyleName = 'solid' | 'outline' | 'gradient' | 'split';

export const VISUAL_STYLE_NAMES: VisualStyleName[] = [
  'solid',
  'outline',
  'gradient',
  'split',
];

export type GradientConfig = {
  colors: string[];
  angle: number;
};

export type VisualStyleConfig = {
  type: VisualStyleName;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  gradient?: GradientConfig;
  opacity?: number;
  parts?: VisualStyleConfig[];
  splitBy?: 'auto' | 'word' | 'letter';
};

export const COLOR_TOKENS: Record<string, string> = {
  white: '#FFFFFF',
  black: '#0F0F0F',
  cream: '#EEEEEE',
  dark_green: '#13581D',
  deep_green: '#214E1B',
  blue: '#2645B2',
};

export const resolveColor = (
  value: string | undefined,
  fallback: string,
): string => {
  if (!value) return fallback;
  const token = COLOR_TOKENS[value.trim().toLowerCase()];
  if (token) return token;
  return /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : fallback;
};

export const HOUSE_GRADIENT: GradientConfig = {
  colors: ['#FF8A3D', '#F45B9A', '#F5F5F5', '#8DE7F2'],
  angle: 90,
};

export type VisualStyleDefinition = {
  id: VisualStyleName;
  label: string;
  description: string;
  use: string;
  defaults: (theme: Theme) => Omit<VisualStyleConfig, 'type'>;
};

export const VISUAL_STYLES: Record<VisualStyleName, VisualStyleDefinition> = {
  solid: {
    id: 'solid',
    label: 'Solid',
    description: 'One colour, filled. The house treatment.',
    use: 'Statements, setup, explanation.',
    defaults: (theme) => ({ fillColor: theme.ink, opacity: 1 }),
  },
  outline: {
    id: 'outline',
    label: 'Outline',
    description: 'Hollow letters drawn as a stroke. No glow, no shadow.',
    use: 'Contrast, tension, the quieter beat before a loud one.',
    defaults: (theme) => ({
      strokeColor: theme.ink,
      strokeWidth: 0.03,
      opacity: 1,
    }),
  },
  gradient: {
    id: 'gradient',
    label: 'Gradient',
    description: 'A ramp painted inside the glyphs, not behind them.',
    use: 'The important idea. Energy, climax, the line that matters.',
    defaults: () => ({ gradient: HOUSE_GRADIENT, opacity: 1 }),
  },
  split: {
    id: 'split',
    label: 'Split',
    description: 'Two treatments in one piece of type.',
    use: 'Comparisons, two-part ideas, one word doing two jobs.',
    defaults: (theme) => ({
      opacity: 1,
      splitBy: 'auto',
      parts: [
        { type: 'solid', fillColor: theme.ink },
        { type: 'gradient', gradient: HOUSE_GRADIENT },
      ],
    }),
  },
};

export const styleDefinitionOf = (
  name: VisualStyleName | undefined,
): VisualStyleDefinition => VISUAL_STYLES[name ?? 'solid'] ?? VISUAL_STYLES.solid;

export const DEFAULT_VISUAL_STYLE: VisualStyleName = 'solid';

export type ResolvedStyle = {
  type: VisualStyleName;
  fill: string | null;
  stroke: { color: string; width: number } | null;
  gradient: GradientConfig | null;
  opacity: number;
  parts: ResolvedStyle[];
  splitBy: 'auto' | 'word' | 'letter';
};

export const resolveStyle = (
  config: VisualStyleConfig | undefined,
  theme: Theme,
  depth = 0,
): ResolvedStyle => {
  const type = config?.type ?? DEFAULT_VISUAL_STYLE;
  const definition = styleDefinitionOf(type);
  const base = definition.defaults(theme);
  const merged = { ...base, ...config };

  const stroke =
    merged.strokeColor !== undefined || merged.strokeWidth !== undefined
      ? {
          color: resolveColor(merged.strokeColor, theme.ink),
          width: merged.strokeWidth ?? 0.03,
        }
      : null;

  return {
    type,
    fill: merged.fillColor ? resolveColor(merged.fillColor, theme.ink) : null,
    stroke,
    gradient: merged.gradient ?? null,
    opacity: merged.opacity ?? 1,
    parts:
      type === 'split' && depth === 0
        ? (merged.parts ?? []).map((part) => resolveStyle(part, theme, depth + 1))
        : [],
    splitBy: merged.splitBy ?? 'auto',
  };
};

export const gradientCss = (gradient: GradientConfig): string => {
  const colors = gradient.colors.length > 0 ? gradient.colors : HOUSE_GRADIENT.colors;
  const stops = colors.length === 1 ? [colors[0], colors[0]] : colors;
  return `linear-gradient(${gradient.angle}deg, ${stops.join(', ')})`;
};

export const strokePx = (ratio: number, fontSize: number): number =>
  Math.min(18, Math.max(1.5, ratio * fontSize));

export type GlyphBox = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export const styleCss = (
  style: ResolvedStyle,
  fontSize: number,
  box: GlyphBox,
): Record<string, string | number> => {
  const css: Record<string, string | number> = {};

  if (style.gradient) {
    css.backgroundImage = gradientCss(style.gradient);
    css.backgroundSize = `${Math.max(1, box.width)}px ${Math.max(1, box.height)}px`;
    css.backgroundPosition = `${-box.offsetX}px ${-box.offsetY}px`;
    css.backgroundRepeat = 'no-repeat';
    css.WebkitBackgroundClip = 'text';
    css.backgroundClip = 'text';
    css.color = 'transparent';
  } else if (style.fill) {
    css.color = style.fill;
  } else if (style.stroke) {
    css.color = 'transparent';
  }

  if (style.stroke) {
    css.WebkitTextStrokeWidth = `${strokePx(style.stroke.width, fontSize).toFixed(2)}px`;
    css.WebkitTextStrokeColor = style.stroke.color;
  }

  if (style.opacity !== 1) css.opacity = style.opacity;

  return css;
};

export const paints = (style: ResolvedStyle): boolean =>
  style.fill !== null ||
  style.stroke !== null ||
  style.gradient !== null ||
  style.parts.length > 0;
