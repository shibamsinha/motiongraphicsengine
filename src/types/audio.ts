export type ProjectAudio = {
  src: string;
  name?: string;
  sourceDuration?: number;

  sourceStart: number;
  sourceEnd: number;

  timelineStart: number;

  volume: number;
  muted?: boolean;

  fadeIn?: number;
  fadeOut?: number;

  loop?: boolean;
};

export const AUDIO_EXTENSIONS = [
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.weba', '.webm', '.flac',
];

export const audioSelectionLength = (audio: ProjectAudio): number =>
  Math.max(0, audio.sourceEnd - audio.sourceStart);

export const defaultSelection = (
  sourceDuration: number,
  videoSeconds: number,
): { sourceStart: number; sourceEnd: number } => ({
  sourceStart: 0,
  sourceEnd: Math.min(sourceDuration, Math.max(videoSeconds, 0.1)),
});
