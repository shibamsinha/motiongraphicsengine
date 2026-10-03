import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { DATA_DIR, loadEngine } from './engine.mjs';
import { conflict, notFound, validationError } from './errors.mjs';

const STORE_DIR = path.join(DATA_DIR, 'projects');

const ID_PATTERN = /^prj_[0-9a-f]{12}$/;

export const newProjectId = () => `prj_${crypto.randomBytes(6).toString('hex')}`;

export const assertProjectId = (id) => {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw validationError(
      `"${id}" is not a valid project id. Ids look like prj_a1b2c3d4e5f6; list_projects returns them.`,
      { field: 'projectId' },
    );
  }
  return id;
};

const fileFor = (id) => path.join(STORE_DIR, `${assertProjectId(id)}.json`);

const ensureDir = () => fsp.mkdir(STORE_DIR, { recursive: true });

export const readProject = async (id) => {
  const engine = await loadEngine();
  const file = fileFor(id);

  let raw;
  try {
    raw = await fsp.readFile(file, 'utf8');
  } catch {
    throw notFound(`Project ${id} does not exist.`, { projectId: id });
  }

  const parsed = engine.parseProjectScript(raw);
  if (!parsed.ok) {
    throw conflict(
      `Project ${id} is on disk but is not a valid project document.`,
      { projectId: id, issues: parsed.issues.slice(0, 10) },
    );
  }

  const stat = await fsp.stat(file);
  return {
    id,
    project: parsed.project,
    createdAt: stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    warnings: parsed.issues.filter((issue) => issue.severity === 'warning'),
  };
};

export const writeProject = async (id, project) => {
  const engine = await loadEngine();
  await ensureDir();

  const json = engine.serialiseProject(
    project.scenes,
    project.title ?? null,
    project.fields ?? {},
    project.overlay ?? null,
    project.format ?? 'portrait',
    project.audio ?? null,
    project.ink ?? {},
    project.accent ?? null,
  );

  try {
    JSON.parse(json);
  } catch (cause) {
    throw validationError(
      `Refusing to write project ${id}: the serialised document is not valid JSON.`,
      { cause: cause.message },
    );
  }

  const file = fileFor(id);
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;

  let handle;
  try {
    handle = await fsp.open(temp, 'w');
    await handle.writeFile(json);
    await handle.sync();
  } finally {
    await handle?.close();
  }
  await fsp.rename(temp, file);

  try {
    const dir = await fsp.open(STORE_DIR, 'r');
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } catch {}

  return id;
};

export const mutateProject = async (id, mutate) => {
  const before = await readProject(id);
  const next = await mutate(structuredClone(before.project), before);
  await writeProject(id, next);
  return readProject(id);
};

export const createProject = async (project, id = newProjectId()) => {
  await ensureDir();
  if (fs.existsSync(fileFor(id))) {
    throw conflict(`Project ${id} already exists.`, { projectId: id });
  }
  await writeProject(id, project);
  return readProject(id);
};

export const listProjects = async () => {
  const engine = await loadEngine();
  await ensureDir();

  const names = (await fsp.readdir(STORE_DIR)).filter((name) => name.endsWith('.json'));
  const rows = [];

  for (const name of names) {
    const id = name.replace(/\.json$/, '');
    if (!ID_PATTERN.test(id)) continue;
    const file = path.join(STORE_DIR, name);
    const stat = await fsp.stat(file);
    try {
      const parsed = engine.parseProjectScript(await fsp.readFile(file, 'utf8'));
      if (!parsed.ok) {
        rows.push({ projectId: id, error: 'unparseable', updatedAt: stat.mtime.toISOString() });
        continue;
      }
      rows.push({
        projectId: id,
        title: parsed.project.title,
        format: parsed.project.format,
        sceneCount: parsed.project.scenes.length,
        duration: Number(parsed.project.durationSeconds.toFixed(3)),
        hasAudio: parsed.project.audio !== null,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
      });
    } catch {
      rows.push({ projectId: id, error: 'unreadable', updatedAt: stat.mtime.toISOString() });
    }
  }

  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const deleteProject = async (id) => {
  const file = fileFor(id);
  if (!fs.existsSync(file)) {
    throw notFound(`Project ${id} does not exist.`, { projectId: id });
  }
  await fsp.rm(file);
  return id;
};

export { STORE_DIR };
