import type { AnimationStyle, BackgroundName, Scene, SceneElement } from '../types/scene';
import { blankScene, element } from './defaultScenes';
import { splitWords } from '../utils/typography';

export type PhrasePacing = 'even' | 'accelerate' | 'decelerate';

export type PhraseBuildOptions = {
  sentence: string;
  phrases?: string[];
  totalFrames?: number;
  framesPerPhrase?: number[];
  pacing?: PhrasePacing;
  finalWordEmphasis?: boolean;
  staggerFrames?: number;
  enterFrames?: number;
  style?: AnimationStyle;
  finalStyle?: AnimationStyle;
  background?: BackgroundName;
  finalStrobeFrames?: number;
  fitWidth?: number;
};

export type PhraseBuildResult = {
  scenes: Scene[];
  phrases: string[];
  framesPerPhrase: number[];
  finalWord: string | null;
};

const MIN_PHRASE_FRAMES = 3;
const DEFAULT_TOTAL_FRAMES = 90;

export const splitPhrases = (sentence: string, wordsPerPhrase = 3): string[] => {
  const trimmed = sentence.trim();
  if (!trimmed) return [];

  const punctuated = trimmed
    .split(/(?<=[.,;:!?—])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (punctuated.length > 1) return punctuated;

  const words = splitWords(trimmed);
  if (words.length <= wordsPerPhrase) return [trimmed];

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerPhrase) {
    chunks.push(words.slice(i, i + wordsPerPhrase).join(' '));
  }
  return chunks;
};

export const pacePhrases = (
  count: number,
  totalFrames: number,
  pacing: PhrasePacing = 'accelerate',
): number[] => {
  if (count <= 0) return [];
  const budget = Math.max(count * MIN_PHRASE_FRAMES, Math.round(totalFrames));

  const weights = Array.from({ length: count }, (_unused, i) => {
    if (pacing === 'even' || count === 1) return 1;
    const t = i / (count - 1);
    return pacing === 'accelerate' ? 1 - 0.45 * t : 0.55 + 0.45 * t;
  });

  const sum = weights.reduce((total, weight) => total + weight, 0);
  const raw = weights.map((weight) => (weight / sum) * budget);

  const frames = raw.map((value) => Math.max(MIN_PHRASE_FRAMES, Math.floor(value)));
  let remainder = budget - frames.reduce((total, value) => total + value, 0);
  const order = frames
    .map((_value, i) => i)
    .sort((a, b) => raw[b] - raw[a]);
  let cursor = 0;
  while (remainder > 0) {
    frames[order[cursor % order.length]] += 1;
    remainder -= 1;
    cursor += 1;
  }
  while (remainder < 0) {
    const index = order[order.length - 1 - (cursor % order.length)];
    if (frames[index] > MIN_PHRASE_FRAMES) {
      frames[index] -= 1;
      remainder += 1;
    }
    cursor += 1;
    if (cursor > count * 4) break;
  }
  return frames;
};

export const buildPhraseScenes = (options: PhraseBuildOptions): PhraseBuildResult => {
  const {
    sentence,
    pacing = 'accelerate',
    finalWordEmphasis = true,
    staggerFrames = 2,
    enterFrames = 2,
    style = 'punch',
    finalStyle = 'massive',
    background = 'cream',
    finalStrobeFrames,
    fitWidth,
  } = options;

  const phrases = (options.phrases?.length ? options.phrases : splitPhrases(sentence))
    .map((phrase) => phrase.trim())
    .filter(Boolean);

  if (phrases.length === 0) {
    return { scenes: [], phrases: [], framesPerPhrase: [], finalWord: null };
  }

  const cards = [...phrases];
  let finalWord: string | null = null;

  if (finalWordEmphasis) {
    const lastIndex = cards.length - 1;
    const words = splitWords(cards[lastIndex]);
    if (words.length > 1) {
      finalWord = words[words.length - 1];
      cards[lastIndex] = words.slice(0, -1).join(' ');
    } else if (cards.length > 1) {
      finalWord = cards.pop() as string;
    }
  }

  const cardCount = cards.length + (finalWord ? 1 : 0);
  const framesPerPhrase = options.framesPerPhrase?.length
    ? options.framesPerPhrase.slice(0, cardCount)
    : pacePhrases(cardCount, options.totalFrames ?? DEFAULT_TOTAL_FRAMES, pacing);

  while (framesPerPhrase.length < cardCount) {
    framesPerPhrase.push(
      framesPerPhrase[framesPerPhrase.length - 1] ?? MIN_PHRASE_FRAMES,
    );
  }

  const fps = 30;
  const common = {
    background,
    enterFrames,
    ...(staggerFrames > 0
      ? { stagger: { type: 'word' as const, delayFrames: staggerFrames } }
      : {}),
    ...(fitWidth ? { fit: { mode: 'width' as const, maxWidth: fitWidth } } : {}),
  };

  const scenes: Scene[] = cards.map((text, index) =>
    blankScene({
      ...common,
      text,
      style,
      duration: framesPerPhrase[index] / fps,
    }),
  );

  if (finalWord) {
    const elements: SceneElement[] = [
      element(finalWord, { role: 'emphasis', size: 'oversized', case: 'upper' }),
    ];
    scenes.push(
      blankScene({
        ...common,
        text: finalWord,
        style: finalStyle,
        duration: framesPerPhrase[cardCount - 1] / fps,
        stagger: undefined,
        emphasis: [finalWord],
        elements,
        ...(finalStrobeFrames
          ? {
              backgroundMotion: {
                mode: 'alternate' as const,
                everyFrames: finalStrobeFrames,
              },
            }
          : {}),
      }),
    );
  }

  return { scenes, phrases, framesPerPhrase, finalWord };
};
