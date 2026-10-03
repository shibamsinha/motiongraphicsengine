import React from 'react';
import type {
  AnimationStyle,
  VideoConfig,
  CompositionPreset,
  PaletteName,
  PositionPreset,
  Scene,
  SceneElement,
  SizePreset,
  TextRole,
} from '../../types/scene';
import { blankElement, element as makeElement } from '../../data/defaultScenes';
import { ANIMATION_STYLES, styleDefinition } from '../motion/registry';
import { ENTER_SECONDS } from '../motion/primitives';
import {
  COMPOSITIONS,
  COMPOSITION_PRESETS,
  POSITION_LABEL,
  POSITION_PRESETS,
  ROLE_LABEL,
  ROLE_SIZE,
  SIZE_LABEL,
  SIZE_PRESETS,
  TEXT_ROLES,
} from '../../utils/composition';
import { isEmphasised, splitLines, splitWords } from '../../utils/typography';
import { planScene, type ScenePlan } from '../../utils/plan';
import { totalFrames } from '../../utils/timing';
import { VisualStyleControls } from './VisualStyleControls';
import { WordColors } from './WordColors';
import { Disclosure } from './Disclosure';

const runsOf = (scene: Scene): { text: string; role: TextRole }[] => {
  const lines = splitLines(scene.text);
  if (lines.length === 0) return [];

  const emphasis = scene.emphasis ?? [];
  const marked = lines.map((line) =>
    splitWords(line).some((word) => isEmphasised(word, emphasis)),
  );

  if (lines.length > 1) {
    const heroIndex = marked.indexOf(true) >= 0 ? marked.indexOf(true) : lines.length - 1;
    return lines.map((line, index) => ({
      text: line,
      role: (index === heroIndex ? 'primary' : index < heroIndex ? 'secondary' : 'support') as TextRole,
    }));
  }

  const words = splitWords(lines[0]);
  const flags =
    emphasis.length > 0
      ? words.map((word) => isEmphasised(word, emphasis))
      : words.map((_, index) => index === words.length - 1);

  const runs: { hero: boolean; words: string[] }[] = [];
  words.forEach((word, index) => {
    const hero = flags[index];
    const current = runs[runs.length - 1];
    if (current && current.hero === hero) current.words.push(word);
    else runs.push({ hero, words: [word] });
  });

  const heroIndex = runs.findIndex((run) => run.hero);
  return runs.map((run, index) => ({
    text: run.words.join(' '),
    role: (run.hero ? 'primary' : index < heroIndex ? 'secondary' : 'support') as TextRole,
  }));
};

const plannedWords = (plan: ScenePlan) =>
  plan.elements.flatMap((element) =>
    element.block.lines.flatMap((line) => line.words),
  );

export const cascadeDelays = (
  scene: Scene,
  elements: SceneElement[],
  { palette, canvas }: { palette: PaletteName; canvas: VideoConfig },
): SceneElement[] => {
  if (elements.length < 2) return elements;
  const frames = Math.max(1, totalFrames([scene], canvas.fps));
  const delays = new Array(elements.length).fill(0);

  const withDelays = () =>
    elements.map((element, i) => ({
      ...element,
      ...(delays[i] > 0 ? { delay: delays[i] / canvas.fps } : { delay: undefined }),
    }));

  for (let i = 0; i < elements.length - 1; i++) {
    const step = planScene(
      { ...scene, elements: withDelays() },
      frames,
      canvas.fps,
      palette,
      canvas,
    );
    const el = step.elements[i];
    if (!el) break;
    const words = el.block.lines.flatMap((line) => line.words);
    const lastStart =
      words.length > 0 ? Math.max(...words.map((w) => w.start)) : delays[i];
    delays[i + 1] = lastStart + Math.round(ENTER_SECONDS[el.style] * canvas.fps);
  }

  const last = elements.length - 1;
  const lastStyle = elements[last]?.animation ?? scene.style;
  const room = Math.max(1, frames - 1 - Math.round(ENTER_SECONDS[lastStyle] * canvas.fps));
  if (delays[last] > room) {
    const squeeze = room / delays[last];
    for (let i = 0; i < delays.length; i++) delays[i] = Math.round(delays[i] * squeeze);
  }

  return elements.map((element, i) => {
    const { delay: _drop, ...rest } = element;
    return delays[i] > 0
      ? { ...rest, delay: Number((delays[i] / canvas.fps).toFixed(3)) }
      : (rest as SceneElement);
  });
};

export const seedElements = (
  scene: Scene,
  context?: { palette: PaletteName; canvas: VideoConfig },
): SceneElement[] => {
  const runs = runsOf(scene);
  if (runs.length === 0) return [blankElement()];

  const plain = runs.map((run) =>
    makeElement(run.text, { role: run.role, animation: scene.style }),
  );
  if (!context) return plain;

  try {
    const { palette, canvas } = context;
    const frames = Math.max(1, totalFrames([scene], canvas.fps));
    const before = planScene(scene, frames, canvas.fps, palette, canvas);

    const pool = plannedWords(before);
    let cursor = 0;
    const targets = runs.map((run) => {
      const wanted = splitWords(run.text);
      const found: typeof pool = [];
      for (const word of wanted) {
        const at = pool.findIndex(
          (candidate, i) => i >= cursor && candidate.text === word,
        );
        if (at >= 0) {
          found.push(pool[at]);
          cursor = at + 1;
        }
      }
      if (found.length === 0) return null;
      const left = Math.min(...found.map((w) => w.cx - w.width / 2));
      const right = Math.max(...found.map((w) => w.cx + w.width / 2));
      return {
        x: (left + right) / 2 / canvas.width,
        y: found.reduce((sum, w) => sum + w.cy, 0) / found.length / canvas.height,
        fontSize: Math.max(...found.map((w) => w.fontSize)),
      };
    });

    const placed = plain.map((element, index) => {
      const target = targets[index];
      return target ? { ...element, x: target.x, y: target.y } : element;
    });

    const seeded = cascadeDelays(scene, placed, context);

    const after = planScene(
      { ...scene, elements: seeded },
      frames,
      canvas.fps,
      palette,
      canvas,
    );
    return seeded.map((element, index) => {
      const target = targets[index];
      const actual = after.elements[index]?.block.heroSize;
      if (!target || !actual || actual <= 0) return element;
      const scale = target.fontSize / actual;
      if (Math.abs(scale - 1) < 0.01) return element;
      return { ...element, scale: Number(scale.toFixed(3)) };
    });
  } catch {
    return plain;
  }
};

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: T | '';
  options: { value: T; label: string }[];
  onChange: (next: T | '') => void;
  placeholder?: string;
}) {
  return (
    <label className="mini-field">
      <span>{label}</span>
      <select
        className="mini-select"
        value={value}
        onChange={(event) => onChange(event.target.value as T | '')}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const ROLE_OPTIONS = TEXT_ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }));
const SIZE_OPTIONS = SIZE_PRESETS.map((size) => ({ value: size, label: SIZE_LABEL[size] }));
const POSITION_OPTIONS = POSITION_PRESETS.map((position) => ({
  value: position,
  label: POSITION_LABEL(position),
}));
const STYLE_OPTIONS = ANIMATION_STYLES.map((id) => ({
  value: id,
  label: styleDefinition(id).label,
}));

export const CompositionField: React.FC<{
  scene: Scene;
  onChange: (patch: Partial<Scene>) => void;
}> = ({ scene, onChange }) => {
  const composition = scene.composition ?? '';
  return (
    <div className="field">
      <label htmlFor="scene-composition">Layout</label>
      <select
        id="scene-composition"
        className="mini-select"
        value={composition}
        onChange={(event) =>
          event.target.value
            ? onChange({ composition: event.target.value as CompositionPreset })
            : onChange({ composition: undefined })
        }
      >
        <option value="">Auto — chosen from the elements</option>
        {COMPOSITION_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {COMPOSITIONS[preset].label}
          </option>
        ))}
      </select>
      <p className="hint">
        {composition
          ? COMPOSITIONS[composition as CompositionPreset].description
          : 'One element centres; two stack left; three split. Elements that name their own position are placed there regardless.'}
      </p>
    </div>
  );
};

export const ElementEditor: React.FC<{
  scene: Scene;
  palette: PaletteName;
  onChange: (patch: Partial<Scene>) => void;
  canvas?: VideoConfig;
}> = ({ scene, palette, onChange, canvas }) => {
  const elements = scene.elements ?? [];

  const commit = (next: SceneElement[]) =>
    onChange({
      elements: next,
      text: next.map((entry) => entry.text).join('\n'),
    });

  const patch = (index: number, changes: Partial<SceneElement>) =>
    commit(
      elements.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)),
    );

  const clear = (index: number, key: keyof SceneElement) =>
    commit(
      elements.map((entry, i) => {
        if (i !== index) return entry;
        const copy = { ...entry };
        delete copy[key];
        return copy;
      }),
    );

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= elements.length) return;
    const next = [...elements];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  return (
    <>
      <div className="field">
        <label>
          Elements · {elements.length}
        </label>
        <div className="elements">
          {elements.map((entry, index) => (
            <div className="element-card" key={entry.id}>
              <div className="element-head">
                <span className="element-index">{index + 1}</span>
                <input
                  className="element-text"
                  value={entry.text}
                  spellCheck={false}
                  onChange={(event) => patch(index, { text: event.target.value })}
                />
                <button
                  type="button"
                  className="btn icon"
                  title="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn icon"
                  title="Move down"
                  disabled={index === elements.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn icon"
                  title="Remove this element"
                  onClick={() => commit(elements.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>

              <div className="element-grid">
                <Select
                  label="Role"
                  value={entry.role ?? 'primary'}
                  options={ROLE_OPTIONS}
                  onChange={(role) => patch(index, { role: role as TextRole })}
                />
                <Select
                  label="Size"
                  value={entry.size ?? ''}
                  placeholder={`Auto · ${SIZE_LABEL[ROLE_SIZE[entry.role ?? 'primary']]}`}
                  options={SIZE_OPTIONS}
                  onChange={(size) =>
                    size ? patch(index, { size: size as SizePreset }) : clear(index, 'size')
                  }
                />
                <Select
                  label="Position"
                  value={entry.position ?? ''}
                  placeholder="Auto · from composition"
                  options={POSITION_OPTIONS}
                  onChange={(position) =>
                    position
                      ? patch(index, { position: position as PositionPreset })
                      : clear(index, 'position')
                  }
                />
                <Select
                  label="Animation"
                  value={entry.animation ?? ''}
                  placeholder={`Auto · ${styleDefinition(scene.style).label}`}
                  options={STYLE_OPTIONS}
                  onChange={(animation) =>
                    animation
                      ? patch(index, { animation: animation as AnimationStyle })
                      : clear(index, 'animation')
                  }
                />
              </div>

              <Disclosure label="Colour and treatment">
                <WordColors
                  words={splitWords(entry.text)}
                  colors={entry.wordColors}
                  onChange={(wordColors) =>
                    commit(
                      elements.map((item, i) =>
                        i === index ? { ...item, wordColors } : item,
                      ),
                    )
                  }
                />

                <VisualStyleControls
                  scope="element"
                  style={entry.visualStyle}
                  config={entry.styleConfig}
                  background={scene.background}
                  palette={palette}
                  inherited={scene.visualStyle ?? 'solid'}
                  onChange={(visualStyle, styleConfig) =>
                    commit(
                      elements.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              ...(visualStyle
                                ? { visualStyle, styleConfig }
                                : { visualStyle: undefined, styleConfig: undefined }),
                            }
                          : item,
                      ),
                    )
                  }
                />
              </Disclosure>
            </div>
          ))}
        </div>

        <div className="element-actions">
          <button
            type="button"
            className="btn"
            onClick={() => commit([...elements, blankElement()])}
          >
            Add element
          </button>
          {canvas && elements.length > 1 ? (
            <button
              type="button"
              className="btn"
              title="Re-space the delays so each element starts when the one before it finishes"
              onClick={() =>
                commit(cascadeDelays(scene, elements, { palette, canvas }))
              }
            >
              Re-time cascade
            </button>
          ) : null}
          <button
            type="button"
            className="btn"
            title="Go back to one block of text with emphasis"
            onClick={() => onChange({ elements: undefined, composition: undefined })}
          >
            Single text
          </button>
        </div>
        <p className="hint">
          Auto on any field means the element inherits — size from its role,
          position from the composition, animation from the scene.
        </p>
      </div>
    </>
  );
};
