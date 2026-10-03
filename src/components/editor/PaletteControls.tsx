import React from 'react';
import type { BackgroundName, PaletteName } from '../../types/scene';
import { Group } from './Group';
import {
  DEFAULT_ACCENT,
  FIELDS,
  type FieldOverrides,
  themeFor,
} from '../../utils/typography';

const FIELD_NAMES: BackgroundName[] = ['green', 'cream', 'black'];

const FIELD_LABEL: Record<BackgroundName, string> = {
  green: 'Green',
  cream: 'Cream',
  black: 'Black',
};

const ColorCell: React.FC<{
  value: string | undefined;
  fallback: string;
  onChange: (value: string | undefined) => void;
  title: string;
}> = ({ value, fallback, onChange, title }) => (
  <div className="palette-cell">
    <input
      type="color"
      className="palette-swatch"
      aria-label={title}
      title={title}
      value={value ?? fallback}
      onChange={(event) => onChange(event.target.value.toUpperCase())}
    />
    <input
      type="text"
      className="palette-hex"
      spellCheck={false}
      placeholder={fallback}
      value={value ?? ''}
      onChange={(event) => {
        const raw = event.target.value.trim();
        if (raw === '') return onChange(undefined);
        if (/^#[0-9a-fA-F]{6}$/.test(raw)) onChange(raw.toUpperCase());
      }}
    />
  </div>
);

export const PaletteControls: React.FC<{
  palette: PaletteName;
  fields: FieldOverrides;
  ink: FieldOverrides;
  accent: string | null;
  onFields: (next: FieldOverrides) => void;
  onInk: (next: FieldOverrides) => void;
  onAccent: (next: string | null) => void;
}> = ({ palette, fields, ink, accent, onFields, onInk, onAccent }) => {
  const patch = (map: FieldOverrides, name: BackgroundName, value: string | undefined) => {
    const next = { ...map };
    if (value === undefined) delete next[name];
    else next[name] = value;
    return next;
  };

  const overridden =
    Object.keys(fields).length + Object.keys(ink).length + (accent ? 1 : 0);

  return (
    <Group
      title="Palette"
      summary={overridden > 0 ? `${overridden} custom` : 'House'}
      defaultOpen={overridden > 0}
    >
      <p className="hint">
        Field is the ground; ink is the type. Leave ink blank and the engine derives
        a readable colour for you — set it and it is used exactly.
      </p>

      <div className="palette-grid">
        <div className="palette-grid-head">
          <span />
          <span>Field</span>
          <span>Ink</span>
          <span>Preview</span>
        </div>

        {FIELD_NAMES.map((name) => {
          const theme = themeFor(name, palette, fields, ink, accent ?? DEFAULT_ACCENT);
          return (
            <div className="palette-grid-row" key={name}>
              <span className="palette-field-name">{FIELD_LABEL[name]}</span>
              <ColorCell
                value={fields[name]}
                fallback={FIELDS[name]}
                title={`${FIELD_LABEL[name]} field colour`}
                onChange={(value) => onFields(patch(fields, name, value))}
              />
              <ColorCell
                value={ink[name]}
                fallback={theme.ink}
                title={`Type colour on ${FIELD_LABEL[name]}`}
                onChange={(value) => onInk(patch(ink, name, value))}
              />
              <span
                className="palette-preview"
                style={{ background: theme.background, color: theme.ink }}
              >
                Aa
              </span>
            </div>
          );
        })}
      </div>

      <div className="field">
        <label>Accent · used by graphic objects</label>
        <ColorCell
          value={accent ?? undefined}
          fallback={DEFAULT_ACCENT}
          title="Project accent colour"
          onChange={(value) => onAccent(value ?? null)}
        />
      </div>

      {overridden > 0 ? (
        <button
          type="button"
          className="btn wide"
          onClick={() => {
            onFields({});
            onInk({});
            onAccent(null);
          }}
        >
          Reset to the house palette
        </button>
      ) : null}
    </Group>
  );
};
