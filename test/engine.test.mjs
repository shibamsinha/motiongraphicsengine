import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { loadEngine } from '../mcp/lib/engine.mjs';

let engine;

before(async () => {
  engine = await loadEngine();
});

const roundTrip = (scenes, options = {}) => {
  const json = engine.serialiseProject(
    scenes,
    options.title ?? 'Test',
    options.fields ?? {},
    options.overlay ?? null,
    options.format ?? 'portrait',
    options.audio ?? null,
    options.ink ?? {},
    options.accent ?? null,
  );
  const parsed = engine.parseProjectScript(json);
  assert.equal(parsed.ok, true, `parse failed: ${JSON.stringify(parsed.issues ?? [])}`);
  return { json: JSON.parse(json), project: parsed.project };
};

describe('backward compatibility', () => {
  it('leaves a document that uses no optional field byte-identical', () => {
    const scenes = [
      engine.blankScene({ text: 'people', duration: 0.9, style: 'slide' }),
      engine.blankScene({ text: 'buy certainty', duration: 1.2, style: 'punch' }),
    ];
    const first = engine.serialiseProject(scenes, 'Old', {}, null, 'portrait');
    const withDefaults = engine.serialiseProject(scenes, 'Old', {}, null, 'portrait', null, {}, null);
    assert.equal(withDefaults, first);

    const document = JSON.parse(first);
    for (const key of ['inkPalette', 'accentColor']) {
      assert.equal(document[key], undefined, `${key} must not appear unless set`);
    }
    for (const scene of document.scenes) {
      for (const key of ['enterFrames', 'fit', 'fontRole']) {
        assert.equal(scene[key], undefined, `scene.${key} must not appear unless set`);
      }
    }
  });

  it('parses a minimal legacy document and reports no new fields', () => {
    const legacy = JSON.stringify({
      title: 'Legacy reel',
      format: '9:16',
      width: 1080,
      height: 1920,
      fps: 30,
      scenes: [
        {
          id: 'scene-1', start: 0, duration: 1, text: 'discipline',
          animation: 'PUNCH', direction: 'CENTER', alignment: 'CENTER',
          background: 'GREEN', case: 'lower', emphasis: [],
        },
      ],
    });
    const parsed = engine.parseProjectScript(legacy);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.project.ink, {});
    assert.equal(parsed.project.accent, null);
    assert.equal(parsed.project.scenes[0].enterFrames, undefined);
    assert.equal(parsed.project.scenes[0].fit, undefined);
    assert.equal(parsed.project.scenes[0].fontRole, undefined);
  });
});

describe('animation: none', () => {
  it('round-trips as a first-class style', () => {
    const { json, project } = roundTrip([
      engine.blankScene({ text: 'held card', style: 'none', duration: 1 }),
    ]);
    assert.equal(json.scenes[0].animation, 'NONE');
    assert.equal(project.scenes[0].style, 'none');
  });

  it('accepts the spellings an author would reach for', () => {
    for (const word of ['NONE', 'STATIC', 'HOLD', 'none', 'static']) {
      const document = {
        title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
        scenes: [{
          id: 's1', start: 0, duration: 1, text: 'x', animation: word,
          direction: 'CENTER', alignment: 'CENTER', background: 'CREAM', case: 'lower',
        }],
      };
      const parsed = engine.parseProjectScript(JSON.stringify(document));
      assert.equal(parsed.ok, true, `"${word}" should parse`);
      assert.equal(parsed.project.scenes[0].style, 'none');
    }
  });

  it('still rejects a style the engine does not have', () => {
    const document = {
      title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
      scenes: [{
        id: 's1', start: 0, duration: 1, text: 'x', animation: 'EXPLODE',
        direction: 'CENTER', alignment: 'CENTER', background: 'CREAM', case: 'lower',
      }],
    };
    const parsed = engine.parseProjectScript(JSON.stringify(document));
    assert.equal(parsed.ok, false, 'unknown styles must remain errors, not silent fallbacks');
  });
});

describe('explicit entrance duration', () => {
  it('round-trips at scene and element level', () => {
    const { json, project } = roundTrip([
      engine.blankScene({
        text: 'fast',
        duration: 0.5,
        enterFrames: 3,
        elements: [engine.element('fast', { enterFrames: 2 })],
      }),
    ]);
    assert.equal(json.scenes[0].enterFrames, 3);
    assert.equal(json.scenes[0].elements[0].enterFrames, 2);
    assert.equal(project.scenes[0].enterFrames, 3);
    assert.equal(project.scenes[0].elements[0].enterFrames, 2);
  });

  it('rejects a fractional or zero entrance', () => {
    for (const bad of [0, 0.5, -2]) {
      const document = {
        title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
        scenes: [{
          id: 's1', start: 0, duration: 1, text: 'x', animation: 'PUNCH',
          direction: 'CENTER', alignment: 'CENTER', background: 'CREAM',
          case: 'lower', enterFrames: bad,
        }],
      };
      const parsed = engine.parseProjectScript(JSON.stringify(document));
      assert.equal(parsed.ok, false, `enterFrames ${bad} should be rejected`);
    }
  });
});

describe('fit-to-width', () => {
  it('round-trips, and accepts the shorthand form', () => {
    const { json, project } = roundTrip([
      engine.blankScene({
        text: 'consistency beats motivation',
        elements: [engine.element('consistency', { fit: { mode: 'width', maxWidth: 0.88 } })],
      }),
    ]);
    assert.deepEqual(json.scenes[0].elements[0].fit, { mode: 'WIDTH', maxWidth: 0.88 });
    assert.deepEqual(project.scenes[0].elements[0].fit, { mode: 'width', maxWidth: 0.88 });

    const document = {
      title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
      scenes: [{
        id: 's1', start: 0, duration: 1, text: 'x', animation: 'PUNCH',
        direction: 'CENTER', alignment: 'CENTER', background: 'CREAM',
        case: 'lower', fit: 0.75,
      }],
    };
    const parsed = engine.parseProjectScript(JSON.stringify(document));
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.project.scenes[0].fit, { mode: 'width', maxWidth: 0.75 });
  });

  it('rejects a width outside the frame', () => {
    for (const bad of [0, -0.5, 1.5]) {
      const document = {
        title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
        scenes: [{
          id: 's1', start: 0, duration: 1, text: 'x', animation: 'PUNCH',
          direction: 'CENTER', alignment: 'CENTER', background: 'CREAM',
          case: 'lower', fit: bad,
        }],
      };
      assert.equal(
        engine.parseProjectScript(JSON.stringify(document)).ok, false,
        `fit ${bad} should be rejected`,
      );
    }
  });
});

describe('accent typeface', () => {
  it('round-trips as a semantic role', () => {
    const { json, project } = roundTrip([
      engine.blankScene({
        text: 'beats',
        elements: [engine.element('beats', { fontRole: 'accent' })],
      }),
    ]);
    assert.equal(json.scenes[0].elements[0].fontRole, 'ACCENT');
    assert.equal(project.scenes[0].elements[0].fontRole, 'accent');
  });

  it('accepts the words a writer would use, and rejects a real font name', () => {
    const make = (role) => JSON.stringify({
      title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
      scenes: [{
        id: 's1', start: 0, duration: 1, text: 'x', animation: 'PUNCH',
        direction: 'CENTER', alignment: 'CENTER', background: 'CREAM',
        case: 'lower', fontRole: role,
      }],
    });
    for (const [word, expected] of [['SERIF', 'accent'], ['ITALIC', 'accent'], ['SANS', 'primary']]) {
      const parsed = engine.parseProjectScript(make(word));
      assert.equal(parsed.ok, true, `"${word}" should parse`);
      assert.equal(parsed.project.scenes[0].fontRole, expected);
    }
    assert.equal(engine.parseProjectScript(make('Helvetica Neue')).ok, false);
  });
});

describe('project palette', () => {
  it('round-trips arbitrary background and ink colours', () => {
    const { json, project } = roundTrip(
      [engine.blankScene({ text: 'brand', background: 'green' })],
      { fields: { green: '#1A0DCC' }, ink: { green: '#FFFFFF' }, accent: '#00A8FF' },
    );
    assert.deepEqual(json.backgroundPalette, { green: '#1A0DCC' });
    assert.deepEqual(json.inkPalette, { green: '#FFFFFF' });
    assert.equal(json.accentColor, '#00A8FF');

    assert.deepEqual(project.fields, { green: '#1A0DCC' });
    assert.deepEqual(project.ink, { green: '#FFFFFF' });
    assert.equal(project.accent, '#00A8FF');
  });

  it('honours an explicit ink exactly, and derives one when none is given', () => {
    const explicit = engine.themeFor('green', 'forest', { green: '#1A0DCC' }, { green: '#FFFFFF' });
    assert.equal(explicit.background, '#1A0DCC');
    assert.equal(explicit.ink, '#FFFFFF');

    const derived = engine.themeFor('green', 'forest', { green: '#EEEEEE' });
    assert.equal(derived.background, '#EEEEEE');
    assert.ok(
      engine.contrastRatio(derived.background, derived.ink) >= 3,
      'a derived ink must stay readable on its field',
    );
  });

  it('carries the accent on the theme, defaulting to the house value', () => {
    assert.equal(engine.themeFor('green').accent, engine.DEFAULT_ACCENT);
    assert.equal(
      engine.themeFor('green', 'forest', undefined, undefined, '#00A8FF').accent,
      '#00A8FF',
    );
  });

  it('ignores a malformed colour without failing the import', () => {
    const document = {
      title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
      inkPalette: { green: 'not-a-colour' },
      accentColor: 'nope',
      scenes: [{
        id: 's1', start: 0, duration: 1, text: 'x', animation: 'PUNCH',
        direction: 'CENTER', alignment: 'CENTER', background: 'GREEN', case: 'lower',
      }],
    };
    const parsed = engine.parseProjectScript(JSON.stringify(document));
    assert.equal(parsed.ok, true, 'a bad colour should cost that colour, not the import');
    assert.deepEqual(parsed.project.ink, {});
    assert.equal(parsed.project.accent, null);
    assert.ok(parsed.issues.some((issue) => issue.severity === 'warning'));
  });
});

describe('round-trip settles with every optional field set', () => {
  it('is idempotent after one pass', () => {
    const scenes = [
      engine.blankScene({
        text: 'consistency',
        duration: 1,
        style: 'none',
        enterFrames: 2,
        fit: { mode: 'width', maxWidth: 0.88 },
        fontRole: 'accent',
        elements: [
          engine.element('consistency', {
            enterFrames: 2,
            fit: { mode: 'width', maxWidth: 0.9 },
            fontRole: 'accent',
          }),
        ],
      }),
    ];
    const options = { fields: { cream: '#FFFFFF' }, ink: { cream: '#1A0DCC' }, accent: '#00A8FF' };

    const first = engine.serialiseProject(
      scenes, 'Options', options.fields, null, 'portrait', null, options.ink, options.accent,
    );
    const parsed = engine.parseProjectScript(first);
    assert.equal(parsed.ok, true);

    const second = engine.serialiseProject(
      parsed.project.scenes, parsed.project.title, parsed.project.fields, parsed.project.overlay,
      parsed.project.format, parsed.project.audio, parsed.project.ink, parsed.project.accent,
    );
    const again = engine.parseProjectScript(second);
    assert.equal(again.ok, true);
    const third = engine.serialiseProject(
      again.project.scenes, again.project.title, again.project.fields, again.project.overlay,
      again.project.format, again.project.audio, again.project.ink, again.project.accent,
    );
    assert.equal(third, second, 'a second lap must change nothing');
  });
});

describe('text exits', () => {
  it('round-trips an explicit exit at scene and element level', () => {
    const { json, project } = roundTrip([
      engine.blankScene({
        text: 'leaves',
        style: 'punch',
        exit: 'slide',
        exitFrames: 4,
        elements: [engine.element('leaves', { exit: 'none' })],
      }),
    ]);
    assert.equal(json.scenes[0].exit, 'SLIDE');
    assert.equal(json.scenes[0].exitFrames, 4);
    assert.equal(json.scenes[0].elements[0].exit, 'NONE');

    assert.equal(project.scenes[0].exit, 'slide');
    assert.equal(project.scenes[0].exitFrames, 4);
    assert.equal(project.scenes[0].elements[0].exit, 'none');
  });

  it('expresses all four enter/exit combinations', () => {
    const combinations = [
      { style: 'punch', exit: 'punch', label: 'enter → hold → exit' },
      { style: 'punch', exit: 'none', label: 'enter → hold → no exit' },
      { style: 'none', exit: 'punch', label: 'no enter → hold → exit' },
      { style: 'none', exit: 'none', label: 'no enter → hold → no exit' },
    ];
    for (const { style, exit, label } of combinations) {
      const { project } = roundTrip([engine.blankScene({ text: 'x', style, exit })]);
      assert.equal(project.scenes[0].style, style, label);
      assert.equal(project.scenes[0].exit, exit, label);
    }
  });

  it('rejects an exit the engine does not have', () => {
    const document = {
      title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
      scenes: [{
        id: 's1', start: 0, duration: 1, text: 'x', animation: 'PUNCH', exit: 'DISSOLVE',
        direction: 'CENTER', alignment: 'CENTER', background: 'CREAM', case: 'lower',
      }],
    };
    assert.equal(engine.parseProjectScript(JSON.stringify(document)).ok, false);
  });
});

describe('word stagger', () => {
  it('round-trips, and accepts a bare frame count', () => {
    const { json, project } = roundTrip([
      engine.blankScene({
        text: 'one two three',
        stagger: { type: 'word', delayFrames: 2, order: 'reverse' },
      }),
    ]);
    assert.deepEqual(json.scenes[0].stagger, { type: 'WORD', delayFrames: 2, order: 'REVERSE' });
    assert.deepEqual(project.scenes[0].stagger, { type: 'word', delayFrames: 2, order: 'reverse' });

    const document = {
      title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
      scenes: [{
        id: 's1', start: 0, duration: 1, text: 'one two', animation: 'PUNCH',
        direction: 'CENTER', alignment: 'CENTER', background: 'CREAM', case: 'lower',
        stagger: 3,
      }],
    };
    const parsed = engine.parseProjectScript(JSON.stringify(document));
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.project.scenes[0].stagger, { type: 'word', delayFrames: 3 });
  });

  it('omits a forward order, because forward is the default', () => {
    const { json } = roundTrip([
      engine.blankScene({ text: 'a b', stagger: { type: 'word', delayFrames: 1, order: 'forward' } }),
    ]);
    assert.equal(json.scenes[0].stagger.order, undefined);
  });

  it('rejects a fractional, negative or unknown-order stagger', () => {
    const make = (stagger) => JSON.stringify({
      title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
      scenes: [{
        id: 's1', start: 0, duration: 1, text: 'a b', animation: 'PUNCH',
        direction: 'CENTER', alignment: 'CENTER', background: 'CREAM', case: 'lower', stagger,
      }],
    });
    assert.equal(engine.parseProjectScript(make(1.5)).ok, false);
    assert.equal(engine.parseProjectScript(make(-2)).ok, false);
    assert.equal(
      engine.parseProjectScript(make({ type: 'word', delayFrames: 2, order: 'sideways' })).ok,
      false,
    );
  });
});

describe('background alternation', () => {
  it('round-trips with and without a flip limit', () => {
    const { json, project } = roundTrip([
      engine.blankScene({
        text: 'strobe',
        backgroundMotion: { mode: 'alternate', everyFrames: 4, times: 6 },
      }),
      engine.blankScene({
        text: 'forever',
        backgroundMotion: { mode: 'alternate', everyFrames: 2 },
      }),
    ]);
    assert.deepEqual(json.scenes[0].backgroundMotion, {
      mode: 'ALTERNATE', everyFrames: 4, times: 6,
    });
    assert.deepEqual(json.scenes[1].backgroundMotion, { mode: 'ALTERNATE', everyFrames: 2 });
    assert.equal(project.scenes[0].backgroundMotion.times, 6);
    assert.equal(project.scenes[1].backgroundMotion.times, undefined);
  });

  it('rejects an interval below one frame or a fractional one', () => {
    const make = (motion) => JSON.stringify({
      title: 't', format: '9:16', width: 1080, height: 1920, fps: 30,
      scenes: [{
        id: 's1', start: 0, duration: 1, text: 'x', animation: 'PUNCH',
        direction: 'CENTER', alignment: 'CENTER', background: 'CREAM', case: 'lower',
        backgroundMotion: motion,
      }],
    });
    assert.equal(engine.parseProjectScript(make({ mode: 'ALTERNATE', everyFrames: 0 })).ok, false);
    assert.equal(engine.parseProjectScript(make({ mode: 'ALTERNATE', everyFrames: 1.5 })).ok, false);
    assert.equal(engine.parseProjectScript(make({ mode: 'STROBE', everyFrames: 4 })).ok, false);
  });
});

describe('phase-two fields are absent unless set', () => {
  it('adds nothing to a document that uses none of them', () => {
    const scenes = [engine.blankScene({ text: 'plain', duration: 0.9 })];
    const document = JSON.parse(engine.serialiseProject(scenes, 'Plain', {}, null, 'portrait'));
    for (const key of ['exit', 'exitFrames', 'stagger', 'backgroundMotion']) {
      assert.equal(document.scenes[0][key], undefined, `scene.${key} must not appear unless set`);
    }
  });

  it('settles after one round trip with every phase-two field set', () => {
    const scenes = [
      engine.blankScene({
        text: 'one two three',
        duration: 1,
        style: 'punch',
        exit: 'slide',
        exitFrames: 3,
        stagger: { type: 'word', delayFrames: 2, order: 'reverse' },
        backgroundMotion: { mode: 'alternate', everyFrames: 4, times: 8 },
        elements: [engine.element('one two three', {
          exit: 'none',
          stagger: { type: 'word', delayFrames: 1 },
        })],
      }),
    ];
    const first = engine.serialiseProject(scenes, 'Motion', {}, null, 'portrait');
    const parsed = engine.parseProjectScript(first);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.issues ?? []));
    const second = engine.serialiseProject(
      parsed.project.scenes, parsed.project.title, parsed.project.fields,
      parsed.project.overlay, parsed.project.format,
    );
    const third = engine.serialiseProject(
      engine.parseProjectScript(second).project.scenes, 'Motion', {}, null, 'portrait',
    );
    assert.equal(third, second, 'a second lap must change nothing');
  });
});
