export type EaseFn = (t: number) => number;

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const linear: EaseFn = (t) => t;

export const cubicBezier = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): EaseFn => {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a;
  const B = (a: number, b: number) => 3 * b - 6 * a;
  const C = (a: number) => 3 * a;

  const calc = (t: number, a: number, b: number) =>
    ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t: number, a: number, b: number) =>
    3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = slope(t, x1, x2);
      if (d === 0) break;
      const err = calc(t, x1, x2) - x;
      if (Math.abs(err) < 1e-6) return calc(t, y1, y2);
      t -= err / d;
    }

    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const err = calc(t, x1, x2) - x;
      if (Math.abs(err) < 1e-6) break;
      if (err > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return calc(t, y1, y2);
  };
};

export const EASE = {
  settle: cubicBezier(0.16, 1, 0.3, 1),
  reveal: cubicBezier(0.33, 0, 0.2, 1),
  focus: cubicBezier(0.22, 0.9, 0.24, 1),
  punch: cubicBezier(0.19, 1.24, 0.36, 1),
  massive: cubicBezier(0.1, 0.86, 0.16, 1),
  glide: cubicBezier(0.2, 1.05, 0.26, 1),
  inOut: cubicBezier(0.65, 0, 0.35, 1),
  linear,

  punchEnter: cubicBezier(0.18, 1.42, 0.36, 1),
  massiveEnter: cubicBezier(0.06, 0.92, 0.12, 1),
  slideEnter: cubicBezier(0.16, 1.12, 0.24, 1),
  stackEnter: cubicBezier(0.2, 0.9, 0.28, 1),
  rapidEnter: cubicBezier(0.3, 1, 0.35, 1),
  exit: cubicBezier(0.55, 0, 0.85, 0.35),
  exitHard: cubicBezier(0.7, 0, 0.9, 0.2),
  exitFade: cubicBezier(0.2, 0.65, 0.45, 1),
  carry: cubicBezier(0.22, 1, 0.28, 1),
} satisfies Record<string, EaseFn>;

export const EXIT_EASE = {
  massive: 'exitHard',
  punch: 'exit',
  stack: 'exit',
  slide: 'exitHard',
  rapid: 'exit',
  none: 'exit',
} as const;

export type EaseName = keyof typeof EASE;

export const easeByName = (name: EaseName | EaseFn): EaseFn =>
  typeof name === 'function' ? name : EASE[name];

export const progress = (
  frame: number,
  start: number,
  duration: number,
  ease: EaseName | EaseFn = 'linear',
): number => {
  if (duration <= 0) return 1;
  return easeByName(ease)(clamp01((frame - start) / duration));
};
