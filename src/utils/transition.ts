import type { AnimationStyle, VideoConfig } from '../types/scene';
import type { BlockLayout, PlannedWord, ScenePlan } from './plan';
import type { ExitSpec } from '../components/motion/primitives';
import { CANVAS } from './timing';
import { EXIT_EASE } from './easing';

export type CarrySource = {
  cx: number;
  cy: number;
  fontSize: number;
};

export type SceneTransition = {
  frames: number;
  carryFrames: number;
  fieldChanges: boolean;
  exiting: PlannedWord[];
  carried: Map<string, CarrySource>;
  cross: { x: number; y: number };
};

export const NO_TRANSITION: SceneTransition = {
  frames: 0,
  carryFrames: 0,
  fieldChanges: false,
  exiting: [],
  carried: new Map(),
  cross: { x: 0, y: 0 },
};

const OVERLAP_SECONDS: Record<AnimationStyle, number> = {
  massive: 0.2,
  punch: 0.16,
  stack: 0.11,
  slide: 0.22,
  rapid: 0.08,
  none: 0,
};

export const exitSpecFor = (
  style: AnimationStyle,
  frames: number,
  fieldChanges = false,
  canvas: VideoConfig = CANVAS,
): Omit<ExitSpec, 'start'> => {
  const ease = EXIT_EASE[style];
  const fadeEase = fieldChanges ? 'reveal' : 'exitFade';
  switch (style) {
    case 'massive':
      return { frames, toScale: 1.42, toY: -canvas.height * 0.045, ease, fadeEase };
    case 'slide':
      return { frames, toX: -canvas.width * 0.62, toScale: 0.97, ease, fadeEase };
    case 'stack':
      return { frames, toY: -canvas.height * 0.08, toScale: 0.94, ease, fadeEase };
    case 'rapid':
      return { frames, toScale: 1.06, ease, fadeEase };
    case 'none':
      return { frames, ease, fadeEase };
    case 'punch':
    default:
      return { frames, toScale: 1.12, toY: -canvas.height * 0.075, ease, fadeEase };
  }
};

const CROSS_RATIO = 0.75;

const key = (text: string): string =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export type ExitPiece = {
  block: BlockLayout;
  style: AnimationStyle;
  motion: number;
  visual: import('./visualStyle').VisualStyleConfig;
};

export const exitPiecesOf = (plan: ScenePlan): ExitPiece[] =>
  plan.elements.map((element) => ({
    block:
      element.style === 'rapid' && element.beats.length > 0
        ? element.beats[element.beats.length - 1].block
        : element.block,
    style: element.exitStyle,
    motion: element.motion,
    visual: element.visual,
  }));

const wordsOf = (block: BlockLayout): PlannedWord[] =>
  block.lines.flatMap((line) => line.words);

const outgoingWords = (plan: ScenePlan): PlannedWord[] =>
  exitPiecesOf(plan).flatMap((piece) => wordsOf(piece.block));

const incomingWords = (plan: ScenePlan): PlannedWord[] =>
  plan.elements.flatMap((element) => wordsOf(element.block));

export const planTransition = (
  from: ScenePlan | null,
  to: ScenePlan,
  fps: number,
  fieldChanges = false,
  canvas: VideoConfig = CANVAS,
): SceneTransition => {
  if (!from) return NO_TRANSITION;

  const exitStyle = from.scene.exit ?? from.style;
  const seconds = from.scene.exitFrames !== undefined
    ? from.scene.exitFrames / fps
    : OVERLAP_SECONDS[exitStyle] ?? 0.12;
  if (seconds <= 0) return NO_TRANSITION;

  const carryFrames = Math.max(
    0,
    Math.min(Math.round(seconds * fps), Math.floor(to.durationInFrames * 0.34)),
  );
  const frames = fieldChanges
    ? Math.min(carryFrames, Math.round(fps * 0.1))
    : carryFrames;
  if (carryFrames < 1) return NO_TRANSITION;

  const carried = new Map<string, CarrySource>();
  const outgoing = outgoingWords(from);
  const used = new Set<string>();

  if (from.style !== 'rapid' && to.style !== 'rapid') {
    const pool = new Map<string, PlannedWord[]>();
    for (const word of outgoing) {
      const k = key(word.text);
      if (!k) continue;
      const list = pool.get(k);
      if (list) list.push(word);
      else pool.set(k, [word]);
    }

    for (const word of incomingWords(to)) {
      const k = key(word.text);
      if (!k) continue;
      const source = pool.get(k)?.shift();
      if (!source) continue;
      used.add(source.id);
      carried.set(word.id, {
        cx: source.cx,
        cy: source.cy,
        fontSize: source.fontSize,
      });
    }
  }

  const exit = exitSpecFor(from.style, frames, fieldChanges, canvas);
  const cross = {
    x: -(exit.toX ?? 0) * CROSS_RATIO,
    y: -(exit.toY ?? 0) * CROSS_RATIO,
  };

  return {
    frames,
    carryFrames,
    fieldChanges,
    exiting: outgoing.filter((word) => !used.has(word.id)),
    carried,
    cross,
  };
};

export const carryOffset = (
  word: PlannedWord,
  source: CarrySource,
): { x: number; y: number; scale: number } => ({
  x: source.cx - word.cx,
  y: source.cy - word.cy,
  scale: word.fontSize > 0 ? source.fontSize / word.fontSize : 1,
});
