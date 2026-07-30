import { useCallback, useEffect, useRef, useState } from 'react';
import type { DockItemId } from '@/types/settings';
import { resolveDropTarget, type MeasuredRow } from './resolveDropTarget';

/** How far the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

interface Params {
  /** Commit a finished drag. Called once, on release, with the final index. */
  onDrop: (id: DockItemId, index: number) => void;
}

export interface DragState {
  id: DockItemId;
  /** Where the row would land if released now — drives the insertion indicator. */
  target: number | null;
  /**
   * False while the press has not yet travelled past the threshold. Part of state
   * rather than a ref because the UI reacts to it (the row only looks "lifted"
   * once a real drag begins), and a ref change would not re-render.
   */
  active: boolean;
}

/**
 * Pointer-driven row reordering for the dock editor's single ordered list.
 *
 * Deliberately NOT HTML5 drag-and-drop. This webview also runs inside JCEF, where
 * `dataTransfer` proved unreliable enough that native file drops had to be routed
 * around it entirely (Kotlin CefDragHandler → backend → IPC; see
 * ChatInput/hooks/useAttachments.ts). Pointer events are the mechanism already
 * proven in this environment (EffortSlider), they behave identically in a plain
 * browser, and unlike HTML5 DnD they can be simulated in jsdom.
 *
 * Geometry is measured from the live DOM on each move rather than cached at
 * press: rows shift as the insertion indicator appears, so cached rects would
 * point at stale positions after the first movement.
 */
export function useReorderDrag(params: Params) {
  const { onDrop } = params;
  const [drag, setDrag] = useState<DragState | null>(null);

  const rowRefs = useRef(new Map<DockItemId, HTMLElement>());
  const origin = useRef<{ x: number; y: number } | null>(null);
  const started = useRef(false);
  // Mirrors `drag` for the window listeners, which close over the state they were
  // registered with and would otherwise read a stale value.
  const dragRef = useRef<DragState | null>(null);
  const setDragState = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  /** Register a row element so its position can be measured mid-drag. */
  const registerRow = useCallback((id: DockItemId, el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }, []);

  const measure = useCallback((order: DockItemId[]) => {
    const rows: MeasuredRow[] = [];
    order.forEach((id, index) => {
      const el = rowRefs.current.get(id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      rows.push({ index, middle: rect.top + rect.height / 2 });
    });
    return rows;
  }, []);

  const orderRef = useRef<DockItemId[]>([]);
  /** Keep the current row order available to the move handler for measuring. */
  const setOrder = useCallback((order: DockItemId[]) => {
    orderRef.current = order;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, id: DockItemId) => {
      // Reject only a button we can positively identify as non-primary, so a
      // right-click never starts a drag. Written this way rather than
      // `button !== 0` because the property is not guaranteed to be present on
      // every synthesized pointer event, and treating "unknown" as non-primary
      // would drop the gesture entirely.
      if (typeof e.button === 'number' && e.button !== 0) return;
      origin.current = { x: e.clientX, y: e.clientY };
      started.current = false;
      setDragState({ id, target: null, active: false });
    },
    [setDragState],
  );

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const from = origin.current;
      const current = dragRef.current;
      if (!from || !current) return;

      // A press that never travels is a click, not a drag — this threshold is what
      // keeps a plain click on the row usable alongside dragging its handle.
      if (!started.current) {
        const moved = Math.hypot(e.clientX - from.x, e.clientY - from.y);
        if (moved < DRAG_THRESHOLD_PX) return;
        started.current = true;
      }

      const rows = measure(orderRef.current);
      const target = resolveDropTarget(e.clientY, rows);
      if (current.active && target === current.target) {
        return; // nothing changed; skip the re-render
      }
      setDragState({ ...current, target, active: true });
    };

    const reset = () => {
      origin.current = null;
      started.current = false;
      setDragState(null);
    };

    const onUp = () => {
      const current = dragRef.current;
      // Only commit an actual drag. A plain click leaves `started` false, so the
      // row's own onClick handles it instead.
      if (started.current && current?.target !== null && current?.target !== undefined) {
        onDrop(current.id, current.target);
      }
      reset();
    };

    // A cancelled gesture must NOT commit — the pointer was taken away (a system
    // gesture, focus loss), which means the user did not choose a position.
    const onCancel = () => reset();

    // Esc abandons the drag, the same as everywhere else in the app. Stop the
    // event so it does not also close the menu the user is still editing in.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !started.current) return;
      e.stopPropagation();
      e.preventDefault();
      reset();
    };

    // Listeners live on window so a pointer released outside the menu still ends
    // the drag instead of leaving a row stuck to the cursor.
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    // Capture phase so the drag claims Esc before the menu's own handler sees it.
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [drag, measure, onDrop, setDragState]);

  return {
    /** Non-null only once the press has become a real drag (`active`). */
    drag: drag?.active ? drag : null,
    registerRow,
    setOrder,
    handlePointerDown,
  };
}
