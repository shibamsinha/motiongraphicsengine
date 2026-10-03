import type { Scene } from '../types/scene';
import type { SceneObject } from '../types/object';
import { blankScene, element } from './defaultScenes';
import { serialiseProject } from '../utils/importScript';

const ACCENT = '#4ADE6A';
const INK = '#F2F4F2';

const sampleScenes = (): Scene[] => {
  const uiObjects: SceneObject[] = [
    {
      id: 'card-1',
      type: 'card',
      x: 0.12, y: 0.32, width: 0.76, height: 0.26,
      surface: {
        fill: '#16181B', radius: 0.09, shadow: 'strong',
        stroke: 'rgba(255,255,255,0.07)', strokeWidth: 1,
      },
      title: { text: 'Upload your file', size: 0.04, weight: 600, color: INK },
      body: { text: 'PDF, PNG or JPG', size: 0.022, color: '#8A928A' },
      motion: { enter: 'float-in', speed: 'medium', distance: 'medium' },
    },
    {
      id: 'button-1',
      type: 'button',
      x: 0.30, y: 0.63, width: 0.40, height: 0.085,
      label: { text: 'Upload', size: 0.03, weight: 600, color: '#0C0D0C' },
      icon: 'upload',
      surface: { fill: INK, radius: 0.5, shadow: 'soft' },
      stateStyles: {
        success: {
          fill: ACCENT, radius: 0.5, glow: 'medium',
          glowColor: 'rgba(74,222,106,0.45)',
          label: { text: 'Uploaded', size: 0.03, weight: 600, color: '#0C0D0C' },
        },
      },
      motion: { enter: 'pop-in', speed: 'fast', delay: 0.4 },
    },
    {
      id: 'pointer-1',
      type: 'cursor',
      x: 0.85, y: 0.9, width: 0.06, height: 0.06,
      stops: [
        { x: 0.85, y: 0.92, at: 0 },
        { x: 0.50, y: 0.67, at: 1.6, travel: 0.8, path: 'arc' },
        { x: 0.50, y: 0.67, at: 1.9, action: 'click',
          targetId: 'button-1', targetState: 'success' },
      ],
    },
    {
      id: 'tick-1',
      type: 'icon',
      icon: 'check',
      x: 0.455, y: 0.76, width: 0.09, height: 0.09,
      color: ACCENT,
      motion: { enter: 'draw-in', speed: 'fast' },
      start: 2.1,
    },
  ];

  return [
    blankScene({
      duration: 1.2,
      text: 'the simplest scene',
      style: 'punch',
      background: 'green',
    }),
    blankScene({
      duration: 2,
      text: "YOU DON'T NEED\nMORE\nfollowers.",
      case: 'as-typed',
      background: 'cream',
      style: 'massive',
      composition: 'split',
      visualStyle: 'solid',
      elements: [
        element("YOU DON'T NEED", { role: 'secondary', position: 'top-left', animation: 'slide' }),
        element('MORE', { role: 'emphasis', size: 'oversized', position: 'center',
                          animation: 'massive', visualStyle: 'gradient' }),
        element('followers.', { role: 'support', position: 'bottom-right',
                                animation: 'punch', delay: 0.14 }),
      ],
    }),
    blankScene({
      duration: 3,
      text: 'ONE TAP',
      case: 'as-typed',
      background: 'black',
      style: 'punch',
      composition: 'top-statement',
      elements: [element('ONE TAP', { role: 'secondary', animation: 'punch' })],
      objects: uiObjects,
    }),
    blankScene({
      duration: 1.8,
      text: 'DONE.',
      case: 'as-typed',
      background: 'green',
      style: 'massive',
      composition: 'oversized-center',
      elements: [element('DONE.', { role: 'emphasis', size: 'oversized', animation: 'massive' })],
    }),
  ];
};

export const sampleProjectJson = (): string =>
  serialiseProject(sampleScenes(), 'Sample project', {}, null, 'portrait', {
    src: 'uploads/your-track.mp3',
    name: 'your-track.mp3',
    sourceDuration: 180,
    sourceStart: 88.2,
    sourceEnd: 107.6,
    timelineStart: 0,
    volume: 0.9,
    fadeIn: 0.5,
    fadeOut: 1,
  });
