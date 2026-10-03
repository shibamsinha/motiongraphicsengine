import React, { useState } from 'react';
import type { ObjectKind, SceneObject } from '../../types/object';
import { Group } from './Group';
import {
  OBJECT_KIND_LABELS,
  flattenObjects,
  objectTitle,
} from '../../data/objects';

const ADD_ORDER: ObjectKind[] = [
  'card', 'button', 'shape', 'icon', 'image', 'logo', 'cursor', 'group',
];

const ADD_HINT: Record<ObjectKind, string> = {
  card: 'A panel with a title and body',
  button: 'A label that can change state',
  shape: 'Rectangle, circle or line',
  icon: 'One of the built-in glyphs',
  image: 'A picture from a URL or upload',
  logo: 'The brand mark',
  cursor: 'A pointer that moves and clicks',
  group: 'Move and stagger things together',
};

export const ObjectList: React.FC<{
  objects: SceneObject[] | undefined;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (kind: ObjectKind) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReorder: (to: 'front' | 'back' | 'forward' | 'backward') => void;
}> = ({ objects, selectedId, onSelect, onAdd, onDuplicate, onDelete, onReorder }) => {
  const [adding, setAdding] = useState(false);
  const rows = flattenObjects(objects);

  return (
    <Group
      title="Objects"
      summary={rows.length > 0 ? String(rows.length) : undefined}
      defaultOpen={rows.length > 0}
    >
      {rows.length === 0 && !adding ? (
        <div className="empty-state">
          <p className="empty-state-text">
            Cards, buttons, shapes and icons — the motion-graphics layer that
            sits over this scene's type.
          </p>
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            Add an object
          </button>
        </div>
      ) : null}

      {rows.length > 0 ? (
      <div className="scene-rows object-rows">
        {rows.map(({ object, depth }) => (
          <button
            key={object.id}
            type="button"
            className={`scene-row object-row${object.id === selectedId ? ' is-active' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => onSelect(object.id)}
          >
            <span className="object-kind">{OBJECT_KIND_LABELS[object.type]}</span>
            <span className="label">{objectTitle(object)}</span>
            {object.motion?.enter && object.motion.enter !== 'none' ? (
              <span className="style-tag">{object.motion.enter.replace('-', ' ')}</span>
            ) : null}
          </button>
        ))}
      </div>
      ) : null}

      {adding ? (
        <div className="object-add">
          {ADD_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              className="object-add-item"
              onClick={() => {
                onAdd(kind);
                setAdding(false);
              }}
            >
              <span className="object-add-name">{OBJECT_KIND_LABELS[kind]}</span>
              <span className="object-add-hint">{ADD_HINT[kind]}</span>
            </button>
          ))}
          <button type="button" className="btn wide" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : rows.length > 0 ? (
        <div className="row-actions is-inline">
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + Add object
          </button>
          <button
            type="button"
            className="btn"
            onClick={onDuplicate}
            disabled={!selectedId}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onReorder('backward')}
            disabled={!selectedId}
            title="Send backward"
          >
            ↑
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onReorder('forward')}
            disabled={!selectedId}
            title="Bring forward"
          >
            ↓
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={onDelete}
            disabled={!selectedId}
          >
            Delete
          </button>
        </div>
      ) : null}
    </Group>
  );
};
