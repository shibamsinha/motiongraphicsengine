import { z } from 'zod';

const enumOf = (values, name) => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`Engine vocabulary "${name}" is empty — the bundle is wrong.`);
  }
  return z.enum(values);
};

export const buildSchemas = (engine) => {
  const role = enumOf(engine.TEXT_ROLES, 'TEXT_ROLES');
  const size = enumOf(engine.SIZE_PRESETS, 'SIZE_PRESETS');
  const position = enumOf(engine.POSITION_PRESETS, 'POSITION_PRESETS');
  const composition = enumOf(engine.COMPOSITION_PRESETS, 'COMPOSITION_PRESETS');
  const visualStyle = enumOf(engine.VISUAL_STYLE_NAMES, 'VISUAL_STYLE_NAMES');
  const enterMotion = enumOf(engine.ENTER_NAMES, 'ENTER_NAMES');
  const emphasisMotion = enumOf(engine.EMPHASIS_NAMES, 'EMPHASIS_NAMES');
  const exitMotion = enumOf(engine.EXIT_NAMES, 'EXIT_NAMES');

  const animationStyle = enumOf(engine.ANIMATION_STYLES, 'ANIMATION_STYLES');
  const fontRole = enumOf(engine.FONT_ROLES, 'FONT_ROLES');

  const background = z.enum(['green', 'cream', 'black']);
  const alignment = z.enum(['left', 'center', 'right']);
  const textCase = z.enum(['lower', 'upper', 'as-typed']);
  const direction = z.enum(['left', 'right', 'top', 'bottom']);
  const format = z.enum(['portrait', 'landscape']);
  const shapeKind = z.enum(['rectangle', 'rounded', 'circle', 'line']);
  const motionSpeed = z.enum(['slow', 'medium', 'fast']);
  const motionDistance = z.enum(['small', 'medium', 'large']);

  const projectId = z
    .string()
    .regex(/^prj_[0-9a-f]{12}$/, 'Project ids look like prj_a1b2c3d4e5f6.')
    .describe('Project id from create_project or list_projects.');

  const sceneId = z.string().min(1).describe('Scene id from inspect_project or create_scene.');

  const elementId = z
    .string()
    .min(1)
    .describe(
      'Element or object id from inspect_scene. Text element ids are positional ' +
        '("0-1" = scene 0, element 1) and are renumbered when elements are added or ' +
        'removed, so re-read them after changing a scene. Object ids are stable.',
    );

  const durationInFrames = z
    .number()
    .int()
    .min(1)
    .max(Math.round(engine.MAX_SCENE_DURATION * 30))
    .describe(
      'Scene length in frames at 30fps. Exact, and takes precedence over `duration` ' +
        'if both are given.',
    );

  const enterFrames = z
    .number()
    .int()
    .min(1)
    .max(300)
    .describe(
      'How long the entrance takes, in frames. Overrides the style\'s own measured ' +
        'length; clamped to the scene if longer. Use it for fast cutting.',
    );

  const staggerFrames = z
    .number()
    .int()
    .min(0)
    .max(60)
    .describe('Frames between one word entering and the next. 0 means together.');

  const staggerOrder = z
    .enum(['forward', 'reverse'])
    .describe('Which end reveals first. Forward is reading order.');

  const exitFrames = z
    .number()
    .int()
    .min(0)
    .max(120)
    .describe('How long the exit takes, in frames. 0 removes the overlap entirely.');

  const fitWidth = z
    .number()
    .min(0.05)
    .max(1)
    .describe(
      'Fit the type to this share of the frame width (e.g. 0.88) and never clip. ' +
        'Overrides the size preset.',
    );

  const duration = z
    .number()
    .min(engine.MIN_SCENE_DURATION)
    .max(engine.MAX_SCENE_DURATION)
    .describe(
      `Seconds, ${engine.MIN_SCENE_DURATION}–${engine.MAX_SCENE_DURATION}. ` +
        'Snapped to the 30fps frame grid on save.',
    );

  const hexColor = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour such as #4ADE6A.');

  const confirm = z
    .boolean()
    .optional()
    .describe('Must be true to proceed. Without it the call is refused and nothing is deleted.');

  const idempotencyKey = z
    .string()
    .min(8)
    .max(128)
    .optional()
    .describe(
      'Optional client-generated key. Repeating a call with the same key returns the ' +
        'first result instead of performing the operation again.',
    );

  return {
    fontRole, durationInFrames, enterFrames, fitWidth,
    staggerFrames, staggerOrder, exitFrames,
    role, size, position, composition, visualStyle,
    enterMotion, emphasisMotion, exitMotion,
    animationStyle, background, alignment, textCase, direction, format,
    shapeKind, motionSpeed, motionDistance,
    projectId, sceneId, elementId, duration, hexColor, confirm, idempotencyKey,
  };
};
