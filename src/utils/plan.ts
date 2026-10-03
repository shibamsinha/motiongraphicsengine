import type {
  Alignment,
  AnimationStyle,
  BackgroundName,
  CompositionPreset,
  PaletteName,
  PositionPreset,
  Scene,
  SceneElement,
  WordStagger,
  SizePreset,
  TextCase,
  TextRole,
  VideoConfig,
  WordAnimation,
} from '../types/scene';
import type { VisualStyleConfig } from './visualStyle';
import { DEFAULT_VISUAL_STYLE } from './visualStyle';
import {
  composeImage,
  typeBandHeight,
  typeCentreY,
  type ImageComposition,
} from './imageLayout';
import { CANVAS, distributeFrames, cumulative } from './timing';
import {
  ROLE_CEILING,
  ROLE_FLOOR,
  ROLE_MOTION,
  ROLE_SIZE,
  ROLE_WEIGHT,
  ROLE_WEIGHT_FACE,
  alignForAnchor,
  anchorX,
  anchorY,
  anchorsFor,
  bandCentre,
  compositionDefinition,
  layOut,
  resolveSize,
  separate,
  sizeRule,
  suggestComposition,
  type Anchors,
  type Band,
  type FlowItem,
} from './composition';
import {
  KICKER_RATIO,
  KICKER_WEIGHT,
  HERO_WEIGHT,
  LINE_GAP_EM,
  DEFAULT_PALETTE,
  FACES,
  SIZING,
  applyCase,
  faceFor,
  fitToWidth,
  flipBackground,
  inkBottom,
  inkTop,
  isEmphasised,
  kickerMax,
  kickerMin,
  rapidBaseSize,
  resolveHeroSize,
  sideMargin,
  splitLines,
  splitWords,
  widthOf,
} from './typography';
import type { TypeFace } from './typography';

export type WordRole = 'hero' | 'kicker';

export type PlannedWord = WordAnimation & {
  id: string;
  role: WordRole;
  lineIndex: number;
  order: number;
  x: number;
  y: number;
  fontSize: number;
  width: number;
  cx: number;
  cy: number;
};

export type PlannedLine = {
  id: string;
  role: WordRole;
  text: string;
  fontSize: number;
  weight: number;
  align: Alignment;
  top: number;
  width: number;
  words: PlannedWord[];
};

export type BlockLayout = {
  lines: PlannedLine[];
  face: TypeFace;
  top: number;
  left: number;
  height: number;
  inkHeight: number;
  inkCentre: number;
  width: number;
  heroSize: number;
  heroLineIndex: number;
};

export type RapidBeat = {
  id: string;
  text: string;
  from: number;
  durationInFrames: number;
  background: BackgroundName;
  emphasised: boolean;
  block: BlockLayout;
};

export type PlannedElement = {
  id: string;
  index: number;
  role: TextRole;
  size: SizePreset;
  position: PositionPreset;
  style: AnimationStyle;
  exitStyle: AnimationStyle;
  align: Alignment;
  block: BlockLayout;
  beats: RapidBeat[];
  from?: { x: number; y: number };
  delay: number;
  enterFrames?: number;
  motion: number;
  visual: VisualStyleConfig;
  wordColors?: Record<string, string>;
  dominant: boolean;
};

export type ScenePlan = {
  scene: Scene;
  style: AnimationStyle;
  durationInFrames: number;
  background: BackgroundName;
  picture: ImageComposition;
  layout: CompositionPreset;
  elements: PlannedElement[];
  block: BlockLayout;
  beats: RapidBeat[];
  words: WordAnimation[];
};

type DraftLine = {
  role: WordRole;
  words: string[];
};

const draftLines = (scene: Scene): DraftLine[] => {
  const sourceLines = splitLines(scene.text);
  if (sourceLines.length === 0) return [];

  const hasEmphasis = (scene.emphasis?.length ?? 0) > 0;

  if (sourceLines.length > 1) {
    const lines = sourceLines.map((line) => ({
      role: 'kicker' as WordRole,
      words: splitWords(line),
    }));
    if (hasEmphasis) {
      lines.forEach((line) => {
        if (line.words.some((word) => isEmphasised(word, scene.emphasis))) {
          line.role = 'hero';
        }
      });
      if (!lines.some((line) => line.role === 'hero')) {
        lines[lines.length - 1].role = 'hero';
      }
    } else {
      lines[lines.length - 1].role = 'hero';
    }
    return lines;
  }

  const words = splitWords(sourceLines[0]);
  if (words.length === 0) return [];

  const heroFlags = hasEmphasis
    ? words.map((word) => isEmphasised(word, scene.emphasis))
    : words.map((_, index) => index === words.length - 1);

  if (!heroFlags.some(Boolean)) heroFlags[heroFlags.length - 1] = true;

  const singleLineStyles: AnimationStyle[] = ['slide', 'massive'];
  if (!hasEmphasis && singleLineStyles.includes(scene.style) && words.length <= 3) {
    return [{ role: 'hero', words }];
  }

  const lines: DraftLine[] = [];
  words.forEach((word, index) => {
    const role: WordRole = heroFlags[index] ? 'hero' : 'kicker';
    const current = lines[lines.length - 1];
    if (current && current.role === role) current.words.push(word);
    else lines.push({ role, words: [word] });
  });

  return lines;
};

export const blockLeft = (
  block: BlockLayout,
  alignment: Alignment,
  canvas: VideoConfig = CANVAS,
): number => {
  const margin = sideMargin(canvas);
  if (alignment === 'left') return margin;
  if (alignment === 'right') return canvas.width - margin - block.width;
  return (canvas.width - block.width) / 2;
};

const resolveAbsolutePositions = (block: BlockLayout): void => {
  for (const line of block.lines) {
    const offset =
      line.align === 'left'
        ? 0
        : line.align === 'right'
          ? block.width - line.width
          : (block.width - line.width) / 2;
    for (const word of line.words) {
      word.cx = block.left + offset + word.x + word.width / 2;
      word.cy =
        block.top +
        line.top +
        (inkTop(word.text, word.fontSize) + inkBottom(word.text, word.fontSize)) / 2;
    }
  }
};

const placeBlock = (block: BlockLayout, cx: number, cy: number): void => {
  block.left = cx - block.width / 2;
  block.top = cy - block.inkCentre;
  resolveAbsolutePositions(block);
};

type LineSpec = { text: string; fontSize: number; weight: number };

const layoutLines = (
  idPrefix: string,
  drafts: DraftLine[],
  textCase: TextCase,
  style: AnimationStyle,
  heroSize: number,
  sizeOf: (draft: DraftLine, index: number, text: string) => LineSpec,
  alignOf: (draft: DraftLine, index: number, heroLineIndex: number) => Alignment,
  canvas: VideoConfig = CANVAS,
  face: TypeFace = FACES.primary,
): BlockLayout => {
  const heroLineIndex = Math.max(
    0,
    drafts.findIndex((line) => line.role === 'hero'),
  );

  const sized = drafts.map((draft, index) =>
    sizeOf(draft, index, applyCase(draft.words.join(' '), textCase)),
  );

  const gap = LINE_GAP_EM * heroSize;

  let lineTop = 0;
  const lines: PlannedLine[] = sized.map((entry, lineIndex) => {
    if (lineIndex > 0) {
      const previous = sized[lineIndex - 1];
      lineTop =
        lineTop +
        inkBottom(previous.text, previous.fontSize) +
        gap -
        inkTop(entry.text, entry.fontSize);
    }

    const draft = drafts[lineIndex];
    const width = widthOf(entry.text, entry.fontSize, entry.weight, canvas, face);
    const align = alignOf(draft, lineIndex, heroLineIndex);

    let cursor = 0;
    const words: PlannedWord[] = draft.words.map((raw, indexInLine) => {
      const text = applyCase(raw, textCase);
      const wordWidth = widthOf(text, entry.fontSize, entry.weight, canvas, face);
      const spaceWidth =
        indexInLine === draft.words.length - 1
          ? 0
          : widthOf(`${text} x`, entry.fontSize, entry.weight, canvas, face) -
            wordWidth -
            widthOf('x', entry.fontSize, entry.weight, canvas, face);
      const word: PlannedWord = {
        id: `${idPrefix}-l${lineIndex}-w${indexInLine}`,
        text,
        role: draft.role,
        lineIndex,
        order: 0,
        start: 0,
        duration: 0,
        style,
        fontSize: entry.fontSize,
        x: cursor,
        y: lineTop,
        width: wordWidth,
        cx: 0,
        cy: 0,
      };
      cursor += wordWidth + spaceWidth;
      return word;
    });

    return {
      id: `${idPrefix}-l${lineIndex}`,
      role: draft.role,
      text: entry.text,
      fontSize: entry.fontSize,
      weight: entry.weight,
      align,
      top: lineTop,
      width,
      words,
    };
  });

  if (lines.length === 0) return emptyBlock(0);

  const first = lines[0];
  const last = lines[lines.length - 1];
  const inkStart = first.top + inkTop(first.text, first.fontSize);
  const inkEnd = last.top + inkBottom(last.text, last.fontSize);
  const inkCentre = (inkStart + inkEnd) / 2;

  return {
    lines,
    face,
    top: -inkCentre,
    left: 0,
    height: last.top + last.fontSize,
    inkHeight: inkEnd - inkStart,
    inkCentre,
    width: Math.max(...lines.map((line) => line.width)),
    heroSize,
    heroLineIndex,
  };
};

const layoutBlock = (
  idPrefix: string,
  drafts: DraftLine[],
  heroSize: number,
  scene: Scene,
  textCase: TextCase,
  centreY: number,
  fit = 1,
  canvas: VideoConfig = CANVAS,
  face: TypeFace = FACES.primary,
): BlockLayout => {
  const maxLineWidth = canvas.width * (SIZING[scene.style]?.target ?? 0.84);

  const block = layoutLines(
    idPrefix,
    drafts,
    textCase,
    scene.style,
    heroSize,
    (draft, _index, text) => {
      if (draft.role === 'hero') {
        return { text, fontSize: heroSize, weight: HERO_WEIGHT };
      }
      const scale = (scene.fontSize ?? 1) * fit;
      const wanted = Math.min(
        kickerMax(canvas) * scale,
        Math.max(kickerMin(canvas) * scale, heroSize * KICKER_RATIO),
      );
      const ceiling = fitToWidth(text, maxLineWidth, KICKER_WEIGHT, canvas, face);
      return { text, fontSize: Math.min(wanted, ceiling), weight: KICKER_WEIGHT };
    },
    (draft, lineIndex, heroLineIndex) => {
      if (scene.alignment !== 'center') return scene.alignment;
      if (draft.role === 'hero') return 'center';
      return lineIndex < heroLineIndex ? 'left' : 'right';
    },
    canvas,
  );

  block.top = centreY - block.inkCentre;
  block.left = blockLeft(block, scene.alignment, canvas);
  return block;
};

const layoutBlockInBand = (
  idPrefix: string,
  drafts: DraftLine[],
  heroSize: number,
  scene: Scene,
  textCase: TextCase,
  centreY: number,
  bandHeight: number,
  canvas: VideoConfig = CANVAS,
): BlockLayout => {
  const limit = bandHeight * 0.94;
  let fit = 1;
  let block = layoutBlock(idPrefix, drafts, heroSize, scene, textCase, centreY, fit, canvas);

  for (let pass = 0; pass < 4 && block.inkHeight > limit && block.inkHeight > 0; pass++) {
    fit *= limit / block.inkHeight;
    block = layoutBlock(idPrefix, drafts, heroSize * fit, scene, textCase, centreY, fit, canvas);
  }

  resolveAbsolutePositions(block);
  return block;
};

const STACK_BEAT_SECONDS = 0.3;

const assignTiming = (
  block: BlockLayout,
  style: AnimationStyle,
  durationInFrames: number,
  fps: number,
  delay = 0,
  stagger?: WordStagger,
): void => {
  const words = block.lines.flatMap((line) => line.words);
  if (words.length === 0) return;

  const hold = Math.max(0, Math.min(delay, Math.max(0, durationInFrames - 1)));
  const span = Math.max(1, durationInFrames - hold);

  if (stagger && stagger.delayFrames > 0) {
    const count = words.length;
    const step = Math.max(0, Math.round(stagger.delayFrames));
    words.forEach((word, index) => {
      word.order = index;
      const position = stagger.order === 'reverse' ? count - 1 - index : index;
      word.start = Math.min(hold + position * step, Math.max(0, durationInFrames - 1));
      word.duration = durationInFrames - word.start;
    });
    return;
  }

  if (style === 'stack') {
    const lead = words.length - 1;
    if (lead <= 0) {
      words[0].order = 0;
      words[0].start = hold;
      words[0].duration = durationInFrames - hold;
      return;
    }

    const beat = Math.max(2, Math.round(fps * STACK_BEAT_SECONDS));
    const payoffHold = Math.max(1, Math.round(span * 0.34));
    const budget = Math.min(lead * beat, Math.max(0, span - payoffHold));

    words.forEach((word, index) => {
      word.order = index;
      const raw = index < lead ? Math.round((index * budget) / lead) : budget;
      word.start = Math.max(0, Math.min(hold + raw, durationInFrames - 1));
      word.duration = durationInFrames - word.start;
    });
    return;
  }

  const lag = style === 'rapid' ? 0 : 2;

  words.forEach((word, index) => {
    word.order = index;
    const trails = word.role === 'kicker' && word.lineIndex > block.heroLineIndex;
    word.start = Math.min(
      hold + (trails ? lag : 0),
      Math.max(0, durationInFrames - 1),
    );
    word.duration = durationInFrames - word.start;
  });
};

const rapidItems = (text: string): string[] => {
  const byLine = splitLines(text);
  if (byLine.length > 1) return byLine;
  const single = byLine[0] ?? '';
  const punctuated = single
    .split(/(?<=[.,;!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (punctuated.length > 1) return punctuated;
  return splitWords(single);
};

const planRapid = (
  scene: Scene,
  durationInFrames: number,
  fps: number,
  palette: PaletteName,
  picture: ImageComposition,
  canvas: VideoConfig = CANVAS,
): RapidBeat[] => {
  const items = rapidItems(scene.text);
  if (items.length === 0) return [];

  const lengths = distributeFrames(durationInFrames, items.length);
  const offsets = cumulative(lengths);
  const flip = scene.flipBackground ?? true;
  const rule = SIZING.rapid;
  const scale = scene.fontSize ?? 1;

  return items.flatMap((item, index) => {
    if (lengths[index] <= 0) return [];

    const emphasised = splitWords(item).some((word) =>
      isEmphasised(word, scene.emphasis),
    );
    const text = applyCase(item, scene.case ?? 'lower');
    const size = emphasised
      ? resolveHeroSize(text, rule, scale, HERO_WEIGHT, canvas)
      : Math.min(
          rapidBaseSize(canvas) * scale,
          fitToWidth(text, rule.target * canvas.width, HERO_WEIGHT, canvas),
        );

    const block = layoutBlockInBand(
      `${scene.id}-b${index}`,
      [{ role: 'hero', words: splitWords(item) }],
      size,
      scene,
      scene.case ?? 'lower',
      typeCentreY(picture),
      typeBandHeight(picture),
      canvas,
    );
    assignTiming(block, 'rapid', lengths[index], fps);

    return [
      {
        id: `${scene.id}-beat-${index}`,
        text,
        from: offsets[index],
        durationInFrames: lengths[index],
        background:
          flip && index % 2 === 1
            ? flipBackground(scene.background, palette)
            : scene.background,
        emphasised,
        block,
      },
    ];
  });
};

function emptyBlock(centreY: number): BlockLayout {
  return {
    lines: [],
    face: FACES.primary,
    top: centreY,
    left: 0,
    height: 0,
    inkHeight: 0,
    inkCentre: 0,
    width: 0,
    heroSize: 0,
    heroLineIndex: 0,
  };
}

export const mergeVisual = (
  scene: Scene,
  element?: Pick<SceneElement, 'visualStyle' | 'styleConfig'>,
): VisualStyleConfig => {
  const sceneType = scene.visualStyle ?? scene.styleConfig?.type ?? DEFAULT_VISUAL_STYLE;
  const type = element?.visualStyle ?? element?.styleConfig?.type ?? sceneType;
  const fromScene =
    scene.styleConfig && (scene.styleConfig.type ?? sceneType) === type
      ? scene.styleConfig
      : undefined;
  const fromElement =
    element?.styleConfig && (element.styleConfig.type ?? type) === type
      ? element.styleConfig
      : undefined;
  return { ...fromScene, ...fromElement, type };
};

export const mergeWordColors = (
  scene: Scene,
  element?: Pick<SceneElement, 'wordColors'>,
): Record<string, string> | undefined => {
  const merged: Record<string, string> = {};
  for (const [word, colour] of Object.entries(scene.wordColors ?? {})) {
    merged[word.toLowerCase()] = colour;
  }
  for (const [word, colour] of Object.entries(element?.wordColors ?? {})) {
    merged[word.toLowerCase()] = colour;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
};

type ResolvedElement = {
  source: SceneElement;
  index: number;
  id: string;
  role: TextRole;
  size: SizePreset;
  inheritedSize: boolean;
  position: PositionPreset | null;
  anchors: Anchors | null;
  style: AnimationStyle;
  exitStyle: AnimationStyle;
  align: Alignment | null;
  textCase: TextCase;
  scale: number;
  fontSize: number;
  weight: number;
  face: TypeFace;
  delay: number;
  enterFrames?: number;
  drafts: DraftLine[];
  visual: VisualStyleConfig;
  wordColors?: Record<string, string>;
};

const longestLine = (drafts: DraftLine[], textCase: TextCase): string => {
  let longest = '';
  for (const draft of drafts) {
    const text = applyCase(draft.words.join(' '), textCase);
    if (text.length > longest.length) longest = text;
  }
  return longest;
};

const elementDrafts = (element: SceneElement): DraftLine[] => {
  const lines = splitLines(element.text);
  if (lines.length === 0) return [];
  return lines.map((line) => ({ role: 'hero' as WordRole, words: splitWords(line) }));
};

const resolveElement = (
  element: SceneElement,
  index: number,
  scene: Scene,
  canvas: VideoConfig = CANVAS,
): ResolvedElement => {
  const role: TextRole = element.role ?? 'primary';
  const inheritedSize = element.size === undefined;
  const size: SizePreset = element.size ?? ROLE_SIZE[role];
  const textCase: TextCase = element.case ?? scene.case ?? 'as-typed';
  const drafts = elementDrafts(element);
  const weight = ROLE_WEIGHT_FACE[role];
  const scale = (element.scale ?? 1) * (scene.fontSize ?? 1);
  const face = faceFor(element.fontRole ?? scene.fontRole);
  const fit = element.fit ?? scene.fit;
  const fontSize = resolveSize(
    longestLine(drafts, textCase), size, scale, weight, canvas, face, fit,
  );

  return {
    source: element,
    index,
    id: element.id || `${scene.id}-e${index}`,
    role,
    size,
    inheritedSize,
    position: element.position ?? null,
    anchors: element.position ? anchorsFor(element.position) : null,
    style: element.animation ?? scene.style,
    exitStyle: element.exit ?? scene.exit ?? element.animation ?? scene.style,
    align: element.align ?? null,
    textCase,
    scale,
    fontSize,
    weight,
    face,
    delay: element.delay ?? 0,
    enterFrames: element.enterFrames ?? scene.enterFrames,
    drafts,
    visual: mergeVisual(scene, element),
    wordColors: mergeWordColors(scene, element),
  };
};

const enforceHierarchy = (
  elements: ResolvedElement[],
  dominant: ResolvedElement,
  canvas: VideoConfig = CANVAS,
): void => {
  const W = canvas.width;
  for (const element of elements) {
    if (element === dominant || !element.inheritedSize) continue;
    const ceiling = ROLE_CEILING[element.role] * dominant.fontSize;
    const floor = ROLE_FLOOR[element.role] * W;
    const capped = Math.min(element.fontSize, Math.max(floor, ceiling));
    element.fontSize = Math.max(Math.min(capped, element.fontSize), floor);
  }
};

const visibleFraction = (
  cx: number,
  cy: number,
  width: number,
  height: number,
  canvas: VideoConfig = CANVAS,
): number => {
  if (width <= 0 || height <= 0) return 1;
  const w =
    Math.max(0, Math.min(cx + width / 2, canvas.width) - Math.max(cx - width / 2, 0)) /
    width;
  const h =
    Math.max(0, Math.min(cy + height / 2, canvas.height) - Math.max(cy - height / 2, 0)) /
    height;
  return Math.min(w, h);
};

const layoutElementBlock = (
  element: ResolvedElement,
  fontSize: number,
  align: Alignment,
  canvas: VideoConfig = CANVAS,
): BlockLayout =>
  layoutLines(
    element.id,
    element.drafts,
    element.textCase,
    element.style,
    fontSize,
    (_draft, _index, text) => ({ text, fontSize, weight: element.weight }),
    () => align,
    canvas,
    element.face,
  );

const measureElement = (
  element: ResolvedElement,
  align: Alignment,
  anchors: Anchors,
  band: Band,
  hasFixedPlacement: boolean,
  canvas: VideoConfig = CANVAS,
): BlockLayout => {
  const rule = sizeRule(element.size);
  const bandLimit = (band.bottom - band.top) * rule.bandRoom;
  const offscreen = anchors.h.startsWith('off') || anchors.v.startsWith('off');

  let fontSize = element.fontSize;
  let block = layoutElementBlock(element, fontSize, align, canvas);

  for (let pass = 0; pass < 4; pass++) {
    const tall = block.inkHeight > bandLimit && block.inkHeight > 0;
    const visible =
      offscreen || hasFixedPlacement
        ? 1
        : visibleFraction(
            anchorX(anchors.h, block.width, canvas),
            anchorY(anchors.v, block.inkHeight, band, canvas),
            block.width,
            block.inkHeight,
            canvas,
          );

    if (!tall && visible >= rule.minVisible) break;

    const byHeight = tall ? bandLimit / block.inkHeight : 1;
    const byVisible = visible > 0 ? Math.min(1, visible / rule.minVisible) : 0.5;
    fontSize *= Math.min(byHeight, byVisible) * 0.995;
    if (!(fontSize > 0)) break;
    block = layoutElementBlock(element, fontSize, align, canvas);
  }

  element.fontSize = fontSize;
  return block;
};

const planRapidElement = (
  element: ResolvedElement,
  scene: Scene,
  durationInFrames: number,
  fps: number,
  palette: PaletteName,
  align: Alignment,
  canvas: VideoConfig = CANVAS,
): RapidBeat[] => {
  const items = rapidItems(element.source.text);
  if (items.length === 0) return [];

  const lengths = distributeFrames(durationInFrames, items.length);
  const offsets = cumulative(lengths);
  const flip = scene.flipBackground ?? true;

  return items.flatMap((item, index) => {
    if (lengths[index] <= 0) return [];
    const words = splitWords(item);
    const emphasised = words.some((word) =>
      isEmphasised(word, element.source.emphasis ?? scene.emphasis),
    );
    const text = applyCase(item, element.textCase);
    const beatElement: ResolvedElement = {
      ...element,
      id: `${element.id}-b${index}`,
      drafts: [{ role: 'hero', words }],
    };
    const block = layoutElementBlock(beatElement, element.fontSize, align, canvas);
    assignTiming(block, 'rapid', lengths[index], fps);

    return [
      {
        id: `${element.id}-beat-${index}`,
        text,
        from: offsets[index],
        durationInFrames: lengths[index],
        background:
          flip && index % 2 === 1
            ? flipBackground(scene.background, palette)
            : scene.background,
        emphasised,
        block,
      },
    ];
  });
};

const resolveEnterFrames = (
  requested: number | undefined,
  windowFrames: number,
): number | undefined => {
  if (requested === undefined || !Number.isFinite(requested)) return undefined;
  const room = Math.max(1, Math.floor(windowFrames));
  return Math.max(1, Math.min(room, Math.round(requested)));
};

const planComposed = (
  scene: Scene,
  durationInFrames: number,
  fps: number,
  palette: PaletteName,
  picture: ImageComposition,
  canvas: VideoConfig = CANVAS,
): ScenePlan => {
  const band: Band = { top: picture.typeTop, bottom: picture.typeBottom };

  const resolved = (scene.elements ?? [])
    .map((element, index) => resolveElement(element, index, scene, canvas))
    .filter((element) => element.drafts.length > 0);

  if (resolved.length === 0) {
    return {
      scene,
      style: scene.style,
      durationInFrames,
      background: scene.background,
      picture,
      layout: scene.composition ?? 'center',
      elements: [],
      block: emptyBlock(bandCentre(band)),
      beats: [],
      words: [],
    };
  }

  let dominant = resolved[0];
  for (const element of resolved) {
    const better =
      ROLE_WEIGHT[element.role] > ROLE_WEIGHT[dominant.role] ||
      (ROLE_WEIGHT[element.role] === ROLE_WEIGHT[dominant.role] &&
        element.fontSize > dominant.fontSize);
    if (better) dominant = element;
  }
  enforceHierarchy(resolved, dominant, canvas);

  const layout = scene.composition ?? suggestComposition(resolved.length, dominant.size);
  const definition = compositionDefinition(layout);
  const dominantIndex = resolved.indexOf(dominant);

  const anchorsOf = (element: ResolvedElement, index: number): Anchors => {
    if (element.anchors) return element.anchors;
    if (definition.absolute) {
      return definition.absolute[index % definition.absolute.length];
    }
    return {
      h: definition.column(index - dominantIndex, index),
      v: definition.vertical,
    };
  };

  const anchors = resolved.map(anchorsOf);
  const aligns = resolved.map(
    (element, index) => element.align ?? alignForAnchor(anchors[index].h),
  );
  const fixed = resolved.map((element) =>
    typeof element.source.x === 'number' && typeof element.source.y === 'number'
      ? {
          cx: element.source.x * canvas.width,
          cy: element.source.y * canvas.height,
        }
      : undefined,
  );

  const blocks = resolved.map((element, index) =>
    element.style === 'rapid'
      ? layoutElementBlock(element, element.fontSize, aligns[index], canvas)
      : measureElement(
          element,
          aligns[index],
          anchors[index],
          band,
          fixed[index] !== undefined,
          canvas,
        ),
  );

  const items: FlowItem[] = resolved.map((element, index) => ({
    width: blocks[index].width,
    height: blocks[index].inkHeight,
    anchors: anchors[index],
    fixed: fixed[index],
    flows:
      fixed[index] === undefined &&
      element.position === null &&
      definition.absolute === undefined,
  }));

  const placements = separate(items, layOut(items, definition, band, canvas), canvas);

  const elements: PlannedElement[] = resolved.map((element, index) => {
    const block = blocks[index];
    const place = placements[index];
    placeBlock(block, place.cx, place.cy);

    const beats =
      element.style === 'rapid'
        ? planRapidElement(
            element,
            scene,
            durationInFrames,
            fps,
            palette,
            aligns[index],
            canvas,
          )
        : [];
    for (const beat of beats) placeBlock(beat.block, place.cx, place.cy);

    const delayFrames = Math.max(0, Math.round(element.delay * fps));
    if (element.style !== 'rapid') {
      assignTiming(
        block, element.style, durationInFrames, fps, delayFrames,
        element.source.stagger ?? scene.stagger,
      );
    }

    const from = element.source.from
      ? (() => {
          const origin = anchorsFor(element.source.from as PositionPreset);
          return {
            x: anchorX(origin.h, block.width, canvas) - place.cx,
            y: anchorY(origin.v, block.inkHeight, band, canvas) - place.cy,
          };
        })()
      : undefined;

    return {
      id: element.id,
      index,
      role: element.role,
      size: element.size,
      position: element.position ?? 'center',
      style: element.style,
      exitStyle: element.exitStyle,
      align: aligns[index],
      block,
      beats,
      from,
      delay: delayFrames,
      enterFrames: resolveEnterFrames(element.enterFrames, durationInFrames - delayFrames),
      motion: ROLE_MOTION[element.role],
      visual: element.visual,
      wordColors: element.wordColors,
      dominant: index === dominantIndex,
    };
  });

  const anchor = elements[dominantIndex] ?? elements[0];

  return {
    scene,
    style: anchor.style,
    durationInFrames,
    background: scene.background,
    picture,
    layout,
    elements,
    block: anchor.block,
    beats: anchor.beats,
    words: elements.flatMap((element) =>
      (element.beats.length > 0
        ? element.beats.flatMap((beat) =>
            beat.block.lines.flatMap((line) =>
              line.words.map((word) => ({ word, offset: beat.from })),
            ),
          )
        : element.block.lines.flatMap((line) =>
            line.words.map((word) => ({ word, offset: 0 })),
          )
      ).map(({ word, offset }) => ({
        text: word.text,
        start: offset + word.start,
        duration: word.duration,
        style: element.style,
        fontSize: word.fontSize,
        x: word.x,
        y: word.y,
      })),
    ),
  };
};

const planSingle = (
  scene: Scene,
  durationInFrames: number,
  fps: number,
  palette: PaletteName,
  picture: ImageComposition,
  canvas: VideoConfig = CANVAS,
): ScenePlan => {
  const textCase = scene.case ?? 'lower';
  const centreY = typeCentreY(picture);
  const bandHeight = typeBandHeight(picture);

  const single = (
    block: BlockLayout,
    beats: RapidBeat[],
    words: WordAnimation[],
  ): ScenePlan => ({
    scene,
    style: scene.style,
    durationInFrames,
    background: scene.background,
    picture,
    layout: 'center',
    elements: [
      {
        id: `${scene.id}-e0`,
        index: 0,
        role: 'primary',
        size: 'large',
        position: 'center',
        style: scene.style,
        exitStyle: scene.exit ?? scene.style,
        align: scene.alignment,
        block,
        beats,
        delay: 0,
        enterFrames: resolveEnterFrames(scene.enterFrames, durationInFrames),
        motion: 1,
        visual: mergeVisual(scene),
        wordColors: mergeWordColors(scene),
        dominant: true,
      },
    ],
    block,
    beats,
    words,
  });

  if (scene.style === 'rapid') {
    const beats = planRapid(scene, durationInFrames, fps, palette, picture, canvas);
    return single(
      beats[0]?.block ?? emptyBlock(centreY),
      beats,
      beats.flatMap((beat) =>
        beat.block.lines.flatMap((line) =>
          line.words.map((word) => ({
            text: word.text,
            start: beat.from + word.start,
            duration: word.duration,
            style: scene.style,
            fontSize: word.fontSize,
            x: word.x,
            y: word.y,
          })),
        ),
      ),
    );
  }

  const drafts = draftLines(scene);
  if (drafts.length === 0) return single(emptyBlock(centreY), [], []);

  const heroDraft = drafts.find((line) => line.role === 'hero') ?? drafts[0];
  const heroText = applyCase(heroDraft.words.join(' '), textCase);
  const rule = SIZING[scene.style] ?? SIZING.punch;
  const heroSize = resolveHeroSize(
    heroText,
    rule,
    scene.fontSize ?? 1,
    HERO_WEIGHT,
    canvas,
    FACES.primary,
    scene.fit,
  );

  const block = layoutBlockInBand(
    scene.id,
    drafts,
    heroSize,
    scene,
    textCase,
    centreY,
    bandHeight,
    canvas,
  );
  assignTiming(block, scene.style, durationInFrames, fps, 0, scene.stagger);

  return single(
    block,
    [],
    block.lines.flatMap((line) =>
      line.words.map((word) => ({
        text: word.text,
        start: word.start,
        duration: word.duration,
        style: scene.style,
        fontSize: word.fontSize,
        x: word.x,
        y: word.y,
      })),
    ),
  );
};

export const planScene = (
  scene: Scene,
  durationInFrames: number,
  fps: number = CANVAS.fps,
  palette: PaletteName = DEFAULT_PALETTE,
  canvas: VideoConfig = CANVAS,
): ScenePlan => {
  const picture = composeImage(scene.image, canvas);
  return scene.elements && scene.elements.length > 0
    ? planComposed(scene, durationInFrames, fps, palette, picture, canvas)
    : planSingle(scene, durationInFrames, fps, palette, picture, canvas);
};
