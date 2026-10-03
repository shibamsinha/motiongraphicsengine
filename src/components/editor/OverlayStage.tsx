import React, { useCallback } from 'react';
import type { OverlayImage, Scene, VideoConfig } from '../../types/scene';
import { CANVAS, buildTimeline, sceneAtFrame } from '../../utils/timing';
import { OVERLAY_MIN, overlayRect } from '../motion/OverlayLayer';
import { BoxStage, type Box } from './BoxStage';

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export const OverlayStage: React.FC<{
  overlay: OverlayImage | null;
  scenes: Scene[];
  frame: number;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (next: OverlayImage) => void;
  canvas?: VideoConfig;
}> = ({ overlay, scenes, frame, active, selected, onSelect, onChange, canvas = CANVAS }) => {
  const commit = useCallback(
    (box: Box) => {
      if (!overlay) return;
      onChange({
        ...overlay,
        x: round4(box.x / canvas.width),
        y: round4(box.y / canvas.height),
        width: round4(box.width / canvas.width),
        height: round4(box.height / canvas.height),
      });
    },
    [overlay, onChange, canvas],
  );

  if (!overlay || !active) return null;
  if (sceneAtFrame(buildTimeline(scenes, CANVAS.fps), frame)?.scene.hideOverlay) {
    return null;
  }

  return (
    <BoxStage
      rect={overlayRect(overlay, canvas)}
      min={{ width: OVERLAY_MIN * canvas.width, height: OVERLAY_MIN * canvas.height }}
      onChange={commit}
      selected={selected}
      onSelect={onSelect}
      variant="overlay"
      canvas={canvas}
      readout={(box) =>
        `${Math.round((box.width / canvas.width) * 100)}% × ${Math.round(
          (box.height / canvas.height) * 100,
        )}%`
      }
    />
  );
};
