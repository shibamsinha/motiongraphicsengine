import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import type { ProjectAudio } from '../../types/audio';

const resolveAudioSrc = (src: string): string =>
  /^(https?:)?\/\//.test(src) || src.startsWith('data:') ? src : staticFile(src);

export const AudioTrack: React.FC<{
  audio: ProjectAudio;
  fps: number;
  durationInFrames: number;
}> = ({ audio, fps, durationInFrames }) => {
  const seconds = (value: number) => Math.round(value * fps);

  const from = Math.max(0, seconds(audio.timelineStart));
  const selection = Math.max(0, seconds(audio.sourceEnd) - seconds(audio.sourceStart));

  const available = Math.max(0, durationInFrames - from);
  const playFor = Math.min(selection, available);
  if (playFor <= 0) return null;

  const fadeInFrames = Math.max(0, seconds(audio.fadeIn ?? 0));
  const fadeOutFrames = Math.max(0, seconds(audio.fadeOut ?? 0));
  const base = audio.muted ? 0 : Math.max(0, Math.min(1, audio.volume ?? 1));

  const volume =
    fadeInFrames === 0 && fadeOutFrames === 0
      ? base
      : (frame: number) => {
          let v = base;
          if (fadeInFrames > 0 && frame < fadeInFrames) {
            v *= frame / fadeInFrames;
          }
          const fromEnd = playFor - frame;
          if (fadeOutFrames > 0 && fromEnd < fadeOutFrames) {
            v *= Math.max(0, fromEnd / fadeOutFrames);
          }
          return Math.max(0, Math.min(1, v));
        };

  return (
    <Sequence from={from} durationInFrames={playFor} layout="none" name="Audio">
      <Audio
        src={resolveAudioSrc(audio.src)}
        trimBefore={seconds(audio.sourceStart)}
        trimAfter={seconds(audio.sourceEnd)}
        volume={volume}
        loop={audio.loop ?? false}
        onError={(error) => {
          console.warn('[mge] audio failed to load:', audio.src, error.message);
        }}
      />
    </Sequence>
  );
};
