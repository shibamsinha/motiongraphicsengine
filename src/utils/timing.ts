import type { CanvasFormat, Scene, VideoConfig } from '../types/scene';

export const CANVAS_FORMATS: Record<CanvasFormat, VideoConfig> = {
  portrait: { width: 1080, height: 1920, fps: 30 },
  landscape: { width: 1920, height: 1080, fps: 30 },
};

export const FORMAT_LABEL: Record<CanvasFormat, string> = {
  portrait: 'Portrait · 9:16',
  landscape: 'Landscape · 16:9',
};

export const DEFAULT_FORMAT: CanvasFormat = 'portrait';

export const canvasFor = (format: CanvasFormat = DEFAULT_FORMAT): VideoConfig =>
  CANVAS_FORMATS[format] ?? CANVAS_FORMATS[DEFAULT_FORMAT];

export const CANVAS: VideoConfig = CANVAS_FORMATS.portrait;

export const MIN_SCENE_DURATION = 1 / 30;
export const MAX_SCENE_DURATION = 12;

export const secondsToFrames = (seconds: number, fps: number): number =>
  Math.max(1, Math.round(seconds * fps));

export const framesToSeconds = (frames: number, fps: number): number =>
  frames / fps;

export const sceneFrames = (scene: Scene, fps: number): number =>
  secondsToFrames(scene.duration, fps);

export type TimelineEntry = {
  scene: Scene;
  index: number;
  from: number;
  durationInFrames: number;
  fromSeconds: number;
  durationInSeconds: number;
};

export const buildTimeline = (
  scenes: Scene[],
  fps: number = CANVAS.fps,
): TimelineEntry[] => {
  let cursor = 0;
  return scenes.map((scene, index) => {
    const durationInFrames = sceneFrames(scene, fps);
    const entry: TimelineEntry = {
      scene,
      index,
      from: cursor,
      durationInFrames,
      fromSeconds: cursor / fps,
      durationInSeconds: durationInFrames / fps,
    };
    cursor += durationInFrames;
    return entry;
  });
};

export const totalFrames = (scenes: Scene[], fps: number = CANVAS.fps): number =>
  Math.max(
    1,
    scenes.reduce((sum, scene) => sum + sceneFrames(scene, fps), 0),
  );

export const totalSeconds = (scenes: Scene[], fps: number = CANVAS.fps): number =>
  totalFrames(scenes, fps) / fps;

export const sceneAtFrame = (
  timeline: TimelineEntry[],
  frame: number,
): TimelineEntry | undefined =>
  timeline.find(
    (entry) => frame >= entry.from && frame < entry.from + entry.durationInFrames,
  );

export const distributeFrames = (frames: number, count: number): number[] => {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_unused, index) =>
    Math.round(((index + 1) * frames) / count) -
    Math.round((index * frames) / count),
  );
};

export const cumulative = (lengths: number[]): number[] => {
  let cursor = 0;
  return lengths.map((length) => {
    const from = cursor;
    cursor += length;
    return from;
  });
};

export const formatSeconds = (seconds: number): string =>
  `${seconds.toFixed(2).replace(/0$/, '')}s`;
