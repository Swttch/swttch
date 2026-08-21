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
  /**
   * Identifies the entry for the debugging trail below, e.g. the `tool_use_id`
   * of a tool_result that found no tool card to fold into. Optional: an entry
   * with nothing to identify it still gets counted, just without an id.
   */
  debugId?: string;
}

/**
 * Records an entry this gate removed, so "how often would an empty bubble have
 * appeared here?" stays answerable after the bubble itself is gone.
 *
 * Both trails are deliberately left on in production. They cost one attribute
 * and one array entry per hidden bubble, are invisible to the user, and are the
 * only way to tell "the defect is fixed" apart from "the conditions never
 * occurred" — including on a reporter's machine, where the console is all we
 * get. See `ccgLogs` for the same reasoning applied to logs.
 *
 *   document.querySelectorAll('[data-ccg-would-be-empty]')   where, in the DOM
 *   window.ccgEmptyBubbles                                   how many, and which ids
 */
const WOULD_BE_EMPTY_ATTR = 'data-ccg-would-be-empty';

interface EmptyBubbleTrail {
  count: number;
  ids: string[];
}

function recordWouldBeEmpty(debugId: string | undefined): void {
  const w = window as unknown as { ccgEmptyBubbles?: EmptyBubbleTrail };
  const trail = (w.ccgEmptyBubbles ??= { count: 0, ids: [] });
  trail.count += 1;
  if (debugId) trail.ids.push(debugId);
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

export const IfVisible: React.FC<IfVisibleProps> = ({ children, extra = false, debugId }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  // The effect below runs on every render, but one bubble is one occurrence —
  // a re-render (or StrictMode's double invoke) must not inflate the tally.
  const counted = useRef(false);

  // useLayoutEffect so the removal happens before the browser paints — an empty
  // bubble must never flash on screen.
  useLayoutEffect(() => {
    if (extra) {
      setHidden(false);
      return;
    }
    const isEmpty = !hasVisibleGlyph(ref.current?.textContent);
    if (isEmpty && !counted.current) {
      counted.current = true;
      recordWouldBeEmpty(debugId);
    }
    setHidden(isEmpty);
  });

  // `display: contents` keeps this wrapper out of the layout entirely, so the
  // children lay out exactly as they did before the gate existed.
  return <div ref={ref} {...{ [WOULD_BE_EMPTY_ATTR]: debugId ?? '' }} style={{ display: hidden ? 'none' : 'contents' }}>{children}</div>;
};
