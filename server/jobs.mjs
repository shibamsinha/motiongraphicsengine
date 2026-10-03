import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const LIVE = new Set(['queued', 'starting', 'browser', 'bundling', 'rendering']);

const MAX_RECORDS = 500;

const isLive = (status) => LIVE.has(status);

export class JobStore {
  #file;
  #jobs = new Map();
  #cancels = new Map();
  #writeTimer = null;
  #writing = null;
  #dirty = false;

  constructor(stateDir) {
    this.#file = path.join(stateDir, 'jobs.json');
  }

  async load(outputExists) {
    let raw;
    try {
      raw = await fsp.readFile(this.#file, 'utf8');
    } catch {
      return { restored: 0, interrupted: 0, expired: 0 };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { restored: 0, interrupted: 0, expired: 0, corrupt: true };
    }

    let interrupted = 0;
    let expired = 0;
    for (const record of Array.isArray(parsed?.jobs) ? parsed.jobs : []) {
      if (!record?.jobId) continue;
      const job = { ...record };

      if (isLive(job.status)) {
        job.status = 'interrupted';
        job.progress = 0;
        job.message = 'The render server restarted while this job was running. Start it again.';
        job.completedAt = job.completedAt ?? new Date().toISOString();
        interrupted += 1;
      } else if (job.status === 'done' && job.filename && !outputExists(job.filename)) {
        job.status = 'expired';
        job.message = 'The rendered file is no longer available.';
        expired += 1;
      }

      this.#jobs.set(job.jobId, job);
    }

    this.#trim();
    if (interrupted > 0 || expired > 0) this.#schedule();
    return { restored: this.#jobs.size, interrupted, expired };
  }

  create(fields = {}) {
    const jobId = crypto.randomUUID();
    const job = {
      jobId,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      filename: null,
      message: null,
      frames: null,
      ms: null,
      kind: 'render',
      ...fields,
    };
    this.#jobs.set(jobId, job);
    this.#trim();
    this.#schedule();
    return job;
  }

  get(jobId) {
    return this.#jobs.get(jobId) ?? null;
  }

  update(jobId, patch) {
    const current = this.#jobs.get(jobId);
    if (!current) return null;
    if (
      (current.status === 'cancelled' || current.status === 'interrupted') &&
      patch.status !== undefined &&
      patch.status !== current.status
    ) {
      return current;
    }
    const next = { ...current, ...patch };
    this.#jobs.set(jobId, next);
    if (!isLive(next.status)) {
      this.#cancels.delete(jobId);
      this.#schedule(true);
    } else {
      this.#schedule();
    }
    return next;
  }

  setCancel(jobId, cancel) {
    if (this.#jobs.has(jobId)) this.#cancels.set(jobId, cancel);
  }

  takeCancel(jobId) {
    const cancel = this.#cancels.get(jobId);
    this.#cancels.delete(jobId);
    return cancel ?? null;
  }

  findByFilename(filename) {
    if (typeof filename !== 'string' || filename === '') return null;
    for (const job of this.#jobs.values()) {
      if (job.filename === filename) return job;
    }
    return null;
  }

  activeFilenames() {
    const names = new Set();
    for (const job of this.#jobs.values()) {
      if (isLive(job.status) && job.filename) names.add(job.filename);
    }
    return names;
  }

  counts() {
    let active = 0;
    let queued = 0;
    for (const job of this.#jobs.values()) {
      if (job.status === 'queued') queued += 1;
      else if (isLive(job.status)) active += 1;
    }
    return { active, queued, total: this.#jobs.size };
  }

  view(jobId) {
    const job = this.#jobs.get(jobId);
    if (!job) return null;
    return {
      jobId: job.jobId,
      status: job.status,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      ...(job.filename ? { filename: job.filename, url: `/out/${job.filename}` } : {}),
      ...(job.message ? { message: job.message } : {}),
      ...(job.frames ? { durationInFrames: job.frames } : {}),
      ...(job.ms ? { ms: job.ms } : {}),
      ...(job.queuePosition !== undefined && job.status === 'queued'
        ? { queuePosition: job.queuePosition }
        : {}),
      ...(job.kind && job.kind !== 'render' ? { kind: job.kind } : {}),
      ...(job.result ? { result: job.result } : {}),
      retryable: job.status === 'error' || job.status === 'interrupted',
    };
  }

  #trim() {
    if (this.#jobs.size <= MAX_RECORDS) return;
    const terminal = [...this.#jobs.values()]
      .filter((job) => !isLive(job.status))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    let excess = this.#jobs.size - MAX_RECORDS;
    for (const job of terminal) {
      if (excess-- <= 0) break;
      this.#jobs.delete(job.jobId);
    }
  }

  #schedule(immediate = false) {
    this.#dirty = true;
    if (immediate) {
      if (this.#writeTimer) {
        clearTimeout(this.#writeTimer);
        this.#writeTimer = null;
      }
      void this.flush();
      return;
    }
    if (this.#writeTimer) return;
    this.#writeTimer = setTimeout(() => {
      this.#writeTimer = null;
      void this.flush();
    }, 250);
    this.#writeTimer.unref?.();
  }

  async flush() {
    if (this.#writing) {
      await this.#writing;
      if (!this.#dirty) return;
    }
    this.#dirty = false;
    this.#writing = this.#write().catch(() => {});
    await this.#writing;
    this.#writing = null;
  }

  async #write() {
    const payload = JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      jobs: [...this.#jobs.values()],
    });

    const temp = `${this.#file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    let handle;
    try {
      handle = await fsp.open(temp, 'w');
      await handle.writeFile(payload);
      await handle.sync();
    } finally {
      await handle?.close();
    }
    await fsp.rename(temp, this.#file);
  }

  get file() {
    return this.#file;
  }

  clear() {
    this.#jobs.clear();
    this.#cancels.clear();
  }
}

export const outputExistsIn = (outDir) => (filename) => {
  if (typeof filename !== 'string' || filename === '') return false;
  const safe = path.basename(filename);
  return fs.existsSync(path.join(outDir, safe));
};

export { isLive, LIVE };
