import React from 'react';
import { EASE, clamp01 } from '../../utils/easing';
import { BLUR_GAIN } from '../../utils/motionBlur';
import {
  ENTER,
  ENTER_SECONDS,
  enterTiming,
  StyleBlock,
  combine,
  enterValues,
  framesFor,
  type MotionProps,
} from './primitives';

export const Massive: React.FC<MotionProps> = ({
  element,
  frame,
  fps,
  durationInFrames,
  color,
  visual,
  transition,
  canvas,
}) => {
  const enter = enterTiming(element, ENTER_SECONDS.massive, fps);
  const transformFrames = enter.frames;
  const blurFrames = framesFor(ENTER.blur, fps);
  const opacityFrames = framesFor(ENTER.opacity * 0.7, fps);

  const driftStart = transformFrames;
  const driftSpan = Math.max(1, durationInFrames - driftStart);

  const block = (f: number) => {
    const entrance = enterValues(f, {
      fromScale: 0.34,
      fromY: canvas.height * 0.025,
      blur: 5,
      transformFrames,
      opacityFrames,
      blurFrames,
      transformEase: 'massiveEnter',
    });
    const drift = EASE.inOut(clamp01((f - driftStart) / driftSpan));
    return combine(entrance, { scale: 1 + 0.025 * drift });
  };

  return (
    <StyleBlock
      element={element}
      frame={frame}
      color={color}
      visual={visual}
      transition={transition}
      motion={{
        block,
        frames: transformFrames,
        ease: 'massiveEnter',
        word: (f, word) =>
          enterValues(f, {
            start: word.start,
            fromScale: word.role === 'hero' ? 0.34 : 1,
            fromY:
              word.role === 'hero' ? canvas.height * 0.025 : word.fontSize * 0.35,
            transformFrames,
            opacityFrames,
            blurFrames,
            transformEase: 'massiveEnter',
          }),
        gain: BLUR_GAIN.massive,
      }}
    />
  );
};
