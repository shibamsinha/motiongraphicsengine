import React from 'react';
import type { CSSProperties } from 'react';
import { styleCss, type GlyphBox, type ResolvedStyle } from '../../utils/visualStyle';

export type { GlyphBox };

const paintCss = (
  style: ResolvedStyle,
  fontSize: number,
  box: GlyphBox,
): CSSProperties => styleCss(style, fontSize, box) as CSSProperties;

const LetterSplit: React.FC<{
  text: string;
  parts: ResolvedStyle[];
  fontSize: number;
  box: GlyphBox;
}> = ({ text, parts, fontSize, box }) => (
  <span style={{ position: 'relative', display: 'inline-block' }}>
    {parts.map((part, index) => {
      const from = (index / parts.length) * 100;
      const to = ((index + 1) / parts.length) * 100;
      const clip = `inset(-25% ${(100 - to).toFixed(4)}% -35% ${from.toFixed(4)}%)`;
      return (
        <span
          key={index}
          aria-hidden={index > 0}
          style={{
            ...paintCss(part, fontSize, box),
            clipPath: clip,
            ...(index === 0
              ? { display: 'inline-block' }
              : { position: 'absolute', left: 0, top: 0, display: 'inline-block' }),
          }}
        >
          {text}
        </span>
      );
    })}
  </span>
);

export const StyledText: React.FC<{
  text: string;
  style: ResolvedStyle;
  fontSize: number;
  box: GlyphBox;
  wordIndex: number;
  wordCount: number;
}> = ({ text, style, fontSize, box, wordIndex, wordCount }) => {
  if (style.type === 'split' && style.parts.length > 0) {
    const byLetter =
      style.splitBy === 'letter' ||
      (style.splitBy === 'auto' && wordCount <= 1);

    if (byLetter) {
      return (
        <LetterSplit text={text} parts={style.parts} fontSize={fontSize} box={box} />
      );
    }

    const part = style.parts[wordIndex % style.parts.length];
    return <span style={paintCss(part, fontSize, box)}>{text}</span>;
  }

  return <span style={paintCss(style, fontSize, box)}>{text}</span>;
};
