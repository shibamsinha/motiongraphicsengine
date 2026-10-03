import React, { useCallback } from 'react';
import type { Scene, VideoConfig } from '../../types/scene';
import { CANVAS } from '../../utils/timing';
import { FREE_MIN, composeImage, freeBoxFrom } from '../../utils/imageLayout';
import { BoxStage, type Box } from './BoxStage';

export const ImageStage: React.FC<{
  scene: Scene | null;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Scene>) => void;
  canvas?: VideoConfig;
}> = ({ scene, active, selected, onSelect, onChange, canvas = CANVAS }) => {
  const image = scene?.image;

  const commit = useCallback(
    (box: Box) => {
      if (!scene?.image) return;
      onChange({
        image: {
          ...scene.image,
          placement: 'free',
          x: box.x / canvas.width,
          y: box.y / canvas.height,
          width: box.width / canvas.width,
          height: box.height / canvas.height,
        },
      });
    },
    [scene, onChange, canvas],
  );

  const grab = useCallback(() => {
    if (!scene?.image || scene.image.placement === 'free') return;
    const seeded = freeBoxFrom(composeImage(scene.image, canvas), canvas);
    onChange({ image: { ...scene.image, placement: 'free', ...seeded } });
  }, [scene, onChange, canvas]);

  if (!scene || !image || !active) return null;

  return (
    <BoxStage
      rect={composeImage(image, canvas).rect}
      min={{ width: FREE_MIN * canvas.width, height: FREE_MIN * canvas.height }}
      onChange={commit}
      onGrab={grab}
      selected={selected}
      onSelect={onSelect}
      variant="image"
      canvas={canvas}
    />
  );
};
