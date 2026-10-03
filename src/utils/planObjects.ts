import type {
  ObjectState,
  SceneObject,
  StateTransition,
} from '../types/object';
import { isContainer } from '../types/object';
import type { MotionWindow, ObjectMotionInput } from './objectMotion';

export type ResolvedState = {
  at: number;
  state: ObjectState;
  transition: StateTransition;
};

export type PlannedObject = {
  object: SceneObject;
  window: MotionWindow;
  motion?: ObjectMotionInput;
  layer: number;
  children: PlannedObject[];
  states: ResolvedState[];
};

export type ObjectPlan = {
  objects: PlannedObject[];
  hasCursor: boolean;
};

const frames = (seconds: number, fps: number): number =>
  Math.max(0, Math.round(seconds * fps));

export const TRANSITION_SECONDS: Record<StateTransition, number> = {
  instant: 0,
  smooth: 0.28,
  spring: 0.42,
  morph: 0.5,
  fade: 0.34,
};

const sequenceOffset = (
  mode: 'together' | 'after' | 'stagger' | undefined,
  index: number,
  stagger: number,
  previousEnd: number,
): number => {
  if (!mode || mode === 'together') return 0;
  if (mode === 'stagger') return index * stagger;
  return previousEnd;
};

const planOne = (
  object: SceneObject,
  index: number,
  fps: number,
  parentWindow: MotionWindow,
  extraDelay: number,
): PlannedObject => {
  const startFrames = parentWindow.from + frames(object.start ?? 0, fps) + extraDelay;
  const available = Math.max(0, parentWindow.from + parentWindow.frames - startFrames);
  const own = object.duration !== undefined ? frames(object.duration, fps) : available;
  const window: MotionWindow = {
    from: startFrames,
    frames: Math.max(0, Math.min(own, available)),
  };

  const states: ResolvedState[] = [
    { at: window.from, state: 'default' as ObjectState, transition: 'instant' as StateTransition },
    ...(object.states ?? []).map((change) => ({
      at: window.from + frames(change.at, fps),
      state: change.to,
      transition: change.transition ?? 'smooth',
    })),
  ].sort((a, b) => a.at - b.at);

  let children: PlannedObject[] = [];
  if (isContainer(object) && object.children?.length) {
    const stagger = object.stagger ?? 0.12;
    let previousEnd = 0;
    children = object.children.map((child, i) => {
      const offset = sequenceOffset(object.sequence, i, frames(stagger, fps), previousEnd);
      const planned = planOne(child, i, fps, window, offset);
      const enterSeconds = child.motion?.enter && child.motion.enter !== 'none' ? 0.45 : 0;
      previousEnd = offset + frames(enterSeconds, fps);
      return planned;
    });
  }

  return {
    object,
    window,
    motion: object.motion,
    layer: object.layer ?? index,
    children,
    states,
  };
};

const applyCursorActions = (
  planned: PlannedObject[],
  objects: SceneObject[],
  fps: number,
): void => {
  const byId = new Map<string, PlannedObject>();
  const index = (list: PlannedObject[]): void => {
    for (const item of list) {
      byId.set(item.object.id, item);
      index(item.children);
    }
  };
  index(planned);

  const walk = (list: SceneObject[]): void => {
    for (const object of list) {
      if (object.type === 'cursor') {
        for (const stop of object.stops ?? []) {
          if (!stop.targetId || !stop.targetState) continue;
          const target = byId.get(stop.targetId);
          if (!target) continue;
          target.states.push({
            at: frames(stop.at, fps),
            state: stop.targetState,
            transition: stop.action === 'click' ? 'spring' : 'smooth',
          });
          target.states.sort((a, b) => a.at - b.at);
        }
      }
      if (isContainer(object) && object.children?.length) walk(object.children);
    }
  };
  walk(objects);
};

export const planObjects = (
  objects: SceneObject[] | undefined,
  durationInFrames: number,
  fps: number,
): ObjectPlan => {
  if (!objects || objects.length === 0) {
    return { objects: [], hasCursor: false };
  }

  const scene: MotionWindow = { from: 0, frames: durationInFrames };
  const planned = objects.map((object, i) => planOne(object, i, fps, scene, 0));

  applyCursorActions(planned, objects, fps);

  planned.sort((a, b) => a.layer - b.layer);

  const anyCursor = (list: SceneObject[]): boolean =>
    list.some(
      (o) => o.type === 'cursor' || (isContainer(o) && anyCursor(o.children ?? [])),
    );

  return { objects: planned, hasCursor: anyCursor(objects) };
};

export const stateAtFrame = (
  states: ResolvedState[],
  frame: number,
  fps: number,
): { from: ObjectState; to: ObjectState; progress: number } => {
  let current = states[0] ?? { at: 0, state: 'default' as ObjectState, transition: 'instant' as StateTransition };
  let previous = current;
  for (const entry of states) {
    if (entry.at <= frame) {
      previous = current;
      current = entry;
    } else break;
  }
  if (current === previous) {
    return { from: current.state, to: current.state, progress: 1 };
  }
  const span = Math.max(1, Math.round(TRANSITION_SECONDS[current.transition] * fps));
  const progress = Math.min(1, Math.max(0, (frame - current.at) / span));
  return { from: previous.state, to: current.state, progress };
};
