import { readFile } from 'node:fs/promises';

const [file, port = process.env.MGE_RENDER_PORT ?? '5311'] = process.argv.slice(2);
if (!file) {
  console.error('usage: npm run render -- <scenes.json> [port]');
  process.exit(1);
}

const base = `http://localhost:${port}`;
const scenes = JSON.parse(await readFile(file, 'utf8'));

const started = await fetch(`${base}/api/render`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scenes, palette: 'forest' }),
}).then((response) => response.json());

if (!started.jobId) {
  console.error(started);
  process.exit(1);
}

let last = '';
for (;;) {
  await new Promise((resolve) => setTimeout(resolve, 700));
  const job = await fetch(`${base}/api/render/${started.jobId}`).then((response) => response.json());
  const line = `${job.status} ${Math.round((job.progress || 0) * 100)}%`;
  if (line !== last) process.stderr.write(`${line}\n`);
  last = line;
  if (job.status === 'done') {
    console.log(job.filename);
    break;
  }
  if (job.status === 'error') {
    console.error(job.message);
    process.exit(1);
  }
}
