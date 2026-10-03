import React from 'react';
import type {
  ButtonObject,
  CardObject,
  CursorObject,
  GroupObject,
  IconName,
  IconObject,
  ImageObject,
  LogoObject,
  ObjectLabel,
  ObjectSurface,
  SceneObject,
  ShapeKind,
  ShapeObject,
} from '../../types/object';
import {
  ENTER, EMPHASIS, EXIT,
  type EnterMotion, type EmphasisMotion, type ExitMotion,
  type MotionDirection, type MotionSpeed, type MotionDistance,
} from '../../utils/objectMotion';
import { ICON_PATHS } from '../motion/objects/icons';
import { OBJECT_KIND_LABELS } from '../../data/objects';
import { CANVAS } from '../../utils/timing';
import { Group } from './Group';
import { Disclosure } from './Disclosure';

type Patch = (patch: Partial<SceneObject>) => void;

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="field">
    <label>{label}</label>
    {children}
  </div>
);

function Pick<T extends string>({
  value, options, onChange, allowNone,
}: {
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (next: T | undefined) => void;
  allowNone?: string;
}) {
  return (
    <select
      className="text-input"
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
    >
      {allowNone ? <option value="">{allowNone}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const Num: React.FC<{
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}> = ({ value, onChange, step = 0.01, min, max, placeholder }) => (
  <input
    className="text-input"
    type="number"
    step={step}
    min={min}
    max={max}
    placeholder={placeholder}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
  />
);

const Colour: React.FC<{ value: string | undefined; fallback: string; onChange: (v: string) => void }> = ({
  value, fallback, onChange,
}) => (
  <span className="colour-row">
    <input
      type="color"
      value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback}
      onChange={(e) => onChange(e.target.value)}
    />
    <input
      className="text-input"
      value={value ?? ''}
      placeholder={fallback}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  </span>
);

const opts = <T extends string>(values: readonly T[]): { value: T; label: string }[] =>
  values.map((v) => ({ value: v, label: v.replace(/-/g, ' ') }));

const inFrames = (seconds: number | undefined, name: string): string =>
  seconds === undefined || seconds <= 0
    ? ''
    : ` · ${name} ${Math.round(seconds * CANVAS.fps)}f`;

const LabelFields: React.FC<{
  title: string;
  label: ObjectLabel | undefined;
  onChange: (next: ObjectLabel | undefined) => void;
  fallbackColor: string;
}> = ({ title, label, onChange, fallbackColor }) => (
  <>
    <Row label={title}>
      <input
        className="text-input"
        value={label?.text ?? ''}
        placeholder="(none)"
        onChange={(e) =>
          onChange(e.target.value ? { ...label, text: e.target.value } : undefined)
        }
      />
    </Row>
    {label ? (
      <div className="field-row">
        <Row label="Size">
          <Num value={label.size} step={0.002} onChange={(size) => onChange({ ...label, size })} placeholder="0.028" />
        </Row>
        <Row label="Colour">
          <Colour value={label.color} fallback={fallbackColor} onChange={(color) => onChange({ ...label, color })} />
        </Row>
      </div>
    ) : null}
  </>
);

const SurfaceFields: React.FC<{
  surface: ObjectSurface | undefined;
  onChange: (next: ObjectSurface) => void;
  fillFallback: string;
}> = ({ surface, onChange, fillFallback }) => {
  const set = (patch: Partial<ObjectSurface>) => onChange({ ...surface, ...patch });
  return (
    <>
      <Row label="Fill">
        <Colour value={surface?.fill} fallback={fillFallback} onChange={(fill) => set({ fill })} />
      </Row>
      <Row label="Corner radius">
        <Num value={surface?.radius} step={0.02} min={0} max={0.5} onChange={(radius) => set({ radius })} placeholder="0" />
      </Row>

      <Disclosure label="Shadow and glow">
        <Row label="Shadow">
          <Pick
            value={surface?.shadow}
            options={opts(['none', 'soft', 'medium', 'strong'] as const)}
            onChange={(shadow) => set({ shadow })}
            allowNone="none"
          />
        </Row>
        <div className="field-row">
          <Row label="Glow">
            <Pick
              value={surface?.glow}
              options={opts(['none', 'low', 'medium', 'high'] as const)}
              onChange={(glow) => set({ glow })}
              allowNone="none"
            />
          </Row>
          <Row label="Glow colour">
            <Colour value={surface?.glowColor} fallback="#4ade6a" onChange={(glowColor) => set({ glowColor })} />
          </Row>
        </div>
      </Disclosure>
    </>
  );
};

const MotionFields: React.FC<{ object: SceneObject; patch: Patch }> = ({ object, patch }) => {
  const motion = object.motion ?? {};
  const set = (p: Partial<typeof motion>) => patch({ motion: { ...motion, ...p } } as Partial<SceneObject>);

  const enterRecipe = motion.enter && motion.enter !== 'none' ? ENTER[motion.enter] : null;
  const exitRecipe = motion.exit && motion.exit !== 'none' ? EXIT[motion.exit] : null;
  const emphasisRecipe =
    motion.emphasis && motion.emphasis !== 'none' ? EMPHASIS[motion.emphasis] : null;
  const directional = Boolean(enterRecipe?.directional || exitRecipe?.directional);

  return (
    <>
      <Group title="Motion" summary={enterRecipe ? enterRecipe.label : 'None'}>
        <Row label="Entrance">
          <Pick
            value={motion.enter}
            options={(Object.keys(ENTER) as Exclude<EnterMotion, 'none'>[]).map((k) => ({
              value: k, label: ENTER[k].label,
            }))}
            onChange={(enter) => set({ enter })}
            allowNone="None"
          />
        </Row>
        {enterRecipe ? <p className="hint">{enterRecipe.description}</p> : null}

        <Row label="Emphasis">
          <Pick
            value={motion.emphasis}
            options={(Object.keys(EMPHASIS) as Exclude<EmphasisMotion, 'none'>[]).map((k) => ({
              value: k, label: EMPHASIS[k].label,
            }))}
            onChange={(emphasis) => set({ emphasis })}
            allowNone="Nothing"
          />
        </Row>
        {emphasisRecipe ? <p className="hint">{emphasisRecipe.description}</p> : null}

        <Row label="Exit">
          <Pick
            value={motion.exit}
            options={(Object.keys(EXIT) as Exclude<ExitMotion, 'none'>[]).map((k) => ({
              value: k, label: EXIT[k].label,
            }))}
            onChange={(exit) => set({ exit })}
            allowNone="None"
          />
        </Row>
        {exitRecipe ? <p className="hint">{exitRecipe.description}</p> : null}

        {directional ? (
          <Row label="Comes from">
            <Pick
              value={motion.from}
              options={opts(['left', 'right', 'top', 'bottom'] as const)}
              onChange={(from) => set({ from: from as MotionDirection })}
              allowNone="bottom"
            />
          </Row>
        ) : null}
        <Disclosure label="More motion">
          <div className="field-row">
            <Row label="Speed">
              <Pick
                value={motion.speed}
                options={opts(['slow', 'medium', 'fast'] as const)}
                onChange={(speed) => set({ speed: speed as MotionSpeed })}
                allowNone="medium"
              />
            </Row>
            <Row label="Distance">
              <Pick
                value={motion.distance}
                options={opts(['small', 'medium', 'large'] as const)}
                onChange={(distance) => set({ distance: distance as MotionDistance })}
                allowNone="medium"
              />
            </Row>
          </div>

          <div className="field-row">
            <Row label="Delay">
              <Num value={motion.delay} step={0.05} min={0} onChange={(delay) => set({ delay })} placeholder="0" />
            </Row>
            <Row label="Start">
              <Num value={object.start} step={0.05} min={0} onChange={(start) => patch({ start })} placeholder="0" />
            </Row>
            <Row label="Duration">
              <Num value={object.duration} step={0.1} min={0} onChange={(duration) => patch({ duration })} placeholder="rest of scene" />
            </Row>
          </div>
          <p className="hint">
            Seconds{inFrames(motion.delay, 'delay')}{inFrames(object.start, 'start')}
            {inFrames(object.duration, 'duration')}. Delay is measured from the
            object's start; start is measured from the scene's.
          </p>
        </Disclosure>
      </Group>
    </>
  );
};

const SURFACE_FALLBACK: Partial<Record<SceneObject['type'], string>> = {
  shape: 'ink',
  card: '#16181b',
  button: '#f2f4f2',
};

export const ObjectInspector: React.FC<{
  object: SceneObject | null;
  ink: string;
  onChange: (patch: Partial<SceneObject>) => void;
  targets: { id: string; label: string }[];
}> = ({ object, ink, onChange, targets }) => {
  if (!object) return null;

  const patch: Patch = onChange;

  return (
    <>
      <Group title={OBJECT_KIND_LABELS[object.type]}>
        {object.type === 'shape' ? (
          <>
            <Row label="Shape">
              <Pick
                value={(object as ShapeObject).shape}
                options={opts(['rectangle', 'rounded', 'circle', 'line'] as const)}
                onChange={(shape) => patch({ shape: shape as ShapeKind } as Partial<SceneObject>)}
              />
            </Row>
          </>
        ) : null}

        {object.type === 'icon' ? (
          <>
            <Row label="Icon">
              <Pick
                value={(object as IconObject).icon}
                options={(Object.keys(ICON_PATHS) as IconName[]).map((k) => ({ value: k, label: k }))}
                onChange={(icon) => patch({ icon: icon as IconName } as Partial<SceneObject>)}
              />
            </Row>
            <div className="field-row">
              <Row label="Colour">
                <Colour
                  value={(object as IconObject).color}
                  fallback={ink}
                  onChange={(color) => patch({ color } as Partial<SceneObject>)}
                />
              </Row>
              <Row label="Stroke">
                <Num
                  value={(object as IconObject).weight}
                  step={0.2} min={0.5}
                  onChange={(weight) => patch({ weight } as Partial<SceneObject>)}
                  placeholder="2"
                />
              </Row>
            </div>
          </>
        ) : null}

        {object.type === 'image' || object.type === 'logo' ? (
          <>
            <Row label="Source">
              <input
                className="text-input"
                value={(object as ImageObject | LogoObject).src}
                placeholder="uploads/… or https://…"
                spellCheck={false}
                onChange={(e) => patch({ src: e.target.value } as Partial<SceneObject>)}
              />
            </Row>
            <Row label="Fit">
              <Pick
                value={(object as ImageObject).fit}
                options={opts(['contain', 'cover'] as const)}
                onChange={(fit) => patch({ fit } as Partial<SceneObject>)}
                allowNone="contain"
              />
            </Row>
          </>
        ) : null}

        {object.type === 'card' ? (
          <>
            <LabelFields
              title="Title"
              label={(object as CardObject).title}
              fallbackColor={ink}
              onChange={(title) => patch({ title } as Partial<SceneObject>)}
            />
            <LabelFields
              title="Body"
              label={(object as CardObject).body}
              fallbackColor={ink}
              onChange={(body) => patch({ body } as Partial<SceneObject>)}
            />
          </>
        ) : null}

        {object.type === 'button' ? (
          <>
            <LabelFields
              title="Label"
              label={(object as ButtonObject).label}
              fallbackColor="#0c0d0c"
              onChange={(label) => patch({ label } as Partial<SceneObject>)}
            />
            <Row label="Icon">
              <Pick
                value={(object as ButtonObject).icon}
                options={(Object.keys(ICON_PATHS) as IconName[]).map((k) => ({ value: k, label: k }))}
                onChange={(icon) => patch({ icon } as Partial<SceneObject>)}
                allowNone="None"
              />
            </Row>
            <p className="hint">
              A cursor click can put this button into its success state — add a
              cursor and point one of its stops at this object.
            </p>
          </>
        ) : null}

        {object.type === 'cursor' ? (
          <CursorFields object={object as CursorObject} patch={patch} targets={targets} />
        ) : null}

        {object.type === 'group' ? (
          <>
            <Row label="Children animate">
              <Pick
                value={(object as GroupObject).sequence}
                options={[
                  { value: 'together' as const, label: 'All together' },
                  { value: 'after' as const, label: 'One after another' },
                  { value: 'stagger' as const, label: 'Stagger' },
                ]}
                onChange={(sequence) => patch({ sequence } as Partial<SceneObject>)}
                allowNone="All together"
              />
            </Row>
            <Row label="Stagger (s)">
              <Num
                value={(object as GroupObject).stagger}
                step={0.02} min={0}
                onChange={(stagger) => patch({ stagger } as Partial<SceneObject>)}
                placeholder="0.12"
              />
            </Row>
          </>
        ) : null}

      </Group>

      {SURFACE_FALLBACK[object.type] !== undefined ? (
        <Group title="Look">
          <SurfaceFields
            surface={(object as ShapeObject | CardObject | ButtonObject).surface}
            fillFallback={SURFACE_FALLBACK[object.type] === 'ink' ? ink : (SURFACE_FALLBACK[object.type] as string)}
            onChange={(surface) => patch({ surface } as Partial<SceneObject>)}
          />
        </Group>
      ) : null}

      <Group title="Position">
        <div className="field">
          <label>Snap to</label>
          <div className="chips">
            <button type="button" className="btn tiny"
              onClick={() => patch({ x: (1 - object.width) / 2 })}>Centre X</button>
            <button type="button" className="btn tiny"
              onClick={() => patch({ y: (1 - object.height) / 2 })}>Centre Y</button>
            <button type="button" className="btn tiny" onClick={() => patch({ x: 0.08 })}>Left</button>
            <button type="button" className="btn tiny"
              onClick={() => patch({ x: 1 - 0.08 - object.width })}>Right</button>
            <button type="button" className="btn tiny" onClick={() => patch({ y: 0.08 })}>Top</button>
            <button type="button" className="btn tiny"
              onClick={() => patch({ y: 1 - 0.08 - object.height })}>Bottom</button>
          </div>
          <p className="hint">Or drag the object on the canvas.</p>
        </div>

        <Disclosure label="Exact position">
          <div className="field-row">
            <Row label="X"><Num value={object.x} onChange={(x) => patch({ x: x ?? 0 })} /></Row>
            <Row label="Y"><Num value={object.y} onChange={(y) => patch({ y: y ?? 0 })} /></Row>
          </div>
          <div className="field-row">
            <Row label="Width"><Num value={object.width} onChange={(width) => patch({ width: width ?? 0.1 })} /></Row>
            <Row label="Height"><Num value={object.height} onChange={(height) => patch({ height: height ?? 0.1 })} /></Row>
          </div>
          <div className="field-row">
            <Row label="Rotation (°)">
              <Num value={object.rotation} step={1} onChange={(rotation) => patch({ rotation })} placeholder="0" />
            </Row>
            <Row label="Opacity">
              <Num value={object.opacity} step={0.05} min={0} max={1} onChange={(opacity) => patch({ opacity })} placeholder="1" />
            </Row>
          </div>
        </Disclosure>
      </Group>

      {object.type !== 'cursor' ? <MotionFields object={object} patch={patch} /> : null}
    </>
  );
};

const CursorFields: React.FC<{
  object: CursorObject;
  patch: Patch;
  targets: { id: string; label: string }[];
}> = ({ object, patch, targets }) => {
  const setStop = (i: number, next: Partial<CursorObject['stops'][number]>) =>
    patch({
      stops: object.stops.map((s, j) => (j === i ? { ...s, ...next } : s)),
    } as Partial<SceneObject>);

  return (
    <>
      <p className="hint">
        The pointer travels between stops. A stop with an action can put another
        object into a new state — that is how a click drives a button.
      </p>
      {object.stops.map((stop, i) => (
        <div key={i} className="cursor-stop">
          <div className="section-head">
            Stop {i + 1}
            <span className="spacer" />
            <span>{stop.action && stop.action !== 'none' ? stop.action : 'move'}</span>
          </div>
          <div className="field-row">
            <Row label="X"><Num value={stop.x} onChange={(x) => setStop(i, { x: x ?? 0.5 })} /></Row>
            <Row label="Y"><Num value={stop.y} onChange={(y) => setStop(i, { y: y ?? 0.5 })} /></Row>
          </div>
          <Row label="Action">
            <Pick value={stop.action} options={opts(['none', 'click', 'press', 'hover'] as const)}
                  onChange={(action) => setStop(i, { action })} allowNone="none" />
          </Row>
          {stop.action && stop.action !== 'none' ? (
            <div className="field-row">
              <Row label="Acts on">
                <Pick
                  value={stop.targetId}
                  options={targets.filter((t) => t.id !== object.id).map((t) => ({ value: t.id, label: t.label }))}
                  onChange={(targetId) => setStop(i, { targetId })}
                  allowNone="Nothing"
                />
              </Row>
              <Row label="Puts it in">
                <Pick
                  value={stop.targetState}
                  options={opts(['default', 'hover', 'pressed', 'active', 'success', 'error'] as const)}
                  onChange={(targetState) => setStop(i, { targetState })}
                  allowNone="—"
                />
              </Row>
            </div>
          ) : null}
          <Disclosure label="Travel">
            <div className="field-row">
              <Row label="Arrives at">
                <Num value={stop.at} step={0.1} onChange={(at) => setStop(i, { at: at ?? 0 })} />
              </Row>
              <Row label="Takes">
                <Num value={stop.travel} step={0.1} onChange={(travel) => setStop(i, { travel })} placeholder="0.6" />
              </Row>
            </div>
            <Row label="Path">
              <Pick value={stop.path} options={opts(['straight', 'arc', 'curve'] as const)}
                    onChange={(path) => setStop(i, { path })} allowNone="straight" />
            </Row>
            <p className="hint">
              Both in seconds{inFrames(stop.at, 'arrives')}{inFrames(stop.travel, 'takes')}.
            </p>
          </Disclosure>
        </div>
      ))}
      <button
        type="button"
        className="btn wide"
        onClick={() => {
          const last = object.stops[object.stops.length - 1];
          patch({
            stops: [
              ...object.stops,
              { x: 0.5, y: 0.5, at: (last?.at ?? 0) + 1, travel: 0.6, path: 'arc' },
            ],
          } as Partial<SceneObject>);
        }}
      >
        + Add stop
      </button>
    </>
  );
};
