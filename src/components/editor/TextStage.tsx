import React, { useCallback, useMemo } from 'react';
import type { PaletteName, Scene, SceneElement, VideoConfig } from '../../types/scene';
import { planScene } from '../../utils/plan';
import { totalFrames } from '../../utils/timing';
import { useFontsReady } from '../../utils/fonts';
import { BoxStage } from './BoxStage';

export const TextStage: React.FC<{
  scene: Scene | null;
  palette: PaletteName;
  canvas: VideoConfig;
  selectedElementId: string | null;
  active: boolean;
  onSelect: (id: string) => void;
  onChange: (patch: Partial<Scene>) => void;
}> = ({ scene, palette, canvas, selectedElementId, active, onSelect, onChange }) => {
  const fontsReady = useFontsReady();

  const plan = useMemo(() => {
    if (!scene || !fontsReady) return null;
    const frames = Math.max(1, totalFrames([scene], canvas.fps));
    try {
      return planScene(scene, frames, canvas.fps, palette, canvas);
    } catch {
      return null;
    }
  }, [scene, palette, canvas, fontsReady]);

  const setElement = useCallback(
    (id: string, patch: Partial<SceneElement>) => {
      if (!scene?.elements) return;
      onChange({
        elements: scene.elements.map((element) =>
          element.id === id ? { ...element, ...patch } : element,
        ),
      });
    },
    [scene, onChange],
  );

  if (!active || !scene || !plan) return null;

  if (!scene.elements || scene.elements.length === 0) return null;

  return (
    <>
      {plan.elements.map((planned) => {
        const { block } = planned;
        const rect = {
          x: block.left,
          y: block.top,
          width: Math.max(1, block.width),
          height: Math.max(1, block.inkHeight),
        };
        return (
          <BoxStage
            key={planned.id}
            canvas={canvas}
            rect={rect}
            min={{ width: rect.width, height: rect.height }}
            selected={planned.id === selectedElementId}
            onSelect={() => onSelect(planned.id)}
            onChange={(box) => {
              setElement(planned.id, {
                x: (box.x + block.width / 2) / canvas.width,
                y: (box.y + block.inkCentre) / canvas.height,
              });
            }}
            readout={(box) =>
              `${Math.round(((box.x + block.width / 2) / canvas.width) * 100)}% · ` +
              `${Math.round(((box.y + block.inkCentre) / canvas.height) * 100)}%`
            }
          />
        );
      })}
    </>
  );
};
