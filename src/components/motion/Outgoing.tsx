import React from 'react';
import type { ScenePlan } from '../../utils/plan';
import type { SceneTransition } from '../../utils/transition';
import { exitPiecesOf, exitSpecFor } from '../../utils/transition';
import { BLUR_GAIN, velocityBlur } from '../../utils/motionBlur';
import { MotionSpan, TypeBlock, amplify, exitValues } from './primitives';
import { resolveStyle } from '../../utils/visualStyle';
import type { Theme } from '../../utils/typography';
import type { VideoConfig } from '../../types/scene';
import { CANVAS } from '../../utils/timing';

const SOLID = { opacity: 1, x: 0, y: 0, scale: 1, blur: 0, rotate: 0 };
const GONE = { opacity: 0, x: 0, y: 0, scale: 1, blur: 0, rotate: 0 };

export const Outgoing: React.FC<{
  plan: ScenePlan;
  transition: SceneTransition;
  frame: number;
  color: string;
  theme: Theme;
  canvas?: VideoConfig;
}> = ({ plan, transition, frame, color, theme, canvas = CANVAS }) => {
  if (transition.frames <= 0 || frame >= transition.frames) return null;
  if (transition.exiting.length === 0) return null;

  const leaving = new Set(transition.exiting.map((word) => word.id));

  return (
    <>
      {exitPiecesOf(plan).map((piece, index) => {
        if (piece.block.lines.length === 0) return null;
        if (!piece.block.lines.some((line) => line.words.some((w) => leaving.has(w.id))))
          return null;

        const spec = exitSpecFor(piece.style, transition.frames, transition.fieldChanges, canvas);
        const gain = BLUR_GAIN[piece.style] ?? 1;
        const visual = resolveStyle(piece.visual, theme);

        const at = (f: number) => amplify(exitValues(f, spec), piece.motion);

        return (
          <TypeBlock
            key={`${piece.block.lines[0]?.id ?? 'piece'}-${index}`}
            block={piece.block}
            color={color}
            visual={visual}
            values={at(frame)}
            blur={velocityBlur(at, frame, piece.block.heroSize, gain)}
            renderWord={(word, _line, glyph) =>
              leaving.has(word.id) ? (
                <MotionSpan values={SOLID}>{glyph}</MotionSpan>
              ) : (
                <MotionSpan values={GONE} style={{ visibility: 'hidden' }}>
                  {glyph}
                </MotionSpan>
              )
            }
          />
        );
      })}
    </>
  );
};
