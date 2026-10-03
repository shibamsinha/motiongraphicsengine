import React, { useState } from 'react';

export const colorKey = (word: string): string =>
  word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

const SWATCHES = [
  '#4ADE6A', '#13581D', '#EEEEEE', '#0F0F0F',
  '#E5484D', '#F5A524', '#3E7BFA', '#B15CF0',
];

export const WordColors: React.FC<{
  words: string[];
  colors: Record<string, string> | undefined;
  onChange: (next: Record<string, string> | undefined) => void;
}> = ({ words, colors, onChange }) => {
  const [selected, setSelected] = useState<string | null>(null);

  if (words.length === 0) return null;

  const set = (key: string, colour: string | null) => {
    const next = { ...(colors ?? {}) };
    if (colour === null) delete next[key];
    else next[key] = colour;
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  const activeColour = selected ? colors?.[selected] ?? '#4ADE6A' : '#4ADE6A';

  return (
    <div className="field">
      <label>Word colour</label>
      <div className="chips">
        {words.map((word, index) => {
          const key = colorKey(word);
          const colour = colors?.[key];
          return (
            <button
              key={`${word}-${index}`}
              type="button"
              className={`chip word-chip${selected === key ? ' is-on' : ''}`}
              onClick={() => setSelected(selected === key ? null : key)}
              title={colour ? `${word} — ${colour}` : `Colour "${word}"`}
            >
              {colour ? (
                <span className="word-chip-dot" style={{ background: colour }} />
              ) : null}
              {word}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="word-color-picker">
          <div className="chips">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`word-swatch${colors?.[selected] === swatch ? ' is-on' : ''}`}
                style={{ background: swatch }}
                onClick={() => set(selected, swatch)}
                title={swatch}
              />
            ))}
          </div>
          <div className="colour-row">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(activeColour) ? activeColour : '#4ADE6A'}
              onChange={(e) => set(selected, e.target.value)}
            />
            <input
              className="text-input"
              value={colors?.[selected] ?? ''}
              placeholder="#4ADE6A or any CSS colour"
              spellCheck={false}
              onChange={(e) => set(selected, e.target.value || null)}
            />
            <button
              type="button"
              className="btn tiny"
              onClick={() => set(selected, null)}
              disabled={!colors?.[selected]}
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <p className="hint">
          {colors && Object.keys(colors).length > 0
            ? `Coloured: ${Object.keys(colors).join(', ')}`
            : 'Click a word, then pick a colour. Nothing coloured — every word takes the scene’s treatment.'}
        </p>
      )}
    </div>
  );
};
