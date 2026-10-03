import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'test', 'baseline.json');
const write = process.argv.includes('--write');

const work = mkdtempSync(path.join(tmpdir(), 'mge-baseline-'));
const entry = path.join(work, 'entry.ts');

writeFileSync(
  entry,
  `
import { PRESETS } from ${JSON.stringify(path.join(ROOT, 'src/data/presets'))};
import { serialiseProject, parseProjectScript } from ${JSON.stringify(path.join(ROOT, 'src/utils/importScript'))};
import { buildTimeline, totalFrames, CANVAS } from ${JSON.stringify(path.join(ROOT, 'src/utils/timing'))};
import { sampleProjectJson } from ${JSON.stringify(path.join(ROOT, 'src/data/sampleProject'))};

const keysOf = (obj: any, into: Set<string>) => {
  for (const k of Object.keys(obj ?? {})) into.add(k);
};

const normalise = (doc: any) => {
  const copy = JSON.parse(JSON.stringify(doc));
  (copy.scenes ?? []).forEach((s: any, i: number) => {
    if ('id' in s) s.id = 'scene-' + i;
    (s.elements ?? []).forEach((e: any, j: number) => {
      if ('id' in e) e.id = 'el-' + i + '-' + j;
    });
  });
  return JSON.stringify(copy, null, 2);
};

const fingerprint = (label: string, scenes: any[], title: string | null) => {
  const json = serialiseProject(scenes, title, {}, null, 'portrait');
  const parsed = parseProjectScript(json);
  if (!parsed.ok) {
    return { label, error: 'engine output failed its own parser',
             issues: parsed.issues.map((i: any) => i.path + ': ' + i.message) };
  }
  const again = serialiseProject(parsed.project.scenes, parsed.project.title,
                                 parsed.project.fields, parsed.project.overlay,
                                 parsed.project.format);

  const parsedAgain = parseProjectScript(again);
  const third = parsedAgain.ok
    ? serialiseProject(parsedAgain.project.scenes, parsedAgain.project.title,
                       parsedAgain.project.fields, parsedAgain.project.overlay,
                       parsedAgain.project.format)
    : null;

  const doc = JSON.parse(json);
  const docKeys = new Set<string>(); keysOf(doc, docKeys);
  const sceneKeys = new Set<string>(); const elementKeys = new Set<string>();
  for (const s of doc.scenes ?? []) {
    keysOf(s, sceneKeys);
    for (const e of s.elements ?? []) keysOf(e, elementKeys);
  }

  const timeline = buildTimeline(scenes, CANVAS.fps);
  return {
    label,
    scenes: scenes.length,
    totalFrames: totalFrames(scenes, CANVAS.fps),
    frames: timeline.map((t: any) => t.durationInFrames),
    roundTripStable: again === json,
    roundTripIdempotent: third !== null && third === again,
    durationsSnapped: scenes
      .map((s: any, i: number) => ({
        i,
        from: s.duration,
        to: parsed.project.scenes[i]?.duration,
      }))
      .filter((d: any) => d.to !== undefined && Math.abs(d.to - d.from) > 1e-9),
    schemaHash: null as string | null,
    json: normalise(doc),
    docKeys: [...docKeys].sort(),
    sceneKeys: [...sceneKeys].sort(),
    elementKeys: [...elementKeys].sort(),
    importErrors: parsed.issues.filter((i: any) => i.severity === 'error').length,
    importWarnings: parsed.issues
      .filter((i: any) => i.severity === 'warning')
      .map((i: any) => (i.path ? i.path + ': ' : '') + i.message)
      .sort(),
  };
};

export const collect = () => {
  const reels = PRESETS.map((p: any) => fingerprint('reel:' + p.id, p.build(), p.label));
  return reels;
};

export const sample = () => {
  const json = sampleProjectJson();
  const r = parseProjectScript(json);
  if (!r.ok) {
    return { label: 'sample', ok: false,
             errors: r.issues.filter((i: any) => i.severity === 'error')
                             .map((i: any) => (i.path ? i.path + ': ' : '') + i.message).sort() };
  }
  const doc = JSON.parse(json);
  const sceneKeys = new Set<string>(); const objectKeys = new Set<string>();
  const kinds = new Set<string>();
  const walk = (list: any[]) => {
    for (const o of list ?? []) {
      keysOf(o, objectKeys); kinds.add(o.type);
      if (o.children) walk(o.children);
    }
  };
  for (const s of doc.scenes ?? []) { keysOf(s, sceneKeys); walk(s.objects); }
  return {
    label: 'sample', ok: true,
    scenes: r.project.scenes.length,
    // A newline escape here would be consumed by the surrounding template literal.
    lines: json.split(String.fromCharCode(10)).length,
    objectKinds: [...kinds].sort(),
    sceneKeys: [...sceneKeys].sort(),
    objectKeys: [...objectKeys].sort(),
    warnings: r.issues.filter((i: any) => i.severity === 'warning')
                      .map((i: any) => (i.path ? i.path + ': ' : '') + i.message).sort(),
    json: normalise(doc),
  };
};

export const parseFile = (source: string, label: string) => {
  const r = parseProjectScript(source);
  if (!r.ok) {
    return { label, ok: false,
             errors: r.issues.filter((i: any) => i.severity === 'error')
                              .map((i: any) => (i.path ? i.path + ': ' : '') + i.message).sort() };
  }

  const out = serialiseProject(r.project.scenes, r.project.title, r.project.fields,
                               r.project.overlay, r.project.format);
  const back = parseProjectScript(out);
  const out2 = back.ok
    ? serialiseProject(back.project.scenes, back.project.title, back.project.fields,
                       back.project.overlay, back.project.format)
    : null;

  const doc = JSON.parse(out);
  const docKeys = new Set<string>(); keysOf(doc, docKeys);
  const sceneKeys = new Set<string>(); const elementKeys = new Set<string>();
  for (const s of doc.scenes ?? []) {
    keysOf(s, sceneKeys);
    for (const e of s.elements ?? []) keysOf(e, elementKeys);
  }

  return {
    label, ok: true,
    scenes: r.project.scenes.length,
    roundTripIdempotent: out2 !== null && out2 === out,
    json: normalise(doc),
    docKeys: [...docKeys].sort(),
    sceneKeys: [...sceneKeys].sort(),
    elementKeys: [...elementKeys].sort(),
    format: r.project.format,
    palette: r.project.palette,
    title: r.project.title,
    totalFrames: r.project.durationInFrames,
    warnings: r.issues.filter((i: any) => i.severity === 'warning')
                      .map((i: any) => (i.path ? i.path + ': ' : '') + i.message).sort(),
  };
};
`,
  'utf8',
);

const bundle = path.join(work, 'entry.cjs');
execFileSync(
  path.join(ROOT, 'node_modules/.bin/esbuild'),
  [entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${bundle}`,
   '--log-level=error'],
  { stdio: 'inherit', cwd: ROOT },
);

const mod = require(bundle);
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const reels = mod.collect().map((r) => {
  if (r.error) return r;
  const { json, ...rest } = r;
  return { ...rest, schemaHash: sha(json) };
});

const templates = ['script-template.json', 'script-full-reference.json',
                   'script-composition.json']
  .filter((f) => existsSync(path.join(ROOT, 'templates', f)))
  .map((f) => mod.parseFile(readFileSync(path.join(ROOT, 'templates', f), 'utf8'),
                            'template:' + f))
  .map((t) => {
    if (!t.ok) return t;
    const { json, ...rest } = t;
    return { ...rest, schemaHash: sha(json) };
  });

rmSync(work, { recursive: true, force: true });

const sampleRow = (() => {
  const row = mod.sample();
  if (!row.ok) return row;
  const { json, ...rest } = row;
  return { ...rest, schemaHash: sha(json) };
})();

const current = { reels, templates, sample: sampleRow };

if (write) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`baseline written: ${reels.length} reels, ${templates.length} templates`);
  const bad = reels.filter((r) => r.error || r.roundTripIdempotent === false);
  if (bad.length) {
    console.error('\nrecorded, but these are already broken:');
    for (const b of bad) console.error('  ' + b.label);
    process.exit(1);
  }
  const snapped = reels.filter((r) => r.durationsSnapped?.length);
  if (snapped.length) {
    console.log(
      `note: ${snapped.length} reel(s) have durations off the frame grid; the ` +
      'first import snaps them (renders identically, JSON differs):',
    );
    for (const r of snapped) {
      console.log(`  ${r.label} — ${r.durationsSnapped.length} scene(s), e.g. ` +
        `${r.durationsSnapped[0].from}s → ${r.durationsSnapped[0].to}s`);
    }
  }
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('No baseline recorded. Run: node scripts/baseline.mjs --write');
  process.exit(2);
}

const previous = JSON.parse(readFileSync(BASELINE, 'utf8'));
const failures = [];

const compare = (was, now, label) => {
  const keys = new Set([...Object.keys(was ?? {}), ...Object.keys(now ?? {})]);
  for (const k of keys) {
    const a = JSON.stringify(was?.[k]);
    const b = JSON.stringify(now?.[k]);
    if (a !== b) failures.push(`${label} · ${k}\n      was: ${a}\n      now: ${b}`);
  }
};

const index = (list) => Object.fromEntries(list.map((x) => [x.label, x]));
const wasReels = index(previous.reels ?? []);
const nowReels = index(current.reels);
for (const label of new Set([...Object.keys(wasReels), ...Object.keys(nowReels)])) {
  compare(wasReels[label], nowReels[label], label);
}
const wasT = index(previous.templates ?? []);
const nowT = index(current.templates);
for (const label of new Set([...Object.keys(wasT), ...Object.keys(nowT)])) {
  compare(wasT[label], nowT[label], label);
}

for (const r of current.reels) {
  if (r.error) failures.push(`${r.label} · ${r.error}`);
  else if (!r.roundTripIdempotent) failures.push(`${r.label} · round-trip does not settle: a second extract→import→extract still changes the document`);
  else if (r.importErrors > 0) failures.push(`${r.label} · engine output has ${r.importErrors} import errors`);
}
for (const t of current.templates) {
  if (!t.ok) failures.push(`${t.label} · no longer parses: ${(t.errors ?? []).join('; ')}`);
  else if (!t.roundTripIdempotent) failures.push(`${t.label} · round-trip does not settle`);
}
compare(previous.sample, current.sample, 'sample');
if (!current.sample.ok) {
  failures.push(`sample · the import screen's sample no longer parses: ${(current.sample.errors ?? []).join('; ')}`);
} else if (current.sample.warnings.length > 0) {
  failures.push(`sample · emits import warnings a reader would copy: ${current.sample.warnings.join('; ')}`);
}

if (failures.length === 0) {
  console.log(
    `baseline OK — ${current.reels.length} reels, ${current.templates.length} templates, ` +
    `sample (${current.sample.lines} lines, ${(current.sample.objectKinds ?? []).length} object kinds), ` +
    `round-trip settles, no schema drift`,
  );
  process.exit(0);
}

console.error(`baseline FAILED — ${failures.length} difference(s):\n`);
for (const f of failures) console.error('  • ' + f);
console.error(
  '\nIf a change here is intended, re-record with:\n' +
  '  node scripts/baseline.mjs --write\n',
);
process.exit(1);
