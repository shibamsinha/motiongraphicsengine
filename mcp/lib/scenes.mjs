import { notFound } from './errors.mjs';

export const requireScene = (project, sceneId) => {
  const index = project.scenes.findIndex((scene) => scene.id === sceneId);
  if (index === -1) {
    throw notFound(`Scene ${sceneId} is not in this project.`, {
      sceneId,
      availableSceneIds: project.scenes.map((scene) => scene.id),
    });
  }
  return { scene: project.scenes[index], index };
};

export const replaceScene = (project, index, scene) => ({
  ...project,
  scenes: project.scenes.map((existing, i) => (i === index ? scene : existing)),
});

export const requireElement = (scene, elementId) => {
  const elements = scene.elements ?? [];
  const index = elements.findIndex((element) => element.id === elementId);
  if (index === -1) {
    throw notFound(`Element ${elementId} is not in scene ${scene.id}.`, {
      elementId,
      sceneId: scene.id,
      availableElementIds: elements.map((element) => element.id),
    });
  }
  return { element: elements[index], index };
};

export const replaceElement = (scene, index, element) => ({
  ...scene,
  elements: (scene.elements ?? []).map((existing, i) => (i === index ? element : existing)),
});

export const syncSceneText = (scene) => {
  const elements = scene.elements ?? [];
  if (elements.length === 0) return scene;
  return { ...scene, text: elements.map((element) => element.text).join('\n') };
};

export const definedOnly = (patch) =>
  Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
