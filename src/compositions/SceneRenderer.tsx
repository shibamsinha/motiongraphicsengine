import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { BackgroundName, PaletteName, Scene } from '../types/scene';
import { planScene } from '../utils/plan';
import { DEFAULT_PALETTE, themeFor } from '../utils/typography';
import { backgroundForFrame, styleDefinition } from '../components/motion/registry';
import { SceneImageLayer } from '../components/motion/SceneImageLayer';
import { Outgoing } from '../components/motion/Outgoing';
import { planTransition } from '../utils/transition';
import { resolveStyle } from '../utils/visualStyle';
import { useFontsReady } from '../utils/fonts';
import { planObjects } from '../utils/planObjects';
import { ObjectLayer } from '../components/motion/ObjectLayer';

export const SceneRenderer: React.FC<{
  scene: Scene;
  durationInFrames: number;
  palette?: PaletteName;
  fields?: Partial<Record<BackgroundName, string>>;
  ink?: Partial<Record<BackgroundName, string>>;
  accent?: string;
  previous?: { scene: Scene; durationInFrames: number };
}> = ({
  scene,
  durationInFrames,
  palette = DEFAULT_PALETTE,
  fields,
  ink,
  accent,
  previous,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const fontsReady = useFontsReady();

  const canvas = useMemo(() => ({ width, height, fps }), [width, height, fps]);

  const plan = useMemo(
    () =>
      fontsReady ? planScene(scene, durationInFrames, fps, palette, canvas) : null,
    [scene, durationInFrames, fps, palette, canvas, fontsReady],
  );

  const previousPlan = useMemo(
    () =>
      fontsReady && previous
        ? planScene(previous.scene, previous.durationInFrames, fps, palette, canvas)
        : null,
    [fontsReady, previous, fps, palette, canvas],
  );

  const transition = useMemo(() => {
    if (!plan) return undefined;
    const fieldChanges = previousPlan
      ? backgroundForFrame(
          previousPlan,
          previousPlan.durationInFrames - 1,
          palette,
        ) !== backgroundForFrame(plan, 0, palette)
      : false;
    return planTransition(previousPlan, plan, fps, fieldChanges);
  }, [previousPlan, plan, fps, palette]);

  const objectPlan = useMemo(
    () => planObjects(scene.objects, durationInFrames, fps),
    [scene.objects, durationInFrames, fps],
  );

  const background = plan
    ? backgroundForFrame(plan, frame, palette)
    : scene.background;
  const theme = themeFor(background, palette, fields, ink, accent);

  const behindType = objectPlan.objects.filter((o) => o.layer < 0);
  const inFrontOfType = objectPlan.objects.filter((o) => o.layer >= 0);

  if (!plan) {
    return (
      <AbsoluteFill style={{ backgroundColor: theme.background }}>
        <ObjectLayer
          plan={objectPlan}
          frame={frame}
          fps={fps}
          canvas={canvas}
          theme={theme}
        />
      </AbsoluteFill>
    );
  }

  const picture = scene.image ? (
    <SceneImageLayer
      image={scene.image}
      composition={plan.picture}
      frame={frame}
      fps={fps}
      durationInFrames={durationInFrames}
      theme={theme}
      hardCut={plan.style === 'rapid'}
    />
  ) : null;

  const inFront = scene.image?.placement === 'free' && scene.image.layer === 'front';

  return (
    <AbsoluteFill style={{ backgroundColor: theme.background }}>
      {inFront ? null : picture}
      {behindType.length > 0 ? (
        <ObjectLayer
          plan={{ ...objectPlan, objects: behindType }}
          frame={frame}
          fps={fps}
          canvas={canvas}
          theme={theme}
        />
      ) : null}
      <AbsoluteFill style={{ overflow: 'visible' }}>
        {previousPlan && transition ? (
          <Outgoing
            plan={previousPlan}
            transition={transition}
            frame={frame}
            color={theme.ink}
            theme={theme}
            canvas={canvas}
          />
        ) : null}
        {plan.elements.map((element) => {
          const { Component } = styleDefinition(element.style);
          return (
            <Component
              key={element.id}
              plan={plan}
              element={element}
              frame={frame}
              fps={fps}
              durationInFrames={durationInFrames}
              color={theme.ink}
              visual={resolveStyle(element.visual, theme)}
              transition={transition}
              canvas={canvas}
            />
          );
        })}
      </AbsoluteFill>
      {inFrontOfType.length > 0 ? (
        <AbsoluteFill style={{ overflow: 'visible' }}>
          <ObjectLayer
            plan={{ ...objectPlan, objects: inFrontOfType }}
            frame={frame}
            fps={fps}
            canvas={canvas}
            theme={theme}
          />
        </AbsoluteFill>
      ) : null}
      {inFront ? picture : null}
    </AbsoluteFill>
  );
};
