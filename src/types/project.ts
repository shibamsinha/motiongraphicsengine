import type { CanvasFormat, OverlayImage, PaletteName, Scene } from './scene';
import type { FieldOverrides } from '../utils/typography';
import type { ProjectAudio } from './audio';

export type Project = {
  scenes: Scene[];
  palette: PaletteName;
  format: CanvasFormat;
  fields: FieldOverrides;
  ink: FieldOverrides;
  accent: string | null;
  overlay: OverlayImage | null;
  audio: ProjectAudio | null;
  title: string | null;
  selectedId: string | null;
};

export type ProjectOrigin = 'scratch' | 'import' | 'template' | 'resumed';
