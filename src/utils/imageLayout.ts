import type { SceneImage, VideoConfig } from '../types/scene';
import { CANVAS } from './timing';
import { sideMargin } from './typography';

export type Rect = { x: number; y: number; width: number; height: number };

export type ImageComposition = {
  rect: Rect;
  typeTop: number;
  typeBottom: number;
  scrim: number;
  focusX: number;
  focusY: number;
  overlaps: boolean;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const finite = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const PANEL_MIN = 0.18;
export const PANEL_MAX = 0.72;

export const FREE_MIN = 0.05;

export const freeBoxFrom = (
  composition: ImageComposition,
  canvas: VideoConfig = CANVAS,
): { x: number; y: number; width: number; height: number } => ({
  x: composition.rect.x / canvas.width,
  y: composition.rect.y / canvas.height,
  width: composition.rect.width / canvas.width,
  height: composition.rect.height / canvas.height,
});

export const composeImage = (
  image: SceneImage | undefined,
  canvas: VideoConfig = CANVAS,
): ImageComposition => {
  const { width: W, height: H } = canvas;
  const margin = sideMargin(canvas);
  const bandGap = margin * 0.85;

  const full: ImageComposition = {
    rect: { x: 0, y: 0, width: W, height: H },
    typeTop: 0,
    typeBottom: H,
    scrim: clamp(finite(image?.scrim, 0.42), 0, 0.95),
    focusX: clamp(finite(image?.focusX, 0.5), 0, 1),
    focusY: clamp(finite(image?.focusY, 0.5), 0, 1),
    overlaps: true,
  };

  if (!image) return { ...full, scrim: 0 };
  if (image.placement === 'full') return full;

  const side = image.side ?? 'top';
  const focusX = clamp(finite(image.focusX, 0.5), 0, 1);
  const focusY = clamp(finite(image.focusY, 0.5), 0, 1);

  if (image.placement === 'free') {
    const width = Math.max(FREE_MIN * W, finite(image.width, 0.5) * W);
    const height = Math.max(FREE_MIN * H, finite(image.height, 0.32) * H);
    return {
      rect: {
        x: finite(image.x, 0.25) * W,
        y: finite(image.y, 0.34) * H,
        width,
        height,
      },
      typeTop: 0,
      typeBottom: H,
      scrim: clamp(finite(image.scrim, 0), 0, 0.95),
      focusX,
      focusY,
      overlaps: true,
    };
  }

  if (image.placement === 'split') {
    const height = H / 2;
    const y = side === 'top' ? 0 : H - height;
    return {
      rect: { x: 0, y, width: W, height },
      typeTop: side === 'top' ? height + bandGap : margin,
      typeBottom: side === 'top' ? H - margin : y - bandGap,
      scrim: clamp(finite(image.scrim, 0), 0, 0.95),
      focusX,
      focusY,
      overlaps: false,
    };
  }

  const height = H * clamp(finite(image.size, 0.42), PANEL_MIN, PANEL_MAX);
  const y = side === 'top' ? margin : H - margin - height;
  return {
    rect: { x: margin, y, width: W - margin * 2, height },
    typeTop: side === 'top' ? y + height + bandGap : margin,
    typeBottom: side === 'top' ? H - margin : y - bandGap,
    scrim: clamp(finite(image.scrim, 0), 0, 0.95),
    focusX,
    focusY,
    overlaps: false,
  };
};

export const typeCentreY = (composition: ImageComposition): number =>
  (composition.typeTop + composition.typeBottom) / 2;

export const typeBandHeight = (composition: ImageComposition): number =>
  Math.max(1, composition.typeBottom - composition.typeTop);
