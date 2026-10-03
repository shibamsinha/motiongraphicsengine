import type {
  ObjectKind,
  SceneObject,
} from '../types/object';
import { isContainer } from '../types/object';
import { makeElementId } from './defaultScenes';

const CENTRED = { x: 0.28, y: 0.42, width: 0.44, height: 0.16 };

const INK = '#F2F4F2';
const ACCENT = '#4ADE6A';
const PANEL = '#16181B';

export const newObject = (kind: ObjectKind): SceneObject => {
  const id = makeElementId();
  const base = { id, ...CENTRED, motion: { enter: 'pop-in' as const, speed: 'fast' as const } };

  switch (kind) {
    case 'shape':
      return { ...base, type: 'shape', shape: 'rounded', surface: { fill: ACCENT, radius: 0.12 } };
    case 'image':
      return { ...base, type: 'image', src: '', fit: 'contain' };
    case 'logo':
      return { ...base, type: 'logo', src: '/brand/logo-mark.png', fit: 'contain',
               width: 0.18, height: 0.18, x: 0.41, y: 0.41 };
    case 'icon':
      return { ...base, type: 'icon', icon: 'check', color: ACCENT,
               width: 0.16, height: 0.16, x: 0.42, y: 0.42,
               motion: { enter: 'draw-in', speed: 'medium' } };
    case 'card':
      return {
        ...base, type: 'card',
        x: 0.12, y: 0.34, width: 0.76, height: 0.28,
        surface: { fill: PANEL, radius: 0.09, shadow: 'strong',
                   stroke: 'rgba(255,255,255,0.07)', strokeWidth: 1 },
        title: { text: 'Card title', size: 0.04, weight: 600, color: INK },
        body: { text: 'Supporting line', size: 0.024, color: '#8A928A' },
        motion: { enter: 'float-in', speed: 'medium' },
        children: [],
      };
    case 'button':
      return {
        ...base, type: 'button',
        x: 0.30, y: 0.62, width: 0.40, height: 0.085,
        label: { text: 'Get started', size: 0.03, weight: 600, color: '#0C0D0C' },
        surface: { fill: INK, radius: 0.5, shadow: 'soft' },
        stateStyles: {
          pressed: { fill: '#D6DAD6', radius: 0.5 },
          success: {
            fill: ACCENT, radius: 0.5, glow: 'medium',
            glowColor: 'rgba(74,222,106,0.45)',
            label: { text: 'Done', size: 0.03, weight: 600, color: '#0C0D0C' },
          },
        },
      };
    case 'cursor':
      return {
        id, type: 'cursor',
        x: 0.5, y: 0.5, width: 0.06, height: 0.06,
        stops: [
          { x: 0.85, y: 0.9, at: 0 },
          { x: 0.5, y: 0.66, at: 1.2, travel: 0.8, path: 'arc' },
        ],
      };
    case 'group':
      return { ...base, type: 'group', x: 0.1, y: 0.3, width: 0.8, height: 0.4,
               children: [], sequence: 'stagger', stagger: 0.12, motion: undefined };
  }
};

export const flattenObjects = (
  objects: SceneObject[] | undefined,
  depth = 0,
): { object: SceneObject; depth: number }[] =>
  (objects ?? []).flatMap((object) => [
    { object, depth },
    ...(isContainer(object) ? flattenObjects(object.children, depth + 1) : []),
  ]);

export const findObject = (
  objects: SceneObject[] | undefined,
  id: string,
): SceneObject | null => {
  for (const object of objects ?? []) {
    if (object.id === id) return object;
    if (isContainer(object)) {
      const found = findObject(object.children, id);
      if (found) return found;
    }
  }
  return null;
};

export const updateObject = (
  objects: SceneObject[],
  id: string,
  patch: Partial<SceneObject>,
): SceneObject[] =>
  objects.map((object) => {
    if (object.id === id) return { ...object, ...patch } as SceneObject;
    if (isContainer(object) && object.children?.length) {
      return { ...object, children: updateObject(object.children, id, patch) } as SceneObject;
    }
    return object;
  });

export const removeObject = (objects: SceneObject[], id: string): SceneObject[] =>
  objects
    .filter((object) => object.id !== id)
    .map((object) =>
      isContainer(object) && object.children?.length
        ? ({ ...object, children: removeObject(object.children, id) } as SceneObject)
        : object,
    );

const reid = (object: SceneObject): SceneObject => ({
  ...object,
  id: makeElementId(),
  ...(isContainer(object) && object.children
    ? { children: object.children.map(reid) }
    : {}),
}) as SceneObject;

export const duplicateObject = (objects: SceneObject[], id: string): SceneObject[] => {
  const out: SceneObject[] = [];
  for (const object of objects) {
    if (object.id === id) {
      out.push(object);
      const copy = reid(object);
      out.push({ ...copy, x: copy.x + 0.03, y: copy.y + 0.03 } as SceneObject);
    } else if (isContainer(object) && object.children?.length) {
      out.push({ ...object, children: duplicateObject(object.children, id) } as SceneObject);
    } else {
      out.push(object);
    }
  }
  return out;
};

export const reorderObject = (
  objects: SceneObject[],
  id: string,
  to: 'front' | 'back' | 'forward' | 'backward',
): SceneObject[] => {
  const index = objects.findIndex((o) => o.id === id);
  if (index >= 0) {
    const next = [...objects];
    const [item] = next.splice(index, 1);
    const target =
      to === 'front' ? next.length
      : to === 'back' ? 0
      : to === 'forward' ? Math.min(next.length, index + 1)
      : Math.max(0, index - 1);
    next.splice(target, 0, item);
    return next.map((o) => (o.layer === undefined ? o : ({ ...o, layer: undefined } as SceneObject)));
  }
  return objects.map((object) =>
    isContainer(object) && object.children?.length
      ? ({ ...object, children: reorderObject(object.children, id, to) } as SceneObject)
      : object,
  );
};

export const addObject = (
  objects: SceneObject[],
  object: SceneObject,
  intoId: string | null,
): SceneObject[] => {
  if (!intoId) return [...objects, object];
  let placed = false;
  const walk = (list: SceneObject[]): SceneObject[] =>
    list.map((item) => {
      if (item.id === intoId && isContainer(item)) {
        placed = true;
        const child = { ...object, x: 0.1, y: 0.3, width: 0.8, height: 0.4 } as SceneObject;
        return { ...item, children: [...(item.children ?? []), child] } as SceneObject;
      }
      if (isContainer(item) && item.children?.length) {
        return { ...item, children: walk(item.children) } as SceneObject;
      }
      return item;
    });
  const next = walk(objects);
  return placed ? next : [...objects, object];
};

export const OBJECT_KIND_LABELS: Record<ObjectKind, string> = {
  shape: 'Shape',
  image: 'Image',
  icon: 'Icon',
  card: 'Card',
  button: 'Button',
  logo: 'Logo',
  cursor: 'Cursor',
  group: 'Group',
};

export const objectTitle = (object: SceneObject): string => {
  switch (object.type) {
    case 'button': return object.label?.text || 'Button';
    case 'card': return object.title?.text || 'Card';
    case 'icon': return object.icon;
    case 'shape': return object.shape;
    case 'image':
    case 'logo': return object.src.split('/').pop() || object.type;
    case 'cursor': return `Cursor · ${object.stops.length} stops`;
    case 'group': return `Group · ${object.children.length}`;
  }
};
