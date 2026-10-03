import { EASE, clamp01, type EaseName } from './easing';

export type MotionDirection = 'left' | 'right' | 'top' | 'bottom';
export type MotionSpeed = 'slow' | 'medium' | 'fast';
export type MotionDistance = 'small' | 'medium' | 'large';

export type EnterMotion =
  | 'none'
  | 'fade-in'
  | 'slide-in'
  | 'rise-in'
  | 'pop-in'
  | 'scale-in'
  | 'reveal'
  | 'float-in'
  | 'draw-in';

export type EmphasisMotion =
  | 'none'
  | 'pulse'
  | 'pop'
  | 'shake'
  | 'float'
  | 'glow'
  | 'bounce';

export type ExitMotion =
  | 'none'
  | 'fade-out'
  | 'slide-out'
  | 'scale-out'
  | 'shrink'
  | 'reveal-out';

export type MotionState = {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  blur: number;
  reveal: number;
};

export const REST: MotionState = {
  opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, blur: 0, reveal: 1,
};

const SPEED_SECONDS: Record<MotionSpeed, number> = {
  slow: 1.05,
  medium: 0.72,
  fast: 0.45,
};

const DISTANCE_FRACTION: Record<MotionDistance, number> = {
  small: 0.06,
  medium: 0.16,
  large: 0.34,
};

const axis = (direction: MotionDirection, amount: number): { x: number; y: number } => {
  switch (direction) {
    case 'left': return { x: -amount, y: 0 };
    case 'right': return { x: amount, y: 0 };
    case 'top': return { x: 0, y: -amount };
    case 'bottom': return { x: 0, y: amount };
  }
};

type EnterRecipe = {
  label: string;
  description: string;
  directional?: boolean;
  at: (t: number, distance: number, direction: MotionDirection) => Partial<MotionState>;
  ease?: EaseName;
  fadeEase?: EaseName;
};

export const ENTER: Record<Exclude<EnterMotion, 'none'>, EnterRecipe> = {
  'fade-in': {
    label: 'Fade In',
    description: 'Opacity only. The quietest arrival there is.',
    at: (t) => ({ opacity: t }),
    ease: 'reveal',
  },
  'slide-in': {
    label: 'Slide In',
    description: 'Travels in from one edge and settles.',
    directional: true,
    at: (t, distance, direction) => {
      const { x, y } = axis(direction, distance * (1 - t));
      return { opacity: Math.min(1, t * 1.6), x, y };
    },
    ease: 'glide',
  },
  'rise-in': {
    label: 'Rise In',
    description: 'Lifts from below while it fades up.',
    at: (t, distance) => ({ opacity: t, y: distance * 0.5 * (1 - t) }),
    ease: 'settle',
  },
  'pop-in': {
    label: 'Pop In',
    description: 'Scales up fast with a small overshoot. The workhorse.',
    at: (t) => ({ opacity: Math.min(1, t * 2), scale: 0.86 + 0.14 * t }),
    ease: 'punchEnter',
    fadeEase: 'reveal',
  },
  'scale-in': {
    label: 'Scale In',
    description: 'Grows from small to full. No overshoot.',
    at: (t) => ({ opacity: t, scale: 0.7 + 0.3 * t }),
    ease: 'settle',
  },
  reveal: {
    label: 'Reveal',
    description: 'Wipes into view from one edge without moving.',
    directional: true,
    at: (t) => ({ opacity: 1, reveal: t }),
    ease: 'inOut',
  },
  'float-in': {
    label: 'Float In',
    description: 'Drifts up into focus — opacity, a lift, a little scale, and blur.',
    at: (t, distance) => ({
      opacity: t,
      y: distance * 0.42 * (1 - t),
      scale: 0.96 + 0.04 * t,
      blur: 10 * Math.max(0, 1 - t * 3),
    }),
    ease: 'settle',
    fadeEase: 'reveal',
  },
  'draw-in': {
    label: 'Draw In',
    description: 'Strokes itself on, as if being drawn. Best on icons and lines.',
    at: (t) => ({ opacity: 1, reveal: t, scale: 0.98 + 0.02 * t }),
    ease: 'focus',
  },
};

type EmphasisRecipe = {
  label: string;
  description: string;
  period: number;
  at: (phase: number) => Partial<MotionState>;
};

export const EMPHASIS: Record<Exclude<EmphasisMotion, 'none'>, EmphasisRecipe> = {
  pulse: {
    label: 'Pulse',
    description: 'A slow breath in scale.',
    period: 1.6,
    at: (p) => ({ scale: 1 + 0.022 * Math.sin(p * Math.PI * 2) }),
  },
  pop: {
    label: 'Pop',
    description: 'One sharp scale kick, then still.',
    period: 1.2,
    at: (p) => ({ scale: 1 + 0.07 * Math.max(0, Math.sin(p * Math.PI * 4)) * (p < 0.25 ? 1 : 0) }),
  },
  shake: {
    label: 'Shake',
    description: 'A short horizontal rattle. Use for errors.',
    period: 0.5,
    at: (p) => ({ x: 0.006 * Math.sin(p * Math.PI * 6) * (1 - p) }),
  },
  float: {
    label: 'Float',
    description: 'Drifts up and down. Good under a shadow.',
    period: 3.2,
    at: (p) => ({ y: -0.008 * Math.sin(p * Math.PI * 2) }),
  },
  glow: {
    label: 'Glow',
    description: 'The bloom swells and settles.',
    period: 2.0,
    at: (p) => ({ opacity: 1 - 0.06 * (0.5 - 0.5 * Math.cos(p * Math.PI * 2)) }),
  },
  bounce: {
    label: 'Bounce',
    description: 'A soft vertical bob with weight at the bottom.',
    period: 1.4,
    at: (p) => ({ y: -0.014 * Math.abs(Math.sin(p * Math.PI)) }),
  },
};

type ExitRecipe = {
  label: string;
  description: string;
  directional?: boolean;
  at: (t: number, distance: number, direction: MotionDirection) => Partial<MotionState>;
  ease?: EaseName;
};

export const EXIT: Record<Exclude<ExitMotion, 'none'>, ExitRecipe> = {
  'fade-out': {
    label: 'Fade Out',
    description: 'Opacity only.',
    at: (t) => ({ opacity: 1 - t }),
    ease: 'exitFade',
  },
  'slide-out': {
    label: 'Slide Out',
    description: 'Leaves towards one edge.',
    directional: true,
    at: (t, distance, direction) => {
      const { x, y } = axis(direction, distance * t);
      return { opacity: 1 - t * 0.9, x, y };
    },
    ease: 'exitHard',
  },
  'scale-out': {
    label: 'Scale Out',
    description: 'Grows slightly as it goes, like it is passing the camera.',
    at: (t) => ({ opacity: 1 - t, scale: 1 + 0.16 * t }),
    ease: 'exit',
  },
  shrink: {
    label: 'Shrink',
    description: 'Collapses to nothing.',
    at: (t) => ({ opacity: 1 - t * 0.8, scale: 1 - 0.35 * t }),
    ease: 'exit',
  },
  'reveal-out': {
    label: 'Reveal Out',
    description: 'Wipes away from one edge without moving.',
    directional: true,
    at: (t) => ({ reveal: 1 - t }),
    ease: 'inOut',
  },
};

const EXIT_SECONDS: Record<MotionSpeed, number> = {
  slow: 0.7,
  medium: 0.5,
  fast: 0.32,
};

export type MotionWindow = {
  from: number;
  frames: number;
};

const merge = (base: MotionState, patch: Partial<MotionState>): MotionState => ({
  opacity: base.opacity * (patch.opacity ?? 1),
  x: base.x + (patch.x ?? 0),
  y: base.y + (patch.y ?? 0),
  scale: base.scale * (patch.scale ?? 1),
  rotate: base.rotate + (patch.rotate ?? 0),
  blur: Math.max(base.blur, patch.blur ?? 0),
  reveal: Math.min(base.reveal, patch.reveal ?? 1),
});

export const resolveMotion = (
  motion: ObjectMotionInput | undefined,
  frame: number,
  fps: number,
  window: MotionWindow,
): MotionState => {
  if (!motion) return REST;

  const local = frame - window.from;
  if (local < 0 || local >= window.frames) {
    return { ...REST, opacity: 0 };
  }

  const speed = motion.speed ?? 'medium';
  const distance = DISTANCE_FRACTION[motion.distance ?? 'medium'];
  const direction = motion.from ?? 'bottom';
  const delayFrames = Math.round((motion.delay ?? 0) * fps);

  let state: MotionState = { ...REST };

  const enterName = motion.enter && motion.enter !== 'none' ? motion.enter : null;
  const enterFrames = enterName
    ? Math.max(1, Math.round(SPEED_SECONDS[speed] * fps))
    : 0;
  let entering = false;

  if (enterName) {
    const recipe = ENTER[enterName];
    const since = local - delayFrames;
    if (since < 0) {
      return { ...REST, opacity: 0 };
    }
    const raw = clamp01(since / enterFrames);
    entering = raw < 1;
    const t = EASE[recipe.ease ?? 'settle'](raw);
    const patch = recipe.at(t, distance, direction);
    if (patch.opacity !== undefined && recipe.fadeEase) {
      patch.opacity = EASE[recipe.fadeEase](raw);
    }
    state = merge(state, patch);
  }

  const exitName = motion.exit && motion.exit !== 'none' ? motion.exit : null;
  const exitFrames = exitName
    ? Math.max(1, Math.round(EXIT_SECONDS[speed] * fps))
    : 0;
  const exitStart = window.frames - exitFrames;
  let exiting = false;

  if (exitName && local >= exitStart) {
    const recipe = EXIT[exitName];
    const raw = clamp01((local - exitStart) / exitFrames);
    exiting = true;
    const t = EASE[recipe.ease ?? 'exit'](raw);
    state = merge(state, recipe.at(t, distance, motion.exitTo ?? direction));
  }

  if (motion.emphasis && motion.emphasis !== 'none' && !entering && !exiting) {
    const recipe = EMPHASIS[motion.emphasis];
    const period = Math.max(1, recipe.period * fps);
    const since = local - delayFrames - enterFrames;
    if (since >= 0) {
      state = merge(state, recipe.at((since % period) / period));
    }
  }

  return state;
};

export type ObjectMotionInput = {
  enter?: EnterMotion;
  from?: MotionDirection;
  speed?: MotionSpeed;
  distance?: MotionDistance;
  emphasis?: EmphasisMotion;
  exit?: ExitMotion;
  exitTo?: MotionDirection;
  delay?: number;
};

export const ENTER_NAMES = Object.keys(ENTER) as Exclude<EnterMotion, 'none'>[];
export const EMPHASIS_NAMES = Object.keys(EMPHASIS) as Exclude<EmphasisMotion, 'none'>[];
export const EXIT_NAMES = Object.keys(EXIT) as Exclude<ExitMotion, 'none'>[];
