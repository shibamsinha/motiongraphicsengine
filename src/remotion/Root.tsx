import React from 'react';
import { Composition } from 'remotion';
import {
  COMPOSITION_ID,
  MotionVideo,
  calculateMotionMetadata,
} from '../compositions/MotionVideo';
import { defaultScenes } from '../data/defaultScenes';
import { CANVAS } from '../utils/timing';

export const RemotionRoot: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={MotionVideo}
    durationInFrames={1}
    fps={CANVAS.fps}
    width={CANVAS.width}
    height={CANVAS.height}
    defaultProps={{ scenes: defaultScenes() }}
    calculateMetadata={calculateMotionMetadata}
  />
);
