import React from 'react';
import { IDENTITY, StyleBlock, type MotionProps } from './primitives';

export const Static: React.FC<MotionProps> = ({
  element,
  frame,
  color,
  visual,
  transition,
}) => (
  <StyleBlock
    element={element}
    frame={frame}
    color={color}
    visual={visual}
    transition={transition}
    motion={{
      frames: 0,
      block: () => IDENTITY,
      word: () => IDENTITY,
      gain: 0,
    }}
  />
);
