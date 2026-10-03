import React from 'react';
import { BLUR_GAIN } from '../../utils/motionBlur';
import {
  ENTER,
  ENTER_SECONDS,
  StyleBlock,
  enterTiming,
  enterValues,
  type MotionProps,
} from './primitives';

export const Punch: React.FC<MotionProps> = ({
  element,
  frame,
  fps,
  color,
  visual,
  transition,
}) => {
  const enter = enterTiming(element, ENTER_SECONDS.punch, fps);
  const transformFrames = enter.frames;
  const opacityFrames = enter.channel(ENTER.opacity * 0.75);
  const blurFrames = enter.channel(ENTER.blur * 0.8);

  return (
    <StyleBlock
      element={element}
      frame={frame}
      color={color}
      visual={visual}
      transition={transition}
      motion={{
        frames: transformFrames,
        ease: 'punchEnter',
        block: (f) =>
          enterValues(f, {
            fromScale: 0.85,
            blur: 3,
            transformFrames,
            opacityFrames,
            blurFrames,
            transformEase: 'punchEnter',
          }),
        word: (f, word) =>
          enterValues(f, {
            start: word.start,
            fromScale: word.role === 'hero' ? 0.85 : 0.94,
            fromY: word.role === 'hero' ? 0 : word.fontSize * 0.28,
            transformFrames,
            opacityFrames,
            blurFrames,
            transformEase: 'punchEnter',
          }),
        gain: BLUR_GAIN.punch,
      }}
    />
  );
};
