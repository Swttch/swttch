import { useLayoutEffect, useState } from 'react';

/** Attribute marking the body of one send section. See `ChatMessageArea`. */
const BODY = '[data-section-body]';

/** Attribute marking the bullet that leads a message. See `ToolWrapper`. */
const BULLET = '[data-message-bullet]';

/**
 * True unless something between `el` and `root` has been switched off with
 * `display: none`.
 *
 * `IfVisible` removes a bubble that drew nothing by setting exactly that inline
 * style, leaving the subtree mounted, so a tally taken with `querySelectorAll`
 * alone would include markers no reader can see.
 *
 * The walk stops at `root` on purpose: `root` is the collapsed body, and it
 * carries `display: none` itself. Walking past it would answer "hidden" for
 * every bullet in a folded section, which is precisely the set being counted.
 *
 * Deliberately not `getClientRects()`, the shorter way to ask this in a
 * browser. It answers "no" for everything under jsdom, where nothing is laid
 * out, so every count would come out zero in tests while looking right in the
 * app — leaving the number verified nowhere but by hand. Reading the inline
 * style asks about the mechanism that actually hides these, and gives the same
 * answer in both places.
 */
function isDrawn(el: Element, root: Element): boolean {
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    if ((node as HTMLElement).style?.display === 'none') return false;
  }
  return true;
}

/**
 * How much a folded section is hiding, counted from the document and kept
 * current.
 *
 * The unit is the bullet that leads a message, because that is the unit a
 * reader counts: a folded reply is a column of dots down the left margin, and
 * "how much is hidden" means how many of those there were. The label calls them
 * replies, following the verb the fold controls already use.
 *
 * ## Why it is measured rather than derived
 *
 * A count of transcript entries was tried and was wrong by construction. An
 * entry is not a bullet: one assistant turn draws a bullet per text block and
 * per tool call, several kinds of entry draw nothing at all, and `IfVisible`
 * only decides which after mount by measuring its own output. Measured on the
 * session where that was caught, one section held 11 entries and drew 4 — the
 * other 7 were `attachment` entries. A live stream and the same transcript
 * replayed from disk do not even carry the same entries.
 *
 * So the question is asked of the rendered result, the way `IfVisible` asks its
 * own. Folding hides the body with CSS instead of unmounting it, which is what
 * leaves anything to ask.
 *
 * ## Why the effect has no dependency array
 *
 * The number has to follow a reply that is still being written. A section can
 * be folded while its reply streams, and every new block adds bullets to a body
 * nobody is looking at. Re-reading after each render of the notice — which
 * re-renders with the transcript around it — keeps the count level with the
 * document without a MutationObserver watching a subtree this large.
 *
 * `setCount` bails out when the number has not moved, so the effect settles
 * after one pass instead of looping. Same shape as `IfVisible`.
 */
export function useHiddenBulletCount(sectionKey: string): number {
  const [count, setCount] = useState(0);

  useLayoutEffect(() => {
    const body = document.querySelector(`[data-send-section="${CSS.escape(sectionKey)}"] ${BODY}`);
    const next = body
      ? Array.from(body.querySelectorAll(BULLET)).filter(el => isDrawn(el, body)).length
      : 0;
    setCount(prev => (prev === next ? prev : next));
  });

  return count;
}
