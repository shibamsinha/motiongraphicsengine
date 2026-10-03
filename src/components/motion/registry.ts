import type React from 'react';
import type {
  AnimationStyle,
  BackgroundName,
  PaletteName,
} from '../../types/scene';
import type { ScenePlan } from '../../utils/plan';
import { DEFAULT_PALETTE, flipBackground } from '../../utils/typography';
import type { MotionProps } from './primitives';
import { Massive } from './Massive';
import { Punch } from './Punch';
import { Slide } from './Slide';
import { Stack, stackBackground } from './Stack';
import { Rapid, rapidBackground } from './Rapid';
import { Static } from './Static';

export type MotionStyleDefinition = {
  id: AnimationStyle;
  label: string;
  description: string;
  Component: React.FC<MotionProps>;
  backgroundAt?: (
    plan: ScenePlan,
    frame: number,
    palette: PaletteName,
  ) => BackgroundName;
  supports: {
    direction?: boolean;
    flipBackground?: boolean;
  };
};

export const MOTION_STYLES: Record<AnimationStyle, MotionStyleDefinition> = {
  massive: {
    id: 'massive',
    label: 'Massive',
    description: 'Small to enormous in one move. Type runs past the frame edge.',
    Component: Massive,
    supports: {},
  },
  punch: {
    id: 'punch',
    label: 'Punch',
    description: 'Fast scale to 100% with a sub-1% overshoot. The workhorse.',
    Component: Punch,
    supports: {},
  },
  stack: {
    id: 'stack',
    label: 'Stack',
    description: 'Words land one by one into a pre-solved layout. Nothing shifts.',
    Component: Stack,
    backgroundAt: stackBackground,
    supports: { flipBackground: true },
  },
  slide: {
    id: 'slide',
    label: 'Slide',
    description: 'Travels in from an edge and settles on an exponential curve.',
    Component: Slide,
    backgroundAt: undefined,
    supports: { direction: true },
  },
  none: {
    id: 'none',
    label: 'None',
    description: 'No motion at all. The type is simply there — a held card, cut to.',
    Component: Static,
    supports: {},
  },
  rapid: {
    id: 'rapid',
    label: 'Rapid',
    description: 'Staccato cuts, alternating field. One line or beat per item.',
    Component: Rapid,
    backgroundAt: rapidBackground,
    supports: { flipBackground: true },
  },
};

export const ANIMATION_STYLES: AnimationStyle[] = [
  'massive',
  'punch',
  'stack',
  'slide',
  'rapid',
  'none',
];

export const styleDefinition = (style: AnimationStyle): MotionStyleDefinition =>
  MOTION_STYLES[style] ?? MOTION_STYLES.punch;

export const backgroundForFrame = (
  plan: ScenePlan,
  frame: number,
  palette: PaletteName = DEFAULT_PALETTE,
): BackgroundName => {
  const motion = plan.scene.backgroundMotion;
  if (motion && motion.mode === 'alternate') {
    const every = Math.max(1, Math.round(motion.everyFrames));
    const flips = Math.floor(Math.max(0, frame) / every);
    const limit = motion.times === undefined
      ? flips
      : Math.min(flips, Math.max(0, Math.round(motion.times)));
    return limit % 2 === 0
      ? plan.scene.background
      : flipBackground(plan.scene.background, palette);
  }

  const definition = styleDefinition(plan.style);
  return definition.backgroundAt
    ? definition.backgroundAt(plan, frame, palette)
    : plan.scene.background;
};
