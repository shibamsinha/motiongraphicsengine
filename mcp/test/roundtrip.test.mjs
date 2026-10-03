import './env.mjs';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { loadEngine } from '../lib/engine.mjs';
import { readProject } from '../lib/store.mjs';
import { connect, makeProject, ok } from './helpers.mjs';

let client;
let close;
let engine;

before(async () => {
  ({ client, close } = await connect());
  engine = await loadEngine();
});

after(async () => {
  await close();
});

const serialise = (project) =>
  engine.serialiseProject(
    project.scenes,
    project.title,
    project.fields,
    project.overlay,
    project.format,
    project.audio,
  );

describe('round trip', () => {
  it('settles after one pass, for a project built entirely over MCP', async () => {
    const project = await makeProject(client, { title: 'Round trip' });
    const sceneId = project.scenes[0].sceneId;

    await ok(client, 'add_text', {
      projectId: project.projectId, sceneId, text: 'discipline',
      role: 'primary', size: 'oversized', case: 'upper',
    });
    await ok(client, 'add_text', {
      projectId: project.projectId, sceneId, text: 'beats motivation',
      role: 'emphasis', emphasis: ['beats'], delay: 0.2,
    });
    await ok(client, 'set_text_composition', {
      projectId: project.projectId, sceneId, composition: 'left-stack',
    });
    await ok(client, 'set_word_colors', {
      projectId: project.projectId, sceneId, colors: { discipline: '#4ADE6A' },
    });
    await ok(client, 'add_shape', {
      projectId: project.projectId, sceneId, kind: 'button', label: 'Start', fill: '#F2F4F2',
    });
    await ok(client, 'apply_motion_style', {
      projectId: project.projectId, sceneId, style: 'cinematic',
    });

    const stored = await readProject(project.projectId);

    const first = serialise(stored.project);
    const reparsed = engine.parseProjectScript(first);
    assert.equal(reparsed.ok, true, 'the engine must be able to read its own output');

    const second = serialise(reparsed.project);
    assert.equal(second, first, 'the round trip must settle — a second lap changed the document');

    const third = serialise(engine.parseProjectScript(second).project);
    assert.equal(third, second, 'a third lap must also be a no-op');
  });

  it('preserves the intended state through the round trip', async () => {
    const project = await makeProject(client, { title: 'Preserved' });
    const sceneId = project.scenes[0].sceneId;

    await ok(client, 'add_text', {
      projectId: project.projectId, sceneId, text: 'discipline',
      role: 'primary', size: 'oversized', case: 'upper', position: 'top-center',
    });
    await ok(client, 'update_scene', {
      projectId: project.projectId, sceneId, background: 'black', style: 'massive',
      composition: 'oversized-center', emphasis: ['discipline'],
    });

    const scene = (await ok(client, 'inspect_scene', { projectId: project.projectId, sceneId })).scene;

    assert.equal(scene.background, 'black');
    assert.equal(scene.style, 'massive');
    assert.equal(scene.composition, 'oversized-center');
    assert.deepEqual(scene.emphasis, ['discipline']);

    const element = scene.elements[0];
    assert.equal(element.text, 'discipline');
    assert.equal(element.role, 'primary');
    assert.equal(element.size, 'oversized');
    assert.equal(element.case, 'upper');
    assert.equal(element.position, 'top-center');
  });

  it('preserves object motion and geometry', async () => {
    const project = await makeProject(client);
    const sceneId = project.scenes[0].sceneId;

    const added = await ok(client, 'add_shape', {
      projectId: project.projectId, sceneId, kind: 'card',
      x: 0.15, y: 0.3, width: 0.7, height: 0.25, label: 'A card',
    });
    await ok(client, 'animate_element', {
      projectId: project.projectId, sceneId, elementId: added.objectId,
      entrance: 'float-in', emphasis: 'glow', exit: 'fade-out',
      speed: 'slow', distance: 'large', delay: 0.3,
    });

    const scene = (await ok(client, 'inspect_scene', { projectId: project.projectId, sceneId })).scene;
    const object = scene.objects.find((candidate) => candidate.objectId === added.objectId);

    assert.equal(object.box.x, 0.15);
    assert.equal(object.box.width, 0.7);
    assert.equal(object.enter, 'float-in');
    assert.equal(object.emphasis, 'glow');
    assert.equal(object.exit, 'fade-out');
    assert.equal(object.speed, 'slow');
    assert.equal(object.distance, 'large');
    assert.equal(object.delay, 0.3);
  });

  it('keeps object ids stable across saves, unlike positional text ids', async () => {
    const project = await makeProject(client);
    const sceneId = project.scenes[0].sceneId;
    const added = await ok(client, 'add_shape', { projectId: project.projectId, sceneId, kind: 'icon' });

    await ok(client, 'update_scene', { projectId: project.projectId, sceneId, text: 'changed' });
    await ok(client, 'set_scene_duration', { projectId: project.projectId, sceneId, duration: 1.2 });

    const scene = (await ok(client, 'inspect_scene', { projectId: project.projectId, sceneId })).scene;
    assert.ok(
      scene.objects.some((object) => object.objectId === added.objectId),
      'object ids are serialised and must survive',
    );
  });

  it('produces a document the editor could import', async () => {
    const project = await makeProject(client, { title: 'For the editor' });
    const raw = await ok(client, 'get_project_json', { projectId: project.projectId });

    assert.equal(typeof raw.document.title, 'string');
    assert.equal(raw.document.fps, 30);
    assert.equal(raw.document.width, 1080);
    assert.equal(raw.document.height, 1920);
    assert.ok(Array.isArray(raw.document.scenes));

    const parsed = engine.parseProjectScript(JSON.stringify(raw.document));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.project.scenes.length, 3);
  });

  it('writes the store file as plain project JSON with no MCP envelope', async () => {
    const project = await makeProject(client);
    const stored = await readProject(project.projectId);

    const document = JSON.parse(serialise(stored.project));
    assert.ok('scenes' in document);
    assert.ok('fps' in document);
    assert.equal(document.projectId, undefined, 'MCP ids must not leak into the document');
    assert.equal(document.mcp, undefined);
    assert.equal(document.metadata, undefined);
  });

  it('snaps durations onto the frame grid and then holds them steady', async () => {
    const created = await ok(client, 'create_project', {
      title: 'Snapping', scenes: [{ text: 'one', duration: 0.85 }],
    });
    const first = created.project.scenes[0].duration;
    assert.notEqual(first, 0.85, 'the importer should have snapped this to the frame grid');

    await ok(client, 'update_project', { projectId: created.project.projectId, title: 'Again' });
    const after = await ok(client, 'inspect_project', { projectId: created.project.projectId });
    assert.equal(after.project.scenes[0].duration, first, 'duration must settle, not creep');
  });
});
