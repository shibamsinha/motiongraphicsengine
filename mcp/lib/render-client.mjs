import nodePath from 'node:path';

import { config } from '../../server/config.mjs';
import { renderFailed, unavailable, validationError } from './errors.mjs';

const PORT = Number(process.env.MGE_RENDER_PORT ?? 5311);
const BASE = process.env.MGE_RENDER_URL ?? `http://localhost:${PORT}`;

const DEFAULT_TIMEOUT_MS = 120_000;

export const outPath = (filename) =>
  nodePath.join(config.outDir, nodePath.basename(String(filename ?? '')));

const authHeaders = () =>
  config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {};

const call = async (path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...authHeaders(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw unavailable(`The render server did not respond within ${timeoutMs / 1000}s.`);
    }
    throw unavailable(
      `Cannot reach the render server at ${BASE}. Start it with \`npm run dev\` ` +
        '(or `npm run dev:render` for the renderer alone).',
      { baseUrl: BASE, cause: error.message },
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw renderFailed(`The render server returned something that is not JSON: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const message = payload.error ?? `Render server returned ${response.status}.`;
    if (response.status === 404) throw validationError(message, payload);
    if (response.status >= 500) throw unavailable(message, payload);
    throw renderFailed(message, { status: response.status, ...payload });
  }

  return payload;
};

export const health = () => call('/api/health', { timeoutMs: 4000 });

export const startRender = (payload) =>
  call('/api/render', { method: 'POST', body: payload });

export const renderStatus = (jobId) =>
  call(`/api/render/${encodeURIComponent(jobId)}`, { timeoutMs: 10_000 });

export const cancelRender = (jobId) =>
  call(`/api/render/${encodeURIComponent(jobId)}`, { method: 'DELETE', timeoutMs: 10_000 });

export const renderStill = (payload) =>
  call('/api/still', { method: 'POST', body: payload, timeoutMs: 300_000 });

export const renderContactSheet = (payload) =>
  call('/api/contact-sheet', { method: 'POST', body: payload, timeoutMs: 600_000 });

export const renderPayload = (project) => ({
  scenes: project.scenes,
  palette: project.palette,
  fields: project.fields ?? {},
  ...(Object.keys(project.ink ?? {}).length > 0 ? { ink: project.ink } : {}),
  ...(project.accent ? { accent: project.accent } : {}),
  ...(project.overlay ? { overlay: project.overlay } : {}),
  ...(project.audio ? { audio: project.audio } : {}),
  ...(project.format === 'landscape' ? { format: 'landscape' } : {}),
});

export { BASE };
