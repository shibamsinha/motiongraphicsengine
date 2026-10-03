import React, { useCallback, useRef, useState } from 'react';
import type { Project, ProjectOrigin } from '../../types/project';
import type { Preset } from '../../data/presets';
import type { PersistedProject } from '../../utils/persistence';
import { parseProjectScript } from '../../utils/importScript';
import {
  createBlankProject,
  createProjectFromJSON,
  createProjectFromPersisted,
  createProjectFromTemplate,
} from '../../utils/project';
import { Logo } from '../brand/Logo';
import { TemplateBrowser } from './TemplateBrowser';
import { MotionField } from './MotionField';
import { sampleProjectJson } from '../../data/sampleProject';

type Failure = { title: string; hint: string; detail: string | null };

type View =
  | { kind: 'choose' }
  | { kind: 'templates' }
  | { kind: 'import'; text: string; failure: Failure | null }
  | { kind: 'busy'; label: string }
  | { kind: 'failed'; failure: Failure };

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="start">
    <div className="start-backdrop" aria-hidden>
      <span className="start-grid" />
      <span className="start-glow" />
      <MotionField />
      <span className="start-fade" />
    </div>
    <div className="start-scroll">{children}</div>
  </div>
);

const CARDS = [
  {
    id: 'scratch',
    title: 'Blank canvas',
    body: 'Build a motion piece from an empty timeline.',
    action: 'Start from scratch',
  },
  {
    id: 'import',
    title: 'Import project',
    body: 'Open a project JSON exported from the editor or written by hand.',
    action: 'Import JSON',
  },
  {
    id: 'template',
    title: 'Reference reels',
    body: 'Start from one of the bundled reels and make it your own.',
    action: 'Browse templates',
  },
] as const;

const CardIcon: React.FC<{ id: (typeof CARDS)[number]['id'] }> = ({ id }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {id === 'scratch' ? (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        <path d="M12 8.5v7M8.5 12h7" />
      </>
    ) : id === 'import' ? (
      <>
        <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
        <path d="M14 3.5V8h4.5M12 11v6M9.5 14.5 12 17l2.5-2.5" />
      </>
    ) : (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
        <path d="m17 13.5 3.5 3.5-3.5 3.5-3.5-3.5z" />
      </>
    )}
  </svg>
);

export const StartScreen: React.FC<{
  resumable: PersistedProject | null;
  onOpen: (project: Project, origin: ProjectOrigin) => void;
}> = ({ resumable, onOpen }) => {
  const [view, setView] = useState<View>({ kind: 'choose' });
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const fail = useCallback((failure: Failure) => {
    setView({ kind: 'failed', failure });
  }, []);

  const runImport = useCallback(
    (source: string, origin: 'file' | 'paste') => {
      const text = source.trim();
      if (text === '') {
        setView({
          kind: 'import',
          text: source,
          failure: {
            title: 'Nothing to import.',
            hint: 'Choose a .json file, or paste a project below.',
            detail: null,
          },
        });
        return;
      }

      const result = parseProjectScript(text);
      if (!result.ok) {
        const errors = result.issues.filter((i) => i.severity === 'error');
        setView({
          kind: 'import',
          text: source,
          failure: {
            title: "This isn't a valid Motion Graphics Engine project.",
            hint:
              origin === 'file'
                ? 'Check the file was extracted from the Motion Engine — or edit it below and import again.'
                : 'Fix the problems below and import again.',
            detail:
              errors
                .slice(0, 6)
                .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
                .join('\n') || null,
          },
        });
        return;
      }
      onOpen(createProjectFromJSON(result.project), 'import');
    },
    [onOpen],
  );

  const readFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;

      const reader = new FileReader();
      reader.onerror = () =>
        setView({
          kind: 'import',
          text: '',
          failure: {
            title: "That file couldn't be read.",
            hint: 'It may have been moved or renamed. Try again, or paste the project below.',
            detail: null,
          },
        });
      reader.onload = () => runImport(String(reader.result ?? ''), 'file');
      reader.readAsText(file);
    },
    [runImport],
  );

  const beginImport = useCallback(() => {
    setView({ kind: 'import', text: '', failure: null });
    fileRef.current?.click();
  }, []);

  const useTemplate = useCallback(
    (preset: Preset) => {
      setView({ kind: 'busy', label: 'Loading template…' });
      window.setTimeout(() => {
        try {
          onOpen(createProjectFromTemplate(preset), 'template');
        } catch {
          fail({
            title: "This template couldn't be loaded.",
            hint: 'Please try again, or pick a different Reference Reel.',
            detail: null,
          });
        }
      }, 0);
    },
    [fail, onOpen],
  );

  const picker = (
    <input
      ref={fileRef}
      type="file"
      accept=".json,application/json"
      hidden
      onChange={(event) => {
        readFile(event.target.files?.[0]);
        event.target.value = '';
      }}
    />
  );

  if (view.kind === 'templates') {
    return (
      <Shell>
        {picker}
        <TemplateBrowser
          onUse={useTemplate}
          onBack={() => setView({ kind: 'choose' })}
        />
      </Shell>
    );
  }

  if (view.kind === 'busy') {
    return (
      <Shell>
        {picker}
        <div className="start-pane is-busy">
          <p className="start-busy">{view.label}</p>
        </div>
      </Shell>
    );
  }

  if (view.kind === 'import') {
    const { text, failure } = view;
    const setText = (next: string) =>
      setView({ kind: 'import', text: next, failure: null });

    return (
      <Shell>
        {picker}
        <div className="start-pane">
          <div className="start-head">
            <button
              type="button"
              className="start-back"
              onClick={() => setView({ kind: 'choose' })}
            >
              ← Back
            </button>
            <h1 className="start-title">Import a project</h1>
            <p className="start-sub">
              Choose a <code>.json</code> file, or paste one straight in.
            </p>
          </div>

          <div className="import-panel">
            <button
              type="button"
              className={`dropzone${dragging ? ' is-over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                readFile(event.dataTransfer.files?.[0]);
              }}
            >
              Drop a .json file here, or click to choose one
            </button>

            <div className="import-sample">
              <span className="import-or">or paste the JSON</span>
              <span className="spacer" />
              <button
                type="button"
                className="btn tiny"
                onClick={() => {
                  const sample = sampleProjectJson();
                  navigator.clipboard?.writeText(sample).then(
                    () => setCopied(true),
                    () => setText(sample),
                  );
                  window.setTimeout(() => setCopied(false), 1600);
                }}
                title="A complete, valid example project — text, composition, and motion graphics"
              >
                {copied ? 'Copied' : 'Copy sample JSON'}
              </button>
              <button
                type="button"
                className="btn tiny"
                onClick={() => setText(sampleProjectJson())}
                title="Put the sample in the box below"
              >
                Load sample
              </button>
            </div>

            <textarea
              className="text-input import-input"
              spellCheck={false}
              autoFocus
              placeholder={'{\n  "title": "…",\n  "scenes": [ … ]\n}'}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />

            {failure ? (
              <div className="import-failure">
                <p className="import-failure-title">{failure.title}</p>
                <p className="import-failure-hint">{failure.hint}</p>
                {failure.detail ? (
                  <pre className="start-detail">{failure.detail}</pre>
                ) : null}
              </div>
            ) : null}

            <div className="start-actions">
              <button
                type="button"
                className="btn primary"
                disabled={text.trim() === ''}
                onClick={() => runImport(text, 'paste')}
              >
                Import project
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setView({ kind: 'choose' })}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (view.kind === 'failed') {
    const { failure } = view;
    return (
      <Shell>
        {picker}
        <div className="start-pane">
          <div className="start-head">
            <h1 className="start-title">{failure.title}</h1>
            <p className="start-sub">{failure.hint}</p>
          </div>
          {failure.detail ? (
            <pre className="start-detail">{failure.detail}</pre>
          ) : null}
          <div className="start-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => setView({ kind: 'templates' })}
            >
              Back to templates
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setView({ kind: 'choose' })}
            >
              Back to start
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {picker}
      <div className="start-pane">
        <div className="start-head">
          <Logo size={30} className="start-logo" />
          <h1 className="start-title">
            Start something that <em>moves.</em>
          </h1>
          <p className="start-sub">
            Choose a starting point for your next motion piece.
          </p>
        </div>

        <div className="start-cards">
          {CARDS.map((card, i) => (
            <button
              key={card.id}
              type="button"
              className="start-card"
              style={{ '--i': i } as React.CSSProperties}
              onClick={() => {
                if (card.id === 'scratch') onOpen(createBlankProject(), 'scratch');
                else if (card.id === 'import') beginImport();
                else setView({ kind: 'templates' });
              }}
            >
              <span className="start-card-icon">
                <CardIcon id={card.id} />
              </span>
              <span className="start-card-title">{card.title}</span>
              <span className="start-card-body">{card.body}</span>
              <span className="start-card-action">
                {card.action}
                <i className="start-arrow" aria-hidden>
                  →
                </i>
              </span>
            </button>
          ))}
        </div>

        {resumable ? (
          <p className="start-resume">
            <button
              type="button"
              className="linkish"
              onClick={() =>
                onOpen(createProjectFromPersisted(resumable), 'resumed')
              }
            >
              Resume last session
            </button>
            <span className="start-resume-note">
              {resumable.title ?? 'Untitled reel'} · {resumable.scenes.length} scenes
            </span>
          </p>
        ) : null}
      </div>
    </Shell>
  );
};
