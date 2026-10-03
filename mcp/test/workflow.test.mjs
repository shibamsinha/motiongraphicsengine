import './env.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { connect, ok } from './helpers.mjs';
import { health } from '../lib/render-client.mjs';

let client;
let close;
let fixtures;
let serverUp = false;

const makeClickTrack = (file, bpm, seconds) => {
  const rate = 44100;
  const period = 60 / bpm;
  const total = Math.floor(rate * seconds);
  const samples = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) {
    const t = i / rate;
    const into = t % period;
    const value = into < 0.02 ? 0.8 * Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-40 * into) : 0;
    samples.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, samples]));
  return file;
};

before(async () => {
  ({ client, close } = await connect());
  fixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'mge-workflow-'));
  makeClickTrack(path.join(fixtures, 'track.wav'), 120, 20);
  try {
    await health();
    serverUp = true;
  } catch {
    serverUp = false;
  }
});

after(async () => {
  await close();
  fs.rmSync(fixtures, { recursive: true, force: true });
});

describe('end-to-end: "Consistency beats motivation"', () => {
  it('creates, styles, animates, scores, syncs, previews and revises', async (t) => {
    const created = await ok(client, 'create_project', {
      title: 'Consistency beats motivation',
      format: 'portrait',
      scenes: [
        { text: 'consistency', duration: 2 },
        { text: 'beats', duration: 1 },
        { text: 'motivation', duration: 2 },
      ],
    });
    const projectId = created.project.projectId;
    const [first, second, third] = created.project.scenes.map((scene) => scene.sceneId);
    assert.equal(created.project.sceneCount, 3);

    for (const [sceneId, word, style] of [
      [first, 'consistency', 'hero'],
      [second, 'beats', 'emphasis'],
      [third, 'motivation', 'hero'],
    ]) {
      await ok(client, 'add_text', { projectId, sceneId, text: word });
      await ok(client, 'apply_typography_style', { projectId, sceneId, style });
    }

    await ok(client, 'apply_motion_style', { projectId, sceneId: first, style: 'cinematic' });
    await ok(client, 'apply_motion_style', { projectId, sceneId: second, style: 'rapid' });
    await ok(client, 'apply_motion_style', { projectId, sceneId: third, style: 'massive' });

    await ok(client, 'scale_timing', { projectId, targetDuration: 7 });
    const fitted = await ok(client, 'inspect_project', { projectId });
    assert.ok(
      Math.abs(fitted.project.duration - 7) < 0.2,
      `expected ~7s, got ${fitted.project.duration}`,
    );

    await ok(client, 'add_audio', {
      projectId, path: path.join(fixtures, 'track.wav'), sourceStart: 0, sourceEnd: 12,
    });
    const analysis = await ok(client, 'analyze_audio', { projectId });
    assert.ok(Math.abs(analysis.analysis.bpm - 120) < 1);
    assert.equal(analysis.analysis.quality, 'estimated');

    const synced = await ok(client, 'sync_to_beats', { projectId, mode: 'every-n-beats', n: 4 });
    assert.equal(synced.plan.length, 3);
    let cursor = 0;
    for (const row of synced.plan) {
      cursor += row.duration;
      assert.ok(
        Math.abs(cursor - row.landsOn) < 0.05,
        `scene ${row.sceneId} should end on its beat`,
      );
    }

    if (serverUp) {
      const preview = await ok(client, 'render_preview', { projectId, sceneId: third });
      const image = preview._result.content.find((block) => block.type === 'image');
      assert.ok(image && image.data.length > 1000, 'the preview should be a real frame');
    } else {
      t.diagnostic('render server down — skipping the preview step');
    }

    const beforeRevision = await ok(client, 'inspect_scene', { projectId, sceneId: third });
    assert.equal(beforeRevision.scene.style, 'massive');

    await ok(client, 'apply_motion_style', { projectId, sceneId: third, style: 'aggressive' });
    await ok(client, 'apply_typography_style', { projectId, sceneId: third, style: 'hero', size: 'oversized' });
    await ok(client, 'update_scene', { projectId, sceneId: third, background: 'green', emphasis: ['motivation'] });

    const revised = await ok(client, 'inspect_scene', { projectId, sceneId: third });
    assert.equal(revised.scene.style, 'punch', 'aggressive maps to the punch animation');
    assert.equal(revised.scene.background, 'green');
    assert.deepEqual(revised.scene.emphasis, ['motivation']);
    assert.equal(revised.scene.elements[0].size, 'oversized');

    const raw = await ok(client, 'get_project_json', { projectId });
    assert.equal(raw.document.scenes.length, 3);
    assert.ok(raw.document.audio, 'the audio must have survived every edit');
    assert.equal(raw.document.fps, 30);

    const finalState = await ok(client, 'inspect_project', { projectId });
    assert.equal(finalState.project.audio.present, true);
    assert.equal(finalState.project.sceneCount, 3);
  });

  it('lets a model discover the engine\'s limits before hitting them', async () => {
    const capabilities = await ok(client, 'describe_capabilities');
    assert.ok(capabilities.notSupported.keyframes);
    assert.ok(capabilities.notSupported.video);
    assert.ok(capabilities.supported.motion);

    const vocabulary = await ok(client, 'list_motion_vocabulary');
    assert.ok(vocabulary.objectEntrances.length >= 8);
    assert.ok(Object.keys(vocabulary.motionStyles).length >= 5);
  });
});
