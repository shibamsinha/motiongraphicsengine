import React, { useMemo, useState } from 'react';
import type { Scene } from '../../types/scene';
import { buildPhraseScenes, type PhrasePacing } from '../../data/phraseBuild';
import { CANVAS } from '../../utils/timing';
import { Group } from './Group';
import { Disclosure } from './Disclosure';

const PACING: { value: PhrasePacing; label: string }[] = [
  { value: 'accelerate', label: 'Faster' },
  { value: 'even', label: 'Even' },
  { value: 'decelerate', label: 'Slower' },
];

const seconds = (frames: number): string => `${(frames / CANVAS.fps).toFixed(2)}s`;

export const PhraseBuildPanel: React.FC<{
  onBuild: (scenes: Scene[], replace: boolean) => void;
}> = ({ onBuild }) => {
  const [sentence, setSentence] = useState('');
  const [totalFrames, setTotalFrames] = useState(3 * CANVAS.fps);
  const [pacing, setPacing] = useState<PhrasePacing>('accelerate');
  const [promoteFinal, setPromoteFinal] = useState(true);
  const [staggerFrames, setStaggerFrames] = useState(2);
  const [replace, setReplace] = useState(false);

  const options = { sentence, totalFrames, pacing, finalWordEmphasis: promoteFinal, staggerFrames };

  const preview = useMemo(
    () => (sentence.trim() ? buildPhraseScenes(options) : null),
    [sentence, totalFrames, pacing, promoteFinal, staggerFrames],
  );

  const ready = Boolean(preview && preview.scenes.length > 0);

  return (
    <Group
      title="Phrase build"
      summary={preview ? `${preview.scenes.length} scenes` : undefined}
      defaultOpen={false}
    >
      <p className="hint">
        One sentence becomes a run of cards, revealed word by word, tightening as
        it goes. Everything it makes is a normal scene you can edit afterwards.
      </p>

      <div className="field">
        <label htmlFor="phrase-sentence">Sentence</label>
        <textarea
          id="phrase-sentence"
          className="text-input"
          rows={2}
          value={sentence}
          placeholder="discipline beats motivation, every single day"
          onChange={(event) => setSentence(event.target.value)}
        />
      </div>

      <div className="field">
        <label>Length</label>
        <div className="number-row">
          <input
            type="number"
            step={1}
            min={CANVAS.fps / 2}
            max={60 * CANVAS.fps}
            value={totalFrames}
            onChange={(event) =>
              setTotalFrames(
                Math.max(
                  Math.round(CANVAS.fps / 2),
                  Math.min(60 * CANVAS.fps, Math.round(Number(event.target.value) || CANVAS.fps)),
                ),
              )
            }
          />
          <span className="unit-note">
            frames · <b>{seconds(totalFrames)}</b>
          </span>
        </div>
      </div>

      <div className="field">
        <label>Word timing</label>
        <div className="number-row">
          <input
            type="number"
            step={1}
            min={0}
            max={30}
            value={staggerFrames}
            onChange={(event) =>
              setStaggerFrames(Math.max(0, Math.min(30, Math.round(Number(event.target.value) || 0))))
            }
          />
          <span className="unit-note">
            frames apart · <b>{seconds(staggerFrames)}</b>
          </span>
        </div>
        <p className="hint">
          {staggerFrames > 0
            ? 'How far apart the words land inside each card.'
            : 'Every word in a card arrives together.'}
        </p>
      </div>

      <div className="field">
        <label>Pacing</label>
        <div className="segmented">
          {PACING.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === pacing ? 'is-on' : ''}
              onClick={() => setPacing(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="hint">
          {pacing === 'accelerate'
            ? 'Cards get shorter as the sentence goes — it tightens towards the end.'
            : pacing === 'decelerate'
              ? 'Cards get longer as the sentence goes — it settles towards the end.'
              : 'Every card gets the same length.'}
        </p>
      </div>

      <Disclosure label="Build options">
        <label className="phrase-check">
          <input
            type="checkbox"
            checked={promoteFinal}
            onChange={(event) => setPromoteFinal(event.target.checked)}
          />
          Give the last word its own display card
        </label>
        <label className="phrase-check">
          <input
            type="checkbox"
            checked={replace}
            onChange={(event) => setReplace(event.target.checked)}
          />
          Replace the reel instead of adding to it
        </label>
      </Disclosure>

      {ready && preview ? (
        <div className="field">
          <label>What this will make</label>
          <div className="phrase-preview">
            {preview.scenes.map((scene, index) => (
              <div className="phrase-preview-row" key={scene.id}>
                <span className="phrase-preview-text">{scene.text}</span>
                <span className="phrase-preview-frames">
                  {preview.framesPerPhrase[index]}f
                </span>
              </div>
            ))}
          </div>
          {preview.finalWord ? (
            <p className="hint">
              “{preview.finalWord}” is promoted to its own card.
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className="btn wide primary"
        disabled={!ready}
        onClick={() => {
          if (!ready) return;
          onBuild(buildPhraseScenes(options).scenes, replace);
          setSentence('');
        }}
      >
        {replace ? 'Build and replace the reel' : 'Build and add the scenes'}
      </button>
    </Group>
  );
};
