import type { EnterMotion, EmphasisMotion, ExitMotion, MotionSpeed, MotionDistance, MotionDirection } from '../utils/objectMotion';

export type ObjectKind =
  | 'shape'
  | 'image'
  | 'icon'
  | 'card'
  | 'button'
  | 'logo'
  | 'cursor'
  | 'group';

export type ShapeKind = 'rectangle' | 'rounded' | 'circle' | 'line';

export type IconName =
  | 'check'
  | 'plus'
  | 'upload'
  | 'download'
  | 'folder'
  | 'file'
  | 'camera'
  | 'scan'
  | 'search'
  | 'arrow-right'
  | 'chevron-right'
  | 'close'
  | 'heart'
  | 'star'
  | 'bell'
  | 'user'
  | 'lock'
  | 'play';

export type ObjectState = 'default' | 'hover' | 'pressed' | 'active' | 'success' | 'error';

export type StateTransition = 'instant' | 'smooth' | 'spring' | 'morph' | 'fade';

export type StateChange = {
  at: number;
  to: ObjectState;
  transition?: StateTransition;
};

export type ObjectSurface = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  shadow?: 'none' | 'soft' | 'medium' | 'strong';
  glow?: 'none' | 'low' | 'medium' | 'high';
  glowColor?: string;
  blur?: number;
};

export type ObjectLabel = {
  text: string;
  color?: string;
  size?: number;
  weight?: number;
  align?: 'left' | 'center' | 'right';
  tracking?: number;
};

export type ObjectMotion = {
  enter?: EnterMotion;
  from?: MotionDirection;
  speed?: MotionSpeed;
  distance?: MotionDistance;
  emphasis?: EmphasisMotion;
  exit?: ExitMotion;
  exitTo?: MotionDirection;
  delay?: number;
};

export type SequenceMode = 'together' | 'after' | 'stagger';

type ObjectBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  layer?: number;
  motion?: ObjectMotion;
  start?: number;
  duration?: number;
  states?: StateChange[];
  note?: string;
};

export type ShapeObject = ObjectBase & {
  type: 'shape';
  shape: ShapeKind;
  surface?: ObjectSurface;
};

export type ImageObject = ObjectBase & {
  type: 'image';
  src: string;
  fit?: 'cover' | 'contain';
  surface?: ObjectSurface;
};

export type LogoObject = ObjectBase & {
  type: 'logo';
  src: string;
  fit?: 'cover' | 'contain';
  surface?: ObjectSurface;
};

export type IconObject = ObjectBase & {
  type: 'icon';
  icon: IconName;
  color?: string;
  weight?: number;
  surface?: ObjectSurface;
};

export type CardObject = ObjectBase & {
  type: 'card';
  surface?: ObjectSurface;
  title?: ObjectLabel;
  body?: ObjectLabel;
  children?: SceneObject[];
  sequence?: SequenceMode;
  stagger?: number;
};

export type ButtonObject = ObjectBase & {
  type: 'button';
  label?: ObjectLabel;
  icon?: IconName;
  surface?: ObjectSurface;
  stateStyles?: Partial<Record<ObjectState, ObjectSurface & { label?: ObjectLabel }>>;
};

export type CursorObject = ObjectBase & {
  type: 'cursor';
  stops: CursorStop[];
  variant?: 'arrow' | 'hand';
  color?: string;
};

export type CursorStop = {
  x: number;
  y: number;
  at: number;
  travel?: number;
  path?: 'straight' | 'arc' | 'curve';
  action?: 'none' | 'click' | 'press' | 'release' | 'hover';
  targetId?: string;
  targetState?: ObjectState;
};

export type GroupObject = ObjectBase & {
  type: 'group';
  children: SceneObject[];
  sequence?: SequenceMode;
  stagger?: number;
};

export type SceneObject =
  | ShapeObject
  | ImageObject
  | IconObject
  | CardObject
  | ButtonObject
  | LogoObject
  | CursorObject
  | GroupObject;

export const isContainer = (
  object: SceneObject,
): object is CardObject | GroupObject =>
  object.type === 'card' || object.type === 'group';
