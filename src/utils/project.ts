import type { Project } from '../types/project';
import type { Scene } from '../types/scene';
import { blankScene } from '../data/defaultScenes';
import { DEFAULT_FORMAT } from './timing';
import { DEFAULT_PALETTE } from './typography';
import type { ImportedProject } from './importScript';
import type { PersistedProject } from './persistence';
import type { Preset } from '../data/presets';

const base = (scenes: Scene[]): Project => ({
  scenes,
  palette: DEFAULT_PALETTE,
  format: DEFAULT_FORMAT,
  fields: {},
  ink: {},
  accent: null,
  overlay: null,
  audio: null,
  title: null,
  selectedId: scenes[0]?.id ?? null,
});

export const createBlankProject = (): Project => base([blankScene()]);

export const createProjectFromJSON = (imported: ImportedProject): Project => ({
  scenes: imported.scenes,
  palette: imported.palette,
  format: imported.format,
  fields: imported.fields,
  ink: imported.ink,
  accent: imported.accent,
  overlay: imported.overlay,
  audio: imported.audio,
  title: imported.title,
  selectedId: imported.scenes[0]?.id ?? null,
});

export const createProjectFromTemplate = (preset: Preset): Project => ({
  ...base(preset.build()),
  title: preset.label,
});

export const createProjectFromPersisted = (saved: PersistedProject): Project => ({
  scenes: saved.scenes,
  palette: saved.palette,
  format: saved.format,
  fields: saved.fields,
  ink: saved.ink,
  accent: saved.accent,
  overlay: saved.overlay,
  audio: saved.audio,
  title: saved.title,
  selectedId: saved.selectedId,
});
