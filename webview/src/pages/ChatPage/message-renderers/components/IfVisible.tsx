import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * Renders `children` only when they put something a human can actually see on
 * the screen.
 *
 * The rule this enforces — "never draw an empty user bubble" — kept leaking
 * because it was checked case by case on the way in: first `''`, then
 * `<system-reminder>`, then `tool_result`, and a zero-width space still drew a
 * box because `String.trim()` does not treat one as whitespace. Every new
 * invisible character, and every new branch added above the check, was another
 * leak (issue #232, reopened twice).
 *
 * So the question is asked once, at the exit, about the rendered result rather
 * than about the input: after mount, does this subtree contain any visible
 * glyph? If not, it is removed. That holds no matter which branch produced it or
 * what the content was made of.
 *
 * `extra` marks content that is legitimately glyph-less — an image attachment, a
 * context pill — so it survives the check.
 */
interface IfVisibleProps {
  children: React.ReactNode;
  /** True when non-text content (images, pills) makes this worth showing. */
  extra?: boolean;
}

/**
 * Characters that occupy no visual space. Stripping these is what separates
 * "the string is non-empty" from "the user can see something".
 *
 * Written as escapes on purpose: the literal characters are invisible in an
 * editor, so a pasted one would be unreviewable — and a stray one breaks the
 * parse outright.
 */
const INVISIBLE = new RegExp(
  '[' +
    '\\s' + // ordinary whitespace, incl. NBSP and ideographic space
    '\\u00AD' + // soft hyphen
    '\\u034F' + // combining grapheme joiner
    '\\u061C' + // arabic letter mark
    '\\u115F\\u1160' + // hangul choseong/jungseong fillers
    '\\u17B4\\u17B5' + // khmer inherent vowels
    '\\u180B-\\u180E' + // mongolian variation selectors, vowel separator
    '\\u200B-\\u200F' + // zero-width space/non-joiner/joiner, LRM, RLM
    '\\u202A-\\u202E' + // bidi embedding and override controls
    '\\u2060-\\u2064' + // word joiner, invisible operators
    '\\u206A-\\u206F' + // deprecated formatting controls
    '\\u3164' + // hangul filler
    '\\uFE00-\\uFE0F' + // variation selectors
    '\\uFEFF' + // zero-width no-break space (BOM)
    '\\uFFA0' + // halfwidth hangul filler
    ']',
  'g',
);

/** True when `text` contains at least one character a human can see. */
export function hasVisibleGlyph(text: string | null | undefined): boolean {
  return (text ?? '').replace(INVISIBLE, '') !== '';
}

export const IfVisible: React.FC<IfVisibleProps> = ({ children, extra = false }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  // useLayoutEffect so the removal happens before the browser paints — an empty
  // bubble must never flash on screen.
  useLayoutEffect(() => {
    if (extra) {
      setHidden(false);
      return;
    }
    setHidden(!hasVisibleGlyph(ref.current?.textContent));
  });

  if (hidden) return null;
  // `display: contents` keeps this wrapper out of the layout entirely, so the
  // children lay out exactly as they did before the gate existed.
  return <div ref={ref} style={{ display: 'contents' }}>{children}</div>;
};
