import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  initialHeight: number;
  minHeight: number;
  maxHeight: number;
}

/**
 * Drag-to-resize a panel's height from a handle at its bottom edge. Height is
 * plain component state (not measured from the DOM), so nothing needs a
 * ResizeObserver just to know its own size — the drag delta is added directly
 * to the height that was already state.
 */
export function useVerticalResize(options: Options) {
  const { initialHeight, minHeight, maxHeight } = options;
  const [height, setHeight] = useState(initialHeight);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const clamp = useCallback((h: number) => Math.min(maxHeight, Math.max(minHeight, h)), [minHeight, maxHeight]);

  // A resize drag routinely ends with the pointer off the thin handle — often
  // over whatever's behind it, e.g. this modal's click-outside-to-close
  // overlay. The browser synthesizes a click on that element right after
  // pointerup, at the same coordinates, which reads as "the user clicked
  // outside the modal" and closes it the instant a resize finishes (issue:
  // dragging closed the modal it was resizing). This flag marks the brief
  // window between pointerup and that synthesized click so callers — the
  // overlay's onClick — can tell a real outside-click from a drag's tail end.
  const justFinishedRef = useRef(false);

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragStartRef.current = { startY: e.clientY, startHeight: height };
      setIsResizing(true);
    },
    [height],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: PointerEvent) => {
      const drag = dragStartRef.current;
      if (!drag) return;
      setHeight(clamp(drag.startHeight + (e.clientY - drag.startY)));
    };
    const handleUp = () => {
      dragStartRef.current = null;
      setIsResizing(false);
      justFinishedRef.current = true;
      // The synthesized click fires synchronously right after pointerup, so
      // this only needs to survive one tick — cleared on the next one.
      setTimeout(() => {
        justFinishedRef.current = false;
      }, 0);
    };

    // The drag handle is thin — the pointer strays outside it constantly
    // while dragging. Without this, that stray movement selects surrounding
    // text and shows the wrong cursor between handle hit-tests.
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [isResizing, clamp]);

  // Read fresh at call time (not a plain boolean return) — the overlay calls
  // this from inside its own click handler, after this hook's justFinishedRef
  // was set, so it needs the current value rather than one captured at the
  // render that produced this closure.
  const wasJustResizing = useCallback(() => justFinishedRef.current, []);

  return { height, isResizing, startResize, wasJustResizing };
}
