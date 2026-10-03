import type { VisualStyleConfig, VisualStyleName } from '../utils/visualStyle';
import type { FontRole } from '../utils/typography';
import type { SceneObject } from './object';
import type { ProjectAudio } from './audio';

export type AnimationStyle = 'massive' | 'punch' | 'stack' | 'slide' | 'rapid' | 'none';

export type BackgroundName = 'green' | 'cream' | 'black';

export type TextRole = 'primary' | 'secondary' | 'emphasis' | 'support';

export type SizePreset = 'xs' | 'small' | 'medium' | 'large' | 'huge' | 'oversized';

export type PositionPreset =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'edge-left'
  | 'edge-right'
  | 'edge-top'
  | 'edge-bottom'
  | 'offscreen-left'
  | 'offscreen-right'
  | 'offscreen-top'
  | 'offscreen-bottom';

export type CompositionPreset =
  | 'center'
  | 'left-stack'
  | 'right-stack'
  | 'top-statement'
  | 'bottom-statement'
  | 'split'
  | 'oversized-center'
  | 'corner';

export type TextFit = {
  mode: 'width';
  maxWidth: number;
};

export type WordStagger = {
  type: 'word';
  delayFrames: number;
  order?: 'forward' | 'reverse';
};

export type BackgroundMotion = {
  mode: 'alternate';
  everyFrames: number;
  times?: number;
};

export type SceneElement = {
  id: string;
  text: string;
  role?: TextRole;
  visualStyle?: VisualStyleName;
  styleConfig?: VisualStyleConfig;
  size?: SizePreset;
  fit?: TextFit;
  fontRole?: FontRole;
  position?: PositionPreset;
  animation?: AnimationStyle;
  exit?: AnimationStyle;
  stagger?: WordStagger;
  align?: Alignment;
  emphasis?: string[];
  wordColors?: Record<string, string>;

  case?: TextCase;
  scale?: number;
  delay?: number;
  enterFrames?: number;
  from?: PositionPreset;
  x?: number;
  y?: number;
};

export type PaletteName = 'forest' | 'ink';

export type Alignment = 'left' | 'center' | 'right';

export type SlideDirection = 'left' | 'right' | 'top' | 'bottom';

export type TextCase = 'lower' | 'upper' | 'as-typed';

export type ImagePlacement = 'full' | 'panel' | 'split' | 'free';

export type ImageSide = 'top' | 'bottom';

export type ImageFit = 'cover' | 'contain';

export type ImageLayer = 'behind' | 'front';

export type SceneImage = {
  src: string;
  placement: ImagePlacement;
  side?: ImageSide;
  size?: number;
  scrim?: number;
  focusX?: number;
  focusY?: number;

  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fit?: ImageFit;
  layer?: ImageLayer;
  naturalWidth?: number;
  naturalHeight?: number;
};

export type OverlayImage = {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fit?: ImageFit;
  opacity?: number;
};

export type Scene = {
  id: string;
  duration: number;
  text: string;
  style: AnimationStyle;
  background: BackgroundName;
  alignment: Alignment;
  emphasis?: string[];
  wordColors?: Record<string, string>;
  fontSize?: number;
  exit?: AnimationStyle;
  exitFrames?: number;
  stagger?: WordStagger;
  backgroundMotion?: BackgroundMotion;
  fit?: TextFit;
  fontRole?: FontRole;
  enterFrames?: number;
  direction?: SlideDirection;
  flipBackground?: boolean;
  case?: TextCase;
  composition?: CompositionPreset;
  visualStyle?: VisualStyleName;
  styleConfig?: VisualStyleConfig;
  elements?: SceneElement[];
  image?: SceneImage;
  objects?: SceneObject[];
  hideOverlay?: boolean;
  note?: string;
};

export type WordAnimation = {
  text: string;
  start: number;
  duration: number;
  style: AnimationStyle;
  fontSize?: number;
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
};

export type VideoConfig = {
  width: number;
  height: number;
  fps: number;
};

export type CanvasFormat = 'portrait' | 'landscape';

export type MotionVideoProps = {
  scenes: Scene[];
  format?: CanvasFormat;
  palette?: PaletteName;
  fields?: Partial<Record<BackgroundName, string>>;
  ink?: Partial<Record<BackgroundName, string>>;
  accent?: string;
  overlay?: OverlayImage;
  audio?: ProjectAudio;
};
