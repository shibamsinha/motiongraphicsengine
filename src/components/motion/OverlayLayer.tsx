import React from 'react';
import { Img, useCurrentFrame } from 'remotion';
import type { OverlayImage, Scene, VideoConfig } from '../../types/scene';
import { CANVAS, buildTimeline, sceneAtFrame } from '../../utils/timing';
import { resolveImageSrc } from './SceneImageLayer';

const finite = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const OVERLAY_MIN = 0.03;

export const DEFAULT_OVERLAY: Omit<OverlayImage, 'src'> = {
  x: 0.08,
  y: 0.05,
  width: 0.26,
  height: 0.09,
  fit: 'contain',
  opacity: 1,
};

export const overlayRect = (overlay: OverlayImage, canvas: VideoConfig = CANVAS) => ({
  x: finite(overlay.x, DEFAULT_OVERLAY.x) * canvas.width,
  y: finite(overlay.y, DEFAULT_OVERLAY.y) * canvas.height,
  width: Math.max(OVERLAY_MIN, finite(overlay.width, DEFAULT_OVERLAY.width)) * canvas.width,
  height:
    Math.max(OVERLAY_MIN, finite(overlay.height, DEFAULT_OVERLAY.height)) * canvas.height,
});

export const OverlayLayer: React.FC<{
  overlay: OverlayImage;
  scenes: Scene[];
  fps?: number;
  canvas?: VideoConfig;
}> = ({ overlay, scenes, fps = CANVAS.fps, canvas = CANVAS }) => {
  const frame = useCurrentFrame();
  if (!overlay.src) return null;

  const current = sceneAtFrame(buildTimeline(scenes, fps), frame);
  if (current?.scene.hideOverlay) return null;

  const rect = overlayRect(overlay, canvas);
  const opacity = clamp01(finite(overlay.opacity, 1));
  if (opacity <= 0.001) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        opacity,
        pointerEvents: 'none',
      }}
    >
      <Img
        src={resolveImageSrc(overlay.src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: overlay.fit ?? 'contain',
        }}
      />
    </div>
  );
};
