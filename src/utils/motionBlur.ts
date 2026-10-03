import type { MotionValues } from '../components/motion/primitives';

export type BlurVector = {
  sx: number;
  sy: number;
};

export const NO_BLUR: BlurVector = { sx: 0, sy: 0 };

const SPEED_FLOOR = 6;

const MAX_SIGMA = 18;

const SPEED_TO_SIGMA = 0.3;

const SCALE_TO_SPEED = 0.42;

const softFloor = (speed: number): number =>
  speed <= SPEED_FLOOR ? 0 : speed - SPEED_FLOOR;

export const velocityBlur = (
  at: (frame: number) => MotionValues,
  frame: number,
  extent: number,
  gain = 1,
): BlurVector => {
  if (gain <= 0 || frame <= 0) return NO_BLUR;

  const now = at(frame);
  const before = at(frame - 1);

  const dx = now.x - before.x;
  const dy = now.y - before.y;

  const edge = Math.abs(now.scale - before.scale) * extent * 0.5 * SCALE_TO_SPEED;

  const sx = Math.min(MAX_SIGMA, softFloor(Math.abs(dx) + edge) * SPEED_TO_SIGMA * gain);
  const sy = Math.min(MAX_SIGMA, softFloor(Math.abs(dy) + edge) * SPEED_TO_SIGMA * gain);

  return {
    sx: Number.isFinite(sx) && sx > 0.15 ? sx : 0,
    sy: Number.isFinite(sy) && sy > 0.15 ? sy : 0,
  };
};

export const hasBlur = (blur: BlurVector): boolean => blur.sx > 0.15 || blur.sy > 0.15;

export const addBlur = (a: BlurVector, isotropic: number): BlurVector =>
  isotropic <= 0.05 ? a : { sx: a.sx + isotropic, sy: a.sy + isotropic };

export const BLUR_GAIN: Record<string, number> = {
  massive: 1.15,
  punch: 0.85,
  slide: 1.1,
  stack: 0.7,
  rapid: 0.25,
};
