import { z } from 'zod';

import { confirmationRequired, guard, ok, validationError } from '../lib/errors.mjs';
import { once } from '../lib/idempotency.mjs';
import { sceneDetail, sceneRow } from '../lib/summary.mjs';
import { definedOnly, requireScene, replaceScene } from '../lib/scenes.mjs';
import { mutateProject, readProject } from '../lib/store.mjs';
import { projectSummary } from '../lib/summary.mjs';

const framesToSeconds = (args, engine) => {
  if (args.durationInFrames !== undefined) {
    return engine.framesToSeconds(args.durationInFrames, engine.canvasFor('portrait').fps);
  }
  return args.duration;
};

const staggerFrom = (args) =>
  args.staggerFrames === undefined
    ? undefined
    : {
        type: 'word',
        delayFrames: args.staggerFrames,
        ...(args.staggerOrder && args.staggerOrder !== 'forward'
          ? { order: args.staggerOrder }
          : {}),
      };

const backgroundMotionFrom = (args) =>
  args.backgroundEveryFrames === undefined
    ? undefined
    : {
        mode: 'alternate',
        everyFrames: args.backgroundEveryFrames,
        ...(args.backgroundTimes !== undefined ? { times: args.backgroundTimes } : {}),
      };

const sceneFields = (s) => ({
  text: z.string().min(1).optional(),
  duration: s.duration.optional().describe('Seconds.'),
  durationInFrames: s.durationInFrames.optional(),
  enterFrames: s.enterFrames.optional(),
  fitWidth: s.fitWidth.optional(),
  fontRole: s.fontRole.optional(),
  exit: s.animationStyle.optional().describe('How the type leaves. NONE makes the boundary a hard cut.'),
  exitFrames: s.exitFrames.optional(),
  staggerFrames: s.staggerFrames.optional(),
  staggerOrder: s.staggerOrder.optional(),
  backgroundEveryFrames: z
    .number().int().min(1).max(120).optional()
    .describe('Alternate the field every N frames while the type holds still.'),
  backgroundTimes: z
    .number().int().min(0).max(200).optional()
    .describe('How many background flips to make. Omitted means for the whole scene.'),
  style: s.animationStyle.optional().describe('NONE holds the type completely still — a hard cut.'),
  background: s.background.optional(),
  alignment: s.alignment.optional(),
  case: s.textCase.optional(),
  composition: s.composition.optional(),
  visualStyle: s.visualStyle.optional(),
  emphasis: z.array(z.string()).optional(),
  flipBackground: z.boolean().optional(),
  note: z.string().max(500).optional().describe('A direction for humans. Never rendered.'),
});

const scenePatch = (args, engine) =>
  definedOnly({
    text: args.text,
    duration: framesToSeconds(args, engine),
    enterFrames: args.enterFrames,
    fit: args.fitWidth === undefined ? undefined : { mode: 'width', maxWidth: args.fitWidth },
    fontRole: args.fontRole,
    exit: args.exit,
    exitFrames: args.exitFrames,
    stagger: staggerFrom(args),
    backgroundMotion: backgroundMotionFrom(args),
    style: args.style,
    background: args.background,
    alignment: args.alignment,
    case: args.case,
    composition: args.composition,
    visualStyle: args.visualStyle,
    emphasis: args.emphasis,
    flipBackground: args.flipBackground,
    note: args.note,
  });

export const registerSceneTools = (server, ctx) => {
  const { engine, schemas: s } = ctx;

  server.registerTool(
    'create_scene',
    {
      title: 'Create scene',
      description:
        'Append a scene, or insert one at `index`. Text is required — a scene with no text, ' +
        'elements or objects cannot render. Returns the new scene and the project summary.',
      inputSchema: {
        projectId: s.projectId,
        text: z.string().min(1).describe('Scene copy. Newlines separate lines.'),
        duration: s.duration.optional().describe('Seconds. Defaults to 0.8s.'),
        durationInFrames: s.durationInFrames.optional(),
        enterFrames: s.enterFrames.optional(),
        fitWidth: s.fitWidth.optional(),
        fontRole: s.fontRole.optional().describe('PRIMARY (house sans) or ACCENT (serif italic).'),
        exit: s.animationStyle.optional().describe('How the type leaves. NONE makes the boundary a hard cut. Defaults to `style`.'),
        exitFrames: s.exitFrames.optional(),
        staggerFrames: s.staggerFrames.optional(),
        staggerOrder: s.staggerOrder.optional(),
        backgroundEveryFrames: z
          .number().int().min(1).max(120).optional()
          .describe('Alternate the field every N frames while the type holds still.'),
        backgroundTimes: z
          .number().int().min(0).max(200).optional()
          .describe('How many background flips to make. Omitted means for the whole scene.'),
        style: s.animationStyle.optional().describe('How the type moves. Defaults to punch.'),
        background: s.background.optional().describe('Field colour. Defaults to cream.'),
        alignment: s.alignment.optional(),
        case: s.textCase.optional(),
        composition: s.composition.optional().describe('Layout of multiple elements.'),
        emphasis: z.array(z.string()).optional().describe('Words to highlight in the accent colour.'),
        index: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Insert position. Appends to the end when omitted.'),
        idempotencyKey: s.idempotencyKey,
      },
    },
    guard(async (args) =>
      once('create_scene', args.idempotencyKey, async () => {
        let created = null;
        const stored = await mutateProject(args.projectId, (project) => {
          const scene = engine.blankScene(
            definedOnly({
              text: args.text,
              duration: framesToSeconds(args, engine),
              enterFrames: args.enterFrames,
              fit: args.fitWidth === undefined ? undefined : { mode: 'width', maxWidth: args.fitWidth },
              fontRole: args.fontRole,
              exit: args.exit,
              exitFrames: args.exitFrames,
              stagger: staggerFrom(args),
              backgroundMotion: backgroundMotionFrom(args),
              style: args.style,
              background: args.background,
              alignment: args.alignment,
              case: args.case,
              composition: args.composition,
              emphasis: args.emphasis,
            }),
          );
          created = scene;
          const scenes = [...project.scenes];
          const at = args.index === undefined ? scenes.length : Math.min(args.index, scenes.length);
          scenes.splice(at, 0, scene);
          return { ...project, scenes };
        });

        const canvas = engine.canvasFor(stored.project.format);
        const timeline = engine.buildTimeline(stored.project.scenes, canvas.fps);
        const index = stored.project.scenes.findIndex((scene) => scene.id === created.id);

        return ok({
          scene: sceneRow(stored.project.scenes[index], timeline[index]),
          project: projectSummary(stored, engine),
        });
      }),
    ),
  );

  server.registerTool(
    'update_scenes',
    {
      title: 'Update scenes (bulk)',
      description:
        'Change several scenes in one call, each with its own values. Prefer this over a ' +
        'run of update_scene calls: it is one read-modify-write, so either every change ' +
        'lands or none does, and the whole batch is validated before anything is touched.\n' +
        'Each entry needs a sceneId plus the fields to change. A scene may appear only once.',
      inputSchema: {
        projectId: s.projectId,
        updates: z
          .array(z.object({ sceneId: s.sceneId, ...sceneFields(s) }).strict())
          .min(1)
          .max(200)
          .describe('One entry per scene to change.'),
        idempotencyKey: s.idempotencyKey,
      },
    },
    guard(async (args) =>
      once('update_scenes', args.idempotencyKey, async () => {
        const stored = await mutateProject(args.projectId, (project) => {
          const seen = new Set();
          const planned = args.updates.map((update) => {
            if (seen.has(update.sceneId)) {
              throw validationError(
                `Scene ${update.sceneId} appears more than once. Combine the changes into ` +
                  'one entry — two entries for the same scene have no defined order.',
                { sceneId: update.sceneId },
              );
            }
            seen.add(update.sceneId);

            const { index } = requireScene(project, update.sceneId);
            const patch = scenePatch(update, engine);
            if (Object.keys(patch).length === 0) {
              throw validationError(
                `The entry for scene ${update.sceneId} changes nothing — give it at least one field.`,
                { sceneId: update.sceneId },
              );
            }
            return { index, patch };
          });

          const scenes = [...project.scenes];
          for (const { index, patch } of planned) {
            scenes[index] = { ...scenes[index], ...patch };
          }
          return { ...project, scenes };
        });

        return ok({
          updated: args.updates.length,
          project: projectSummary(stored, engine),
        });
      }),
    ),
  );

  server.registerTool(
    'apply_to_scenes',
    {
      title: 'Apply to scenes (bulk)',
      description:
        'Apply the *same* change to many scenes at once — "make these all black", "give the ' +
        'first four a two-frame entrance". Select either by `sceneIds` or by an index range ' +
        '(`fromIndex`/`toIndex`, inclusive); with neither, it applies to every scene.\n' +
        'Use update_scenes instead when each scene needs different values.',
      inputSchema: {
        projectId: s.projectId,
        sceneIds: z.array(s.sceneId).min(1).optional().describe('Explicit selection.'),
        fromIndex: z.number().int().min(0).optional().describe('First scene index, inclusive.'),
        toIndex: z.number().int().min(0).optional().describe('Last scene index, inclusive.'),
        ...sceneFields(s),
        idempotencyKey: s.idempotencyKey,
      },
    },
    guard(async (args) =>
      once('apply_to_scenes', args.idempotencyKey, async () => {
        if (args.sceneIds && (args.fromIndex !== undefined || args.toIndex !== undefined)) {
          throw validationError('Select by `sceneIds` or by an index range, not both.');
        }
        const patch = scenePatch(args, engine);
        if (Object.keys(patch).length === 0) {
          throw validationError('Nothing to change — pass at least one field.');
        }

        let touched = [];
        const stored = await mutateProject(args.projectId, (project) => {
          let indexes;
          if (args.sceneIds) {
            indexes = args.sceneIds.map((id) => requireScene(project, id).index);
          } else if (args.fromIndex !== undefined || args.toIndex !== undefined) {
            const from = args.fromIndex ?? 0;
            const to = args.toIndex ?? project.scenes.length - 1;
            if (from > to) {
              throw validationError(`fromIndex ${from} is after toIndex ${to}.`);
            }
            if (from >= project.scenes.length) {
              throw validationError(
                `fromIndex ${from} is past the end — this project has ${project.scenes.length} scenes.`,
                { sceneCount: project.scenes.length },
              );
            }
            indexes = [];
            for (let i = from; i <= Math.min(to, project.scenes.length - 1); i++) indexes.push(i);
          } else {
            indexes = project.scenes.map((_scene, i) => i);
          }

          const wanted = new Set(indexes);
          touched = indexes.map((i) => project.scenes[i].id);
          return {
            ...project,
            scenes: project.scenes.map((scene, i) =>
              wanted.has(i) ? { ...scene, ...patch } : scene,
            ),
          };
        });

        return ok({
          updated: touched.length,
          sceneIds: touched,
          project: projectSummary(stored, engine),
        });
      }),
    ),
  );

  server.registerTool(
    'phrase_build',
    {
      title: 'Phrase build',
      description:
        'Turn one sentence into a run of kinetic-typography scenes: broken into phrase ' +
        'cards, revealed word by word, pace tightening, final word promoted to display ' +
        'size on its own card.\n' +
        'This is the highest-leverage tool here — it does in one call what is otherwise six ' +
        'or eight create_scene/add_text/update_scene chains. What it produces is ORDINARY ' +
        'SCENES: nothing is locked, and every choice it makes (the breaks, the cut lengths, ' +
        'the promoted word) is a normal field you can edit afterwards with update_scene.\n' +
        'Override any of its judgements: `phrases` for the breaks, `framesPerPhrase` for an ' +
        'exact cut list, `pacing` for the curve.',
      inputSchema: {
        projectId: s.projectId,
        sentence: z.string().min(1).max(600).describe('The whole sentence.'),
        phrases: z
          .array(z.string().min(1))
          .min(1)
          .max(40)
          .optional()
          .describe('Explicit phrase breaks, in order. Otherwise broken on punctuation, then by word count.'),
        totalFrames: z
          .number().int().min(6).max(3000).optional()
          .describe('Frames for the whole build. Default 90 (3s).'),
        framesPerPhrase: z
          .array(z.number().int().min(3).max(600))
          .min(1)
          .max(40)
          .optional()
          .describe('Exact cut list, one per card. Wins over totalFrames and pacing.'),
        pacing: z
          .enum(['even', 'accelerate', 'decelerate'])
          .optional()
          .describe('accelerate (default) shortens each successive card — it is what makes a build feel like it is arriving.'),
        finalWordEmphasis: z
          .boolean().optional()
          .describe('Give the last word its own display-size card. Default true.'),
        staggerFrames: s.staggerFrames.optional().describe('Frames between words inside a card. Default 2.'),
        enterFrames: s.enterFrames.optional().describe('Entrance length per card. Default 2.'),
        style: s.animationStyle.optional().describe('Phrase-card animation. Default punch.'),
        finalStyle: s.animationStyle.optional().describe('The payoff card. Default massive.'),
        background: s.background.optional().describe('Default cream.'),
        finalStrobeFrames: z
          .number().int().min(1).max(120).optional()
          .describe('Alternate the field every N frames on the payoff card.'),
        fitWidth: s.fitWidth.optional().describe('Fit every card to this share of the frame.'),
        replace: z
          .boolean().optional()
          .describe('Replace the project\'s scenes entirely. Default false — the build is appended.'),
        idempotencyKey: s.idempotencyKey,
      },
    },
    guard(async (args) =>
      once('phrase_build', args.idempotencyKey, async () => {
        const built = engine.buildPhraseScenes({
          sentence: args.sentence,
          ...(args.phrases ? { phrases: args.phrases } : {}),
          ...(args.totalFrames !== undefined ? { totalFrames: args.totalFrames } : {}),
          ...(args.framesPerPhrase ? { framesPerPhrase: args.framesPerPhrase } : {}),
          ...(args.pacing ? { pacing: args.pacing } : {}),
          ...(args.finalWordEmphasis !== undefined
            ? { finalWordEmphasis: args.finalWordEmphasis } : {}),
          ...(args.staggerFrames !== undefined ? { staggerFrames: args.staggerFrames } : {}),
          ...(args.enterFrames !== undefined ? { enterFrames: args.enterFrames } : {}),
          ...(args.style ? { style: args.style } : {}),
          ...(args.finalStyle ? { finalStyle: args.finalStyle } : {}),
          ...(args.background ? { background: args.background } : {}),
          ...(args.finalStrobeFrames !== undefined
            ? { finalStrobeFrames: args.finalStrobeFrames } : {}),
          ...(args.fitWidth !== undefined ? { fitWidth: args.fitWidth } : {}),
        });

        if (built.scenes.length === 0) {
          throw validationError(
            'That sentence produced no phrases — it may be empty or punctuation only.',
            { sentence: args.sentence },
          );
        }

        const stored = await mutateProject(args.projectId, (project) => ({
          ...project,
          scenes: args.replace ? built.scenes : [...project.scenes, ...built.scenes],
        }));

        const summary = projectSummary(stored, engine);
        const created = summary.scenes.slice(
          args.replace ? 0 : summary.scenes.length - built.scenes.length,
        );

        return ok({
          phrases: built.phrases,
          finalWord: built.finalWord,
          framesPerPhrase: built.framesPerPhrase,
          created,
          note: 'These are ordinary scenes — edit any of them with update_scene or update_scenes.',
          project: summary,
        });
      }),
    ),
  );

  server.registerTool(
    'get_scene',
    {
      title: 'Get scene',
      description:
        'One scene in full: its copy, style, composition, every text element and every ' +
        'object with its motion. This is the detailed view — use inspect_project for an overview.',
      inputSchema: { projectId: s.projectId, sceneId: s.sceneId },
    },
    guard(async (args) => {
      const stored = await readProject(args.projectId);
      const { index } = requireScene(stored.project, args.sceneId);
      const canvas = engine.canvasFor(stored.project.format);
      const timeline = engine.buildTimeline(stored.project.scenes, canvas.fps);
      return ok({ scene: sceneDetail(stored.project.scenes[index], timeline[index]) });
    }),
  );

  server.registerTool(
    'update_scene',
    {
      title: 'Update scene',
      description:
        'Change a scene\'s copy, duration, animation style, background, alignment, case, ' +
        'composition or emphasis words. Only the fields you pass are touched.',
      inputSchema: {
        projectId: s.projectId,
        sceneId: s.sceneId,
        ...sceneFields(s),
      },
    },
    guard(async (args) => {
      const patch = scenePatch(args, engine);
      if (Object.keys(patch).length === 0) {
        throw validationError('Nothing to change — pass at least one field to update.');
      }

      const stored = await mutateProject(args.projectId, (project) => {
        const { scene, index } = requireScene(project, args.sceneId);
        return replaceScene(project, index, { ...scene, ...patch });
      });

      const canvas = engine.canvasFor(stored.project.format);
      const timeline = engine.buildTimeline(stored.project.scenes, canvas.fps);
      const { index } = requireScene(stored.project, args.sceneId);
      return ok({ scene: sceneDetail(stored.project.scenes[index], timeline[index]) });
    }),
  );

  server.registerTool(
    'duplicate_scene',
    {
      title: 'Duplicate scene',
      description:
        'Copy a scene, including its elements and objects, and insert the copy directly ' +
        'after the original. Every id in the copy is fresh, so the two share nothing.',
      inputSchema: { projectId: s.projectId, sceneId: s.sceneId, idempotencyKey: s.idempotencyKey },
    },
    guard(async (args) =>
      once('duplicate_scene', args.idempotencyKey, async () => {
        let copyId = null;
        const stored = await mutateProject(args.projectId, (project) => {
          const { scene, index } = requireScene(project, args.sceneId);

          const reidObject = (object) => ({
            ...object,
            id: engine.makeElementId(),
            ...(object.children ? { children: object.children.map(reidObject) } : {}),
          });

          const copy = {
            ...structuredClone(scene),
            id: engine.makeSceneId(),
            ...(scene.elements
              ? { elements: scene.elements.map((el) => ({ ...el, id: engine.makeElementId() })) }
              : {}),
            ...(scene.objects ? { objects: scene.objects.map(reidObject) } : {}),
          };
          copyId = copy.id;

          const scenes = [...project.scenes];
          scenes.splice(index + 1, 0, copy);
          return { ...project, scenes };
        });

        return ok({ sceneId: copyId, copiedFrom: args.sceneId, project: projectSummary(stored, engine) });
      }),
    ),
  );

  server.registerTool(
    'reorder_scenes',
    {
      title: 'Reorder scenes',
      description:
        'Set the scene order by listing every scene id in the order you want. The list must ' +
        'name each scene exactly once — a partial list is rejected rather than guessed at.',
      inputSchema: {
        projectId: s.projectId,
        sceneIds: z.array(s.sceneId).min(1).describe('Every scene id, in the new order.'),
      },
    },
    guard(async (args) => {
      const stored = await mutateProject(args.projectId, (project) => {
        const current = project.scenes.map((scene) => scene.id);
        const wanted = args.sceneIds;

        const missing = current.filter((id) => !wanted.includes(id));
        const unknown = wanted.filter((id) => !current.includes(id));
        if (unknown.length || missing.length || wanted.length !== current.length) {
          throw validationError(
            'sceneIds must list every scene in this project exactly once.',
            { expected: current, received: wanted, missing, unknown },
          );
        }

        return { ...project, scenes: wanted.map((id) => project.scenes.find((sc) => sc.id === id)) };
      });

      return ok({ project: projectSummary(stored, engine) });
    }),
  );

  server.registerTool(
    'delete_scene',
    {
      title: 'Delete scene',
      description:
        'Remove a scene. Destructive: requires `confirm: true`. A project cannot be left ' +
        'with zero scenes, so deleting the last one is refused.',
      inputSchema: { projectId: s.projectId, sceneId: s.sceneId, confirm: s.confirm },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    guard(async (args) => {
      const before = await readProject(args.projectId);
      const { scene } = requireScene(before.project, args.sceneId);

      if (before.project.scenes.length === 1) {
        throw validationError(
          'This is the only scene — a project must keep at least one, because a ' +
            'zero-frame composition cannot render. Update it instead, or delete the project.',
          { sceneId: args.sceneId },
        );
      }
      if (args.confirm !== true) {
        throw confirmationRequired(
          `This deletes scene "${scene.text.replace(/\s+/g, ' ').slice(0, 40)}" and cannot be undone. ` +
            'Re-send with confirm: true to proceed.',
          { sceneId: args.sceneId },
        );
      }

      const stored = await mutateProject(args.projectId, (project) => ({
        ...project,
        scenes: project.scenes.filter((candidate) => candidate.id !== args.sceneId),
      }));

      return ok({ deleted: args.sceneId, project: projectSummary(stored, engine) });
    }),
  );
};
