export class RenderQueue {
  #concurrency;
  #jobs;
  #pending = [];
  #running = new Set();
  #accepting = true;

  constructor({ concurrency, jobs }) {
    this.#concurrency = Math.max(1, concurrency);
    this.#jobs = jobs;
  }

  get accepting() {
    return this.#accepting;
  }

  stats() {
    return {
      running: this.#running.size,
      queued: this.#pending.length,
      concurrency: this.#concurrency,
      accepting: this.#accepting,
    };
  }

  submit(jobId, task) {
    if (!this.#accepting) {
      return Promise.reject(new Error('The render server is shutting down.'));
    }
    return new Promise((resolve, reject) => {
      this.#pending.push({ jobId, task, resolve, reject });
      this.#renumber();
      this.#pump();
    });
  }

  cancel(jobId) {
    const index = this.#pending.findIndex((entry) => entry.jobId === jobId);
    if (index !== -1) {
      const [entry] = this.#pending.splice(index, 1);
      this.#renumber();
      this.#jobs.update(jobId, {
        status: 'cancelled',
        progress: 0,
        message: 'Cancelled before it started.',
        completedAt: new Date().toISOString(),
      });
      entry.resolve({ cancelled: true });
      return 'queued';
    }

    if (this.#running.has(jobId)) {
      const cancel = this.#jobs.takeCancel(jobId);
      this.#jobs.update(jobId, { status: 'cancelled', progress: 0 });
      try {
        cancel?.();
      } catch {}
      return 'running';
    }

    return null;
  }

  stop() {
    this.#accepting = false;
    const drained = this.#pending.splice(0);
    this.#renumber();
    for (const entry of drained) {
      this.#jobs.update(entry.jobId, {
        status: 'cancelled',
        progress: 0,
        message: 'The render server shut down before this job started.',
        completedAt: new Date().toISOString(),
      });
      entry.resolve({ cancelled: true });
    }
    return drained.length;
  }

  async drain() {
    while (this.#running.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  #renumber() {
    this.#pending.forEach((entry, index) => {
      this.#jobs.update(entry.jobId, { queuePosition: index + 1 });
    });
  }

  #pump() {
    while (this.#running.size < this.#concurrency && this.#pending.length > 0) {
      const entry = this.#pending.shift();
      this.#renumber();
      this.#run(entry);
    }
  }

  async #run(entry) {
    const { jobId, task, resolve, reject } = entry;
    this.#running.add(jobId);
    this.#jobs.update(jobId, { queuePosition: undefined });

    try {
      resolve(await task());
    } catch (problem) {
      reject(problem);
    } finally {
      this.#running.delete(jobId);
      this.#pump();
    }
  }
}
