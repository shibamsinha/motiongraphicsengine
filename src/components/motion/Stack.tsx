import React from 'react';
import type { BackgroundName, PaletteName } from '../../types/scene';
import { flipBackground } from '../../utils/typography';
import type { ScenePlan } from '../../utils/plan';
import { BLUR_GAIN, velocityBlur } from '../../utils/motionBlur';
import { carryOffset } from '../../utils/transition';
import {
  MotionSpan,
  TypeBlock,
  amplify,
  carryValues,
  ENTER_SECONDS,
  enterTiming,
  enterValues,
  framesFor,
  type MotionProps,
} from './primitives';

const HIDDEN = { opacity: 0, x: 0, y: 0, scale: 1, blur: 0, rotate: 0 };
const SOLID = { opacity: 1, x: 0, y: 0, scale: 1, blur: 0, rotate: 0 };

export const stackStepAt = (plan: ScenePlan, frame: number): number => {
  const words = plan.block.lines.flatMap((line) => line.words);
  let step = 0;
  for (const word of words) {
    if (frame >= word.start) step += 1;
  }
  return Math.max(0, step - 1);
};

export const stackBackground = (
  plan: ScenePlan,
  frame: number,
  palette: PaletteName,
): BackgroundName => {
  if (!plan.scene.flipBackground) return plan.scene.background;
  return stackStepAt(plan, frame) % 2 === 1
    ? flipBackground(plan.scene.background, palette)
    : plan.scene.background;
};

export const Stack: React.FC<MotionProps> = ({
  element,
  frame,
  fps,
  color,
  visual,
  transition,
}) => {
  const enter = enterTiming(element, ENTER_SECONDS.stack, fps);
  const transformFrames = enter.frames;
  const opacityFrames = framesFor(0.07, fps);
  const blurFrames = framesFor(0.06, fps);

  return (
    <TypeBlock
      block={element.block}
      color={color}
      visual={visual}
      wordColors={element.wordColors}
      renderWord={(word, _line, glyph) => {
        const source = transition?.carried.get(word.id);
        if (source && transition) {
          const offset = carryOffset(word, source);
          const carry = (f: number) => carryValues(f, transition.carryFrames, offset);
          return (
            <MotionSpan
              values={carry(frame)}
              blur={velocityBlur(carry, frame, word.fontSize, BLUR_GAIN.stack)}
            >
              {glyph}
            </MotionSpan>
          );
        }

        if (frame < word.start) {
          return (
            <MotionSpan values={HIDDEN} style={{ visibility: 'hidden' }}>
              {glyph}
            </MotionSpan>
          );
        }

        if (word.start === element.delay) {
          return <MotionSpan values={SOLID}>{glyph}</MotionSpan>;
        }

        const enter = (f: number) =>
          amplify(
            enterValues(f, {
              start: word.start,
              fromY: word.fontSize * (word.role === 'hero' ? 0.1 : 0.17),
              fromScale: word.role === 'hero' ? 0.98 : 1,
              transformFrames,
              opacityFrames,
              blurFrames,
              transformEase: 'stackEnter',
            }),
            element.motion,
          );
        return (
          <MotionSpan
            values={enter(frame)}
            blur={velocityBlur(enter, frame, word.fontSize, BLUR_GAIN.stack)}
          >
            {glyph}
          </MotionSpan>
        );
      }}
    />
  );
};
