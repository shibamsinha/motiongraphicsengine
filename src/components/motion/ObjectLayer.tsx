import React from 'react';
import type {
  ButtonObject,
  CardObject,
  CursorObject,
  IconObject,
  ImageObject,
  LogoObject,
  ObjectLabel,
  ObjectState,
  ObjectSurface,
  ShapeObject,
} from '../../types/object';
import type { VideoConfig } from '../../types/scene';
import type { Theme } from '../../utils/typography';
import { FONT_STACK } from '../../utils/typography';
import type { ObjectPlan, PlannedObject } from '../../utils/planObjects';
import { stateAtFrame } from '../../utils/planObjects';
import { resolveMotion, type MotionState } from '../../utils/objectMotion';
import { EASE, clamp01 } from '../../utils/easing';
import { Icon } from './objects/icons';
import { resolveImageSrc } from './SceneImageLayer';

const SHADOWS: Record<NonNullable<ObjectSurface['shadow']>, string> = {
  none: 'none',
  soft: '0 1px 2px rgba(0,0,0,0.16), 0 6px 18px rgba(0,0,0,0.18)',
  medium: '0 2px 4px rgba(0,0,0,0.20), 0 14px 40px rgba(0,0,0,0.28)',
  strong: '0 4px 8px rgba(0,0,0,0.26), 0 28px 70px rgba(0,0,0,0.40)',
};

const GLOW_SPREAD: Record<NonNullable<ObjectSurface['glow']>, number> = {
  none: 0,
  low: 18,
  medium: 38,
  high: 68,
};

const surfaceCss = (
  surface: ObjectSurface | undefined,
  shorterSidePx: number,
  glowScale = 1,
): React.CSSProperties => {
  if (!surface) return {};
  const shadow = SHADOWS[surface.shadow ?? 'none'];
  const spread = GLOW_SPREAD[surface.glow ?? 'none'] * glowScale;
  const glow =
    spread > 0
      ? `0 0 ${spread}px ${spread / 3}px ${surface.glowColor ?? 'rgba(120,190,255,0.55)'}`
      : null;

  return {
    background: surface.fill,
    border: surface.stroke
      ? `${surface.strokeWidth ?? 2}px solid ${surface.stroke}`
      : undefined,
    borderRadius: surface.radius ? `${surface.radius * shorterSidePx}px` : undefined,
    boxShadow: [shadow === 'none' ? null : shadow, glow].filter(Boolean).join(', ') || undefined,
    filter: surface.blur ? `blur(${surface.blur}px)` : undefined,
  };
};

const labelCss = (
  label: ObjectLabel,
  canvas: VideoConfig,
  fallbackColor: string,
): React.CSSProperties => ({
  color: label.color ?? fallbackColor,
  fontFamily: FONT_STACK,
  fontSize: (label.size ?? 0.028) * canvas.width,
  fontWeight: label.weight ?? 600,
  textAlign: label.align ?? 'center',
  letterSpacing: label.tracking ? `${label.tracking}em` : undefined,
  lineHeight: 1.25,
  whiteSpace: 'pre-wrap',
});

const blendSurface = (
  base: ObjectSurface | undefined,
  next: ObjectSurface | undefined,
): ObjectSurface | undefined => (next ? { ...base, ...next } : base);

const Shape: React.FC<{ object: ShapeObject; box: Box; theme: Theme }> = ({
  object,
  box,
  theme,
}) => {
  const shorter = Math.min(box.wPx, box.hPx);
  const surface = object.surface ?? {};
  const fill = surface.fill ?? theme.ink;

  if (object.shape === 'line') {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: surface.stroke ?? fill,
          borderRadius: (surface.strokeWidth ?? 2) / 2,
          boxShadow: surfaceCss(surface, shorter).boxShadow,
        }}
      />
    );
  }

  const radius =
    object.shape === 'circle'
      ? '50%'
      : object.shape === 'rounded'
        ? `${(surface.radius ?? 0.14) * shorter}px`
        : undefined;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        ...surfaceCss(surface, shorter),
        background: fill,
        borderRadius: radius,
      }}
    />
  );
};

const Picture: React.FC<{ object: ImageObject | LogoObject; box: Box }> = ({
  object,
  box,
}) => (
  <img
    src={resolveImageSrc(object.src)}
    alt=""
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: object.fit ?? 'contain',
      ...surfaceCss(object.surface, Math.min(box.wPx, box.hPx)),
    }}
  />
);

const Card: React.FC<{
  object: CardObject;
  box: Box;
  canvas: VideoConfig;
  theme: Theme;
  surface: ObjectSurface | undefined;
}> = ({ object, box, canvas, theme, surface }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 0.012 * canvas.width,
      padding: 0.03 * canvas.width,
      ...surfaceCss(surface ?? { fill: '#141614', radius: 0.08, shadow: 'medium' },
                    Math.min(box.wPx, box.hPx)),
    }}
  >
    {object.title ? (
      <div style={labelCss(object.title, canvas, theme.ink)}>{object.title.text}</div>
    ) : null}
    {object.body ? (
      <div style={{ ...labelCss(object.body, canvas, theme.ink), opacity: 0.72 }}>
        {object.body.text}
      </div>
    ) : null}
  </div>
);

const Button: React.FC<{
  object: ButtonObject;
  box: Box;
  canvas: VideoConfig;
  theme: Theme;
  state: { from: ObjectState; to: ObjectState; progress: number };
}> = ({ object, box, canvas, theme, state }) => {
  const shorter = Math.min(box.wPx, box.hPx);
  const styleFor = (s: ObjectState) =>
    blendSurface(object.surface, object.stateStyles?.[s]) ?? object.surface;

  const from = styleFor(state.from);
  const to = styleFor(state.to);
  const t = EASE.settle(clamp01(state.progress));

  const labelOf = (s: ObjectState) =>
    object.stateStyles?.[s]?.label ?? object.label;
  const shownLabel = t > 0.5 ? labelOf(state.to) : labelOf(state.from);

  const pressed = state.to === 'pressed' ? 1 - 0.03 * t : 1;

  const layer = (surface: ObjectSurface | undefined, opacity: number) => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        ...surfaceCss(surface ?? { fill: theme.ink, radius: 0.5 }, shorter),
      }}
    />
  );

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${pressed})` }}>
      {layer(from, 1 - t)}
      {layer(to, t)}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.012 * canvas.width,
          padding: `0 ${0.022 * canvas.width}px`,
        }}
      >
        {object.icon ? (
          <span style={{ width: 0.032 * canvas.width, height: 0.032 * canvas.width, flex: 'none' }}>
            <Icon name={object.icon} color={shownLabel?.color ?? theme.background} />
          </span>
        ) : null}
        {shownLabel ? (
          <span style={labelCss(shownLabel, canvas, theme.background)}>
            {shownLabel.text}
          </span>
        ) : null}
      </div>
    </div>
  );
};

const cursorAt = (
  object: CursorObject,
  frame: number,
  fps: number,
): { x: number; y: number; pressing: boolean } => {
  const stops = [...(object.stops ?? [])].sort((a, b) => a.at - b.at);
  if (stops.length === 0) return { x: object.x, y: object.y, pressing: false };

  const seconds = frame / fps;
  let previous = stops[0];
  let next = stops[0];
  for (const stop of stops) {
    if (stop.at <= seconds) previous = stop;
    else { next = stop; break; }
    next = stop;
  }

  if (previous === next) {
    const pressing =
      (previous.action === 'click' || previous.action === 'press') &&
      seconds - previous.at < 0.16;
    return { x: previous.x, y: previous.y, pressing };
  }

  const travel = next.travel ?? 0.6;
  const startedAt = next.at - travel;
  const raw = clamp01((seconds - startedAt) / Math.max(travel, 1 / fps));
  const t = EASE.inOut(raw);

  let x = previous.x + (next.x - previous.x) * t;
  let y = previous.y + (next.y - previous.y) * t;

  if (next.path === 'arc' || next.path === 'curve') {
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const lift = (next.path === 'arc' ? 0.22 : 0.1) * Math.hypot(dx, dy);
    const bow = Math.sin(t * Math.PI) * lift;
    const len = Math.hypot(dx, dy) || 1;
    x += (-dy / len) * bow;
    y += (dx / len) * bow;
  }

  return { x, y, pressing: false };
};

const Cursor: React.FC<{
  object: CursorObject;
  frame: number;
  fps: number;
  canvas: VideoConfig;
}> = ({ object, frame, fps, canvas }) => {
  const { x, y, pressing } = cursorAt(object, frame, fps);
  const size = 0.055 * canvas.width;
  const color = object.color ?? '#FFFFFF';

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: size,
        height: size,
        transform: `translate(-14%, -10%) scale(${pressing ? 0.86 : 1})`,
        transformOrigin: 'top left',
        pointerEvents: 'none',
      }}
    >
      {pressing ? (
        <div
          style={{
            position: 'absolute',
            left: 0, top: 0,
            width: size * 1.5, height: size * 1.5,
            marginLeft: -size * 0.6, marginTop: -size * 0.6,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.22)',
          }}
        />
      ) : null}
      <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ display: 'block' }}>
        <path
          d="M5 2 L5 19 L9.2 15.1 L11.8 21.2 L14.6 20 L12 14 L18 13.6 Z"
          fill={color}
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={0.9}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

type Box = { wPx: number; hPx: number };

const revealClip = (amount: number, direction: string | undefined): string | undefined => {
  if (amount >= 1) return undefined;
  const hidden = `${(1 - amount) * 100}%`;
  switch (direction) {
    case 'right': return `inset(0 0 0 ${hidden})`;
    case 'top': return `inset(0 0 ${hidden} 0)`;
    case 'bottom': return `inset(${hidden} 0 0 0)`;
    default: return `inset(0 ${hidden} 0 0)`;
  }
};

const RenderedObject: React.FC<{
  planned: PlannedObject;
  frame: number;
  fps: number;
  canvas: VideoConfig;
  theme: Theme;
  parent: Box;
}> = ({ planned, frame, fps, canvas, theme, parent }) => {
  const { object, window } = planned;
  const motion: MotionState = resolveMotion(planned.motion, frame, fps, window);

  if (motion.opacity <= 0.001 && motion.reveal <= 0.001) return null;

  const box: Box = {
    wPx: parent.wPx * object.width,
    hPx: parent.hPx * object.height,
  };

  const state = stateAtFrame(planned.states, frame, fps);

  const dx = motion.x * canvas.width;
  const dy = motion.y * canvas.width;

  const transform = [
    `translate(${dx}px, ${dy}px)`,
    motion.scale !== 1 ? `scale(${motion.scale})` : '',
    object.rotation || motion.rotate
      ? `rotate(${(object.rotation ?? 0) + motion.rotate}deg)`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (() => {
    switch (object.type) {
      case 'shape':
        return <Shape object={object} box={box} theme={theme} />;
      case 'image':
      case 'logo':
        return <Picture object={object} box={box} />;
      case 'icon':
        return (
          <Icon
            name={(object as IconObject).icon}
            color={(object as IconObject).color ?? theme.ink}
            weight={(object as IconObject).weight}
            draw={planned.motion?.enter === 'draw-in' ? motion.reveal : 1}
          />
        );
      case 'card':
        return (
          <Card
            object={object}
            box={box}
            canvas={canvas}
            theme={theme}
            surface={blendSurface(object.surface, undefined)}
          />
        );
      case 'button':
        return (
          <Button object={object} box={box} canvas={canvas} theme={theme} state={state} />
        );
      case 'cursor':
        return null;
      case 'group':
        return null;
    }
  })();

  const drawing = planned.motion?.enter === 'draw-in' && object.type === 'icon';

  return (
    <div
      style={{
        position: 'absolute',
        left: `${object.x * 100}%`,
        top: `${object.y * 100}%`,
        width: `${object.width * 100}%`,
        height: `${object.height * 100}%`,
        opacity: motion.opacity * (object.opacity ?? 1),
        transform,
        transformOrigin: 'center',
        filter: motion.blur > 0 ? `blur(${motion.blur}px)` : undefined,
        clipPath: drawing ? undefined : revealClip(motion.reveal, planned.motion?.from),
      }}
    >
      {content}
      {planned.children.map((child) => (
        <RenderedObject
          key={child.object.id}
          planned={child}
          frame={frame}
          fps={fps}
          canvas={canvas}
          theme={theme}
          parent={box}
        />
      ))}
    </div>
  );
};

export const ObjectLayer: React.FC<{
  plan: ObjectPlan;
  frame: number;
  fps: number;
  canvas: VideoConfig;
  theme: Theme;
}> = ({ plan, frame, fps, canvas, theme }) => {
  if (plan.objects.length === 0) return null;
  const parent: Box = { wPx: canvas.width, hPx: canvas.height };

  return (
    <>
      {plan.objects.map((planned) =>
        planned.object.type === 'cursor' ? null : (
          <RenderedObject
            key={planned.object.id}
            planned={planned}
            frame={frame}
            fps={fps}
            canvas={canvas}
            theme={theme}
            parent={parent}
          />
        ),
      )}
      {plan.objects
        .filter((p) => p.object.type === 'cursor')
        .map((p) => (
          <Cursor
            key={p.object.id}
            object={p.object as CursorObject}
            frame={frame}
            fps={fps}
            canvas={canvas}
          />
        ))}
    </>
  );
};
