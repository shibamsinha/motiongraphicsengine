#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadEngine } from './lib/engine.mjs';
import { buildSchemas } from './lib/schemas.mjs';
import { sweep } from './lib/idempotency.mjs';

import { registerProjectTools } from './tools/project.mjs';
import { registerSceneTools } from './tools/scene.mjs';
import { registerContentTools } from './tools/content.mjs';
import { registerTypographyTools } from './tools/typography.mjs';
import { registerMotionTools } from './tools/motion.mjs';
import { registerTimingTools } from './tools/timing.mjs';
import { registerAudioTools } from './tools/audio.mjs';
import { registerRenderTools } from './tools/render.mjs';
import { registerInspectTools } from './tools/inspect.mjs';

export const log = (...parts) => {
  process.stderr.write(`[mge-mcp] ${parts.join(' ')}\n`);
};

export const createServer = async () => {
  const engine = await loadEngine();
  const schemas = buildSchemas(engine);
  const ctx = { engine, schemas };

  const server = new McpServer(
    { name: 'motion-graphics-engine', version: '1.0.0' },
    {
      instructions:
        'Motion Graphics Engine is a kinetic-typography and 2D motion-graphics engine. A video is an ' +
        'ordered list of scenes; each scene holds text elements and optional graphic ' +
        'objects, and one audio track sits on the whole project. Motion is expressed as ' +
        'intent (an entrance, an emphasis, an exit) rather than keyframes — the engine has ' +
        'no keyframe model, no video elements, and no per-property typography such as ' +
        'font family or letter spacing. Prefer the high-level tools: apply_typography_style, ' +
        'apply_motion_style and sync_to_beats express intent and let the engine compute ' +
        'deterministic values. Start with inspect_project to see what exists.',
    },
  );

  registerProjectTools(server, ctx);
  registerSceneTools(server, ctx);
  registerContentTools(server, ctx);
  registerTypographyTools(server, ctx);
  registerMotionTools(server, ctx);
  registerTimingTools(server, ctx);
  registerAudioTools(server, ctx);
  registerRenderTools(server, ctx);
  registerInspectTools(server, ctx);

  return server;
};

const main = async () => {
  const started = Date.now();
  const server = await createServer();

  const swept = await sweep();
  if (swept > 0) log(`swept ${swept} expired idempotency records`);

  await server.connect(new StdioServerTransport());
  log(`ready in ${Date.now() - started}ms (stdio)`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    log('fatal:', error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
