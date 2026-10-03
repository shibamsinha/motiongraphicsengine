import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoConfig } from '../../types/scene';
import { CANVAS } from '../../utils/timing';

export type Box = { x: number; y: number; width: number; height: number };

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

type Drag = {
  handle: Handle | 'move';
  startPointer: { x: number; y: number };
  startBox: Box;
  aspect: number;
};

export const BoxStage: React.FC<{
  rect: Box;
  min: { width: number; height: number };
  onChange: (box: Box) => void;
  selected: boolean;
  onSelect: () => void;
  onGrab?: () => void;
  variant?: 'image' | 'overlay';
  readout?: (box: Box) => string;
  canvas?: VideoConfig;
}> = ({
  rect,
  min,
  onChange,
  selected,
  onSelect,
  onGrab,
  variant = 'image',
  readout,
  canvas = CANVAS,
}) => {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  const dragRef = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!host) return;
    const measure = () => setScale(host.getBoundingClientRect().width / canvas.width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [host, canvas.width]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent, handle: Handle | 'move') => {
      event.preventDefault();
      event.stopPropagation();
      try {
        (event.target as Element).setPointerCapture?.(event.pointerId);
      } catch {}

      onSelect();

      dragRef.current = {
        handle,
        startPointer: { x: event.clientX, y: event.clientY },
        startBox: { ...rect },
        aspect: rect.height === 0 ? 1 : rect.width / rect.height,
      };
      setDragging(true);
      onGrab?.();
    },
    [rect, onGrab, onSelect],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || scale === 0) return;
      event.preventDefault();

      const dx = (event.clientX - drag.startPointer.x) / scale;
      const dy = (event.clientY - drag.startPointer.y) / scale;
      const { startBox, handle } = drag;

      if (handle === 'move') {
        onChange({ ...startBox, x: startBox.x + dx, y: startBox.y + dy });
        return;
      }

      let { x, y, width, height } = startBox;
      if (handle.includes('w')) {
        width = Math.max(min.width, startBox.width - dx);
        x = startBox.x + startBox.width - width;
      }
      if (handle.includes('e')) width = Math.max(min.width, startBox.width + dx);
      if (handle.includes('n')) {
        height = Math.max(min.height, startBox.height - dy);
        y = startBox.y + startBox.height - height;
      }
      if (handle.includes('s')) height = Math.max(min.height, startBox.height + dy);

      const isCorner = handle.length === 2;
      if (isCorner && !event.shiftKey) {
        const byWidth = width / drag.aspect;
        const byHeight = height * drag.aspect;
        if (Math.abs(byWidth - height) < Math.abs(byHeight - width)) {
          height = Math.max(min.height, byWidth);
        } else {
          width = Math.max(min.width, byHeight);
        }
        if (handle.includes('w')) x = startBox.x + startBox.width - width;
        if (handle.includes('n')) y = startBox.y + startBox.height - height;
      }

      onChange({ x, y, width, height });
    },
    [onChange, min.width, min.height, scale],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const px = (value: number) => `${value * scale}px`;

  return (
    <div ref={setHost} className="image-stage">
      {scale > 0 ? (
        <div
          className={
            `stage-box stage-${variant}` +
            (selected ? '' : ' is-idle') +
            (dragging ? ' is-dragging' : '')
          }
          style={{
            left: px(rect.x),
            top: px(rect.y),
            width: px(rect.width),
            height: px(rect.height),
          }}
          onPointerDown={(event) => onPointerDown(event, 'move')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {selected
            ? HANDLES.map((handle) => (
                <span
                  key={handle}
                  className={`stage-handle h-${handle}`}
                  style={{ cursor: CURSORS[handle] }}
                  onPointerDown={(event) => onPointerDown(event, handle)}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              ))
            : null}
          {selected ? (
            <span className="stage-readout">
              {readout
                ? readout(rect)
                : `${Math.round(rect.width)} × ${Math.round(rect.height)}`}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
