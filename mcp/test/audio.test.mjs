import './env.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { connect, fails, makeProject, ok } from './helpers.mjs';

let client;
let close;
let fixtures;

const FIXTURE_RATE = 44100;

const makeClickTrack = (file, bpm, seconds) => {
  const period = 60 / bpm;
  const total = Math.floor(FIXTURE_RATE * seconds);
  const samples = Buffer.alloc(total * 2);

  for (let i = 0; i < total; i++) {
    const t = i / FIXTURE_RATE;
    const into = t % period;
    const value = into < 0.02
      ? 0.8 * Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-40 * into)
      : 0;
    samples.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32767))), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(FIXTURE_RATE, 24);
  header.writeUInt32LE(FIXTURE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.length, 40);

  fs.writeFileSync(file, Buffer.concat([header, samples]));
  return file;
};

before(async () => {
  ({ client, close } = await connect());
  fixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'mge-audio-'));
  makeClickTrack(path.join(fixtures, 'click120.wav'), 120, 16);
  makeClickTrack(path.join(fixtures, 'click150.wav'), 150, 16);
});

after(async () => {
  await close();
  fs.rmSync(fixtures, { recursive: true, force: true });
});

describe('audio tools', () => {
  it('attaches a track and defaults the selection to the video length', async () => {
    const project = await makeProject(client);
    const added = await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
    });

    assert.equal(added.audio.present, true);
    assert.match(added.audio.src, /^uploads\//);
    assert.equal(added.audio.sourceStart, 0);
    assert.ok(added.audio.sourceEnd < 5, `expected a short selection, got ${added.audio.sourceEnd}`);
    assert.equal(added.audio.timelineStart, 0);
  });

  it('keeps the source trim and the timeline offset independent', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
    });

    const trimmed = await ok(client, 'trim_audio', {
      projectId: project.projectId, sourceStart: 4, sourceEnd: 9,
    });
    assert.equal(trimmed.audio.sourceStart, 4);
    assert.equal(trimmed.audio.sourceEnd, 9);
    assert.equal(trimmed.audio.timelineStart, 0, 'trimming must not move it on the timeline');

    const offset = await ok(client, 'set_audio_offset', {
      projectId: project.projectId, timelineStart: 1.5,
    });
    assert.equal(offset.audio.timelineStart, 1.5);
    assert.equal(offset.audio.sourceStart, 4, 'offsetting must not change the trim');
  });

  it('rejects an inverted or out-of-range trim', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
    });
    await fails(
      client, 'trim_audio',
      { projectId: project.projectId, sourceStart: 5, sourceEnd: 2 },
      'VALIDATION_ERROR',
    );
    await fails(
      client, 'trim_audio',
      { projectId: project.projectId, sourceStart: 0, sourceEnd: 600 },
      'VALIDATION_ERROR',
    );
  });

  it('reports NOT_FOUND when the project has no audio', async () => {
    const project = await makeProject(client);
    const empty = await ok(client, 'get_audio', { projectId: project.projectId });
    assert.equal(empty.audio.present, false);

    await fails(client, 'trim_audio', { projectId: project.projectId, sourceStart: 1 }, 'NOT_FOUND');
    await fails(client, 'analyze_audio', { projectId: project.projectId }, 'NOT_FOUND');
  });

  it('refuses an unsupported file type without reading it', async () => {
    const project = await makeProject(client);
    const notAudio = path.join(fixtures, 'notes.txt');
    fs.writeFileSync(notAudio, 'this is not audio');
    await fails(
      client, 'add_audio', { projectId: project.projectId, path: notAudio }, 'VALIDATION_ERROR',
    );
  });

  it('refuses a path that does not exist', async () => {
    const project = await makeProject(client);
    await fails(
      client, 'add_audio',
      { projectId: project.projectId, path: '/nowhere/at/all/track.mp3' },
      'VALIDATION_ERROR',
    );
  });

  it('requires confirmation to remove the track', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
    });
    await fails(client, 'remove_audio', { projectId: project.projectId }, 'CONFIRMATION_REQUIRED');
    const removed = await ok(client, 'remove_audio', { projectId: project.projectId, confirm: true });
    assert.equal(removed.audio.present, false);
  });

  it('drops a zero fade rather than storing it as a real fade', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'), fadeIn: 2,
    });
    const cleared = await ok(client, 'update_audio', { projectId: project.projectId, fadeIn: 0 });
    assert.equal(cleared.audio.fadeIn, undefined);
  });
});

describe('audio analysis', () => {
  it('estimates a known tempo to within a beat per minute', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
    });
    const analysed = await ok(client, 'analyze_audio', { projectId: project.projectId });

    assert.ok(
      Math.abs(analysed.analysis.bpm - 120) < 1,
      `expected about 120 BPM, got ${analysed.analysis.bpm}`,
    );
    assert.ok(analysed.analysis.confidence > 0.5);
    assert.equal(analysed.analysis.quality, 'estimated');
    assert.ok(analysed.analysis.beatCount > 20);
  });

  it('estimates a second, different tempo correctly', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click150.wav'),
    });
    const analysed = await ok(client, 'analyze_audio', { projectId: project.projectId });
    assert.ok(
      Math.abs(analysed.analysis.bpm - 150) < 1.5,
      `expected about 150 BPM, got ${analysed.analysis.bpm}`,
    );
  });

  it('is deterministic — the same file yields the same numbers', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
    });
    const first = await ok(client, 'analyze_audio', { projectId: project.projectId, force: true });
    const second = await ok(client, 'analyze_audio', { projectId: project.projectId, force: true });
    assert.equal(first.analysis.bpm, second.analysis.bpm);
    assert.equal(first.analysis.beatCount, second.analysis.beatCount);
  });

  it('returns beats spaced by the detected period, in both clocks', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
      sourceStart: 0, sourceEnd: 16,
    });
    await ok(client, 'set_audio_offset', { projectId: project.projectId, timelineStart: 2 });

    const beats = await ok(client, 'get_beats', { projectId: project.projectId });
    assert.ok(beats.beats.length > 10);

    const gap = beats.beats[2].fileTime - beats.beats[1].fileTime;
    assert.ok(Math.abs(gap - 0.5) < 0.03, `expected ~0.5s between beats, got ${gap}`);

    assert.ok(
      Math.abs((beats.beats[1].videoTime - beats.beats[1].fileTime) - 2) < 0.001,
      'videoTime must include timelineStart',
    );
  });

  it('filters beats by strength and by video-time window', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
      sourceStart: 0, sourceEnd: 16,
    });
    const all = await ok(client, 'get_beats', { projectId: project.projectId });
    const window = await ok(client, 'get_beats', {
      projectId: project.projectId, fromVideoTime: 4, toVideoTime: 8,
    });
    assert.ok(window.beats.length < all.beats.length);
    assert.ok(window.beats.every((beat) => beat.videoTime >= 4 && beat.videoTime <= 8));
  });
});

describe('beat synchronisation', () => {
  it('re-times scene boundaries onto beats without changing order or content', async () => {
    const project = await makeProject(client);
    const originalIds = project.scenes.map((scene) => scene.sceneId);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
      sourceStart: 0, sourceEnd: 16,
    });

    const synced = await ok(client, 'sync_to_beats', {
      projectId: project.projectId, mode: 'every-n-beats', n: 2,
    });

    assert.equal(synced.plan.length, 3);
    assert.deepEqual(synced.plan.map((row) => row.sceneId), originalIds);

    let cursor = 0;
    for (const row of synced.plan) {
      cursor += row.duration;
      assert.ok(
        Math.abs(cursor - row.landsOn) < 0.05,
        `scene ${row.sceneId} ends at ${cursor}, expected ${row.landsOn}`,
      );
    }

    const inspected = await ok(client, 'inspect_project', { projectId: project.projectId });
    assert.deepEqual(inspected.project.scenes.map((s) => s.sceneId), originalIds);
  });

  it('previews without writing', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
      sourceStart: 0, sourceEnd: 16,
    });
    const before = await ok(client, 'inspect_project', { projectId: project.projectId });

    const preview = await ok(client, 'sync_to_beats', {
      projectId: project.projectId, mode: 'every-beat', preview: true,
    });
    assert.equal(preview.preview, true);

    const after = await ok(client, 'inspect_project', { projectId: project.projectId });
    assert.deepEqual(
      after.project.scenes.map((s) => s.duration),
      before.project.scenes.map((s) => s.duration),
      'a preview must not modify the project',
    );
  });

  it('refuses when there are fewer usable beats than scenes', async () => {
    const project = await makeProject(client);
    await ok(client, 'add_audio', {
      projectId: project.projectId, path: path.join(fixtures, 'click120.wav'),
      sourceStart: 0, sourceEnd: 1,
    });
    const error = await fails(
      client, 'sync_to_beats',
      { projectId: project.projectId, mode: 'every-n-beats', n: 8 },
      'VALIDATION_ERROR',
    );
    assert.match(error.message, /not enough boundaries|usable beat/i);
  });

  it('needs audio before it can sync', async () => {
    const project = await makeProject(client);
    await fails(
      client, 'sync_to_beats', { projectId: project.projectId, mode: 'every-beat' }, 'NOT_FOUND',
    );
  });
});
