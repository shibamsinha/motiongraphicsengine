import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { blockLeft } from '../../utils/plan';
import type { BlockLayout, PlannedLine, PlannedWord } from '../../utils/plan';
import { clamp01, easeByName, EASE, type EaseName } from '../../utils/easing';
import {
  NO_BLUR,
  addBlur,
  hasBlur,
  velocityBlur,
  type BlurVector,
} from '../../utils/motionBlur';
import { carryOffset, type SceneTransition } from '../../utils/transition';
import { FONT_STACK, trackingFor } from '../../utils/typography';
import type { ResolvedStyle } from '../../utils/visualStyle';
import { StyledText } from './StyledText';

export const ENTER = {
  transform: 0.3,
  opacity: 0.22,
  blur: 0.18,
} as const;

export const ENTER_SECONDS = {
  punch: ENTER.transform,
  massive: ENTER.transform * 1.35,
  slide: ENTER.transform * 1.1,
  stack: 0.11,
  rapid: ENTER.transform,
  none: 0,
} as const;

export type MotionValues = {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  blur: number;
  rotate: number;
};

export const IDENTITY: MotionValues = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  blur: 0,
  rotate: 0,
};

export type EnterSpec = {
  start?: number;
  fromX?: number;
  fromY?: number;
  fromScale?: number;
  fromRotate?: number;
  blur?: number;
  transformFrames?: number;
  opacityFrames?: number;
  blurFrames?: number;
  transformEase?: EaseName;
  opacityEase?: EaseName;
  blurEase?: EaseName;
};

export const enterValues = (frame: number, spec: EnterSpec): MotionValues => {
  const start = spec.start ?? 0;
  const tFrames = spec.transformFrames ?? 9;
  const oFrames = spec.opacityFrames ?? 7;
  const bFrames = spec.blurFrames ?? 6;

  const transformEase = easeByName(spec.transformEase ?? 'settle');
  const opacityEase = easeByName(spec.opacityEase ?? 'reveal');
  const blurEase = easeByName(spec.blurEase ?? 'focus');

  const tp = transformEase(clamp01((frame - start) / Math.max(1, tFrames)));
  const op = opacityEase(clamp01((frame - start) / Math.max(1, oFrames)));
  const bp = blurEase(clamp01((frame - start) / Math.max(1, bFrames)));

  return {
    opacity: op,
    x: (spec.fromX ?? 0) * (1 - tp),
    y: (spec.fromY ?? 0) * (1 - tp),
    scale: 1 + ((spec.fromScale ?? 1) - 1) * (1 - tp),
    rotate: (spec.fromRotate ?? 0) * (1 - tp),
    blur: (spec.blur ?? 0) * (1 - bp),
  };
};

export type ExitSpec = {
  start?: number;
  frames: number;
  toX?: number;
  toY?: number;
  toScale?: number;
  toRotate?: number;
  toOpacity?: number;
  ease?: EaseName;
  fadeEase?: EaseName;
};

export const exitValues = (frame: number, spec: ExitSpec): MotionValues => {
  const start = spec.start ?? 0;
  const frames = Math.max(1, spec.frames);
  const t = clamp01((frame - start) / frames);
  const move = easeByName(spec.ease ?? 'exit')(t);
  const fade = easeByName(spec.fadeEase ?? 'exitFade')(t);

  return {
    opacity: 1 - (1 - (spec.toOpacity ?? 0)) * fade,
    x: (spec.toX ?? 0) * move,
    y: (spec.toY ?? 0) * move,
    scale: 1 + ((spec.toScale ?? 1) - 1) * move,
    rotate: (spec.toRotate ?? 0) * move,
    blur: 0,
  };
};

export const combine = (a: MotionValues, b: Partial<MotionValues>): MotionValues => ({
  opacity: a.opacity * (b.opacity ?? 1),
  x: a.x + (b.x ?? 0),
  y: a.y + (b.y ?? 0),
  scale: a.scale * (b.scale ?? 1),
  blur: a.blur + (b.blur ?? 0),
  rotate: a.rotate + (b.rotate ?? 0),
});

export const amplify = (v: MotionValues, gain: number): MotionValues =>
  gain === 1
    ? v
    : {
        opacity: v.opacity,
        x: v.x * gain,
        y: v.y * gain,
        scale: 1 + (v.scale - 1) * gain,
        blur: v.blur * gain,
        rotate: v.rotate * gain,
      };

export const toTransform = (v: MotionValues): string => {
  const parts = [`translate3d(${v.x.toFixed(3)}px, ${v.y.toFixed(3)}px, 0)`];
  if (v.scale !== 1) parts.push(`scale(${v.scale.toFixed(5)})`);
  if (v.rotate !== 0) parts.push(`rotate(${v.rotate.toFixed(4)}deg)`);
  return parts.join(' ');
};

let filterSeq = 0;

export const MotionSpan: React.FC<{
  values: MotionValues;
  children: ReactNode;
  style?: CSSProperties;
  origin?: string;
  blur?: BlurVector;
}> = ({ values, children, style, origin = 'center center', blur }) => {
  const isotropic = values.blur > 0.05 ? values.blur : 0;
  const vector = addBlur(blur ?? NO_BLUR, isotropic);
  const smeared = hasBlur(vector);

  const id = React.useMemo(() => `fb${(filterSeq += 1)}`, []);

  return (
    <span
      style={{
        display: 'inline-block',
        opacity: values.opacity,
        transform: toTransform(values),
        transformOrigin: origin,
        filter: smeared ? `url(#${id})` : undefined,
        willChange: 'transform, opacity, filter',
        ...style,
      }}
    >
      {smeared ? (
        <svg
          width="0"
          height="0"
          style={{ position: 'absolute', pointerEvents: 'none' }}
          aria-hidden
        >
          <filter
            id={id}
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              stdDeviation={`${vector.sx.toFixed(2)} ${vector.sy.toFixed(2)}`}
            />
          </filter>
        </svg>
      ) : null}
      {children}
    </span>
  );
};

const textAlignToCss = (
  align: import('../../types/scene').Alignment,
): CSSProperties['textAlign'] => align;

const recolour = (
  style: ResolvedStyle,
  wordColors: Record<string, string> | undefined,
  text: string,
): ResolvedStyle => {
  if (!wordColors) return style;
  const bare = text.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const colour = wordColors[bare] ?? wordColors[text.toLowerCase()];
  if (!colour) return style;

  if (style.type === 'gradient') {
    return { ...style, type: 'solid', fill: colour, gradient: null, parts: [] };
  }

  return {
    ...style,
    fill: style.fill === null ? null : colour,
    stroke: style.stroke ? { ...style.stroke, color: colour } : null,
    parts: style.parts.map((part) => ({
      ...part,
      fill: part.fill === null ? null : colour,
      stroke: part.stroke ? { ...part.stroke, color: colour } : null,
      gradient: null,
      type: part.type === 'gradient' ? ('solid' as const) : part.type,
    })),
  };
};

export type WordRenderer = (
  word: PlannedWord,
  line: PlannedLine,
  glyph: ReactNode,
) => ReactNode;

export const TypeBlock: React.FC<{
  block: BlockLayout;
  color: string;
  visual?: ResolvedStyle;
  wordColors?: Record<string, string>;
  renderWord: WordRenderer;
  values?: MotionValues;
  blur?: BlurVector;
  origin?: string;
}> = ({
  block,
  color,
  visual,
  wordColors,
  renderWord,
  values,
  blur,
  origin = 'center center',
}) => {
  if (block.lines.length === 0) return null;

  const v = values ?? IDENTITY;
  const vector = addBlur(blur ?? NO_BLUR, v.blur > 0.05 ? v.blur : 0);
  const smeared = hasBlur(vector);
  const filterId = `bb${(filterSeq += 1)}`;

  return (
    <div
      style={{
        position: 'absolute',
        top: block.top,
        left: block.left,
        width: block.width,
        color,
        fontFamily: block.face?.family ?? FONT_STACK,
        fontStyle: block.face?.italic ? 'italic' : undefined,
        transform: toTransform(v),
        transformOrigin: origin,
        opacity: v.opacity,
        filter: smeared ? `url(#${filterId})` : undefined,
        willChange: 'transform, opacity, filter',
      }}
    >
      {smeared ? (
        <svg
          width="0"
          height="0"
          style={{ position: 'absolute', pointerEvents: 'none' }}
          aria-hidden
        >
          <filter
            id={filterId}
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              stdDeviation={`${vector.sx.toFixed(2)} ${vector.sy.toFixed(2)}`}
            />
          </filter>
        </svg>
      ) : null}
      {block.lines.map((line) => {
        const lineOffset =
          line.align === 'left'
            ? 0
            : line.align === 'right'
              ? block.width - line.width
              : (block.width - line.width) / 2;
        return (
        <div
          key={line.id}
          style={{
            position: 'absolute',
            top: line.top,
            left: 0,
            width: block.width,
            fontSize: line.fontSize,
            fontWeight: line.weight,
            letterSpacing: trackingFor(line.fontSize),
            lineHeight: 1,
            textAlign: textAlignToCss(line.align),
            whiteSpace: 'pre',
            fontKerning: 'normal',
            textRendering: 'geometricPrecision',
            WebkitFontSmoothing: 'antialiased',
          }}
        >
          {line.words.map((word, index) => (
            <React.Fragment key={word.id}>
              {index > 0 ? ' ' : null}
              {renderWord(
                word,
                line,
                visual ? (
                  <StyledText
                    text={word.text}
                    style={recolour(visual, wordColors, word.text)}
                    fontSize={word.fontSize}
                    box={{
                      width: block.width,
                      height: Math.max(1, block.height),
                      offsetX: lineOffset + word.x,
                      offsetY: line.top,
                    }}
                    wordIndex={index}
                    wordCount={line.words.length}
                  />
                ) : (
                  word.text
                ),
              )}
            </React.Fragment>
          ))}
        </div>
        );
      })}
    </div>
  );
};

export const carryValues = (
  frame: number,
  frames: number,
  offset: { x: number; y: number; scale: number },
): MotionValues => ({
  ...enterValues(frame, {
    fromX: offset.x,
    fromY: offset.y,
    fromScale: offset.scale,
    transformFrames: frames,
    opacityFrames: 1,
    blurFrames: 1,
    transformEase: 'carry',
  }),
  opacity: 1,
  blur: 0,
});

export type StyleMotion = {
  block: (frame: number) => MotionValues;
  word: (frame: number, word: PlannedWord) => MotionValues;
  gain: number;
  frames: number;
  ease?: EaseName;
};

export const StyleBlock: React.FC<{
  element: import('../../utils/plan').PlannedElement;
  frame: number;
  color: string;
  visual?: ResolvedStyle;
  motion: StyleMotion;
  transition?: SceneTransition;
  origin?: string;
}> = ({ element, frame, color, visual, motion, transition, origin }) => {
  const carried = transition?.carried;
  const continuity = (carried?.size ?? 0) > 0 && (transition?.carryFrames ?? 0) > 0;

  const travelEase = easeByName(motion.ease ?? 'settle');
  const shaped = (at: (f: number) => MotionValues) => (f: number) => {
    const base = amplify(at(f - element.delay), element.motion);
    if (!element.from) return base;
    if (motion.frames <= 0) return base;
    const t = travelEase(clamp01((f - element.delay) / Math.max(1, motion.frames)));
    return {
      ...base,
      x: base.x + element.from.x * (1 - t),
      y: base.y + element.from.y * (1 - t),
    };
  };

  const blockMotion = shaped(motion.block);
  const blockValues = continuity ? IDENTITY : blockMotion(frame);
  const blockBlur = continuity
    ? NO_BLUR
    : velocityBlur(blockMotion, frame, element.block.heroSize, motion.gain);

  return (
    <TypeBlock
      block={element.block}
      color={color}
      visual={visual}
      wordColors={element.wordColors}
      values={blockValues}
      blur={blockBlur}
      origin={origin}
      renderWord={(word, _line, glyph) => {
        const source = carried?.get(word.id);

        if (source && transition) {
          const offset = carryOffset(word, source);
          const carry = (f: number) => carryValues(f, transition.carryFrames, offset);
          return (
            <MotionSpan
              values={carry(frame)}
              blur={velocityBlur(carry, frame, word.fontSize, motion.gain)}
            >
              {glyph}
            </MotionSpan>
          );
        }

        if (!continuity && word.start === element.delay) {
          return <MotionSpan values={IDENTITY}>{glyph}</MotionSpan>;
        }

        const cross = continuity ? transition?.cross : undefined;
        const crossFrames = transition?.carryFrames ?? 1;
        const enter = (f: number) => {
          const base = motion.word(f, word);
          if (!cross || (cross.x === 0 && cross.y === 0)) return base;
          const settled = easeByName('slideEnter')(clamp01(f / Math.max(1, crossFrames)));
          return {
            ...base,
            x: base.x + cross.x * (1 - settled),
            y: base.y + cross.y * (1 - settled),
          };
        };
        return (
          <MotionSpan
            values={enter(frame)}
            blur={velocityBlur(enter, frame, word.fontSize, motion.gain)}
          >
            {glyph}
          </MotionSpan>
        );
      }}
    />
  );
};

export type MotionProps = {
  plan: import('../../utils/plan').ScenePlan;
  element: import('../../utils/plan').PlannedElement;
  frame: number;
  fps: number;
  durationInFrames: number;
  color: string;
  visual?: ResolvedStyle;
  transition?: SceneTransition;
  canvas: import('../../types/scene').VideoConfig;
};

export const framesFor = (seconds: number, fps: number): number =>
  Math.max(1, Math.round(seconds * fps));

export const enterTiming = (
  element: import('../../utils/plan').PlannedElement,
  seconds: number,
  fps: number,
): { frames: number; channel: (channelSeconds: number) => number } => {
  const natural = framesFor(seconds, fps);
  const frames = element.enterFrames ?? natural;
  const ratio = frames / Math.max(1, natural);
  return {
    frames,
    channel: (channelSeconds: number) =>
      ratio === 1
        ? framesFor(channelSeconds, fps)
        : Math.max(1, Math.round(framesFor(channelSeconds, fps) * ratio)),
  };
};

export { EASE, blockLeft };
export type { EaseName };
