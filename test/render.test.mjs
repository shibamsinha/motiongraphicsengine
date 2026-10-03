import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { loadEngine } from '../mcp/lib/engine.mjs';
import { health, outPath, renderStill } from '../mcp/lib/render-client.mjs';
import { inkColumns, pixelAt, readPng } from './png.mjs';

let engine;
let serverUp = false;
const rendered = [];

before(async () => {
  engine = await loadEngine();
  try {
    await health();
    serverUp = true;
  } catch {
    serverUp = false;
  }
});

after(() => {
  for (const file of rendered) fs.rmSync(file, { force: true });
});

const still = async (scenes, frame, options = {}) => {
  const result = await renderStill({
    scenes,
    palette: options.palette ?? 'forest',
    fields: options.fields ?? {},
    ...(options.ink ? { ink: options.ink } : {}),
    ...(options.accent ? { accent: options.accent } : {}),
    frame,
  });
  const file = outPath(result.filename);
  rendered.push(file);
  const bytes = fs.readFileSync(file);
  return {
    path: file,
    hash: createHash('sha1').update(bytes).digest('hex'),
    width: result.width,
    height: result.height,
    png: readPng(file),
  };
};

const scene = (overrides) =>
  engine.blankScene({ text: 'discipline', duration: 1.5, background: 'cream', ...overrides });

describe('animation: none renders as a genuine hold', () => {
  it('produces byte-identical frames across the whole scene', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = [scene({ style: 'none' })];
    const [a, b, c] = await Promise.all([
      still(scenes, 1), still(scenes, 22), still(scenes, 44),
    ]);

    assert.equal(a.hash, b.hash, 'frame 1 and frame 22 must be identical');
    assert.equal(b.hash, c.hash, 'frame 22 and frame 44 must be identical');
  });

  it('is fully opaque from its first frame — no fade-in at all', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = [scene({ style: 'none' })];
    const first = await still(scenes, 0);
    const later = await still(scenes, 30);
    assert.equal(first.hash, later.hash, 'frame 0 must already be the final image');
  });

  it('CONTROL: an animated scene does change between the same frames', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = [scene({ style: 'punch' })];
    const [a, b] = await Promise.all([still(scenes, 1), still(scenes, 22)]);
    assert.notEqual(
      a.hash, b.hash,
      'PUNCH must differ between frames, or the comparison above proves nothing',
    );
  });
});

describe('explicit entrance duration changes when motion stops', () => {
  it('a 2-frame entrance has settled by frame 4; the default has not', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const fast = [scene({ style: 'punch', enterFrames: 2 })];
    const normal = [scene({ style: 'punch' })];

    const [fastEarly, fastLate] = await Promise.all([still(fast, 4), still(fast, 30)]);
    assert.equal(fastEarly.hash, fastLate.hash, 'a 2-frame entrance must be over by frame 4');

    const [slowEarly, slowLate] = await Promise.all([still(normal, 4), still(normal, 30)]);
    assert.notEqual(
      slowEarly.hash, slowLate.hash,
      'the default entrance should still be resolving at frame 4',
    );
  });

  it('clamps an entrance longer than the scene instead of overrunning', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = [scene({ duration: 7 / 30, style: 'punch', enterFrames: 40 })];
    const last = await still(scenes, 6);
    const settled = await still([scene({ duration: 7 / 30, style: 'none' })], 6);
    const cream = [238, 238, 238];
    const movingInk = inkColumns(last.png, Math.round(last.height / 2), cream);
    const staticInk = inkColumns(settled.png, Math.round(settled.height / 2), cream);
    assert.ok(movingInk.length > 0, 'the clamped entrance must have drawn something');
    assert.ok(
      Math.abs(movingInk.length - staticInk.length) / Math.max(1, staticInk.length) < 0.25,
      'a clamped entrance should be essentially arrived by the last frame',
    );
  });
});

describe('custom palette reaches the pixels', () => {
  it('paints an arbitrary background and an explicit ink', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = [scene({ style: 'none', background: 'green' })];
    const frame = await still(scenes, 20, {
      fields: { green: '#1A0DCC' },
      ink: { green: '#FFFFFF' },
    });

    const corner = pixelAt(frame.png, 4, 4);
    assert.deepEqual(corner, [0x1a, 0x0d, 0xcc], `expected #1A0DCC, got ${corner}`);

    const row = Math.round(frame.height / 2);
    const ink = inkColumns(frame.png, row, [0x1a, 0x0d, 0xcc]);
    assert.ok(ink.length > 50, 'the type should be visible against the custom field');
    const sample = pixelAt(frame.png, ink[Math.floor(ink.length / 2)], row);
    assert.ok(
      sample[0] > 200 && sample[1] > 200 && sample[2] > 200,
      `expected white ink, got ${sample}`,
    );
  });

  it('CONTROL: without overrides the house field is unchanged', async (t) => {
    if (!serverUp) return t.skip('render server not running');
    const frame = await still([scene({ style: 'none', background: 'green' })], 20);
    const corner = pixelAt(frame.png, 4, 4);
    assert.deepEqual(corner, [0x13, 0x58, 0x1d], `expected the house green, got ${corner}`);
  });
});

describe('fit-to-width never clips', () => {
  const cream = [238, 238, 238];

  for (const [label, text] of [
    ['short text', 'go'],
    ['ordinary text', 'discipline'],
    ['long text', 'consistency beats motivation'],
    ['very long text', 'the quiet compounding of unglamorous daily work'],
  ]) {
    it(`keeps ${label} inside the frame at 88%`, async (t) => {
      if (!serverUp) return t.skip('render server not running');

      const scenes = [
        scene({
          text,
          style: 'none',
          background: 'cream',
          elements: [engine.element(text, { fit: { mode: 'width', maxWidth: 0.88 } })],
        }),
      ];
      const frame = await still(scenes, 20);

      let min = Infinity;
      let max = -Infinity;
      for (const fraction of [0.42, 0.46, 0.5, 0.54, 0.58]) {
        const row = Math.round(frame.height * fraction);
        const columns = inkColumns(frame.png, row, cream);
        if (columns.length === 0) continue;
        min = Math.min(min, columns[0]);
        max = Math.max(max, columns[columns.length - 1]);
      }

      assert.ok(Number.isFinite(min), `no ink found for "${text}"`);
      const width = (max - min) / frame.width;
      assert.ok(min >= -2, `"${text}" clipped at the left edge (min ${min})`);
      assert.ok(max <= frame.width + 2, `"${text}" clipped at the right edge (max ${max})`);
      assert.ok(
        width <= 0.9,
        `"${text}" measured ${(width * 100).toFixed(1)}% of the frame, over the 88% fit`,
      );
    });
  }

  it('CONTROL: OVERSIZED is still allowed to bleed past the frame', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = [
      scene({
        text: 'more',
        style: 'none',
        background: 'cream',
        elements: [engine.element('more', { size: 'oversized' })],
      }),
    ];
    const frame = await still(scenes, 20);
    const row = Math.round(frame.height / 2);
    const columns = inkColumns(frame.png, row, cream);
    assert.ok(columns.length > 0, 'expected ink');
    assert.ok(
      columns[0] <= 2 || columns[columns.length - 1] >= frame.width - 3,
      'OVERSIZED should still touch or exceed the frame edge',
    );
  });
});

describe('accent typeface renders as a different face', () => {
  it('measures and paints differently from the primary face', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const text = 'motivation';
    const primary = await still([
      scene({ text, style: 'none', background: 'cream',
        elements: [engine.element(text, { fontRole: 'primary' })] }),
    ], 20);
    const accent = await still([
      scene({ text, style: 'none', background: 'cream',
        elements: [engine.element(text, { fontRole: 'accent' })] }),
    ], 20);

    assert.notEqual(
      primary.hash, accent.hash,
      'the accent face must actually change the rendered image',
    );
  });
});

describe('background alternation renders as a strobe', () => {
  const alternating = (everyFrames, times) => [
    engine.blankScene({
      text: 'hold',
      duration: 2,
      style: 'none',
      background: 'cream',
      backgroundMotion: { mode: 'alternate', everyFrames, ...(times ? { times } : {}) },
    }),
  ];

  it('flips the field on the interval and holds it between flips', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = alternating(4);
    const [a0, a3, b4, b7, c8] = await Promise.all([
      still(scenes, 0), still(scenes, 3), still(scenes, 4), still(scenes, 7), still(scenes, 8),
    ]);

    assert.equal(a0.hash, a3.hash, 'the field must hold for the whole interval');
    assert.equal(b4.hash, b7.hash, 'the second interval must hold too');
    assert.notEqual(a3.hash, b4.hash, 'the field must change on the interval boundary');
    assert.equal(a0.hash, c8.hash, 'the third interval must return to the first field');
  });

  it('changes only the field — the type does not move', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = alternating(4);
    const first = await still(scenes, 1);
    const flipped = await still(scenes, 5);

    const a = pixelAt(first.png, 4, 4);
    const b = pixelAt(flipped.png, 4, 4);
    assert.notDeepEqual(a, b, 'the field colour should have alternated');

    const row = Math.round(first.height / 2);
    const inkA = inkColumns(first.png, row, a);
    const inkB = inkColumns(flipped.png, row, b);
    assert.ok(inkA.length > 0 && inkB.length > 0, 'expected ink in both frames');
    assert.equal(inkA[0], inkB[0], 'the type moved horizontally between flips');
    assert.equal(inkA[inkA.length - 1], inkB[inkB.length - 1], 'the type changed width');
  });

  it('stops after `times` flips and stays on the last field', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = alternating(4, 1);
    const [before, after, later] = await Promise.all([
      still(scenes, 1), still(scenes, 5), still(scenes, 20),
    ]);
    assert.notEqual(before.hash, after.hash, 'the single flip should have happened');
    assert.equal(after.hash, later.hash, 'no further flips after the limit');
  });

  it('CONTROL: a scene without alternation holds one field throughout', async (t) => {
    if (!serverUp) return t.skip('render server not running');
    const scenes = [scene({ style: 'none', duration: 2 })];
    const [a, b] = await Promise.all([still(scenes, 1), still(scenes, 20)]);
    assert.equal(a.hash, b.hash);
  });
});

describe('word stagger reveals words one at a time', () => {
  const staggered = (delayFrames, order) => [
    engine.blankScene({
      text: 'one two three four',
      duration: 2,
      style: 'punch',
      background: 'cream',
      enterFrames: 1,
      stagger: { type: 'word', delayFrames, ...(order ? { order } : {}) },
    }),
  ];

  const inkAmount = (frame) => {
    const cream = [238, 238, 238];
    let total = 0;
    for (const fraction of [0.44, 0.48, 0.52, 0.56]) {
      total += inkColumns(frame.png, Math.round(frame.height * fraction), cream).length;
    }
    return total;
  };

  it('adds words progressively rather than all at once', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = staggered(4);
    const frames = await Promise.all([still(scenes, 1), still(scenes, 6), still(scenes, 14)]);
    const amounts = frames.map(inkAmount);

    assert.ok(amounts[0] > 0, 'the first word should already be in');
    assert.ok(amounts[1] > amounts[0], `expected more ink by frame 6, got ${amounts}`);
    assert.ok(amounts[2] > amounts[1], `expected still more by frame 14, got ${amounts}`);
  });

  it('reverses which end starts first', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const [forwardEarly, reverseEarly] = await Promise.all([
      still(staggered(5, 'forward'), 1),
      still(staggered(5, 'reverse'), 1),
    ]);
    assert.notEqual(
      forwardEarly.hash, reverseEarly.hash,
      'forward and reverse should reveal different words first',
    );

    const [forwardLate, reverseLate] = await Promise.all([
      still(staggered(5, 'forward'), 40),
      still(staggered(5, 'reverse'), 40),
    ]);
    assert.equal(
      forwardLate.hash, reverseLate.hash,
      'once every word is in, order should make no difference',
    );
  });

  it('CONTROL: zero stagger puts every word in together', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const scenes = staggered(0);
    const [early, late] = await Promise.all([still(scenes, 3), still(scenes, 20)]);
    assert.equal(
      inkAmount(early), inkAmount(late),
      'with no stagger the whole line should already be in',
    );
  });
});

describe('text exits, all four combinations', () => {
  const pair = (style, exit) => [
    engine.blankScene({ text: 'leaving', duration: 1, style, exit, background: 'cream' }),
    engine.blankScene({ text: 'arriving', duration: 1, style: 'none', background: 'cream' }),
  ];

  const seamInk = async (scenes) => {
    const cream = [238, 238, 238];
    const frame = await still(scenes, 31);
    let total = 0;
    for (const fraction of [0.40, 0.45, 0.5, 0.55, 0.6]) {
      total += inkColumns(frame.png, Math.round(frame.height * fraction), cream).length;
    }
    return total;
  };

  it('an explicit exit draws outgoing type at the seam', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const withExit = await seamInk(pair('punch', 'punch'));
    const withoutExit = await seamInk(pair('punch', 'none'));

    assert.ok(
      withExit > withoutExit,
      `exit:punch should leave more ink at the seam than exit:none (${withExit} vs ${withoutExit})`,
    );
  });

  it('expresses all four enter/exit corners and renders each', async (t) => {
    if (!serverUp) return t.skip('render server not running');

    const results = {};
    for (const [style, exit] of [
      ['punch', 'punch'], ['punch', 'none'], ['none', 'punch'], ['none', 'none'],
    ]) {
      results[`${style}/${exit}`] = await seamInk(pair(style, exit));
    }

    for (const [label, amount] of Object.entries(results)) {
      assert.ok(amount > 0, `${label} rendered nothing at the seam`);
    }
    assert.ok(results['punch/punch'] > results['punch/none'], JSON.stringify(results));
    assert.ok(results['none/punch'] > results['none/none'], JSON.stringify(results));
  });
});
