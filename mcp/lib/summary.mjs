const round = (value, places = 3) => Number(Number(value).toFixed(places));

const preview = (text, limit = 60) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
};

const countObjects = (objects) =>
  (objects ?? []).reduce(
    (total, object) => total + 1 + countObjects(object.children),
    0,
  );

export const audioSummary = (audio, analysis = null) => {
  if (!audio) return { present: false };
  return {
    present: true,
    src: audio.src,
    ...(audio.name ? { name: audio.name } : {}),
    sourceStart: round(audio.sourceStart),
    sourceEnd: round(audio.sourceEnd),
    selectionDuration: round(audio.sourceEnd - audio.sourceStart),
    timelineStart: round(audio.timelineStart),
    ...(audio.sourceDuration ? { sourceDuration: round(audio.sourceDuration) } : {}),
    volume: audio.volume,
    ...(audio.muted ? { muted: true } : {}),
    ...(audio.fadeIn ? { fadeIn: round(audio.fadeIn) } : {}),
    ...(audio.fadeOut ? { fadeOut: round(audio.fadeOut) } : {}),
    ...(audio.loop ? { loop: true } : {}),
    ...(analysis
      ? { analysis: { bpm: analysis.bpm, confidence: analysis.confidence, beatCount: analysis.beats.length } }
      : {}),
  };
};

export const sceneRow = (scene, entry) => ({
  sceneId: scene.id,
  index: entry.index,
  start: round(entry.fromSeconds),
  duration: round(entry.durationInSeconds),
  text: preview(scene.text),
  style: scene.style,
  background: scene.background,
  frames: entry.durationInFrames,
  elementCount: (scene.elements ?? []).length,
  objectCount: countObjects(scene.objects),
});

export const projectSummary = (stored, engine, analysis = null) => {
  const { project } = stored;
  const canvas = engine.canvasFor(project.format);
  const timeline = engine.buildTimeline(project.scenes, canvas.fps);

  return {
    projectId: stored.id,
    title: project.title,
    format: project.format,
    width: canvas.width,
    height: canvas.height,
    fps: canvas.fps,
    duration: round(engine.totalSeconds(project.scenes, canvas.fps)),
    frames: engine.totalFrames(project.scenes, canvas.fps),
    sceneCount: project.scenes.length,
    palette: {
      name: project.palette,
      nameIsDerived: true,
      background: project.fields ?? {},
      ink: project.ink ?? {},
      accent: project.accent ?? null,
    },
    audio: audioSummary(project.audio, analysis),
    hasOverlay: project.overlay !== null,
    scenes: project.scenes.map((scene, i) => sceneRow(scene, timeline[i])),
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    ...(stored.warnings?.length ? { warnings: stored.warnings.map((w) => `${w.path}: ${w.message}`) } : {}),
  };
};

export const elementDetail = (element) => ({
  elementId: element.id,
  text: element.text,
  ...(element.role ? { role: element.role } : {}),
  ...(element.size ? { size: element.size } : {}),
  ...(element.fit ? { fitWidth: element.fit.maxWidth } : {}),
  ...(element.fontRole ? { fontRole: element.fontRole } : {}),
  ...(element.enterFrames !== undefined ? { enterFrames: element.enterFrames } : {}),
  ...(element.exit ? { exit: element.exit } : {}),
  ...(element.stagger
    ? { stagger: { delayFrames: element.stagger.delayFrames, order: element.stagger.order ?? 'forward' } }
    : {}),
  ...(element.position ? { position: element.position } : {}),
  ...(element.from ? { from: element.from } : {}),
  ...(element.animation ? { animation: element.animation } : {}),
  ...(element.align ? { align: element.align } : {}),
  ...(element.case ? { case: element.case } : {}),
  ...(element.visualStyle ? { visualStyle: element.visualStyle } : {}),
  ...(element.emphasis?.length ? { emphasis: element.emphasis } : {}),
  ...(element.delay !== undefined ? { delay: round(element.delay) } : {}),
  ...(element.scale !== undefined ? { scale: element.scale } : {}),
  ...(element.x !== undefined && element.y !== undefined
    ? { placement: { x: round(element.x), y: round(element.y), note: 'Free placement, frame fractions.' } }
    : {}),
});

export const objectDetail = (object) => ({
  objectId: object.id,
  type: object.type,
  box: { x: round(object.x), y: round(object.y), width: round(object.width), height: round(object.height) },
  ...(object.motion?.enter ? { enter: object.motion.enter } : {}),
  ...(object.motion?.emphasis ? { emphasis: object.motion.emphasis } : {}),
  ...(object.motion?.exit ? { exit: object.motion.exit } : {}),
  ...(object.motion?.speed ? { speed: object.motion.speed } : {}),
  ...(object.motion?.distance ? { distance: object.motion.distance } : {}),
  ...(object.motion?.from ? { from: object.motion.from } : {}),
  ...(object.motion?.delay !== undefined ? { delay: round(object.motion.delay) } : {}),
  ...(object.start !== undefined ? { start: round(object.start) } : {}),
  ...(object.duration !== undefined ? { duration: round(object.duration) } : {}),
  ...(object.children?.length ? { children: object.children.map(objectDetail) } : {}),
});

export const sceneDetail = (scene, entry) => ({
  sceneId: scene.id,
  index: entry.index,
  start: round(entry.fromSeconds),
  duration: round(entry.durationInSeconds),
  frames: entry.durationInFrames,
  text: scene.text,
  style: scene.style,
  background: scene.background,
  alignment: scene.alignment,
  ...(scene.case ? { case: scene.case } : {}),
  ...(scene.composition ? { composition: scene.composition } : {}),
  ...(scene.visualStyle ? { visualStyle: scene.visualStyle } : {}),
  ...(scene.enterFrames !== undefined ? { enterFrames: scene.enterFrames } : {}),
  ...(scene.exit ? { exit: scene.exit } : {}),
  ...(scene.exitFrames !== undefined ? { exitFrames: scene.exitFrames } : {}),
  ...(scene.stagger
    ? { stagger: { delayFrames: scene.stagger.delayFrames, order: scene.stagger.order ?? 'forward' } }
    : {}),
  ...(scene.backgroundMotion
    ? { backgroundMotion: {
        mode: scene.backgroundMotion.mode,
        everyFrames: scene.backgroundMotion.everyFrames,
        ...(scene.backgroundMotion.times !== undefined ? { times: scene.backgroundMotion.times } : {}),
      } }
    : {}),
  ...(scene.fit ? { fitWidth: scene.fit.maxWidth } : {}),
  ...(scene.fontRole ? { fontRole: scene.fontRole } : {}),
  ...(scene.direction ? { direction: scene.direction } : {}),
  ...(scene.emphasis?.length ? { emphasis: scene.emphasis } : {}),
  ...(scene.wordColors && Object.keys(scene.wordColors).length ? { wordColors: scene.wordColors } : {}),
  ...(scene.flipBackground ? { flipBackground: true } : {}),
  ...(scene.hideOverlay ? { hideOverlay: true } : {}),
  ...(scene.note ? { note: scene.note } : {}),
  elements: (scene.elements ?? []).map(elementDetail),
  objects: (scene.objects ?? []).map(objectDetail),
});

export { round, preview, countObjects };
