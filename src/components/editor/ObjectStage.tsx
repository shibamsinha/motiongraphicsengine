import React from 'react';
import type { SceneObject } from '../../types/object';
import type { VideoConfig } from '../../types/scene';
import { BoxStage } from './BoxStage';

export const ObjectStage: React.FC<{
  objects: SceneObject[] | undefined;
  selectedId: string | null;
  canvas: VideoConfig;
  active: boolean;
  onSelect: (id: string) => void;
  onChange: (patch: Partial<SceneObject>) => void;
}> = ({ objects, selectedId, canvas, active, onSelect, onChange }) => {
  if (!active || !selectedId) return null;

  const object = (objects ?? []).find((o) => o.id === selectedId);
  if (!object) return null;

  if (object.type === 'cursor') return null;

  return (
    <BoxStage
      canvas={canvas}
      rect={{
        x: object.x * canvas.width,
        y: object.y * canvas.height,
        width: object.width * canvas.width,
        height: object.height * canvas.height,
      }}
      min={{ width: canvas.width * 0.02, height: canvas.height * 0.01 }}
      selected
      onSelect={() => onSelect(object.id)}
      onChange={(box) =>
        onChange({
          x: box.x / canvas.width,
          y: box.y / canvas.height,
          width: box.width / canvas.width,
          height: box.height / canvas.height,
        })
      }
      readout={(box) =>
        `${Math.round((box.width / canvas.width) * 100)}% × ${Math.round(
          (box.height / canvas.height) * 100,
        )}%`
      }
    />
  );
};
