import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './morphText.css';

interface Leaving {
  key: number;
  node: ReactNode;
}

/**
 * A line of text that is replaced by another one the way the desktop app's summary line is (measured on its
 * recording, frame by frame): the two sentences sit over each other in the same place and cross, and the line grows
 * or shrinks to the new sentence's length with a steep ease-out, so a longer sentence is uncovered from its start
 * and a shorter one is drawn in, instead of the line jumping from one length to the other.
 *
 * `id` says which sentence this is. Nothing is animated while it stays the same (the children may still change, as
 * a count does); a new `id` is a new sentence. The first draw is not animated either.
 */
export function MorphText({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const layerRef = useRef<HTMLSpanElement>(null);
  const shownRef = useRef<{ id: string; node: ReactNode }>({ id, node: children });
  const nextKey = useRef(0);
  const [leaving, setLeaving] = useState<Leaving[]>([]);
  const [lastId, setLastId] = useState(id);
  const [width, setWidth] = useState<number | null>(null);
  const [animated, setAnimated] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);

  // Decided while rendering, so that the frame with the new sentence already has the old one over it.
  if (id !== lastId) {
    setLastId(id);
    setLeaving((list) => [...list, { key: nextKey.current++, node: shownRef.current.node }]);
    setAnimated(true);
  }

  // The layer is as wide as its own text (`width: max-content` in the CSS), not as wide as the box it sits in, so
  // reading its width gives the sentence's length whether the box is shorter or longer than that. It is read again
  // whenever the layer changes size, so a text that grows after the first draw (a font that arrives, a count) is not
  // left in a box that was measured too early.
  // `scrollWidth`, not `getBoundingClientRect()`: the page is drawn under a `zoom` on its root, and a rectangle is
  // given in the zoomed pixels while the `width` set here is in the unzoomed ones, so a rectangle left the box 10%
  // short and cut the end of the sentence off.
  useLayoutEffect(() => {
    shownRef.current = { id, node: children };
    const natural = layerRef.current ? layerRef.current.scrollWidth : null;
    if (natural !== null && natural !== width) setWidth(natural);
    // The line is shorter than the sentence (the box stops at the room the line has): its end fades out, as the
    // summary line's end did before.
    const box = boxRef.current;
    const cut = !!box && box.scrollWidth > box.clientWidth + 1;
    if (cut !== clipped) setClipped(cut);
  });
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(layer.scrollWidth));
    observer.observe(layer);
    return () => observer.disconnect();
  }, [id]);

  // The animation's end is what takes a leaving sentence away; with motion reduced there is none, so this does.
  useEffect(() => {
    if (leaving.length === 0) return;
    const timer = setTimeout(() => setLeaving([]), 400);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <span
      ref={boxRef}
      className={`morph-text ${animated ? 'morph-text-animated' : ''} ${clipped ? 'morph-fade-end' : ''} ${className}`}
      style={width === null ? undefined : { width }}
    >
      {leaving.map((entry) => (
        <span
          key={entry.key}
          aria-hidden
          className="morph-layer morph-out"
          onAnimationEnd={() => setLeaving((list) => list.filter((item) => item.key !== entry.key))}
        >
          {entry.node}
        </span>
      ))}
      <span key={id} ref={layerRef} className={`morph-layer ${animated ? 'morph-in' : ''}`}>
        {children}
      </span>
    </span>
  );
}
