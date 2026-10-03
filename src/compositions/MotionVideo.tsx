import React from 'react';
import { AbsoluteFill, Series, useVideoConfig } from 'remotion';
import type { CalculateMetadataFunction } from 'remotion';
import type { MotionVideoProps } from '../types/scene';
import { buildTimeline, canvasFor, totalFrames } from '../utils/timing';
import { DEFAULT_PALETTE, FIELDS } from '../utils/typography';
import { OverlayLayer } from '../components/motion/OverlayLayer';
import { AudioTrack } from '../components/motion/AudioTrack';
import { SceneRenderer } from './SceneRenderer';

export const MotionVideo: React.FC<MotionVideoProps> = ({
  scenes,
  palette = DEFAULT_PALETTE,
  fields,
  ink,
  accent,
  overlay,
  audio,
}) => {
  const { fps, width, height } = useVideoConfig();
  const canvas = { width, height, fps };
  const timeline = buildTimeline(scenes, fps);
  const base = fields?.cream ?? FIELDS.cream;

  if (timeline.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: base }} />;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: base, overflow: 'hidden' }}>
      <Series>
        {timeline.map((entry, index) => {
          const before = index > 0 ? timeline[index - 1] : undefined;
          return (
            <Series.Sequence
              key={entry.scene.id}
              durationInFrames={entry.durationInFrames}
              layout="none"
            >
              <SceneRenderer
                scene={entry.scene}
                durationInFrames={entry.durationInFrames}
                palette={palette}
                fields={fields}
                ink={ink}
                accent={accent}
                previous={
                  before
                    ? {
                        scene: before.scene,
                        durationInFrames: before.durationInFrames,
                      }
                    : undefined
                }
              />
            </Series.Sequence>
          );
        })}
      </Series>
      {overlay ? (
        <OverlayLayer overlay={overlay} scenes={scenes} fps={fps} canvas={canvas} />
      ) : null}
      {audio ? (
        <AudioTrack
          audio={audio}
          fps={fps}
          durationInFrames={totalFrames(scenes, fps)}
        />
      ) : null}
    </AbsoluteFill>
  );
};

export const calculateMotionMetadata: CalculateMetadataFunction<
  MotionVideoProps
> = ({ props }) => {
  const canvas = canvasFor(props.format);
  return {
    durationInFrames: totalFrames(props.scenes ?? [], canvas.fps),
    fps: canvas.fps,
    width: canvas.width,
    height: canvas.height,
  };
};

export const COMPOSITION_ID = 'MotionVideo';
