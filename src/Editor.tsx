import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import type { CanvasFormat, OverlayImage, PaletteName, Scene } from './types/scene';
import type { Project } from './types/project';
import { blankScene, defaultScenes, makeSceneId } from './data/defaultScenes';
import { PRESETS } from './data/presets';
import {
  CANVAS,
  DEFAULT_FORMAT,
  FORMAT_LABEL,
  buildTimeline,
  canvasFor,
  totalFrames,
} from './utils/timing';
import {
  DEFAULT_PALETTE,
  FIELDS,
  PALETTES,
  PALETTE_NAMES,
  flipBackground,
  remapBackground,
} from './utils/typography';
import { VideoPreview } from './components/editor/VideoPreview';
import { SceneList } from './components/editor/SceneList';
import { SceneEditor } from './components/editor/SceneEditor';
import { Timeline } from './components/editor/Timeline';
import { ExportBar } from './components/editor/ExportBar';
import { ImportPanel } from './components/editor/ImportPanel';
import { ExtractPanel } from './components/editor/ExtractPanel';
import { Logo } from './components/brand/Logo';
import { Group } from './components/editor/Group';
import { Transport } from './components/editor/Transport';
import { ImageStage } from './components/editor/ImageStage';
import { OverlayControls } from './components/editor/OverlayControls';
import { OverlayStage } from './components/editor/OverlayStage';
import { AudioControls } from './components/editor/AudioControls';
import { PaletteControls } from './components/editor/PaletteControls';
import { PhraseBuildPanel } from './components/editor/PhraseBuildPanel';
import type { ProjectAudio } from './types/audio';
import { ObjectList } from './components/editor/ObjectList';
import { ObjectInspector } from './components/editor/ObjectInspector';
import { ObjectStage } from './components/editor/ObjectStage';
import { TextStage } from './components/editor/TextStage';
import type { ObjectKind, SceneObject } from './types/object';
import {
  addObject,
  duplicateObject,
  findObject,
  flattenObjects,
  newObject,
  objectTitle,
  removeObject,
  reorderObject,
  updateObject,
} from './data/objects';
import { themeFor } from './utils/typography';
import { clearProject, saveProject } from './utils/persistence';
import type { ImportedProject } from './utils/importScript';
import type { FieldOverrides } from './utils/typography';

export const Editor: React.FC<{ initial: Project }> = ({ initial }) => {
  const [scenes, setScenes] = useState<Scene[]>(() => initial.scenes);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.selectedId,
  );
  const [palette, setPalette] = useState<PaletteName>(initial.palette);
  const [format, setFormat] = useState<CanvasFormat>(initial.format);
  const [fields, setFields] = useState<FieldOverrides>(initial.fields);
  const [ink, setInk] = useState<FieldOverrides>(initial.ink);
  const [accent, setAccent] = useState<string | null>(initial.accent);
  const [title, setTitle] = useState<string | null>(initial.title);
  const [overlay, setOverlay] = useState<OverlayImage | null>(initial.overlay);
  const [audio, setAudio] = useState<ProjectAudio | null>(initial.audio);
  const [importOpen, setImportOpen] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [frame, setFrame] = useState(0);
  const [canvasTarget, setCanvasTarget] = useState<'image' | 'overlay' | null>(
    null,
  );
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<'scene' | 'project'>('scene');
  const playerRef = useRef<PlayerRef | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);

  const selected = scenes.find((scene) => scene.id === selectedId) ?? null;
  const frames = totalFrames(scenes, CANVAS.fps);
  const seconds = frames / CANVAS.fps;
  const canvas = useMemo(() => canvasFor(format), [format]);

  const selectedIsOnScreen = useMemo(() => {
    if (!selectedId) return false;
    const entry = buildTimeline(scenes, CANVAS.fps).find(
      (candidate) => candidate.scene.id === selectedId,
    );
    return Boolean(
      entry && frame >= entry.from && frame < entry.from + entry.durationInFrames,
    );
  }, [scenes, selectedId, frame]);

  useEffect(() => {
    setSaved(false);
    const snapshot = { scenes, palette, format, fields, ink, accent, overlay, audio, title, selectedId };
    const timer = window.setTimeout(() => {
      setSaved(saveProject(snapshot));
    }, 400);

    const flush = () => {
      if (document.visibilityState === 'hidden') saveProject(snapshot);
    };
    window.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [scenes, palette, format, fields, ink, accent, overlay, audio, title, selectedId]);

  useEffect(() => {
    if (canvasTarget === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCanvasTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canvasTarget]);

  useEffect(() => {
    if (playing) setCanvasTarget(null);
  }, [playing]);
  useEffect(() => {
    if (!overlay) setCanvasTarget((current) => (current === 'overlay' ? null : current));
  }, [overlay]);

  useEffect(() => {
    if (!selectedId && scenes.length > 0) setSelectedId(scenes[0].id);
  }, [scenes, selectedId]);

  useEffect(() => {
    inspectorRef.current?.scrollTo({ top: 0 });
  }, [inspectorTab]);

  useEffect(() => {
    setSelectedObjectId(null);
    setSelectedElementId(null);
  }, [selectedId]);

  const seek = useCallback((target: number) => {
    playerRef.current?.seekTo(target);
    setFrame(target);
  }, []);

  const selectScene = useCallback(
    (id: string, scenesOverride?: Scene[]) => {
      setSelectedId(id);
      const list = scenesOverride ?? scenes;
      const entry = buildTimeline(list, CANVAS.fps).find(
        (candidate) => candidate.scene.id === id,
      );
      if (entry) seek(entry.from);
    },
    [scenes, seek],
  );

  const updateScene = useCallback(
    (patch: Partial<Scene>) => {
      if (!selectedId) return;
      setScenes((current) =>
        current.map((scene) =>
          scene.id === selectedId ? { ...scene, ...patch } : scene,
        ),
      );
    },
    [selectedId],
  );

  const addScene = useCallback(() => {
    const index = scenes.findIndex((scene) => scene.id === selectedId);
    const previous = index >= 0 ? scenes[index] : scenes[scenes.length - 1];
    const created = blankScene({
      background: flipBackground(previous?.background ?? 'cream', palette),
      alignment: previous?.alignment ?? 'center',
    });
    const at = index >= 0 ? index + 1 : scenes.length;
    const next = [...scenes.slice(0, at), created, ...scenes.slice(at)];
    setScenes(next);
    selectScene(created.id, next);
  }, [scenes, selectedId, selectScene, palette]);

  const duplicateScene = useCallback(() => {
    const index = scenes.findIndex((scene) => scene.id === selectedId);
    if (index < 0) return;
    const copy: Scene = {
      ...scenes[index],
      id: makeSceneId(),
      emphasis: [...(scenes[index].emphasis ?? [])],
    };
    const next = [
      ...scenes.slice(0, index + 1),
      copy,
      ...scenes.slice(index + 1),
    ];
    setScenes(next);
    selectScene(copy.id, next);
  }, [scenes, selectedId, selectScene]);

  const deleteScene = useCallback(() => {
    const index = scenes.findIndex((scene) => scene.id === selectedId);
    if (index < 0) return;
    const next = scenes.filter((scene) => scene.id !== selectedId);
    setScenes(next);
    const fallback = next[Math.min(index, next.length - 1)];
    if (fallback) selectScene(fallback.id, next);
    else setSelectedId(null);
  }, [scenes, selectedId, selectScene]);

  const moveScene = useCallback(
    (offset: -1 | 1) => {
      const index = scenes.findIndex((scene) => scene.id === selectedId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= scenes.length) return;
      const next = [...scenes];
      [next[index], next[target]] = [next[target], next[index]];
      setScenes(next);
      selectScene(next[target].id, next);
    },
    [scenes, selectedId, selectScene],
  );

  const withObjects = useCallback(
    (fn: (objects: SceneObject[]) => SceneObject[]) => {
      if (!selected) return;
      updateScene({ objects: fn(selected.objects ?? []) });
    },
    [selected, updateScene],
  );

  const addSceneObject = useCallback(
    (kind: ObjectKind) => {
      const object = newObject(kind);
      const parent = selectedObjectId
        ? findObject(selected?.objects, selectedObjectId)
        : null;
      const into = parent && (parent.type === 'card' || parent.type === 'group')
        ? parent.id
        : null;
      withObjects((objects) => addObject(objects, object, into));
      setSelectedObjectId(object.id);
    },
    [withObjects, selected, selectedObjectId],
  );

  const patchObject = useCallback(
    (patch: Partial<SceneObject>) => {
      if (!selectedObjectId) return;
      withObjects((objects) => updateObject(objects, selectedObjectId, patch));
    },
    [withObjects, selectedObjectId],
  );

  const deleteObject = useCallback(() => {
    if (!selectedObjectId) return;
    withObjects((objects) => removeObject(objects, selectedObjectId));
    setSelectedObjectId(null);
  }, [withObjects, selectedObjectId]);

  const duplicateSceneObject = useCallback(() => {
    if (!selectedObjectId) return;
    withObjects((objects) => duplicateObject(objects, selectedObjectId));
  }, [withObjects, selectedObjectId]);

  const reorderSceneObject = useCallback(
    (to: 'front' | 'back' | 'forward' | 'backward') => {
      if (!selectedObjectId) return;
      withObjects((objects) => reorderObject(objects, selectedObjectId, to));
    },
    [withObjects, selectedObjectId],
  );

  const resetProject = useCallback(() => {
    clearProject();
    const next = defaultScenes();
    setScenes(next);
    setPalette(DEFAULT_PALETTE);
    setFormat(DEFAULT_FORMAT);
    setFields({});
    setOverlay(null);
    setAudio(null);
    setTitle(null);
    setSelectedId(next[0]?.id ?? null);
    seek(0);
  }, [seek]);

  const loadPreset = useCallback(
    (id: string) => {
      const preset = PRESETS.find((candidate) => candidate.id === id);
      if (!preset) return;
      const next = preset.build();
      setScenes(next);
      setSelectedId(null);
      setFields({});
      setInk({});
      setAccent(null);
      setTitle(null);
      seek(0);
    },
    [seek],
  );

  const applyImport = useCallback(
    (project: ImportedProject) => {
      setScenes(project.scenes);
      setPalette(project.palette);
      setFormat(project.format);
      setFields(project.fields);
      setInk(project.ink);
      setAccent(project.accent);
      setOverlay(project.overlay);
      setAudio(project.audio);
      setTitle(project.title);
      setSelectedId(project.scenes[0]?.id ?? null);
      seek(0);
      setImportOpen(false);
    },
    [seek],
  );

  const changePalette = useCallback((next: PaletteName) => {
    setPalette(next);
    setScenes((current) =>
      current.map((scene) => ({
        ...scene,
        background: remapBackground(scene.background, next),
      })),
    );
  }, []);

  const togglePlay = useCallback(() => {
    playerRef.current?.toggle();
  }, []);

  const meta = useMemo(
    () => ({
      scenes: scenes.length,
      seconds: seconds.toFixed(2),
      frames,
    }),
    [scenes.length, seconds, frames],
  );

  return (
    <div className="app">
      <header className="topbar">
        <Logo />

        <input
          className="project-title"
          value={title ?? ''}
          placeholder="Untitled reel"
          spellCheck={false}
          aria-label="Project title"
          onChange={(event) => setTitle(event.target.value || null)}
        />

        <span className="topbar-rule" aria-hidden />

        <select
          className="preset"
          defaultValue="reference"
          onChange={(event) => loadPreset(event.target.value)}
          title="Replace this reel with a Reference Reel"
          aria-label="Start from a reference reel"
        >
          {PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label} — {preset.note}
            </option>
          ))}
        </select>
        <div className="palette-switch" role="group" aria-label="Format">
          {(['portrait', 'landscape'] as CanvasFormat[]).map((name) => (
            <button
              key={name}
              type="button"
              className={`palette-chip${name === format ? ' is-on' : ''}`}
              onClick={() => setFormat(name)}
              title={`Render this reel as ${FORMAT_LABEL[name]}`}
            >
              <span
                className="format-glyph"
                data-orientation={name}
                aria-hidden
              />
              {name === 'portrait' ? '9:16' : '16:9'}
            </button>
          ))}
        </div>
        <div className="palette-switch" role="group" aria-label="Palette">
          {PALETTE_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              className={`palette-chip${name === palette ? ' is-on' : ''}`}
              onClick={() => changePalette(name)}
              title={`Switch the reel to ${PALETTES[name].label}`}
            >
              <span
                className="dot"
                style={{ background: FIELDS[PALETTES[name].dark] }}
              />
              <span className="dot" style={{ background: FIELDS.cream }} />
              {PALETTES[name].label}
            </button>
          ))}
        </div>
        <div className="topbar-meta">
          <span>
            <b>{meta.scenes}</b> scenes
          </span>
          <span>
            <b>{meta.seconds}</b> s
          </span>
          <span>
            <b>{meta.frames}</b> frames
          </span>
          <span>
            {canvas.width}×{canvas.height} · {CANVAS.fps}fps
          </span>
        </div>
      </header>

      <div className="stage">
        <aside className="rail">
          <SceneList
            scenes={scenes}
            palette={palette}
            fields={fields}
            selectedId={selectedId}
            onSelect={(id) => selectScene(id)}
            onAdd={addScene}
            onDuplicate={duplicateScene}
            onDelete={deleteScene}
            onMove={moveScene}
          />
        </aside>

        <div className="canvas-pane">
          <div
            className="canvas-holder"
            style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}
          >
            <VideoPreview
              scenes={scenes}
              palette={palette}
              format={format}
              fields={fields}
              ink={ink}
              accent={accent}
              overlay={overlay}
              audio={audio}
              playerRef={playerRef}
              onFrame={setFrame}
              onPlayingChange={setPlaying}
            />
            <div
              className="stage-backdrop"
              onPointerDown={() => setCanvasTarget(null)}
            />
            <ImageStage
              scene={selected}
              canvas={canvas}
              active={!playing && selectedIsOnScreen}
              selected={canvasTarget === 'image'}
              onSelect={() => setCanvasTarget('image')}
              onChange={updateScene}
            />
            <OverlayStage
              overlay={overlay}
              scenes={scenes}
              canvas={canvas}
              frame={frame}
              active={!playing}
              selected={canvasTarget === 'overlay'}
              onSelect={() => setCanvasTarget('overlay')}
              onChange={setOverlay}
            />
            <TextStage
              scene={selected}
              palette={palette}
              canvas={canvas}
              selectedElementId={selectedElementId}
              active={!playing && selectedIsOnScreen}
              onSelect={setSelectedElementId}
              onChange={updateScene}
            />
            <ObjectStage
              objects={selected?.objects}
              selectedId={selectedObjectId}
              canvas={canvas}
              active={!playing && selectedIsOnScreen}
              onSelect={setSelectedObjectId}
              onChange={patchObject}
            />
          </div>
        </div>

        <aside className="side-pane">
          <div className="inspector-tabs" role="tablist" aria-label="Inspector">
            {(['scene', 'project'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={inspectorTab === tab}
                className={`inspector-tab${inspectorTab === tab ? ' is-on' : ''}`}
                onClick={() => setInspectorTab(tab)}
              >
                {tab === 'scene' ? 'Scene' : 'Project'}
              </button>
            ))}
          </div>

          <div className="inspector-body" ref={inspectorRef}>
            {inspectorTab === 'scene' ? (
              <>
                <SceneEditor
                  onAddScene={addScene}
                  scene={selected}
                  palette={palette}
                  fields={fields}
                  ink={ink}
                  accent={accent}
                  hasOverlay={overlay !== null}
                  onChange={updateScene}
                  canvas={canvas}
                />
                <ObjectList
                  objects={selected?.objects}
                  selectedId={selectedObjectId}
                  onSelect={setSelectedObjectId}
                  onAdd={addSceneObject}
                  onDuplicate={duplicateSceneObject}
                  onDelete={deleteObject}
                  onReorder={reorderSceneObject}
                />
                <ObjectInspector
                  object={
                    selectedObjectId
                      ? findObject(selected?.objects, selectedObjectId)
                      : null
                  }
                  ink={themeFor(selected?.background ?? 'green', palette, fields).ink}
                  onChange={patchObject}
                  targets={flattenObjects(selected?.objects).map(({ object }) => ({
                    id: object.id,
                    label: objectTitle(object),
                  }))}
                />
              </>
            ) : (
              <>
                <AudioControls
                  audio={audio}
                  videoSeconds={seconds}
                  onChange={setAudio}
                  onSeekSeconds={(s) => seek(Math.round(s * CANVAS.fps))}
                />

                <OverlayControls
                  overlay={overlay}
                  scenes={scenes}
                  onChange={setOverlay}
                />

                <PhraseBuildPanel
                  onBuild={(built, replace) => {
                    setScenes((current) => (replace ? built : [...current, ...built]));
                    setSelectedId(built[0]?.id ?? null);
                    seek(0);
                    setInspectorTab('scene');
                  }}
                />

                <PaletteControls
                  palette={palette}
                  fields={fields}
                  ink={ink}
                  accent={accent}
                  onFields={setFields}
                  onInk={setInk}
                  onAccent={setAccent}
                />

                <Group title="Project file" defaultOpen={false}>
                    <div className="field">
                      <label htmlFor="preset-select">Start from a reference reel</label>
                      <select
                        id="preset-select"
                        className="text-input"
                        defaultValue="reference"
                        onChange={(event) => loadPreset(event.target.value)}
                      >
                        {PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label} — {preset.note}
                          </option>
                        ))}
                      </select>
                      <p className="hint">
                        Replaces every scene in this reel. Extract the JSON first
                        if you want to keep what is here.
                      </p>
                    </div>

                    <div className="field">
                      <label>This reel</label>
                      <div className="chips">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setImportOpen(true)}
                        >
                          Import JSON
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setExtractOpen(true)}
                        >
                          Extract JSON
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={resetProject}
                        >
                          Reset
                        </button>
                      </div>
                      <p className="hint">
                        Extract and Import are inverses — whatever comes out of
                        one goes back into the other unchanged.
                      </p>
                    </div>
                </Group>
              </>
            )}
          </div>
        </aside>
      </div>

      <footer className="footer">
        <Timeline
          scenes={scenes}
          palette={palette}
          fields={fields}
          frame={frame}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={seek}
          audio={audio}
          onOpenAudio={() => setInspectorTab('project')}
        />
        <div className="footer-row">
          <Transport
            scenes={scenes}
            frame={frame}
            playing={playing}
            onSeek={seek}
            onTogglePlay={togglePlay}
          />

          <ExportBar
            scenes={scenes}
            palette={palette}
            format={format}
            fields={fields}
            ink={ink}
            accent={accent}
            overlay={overlay}
            audio={audio}
            saved={saved}
          />
        </div>
      </footer>

      <ExtractPanel
        open={extractOpen}
        scenes={scenes}
        title={title}
        format={format}
        fields={fields}
        ink={ink}
        accent={accent}
        overlay={overlay}
        audio={audio}
        onClose={() => setExtractOpen(false)}
      />

      <ImportPanel
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onApply={applyImport}
      />
    </div>
  );
};
