import React, { useMemo, useState } from 'react';
import { PRESETS, type Preset } from '../../data/presets';
import type { Scene } from '../../types/scene';
import { DEFAULT_PALETTE, themeFor } from '../../utils/typography';
import { formatSeconds, totalFrames, CANVAS } from '../../utils/timing';

const POSTER_SCENES = 5;

const firstLine = (text: string): string => {
  const line = text.split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? '';
  return line || '—';
};

const description = (note: string): string =>
  note
    .split('·')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !/^\d+\s*scenes?$/i.test(part) && !/^[\d.]+\s*s$/i.test(part))
    .join(' · ');

const Poster: React.FC<{ scenes: Scene[] }> = ({ scenes }) => (
  <span className="tpl-poster" aria-hidden>
    {scenes.slice(0, POSTER_SCENES).map((scene) => {
      const theme = themeFor(scene.background, DEFAULT_PALETTE);
      return (
        <span
          key={scene.id}
          className="tpl-frame"
          style={{ background: theme.background, color: theme.ink }}
        >
          <span className="tpl-frame-text">{firstLine(scene.text)}</span>
        </span>
      );
    })}
  </span>
);

const TemplateCard: React.FC<{
  preset: Preset;
  selected: boolean;
  onSelect: () => void;
  onUse: () => void;
}> = ({ preset, selected, onSelect, onUse }) => {
  const scenes = useMemo(() => preset.build(), [preset]);
  const seconds = totalFrames(scenes, CANVAS.fps) / CANVAS.fps;
  const note = description(preset.note);

  return (
    <div className={`tpl-card${selected ? ' is-selected' : ''}`}>
      <button
        type="button"
        className="tpl-pick"
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onUse}
      >
        <Poster scenes={scenes} />
        <span className="tpl-meta">
          <span className="tpl-name">{preset.label}</span>
          {note ? <span className="tpl-note">{note}</span> : null}
        </span>
        <span className="tpl-stats">
          {scenes.length} scenes · {formatSeconds(seconds)}
        </span>
      </button>
      {selected ? (
        <button type="button" className="btn primary tpl-use" onClick={onUse}>
          Use this template
        </button>
      ) : null}
    </div>
  );
};

export const TemplateBrowser: React.FC<{
  onUse: (preset: Preset) => void;
  onBack: () => void;
}> = ({ onUse, onBack }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="start-pane is-browser">
      <div className="start-head">
        <button type="button" className="start-back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="start-title">Reference Reels</h1>
        <p className="start-sub">
          Pick one as a starting point. It opens as your own editable copy — the
          original is never changed.
        </p>
      </div>

      <div className="tpl-grid">
        {PRESETS.map((preset) => (
          <TemplateCard
            key={preset.id}
            preset={preset}
            selected={preset.id === selectedId}
            onSelect={() => setSelectedId(preset.id)}
            onUse={() => onUse(preset)}
          />
        ))}
      </div>
    </div>
  );
};
