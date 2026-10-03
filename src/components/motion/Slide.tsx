import React from 'react';
import type { SlideDirection, VideoConfig } from '../../types/scene';
import { BLUR_GAIN } from '../../utils/motionBlur';
import {
  ENTER,
  enterTiming,
  StyleBlock,
  enterValues,
  type MotionProps,
} from './primitives';

const offsetFor = (
  direction: SlideDirection,
  canvas: VideoConfig,
): { x: number; y: number } => {
  const throwY = canvas.height * 0.068;
  const throwX = canvas.width * 0.42;
  switch (direction) {
    case 'left':
      return { x: -throwX, y: 0 };
    case 'right':
      return { x: throwX, y: 0 };
    case 'top':
      return { x: 0, y: -throwY };
    case 'bottom':
    default:
      return { x: 0, y: throwY };
  }
};

export const Slide: React.FC<MotionProps> = ({
  plan,
  element,
  frame,
  fps,
  color,
  visual,
  transition,
  canvas,
}) => {
  const direction = plan.scene.direction ?? 'bottom';
  const { x, y } = offsetFor(direction, canvas);
  const horizontal = direction === 'left' || direction === 'right';
  const enter = enterTiming(element, ENTER.transform * (horizontal ? 1.1 : 0.95), fps);
  const transformFrames = enter.frames;
  const opacityFrames = enter.channel(ENTER.opacity * 0.7);
  const blurFrames = enter.channel(ENTER.blur);

  return (
    <StyleBlock
      element={element}
      frame={frame}
      color={color}
      visual={visual}
      transition={transition}
      motion={{
        frames: transformFrames,
        ease: 'slideEnter',
        block: (f) =>
          enterValues(f, {
            fromX: x,
            fromY: y,
            transformFrames,
            opacityFrames,
            blurFrames,
            transformEase: 'slideEnter',
          }),
        word: (f, word) =>
          enterValues(f, {
            start: word.start,
            fromX: word.role === 'hero' ? x : x * 0.45,
            fromY: word.role === 'hero' ? y : y * 0.45 + word.fontSize * 0.2,
            transformFrames,
            opacityFrames,
            blurFrames,
            transformEase: 'slideEnter',
          }),
        gain: BLUR_GAIN.slide,
      }}
    />
  );
};
