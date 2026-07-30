import { useCallback, useEffect, useRef, useState } from 'react';
import type { DockItemId } from '@/types/settings';
import { DockSection } from './moveDockItem';
import { resolveDropTarget, type DropTarget, type MeasuredRow, type MeasuredSection } from './resolveDropTarget';

/** How far the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

interface Params {
  /** Commit a finished drag. Called once, on release, with the final position. */
  onDrop: (id: DockItemId, section: DockSection, index: number) => void;
}

export interface DragState {
  id: DockItemId;
  section: DockSection;
  index: number;
  /** Where the row would land if released now — drives the insertion indicator. */
  target: DropTarget | null;
  /**
   * False while the press has not yet travelled past the threshold. Part of state
   * rather than a ref because the UI reacts to it (the row only looks "lifted"
   * once a real drag begins), and a ref change would not re-render.
   */
  active: boolean;
}

/**
 * Pointer-driven row reordering for the dock editor.
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
  const sectionRefs = useRef(new Map<DockSection, HTMLElement>());
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

  /** Register a section container — the drop target when a section has no rows. */
  const registerSection = useCallback((section: DockSection, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(section, el);
    else sectionRefs.current.delete(section);
  }, []);

  const measure = useCallback(
    (layout: { docked: DockItemId[]; hidden: DockItemId[] }) => {
      const rows: MeasuredRow[] = [];
      for (const section of [DockSection.DOCKED, DockSection.HIDDEN]) {
        layout[section].forEach((id, index) => {
          const el = rowRefs.current.get(id);
          if (!el) return;
          const rect = el.getBoundingClientRect();
          rows.push({ section, index, middle: rect.top + rect.height / 2 });
        });
      }
      const sections: MeasuredSection[] = [];
      for (const [section, el] of sectionRefs.current) {
        const rect = el.getBoundingClientRect();
        sections.push({ section, top: rect.top, bottom: rect.bottom });
      }
      return { rows, sections };
    },
    [],
  );

  const layoutRef = useRef<{ docked: DockItemId[]; hidden: DockItemId[] }>({ docked: [], hidden: [] });
  /** Keep the current layout available to the move handler for measuring. */
  const setLayout = useCallback((layout: { docked: DockItemId[]; hidden: DockItemId[] }) => {
    layoutRef.current = layout;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, id: DockItemId, section: DockSection, index: number) => {
      // Reject only a button we can positively identify as non-primary, so a
      // right-click never starts a drag. Written this way rather than
      // `button !== 0` because the property is not guaranteed to be present on
      // every synthesized pointer event, and treating "unknown" as non-primary
      // would drop the gesture entirely.
      if (typeof e.button === 'number' && e.button !== 0) return;
      origin.current = { x: e.clientX, y: e.clientY };
      started.current = false;
      setDragState({ id, section, index, target: null, active: false });
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
      // keeps "tap the row to toggle it" usable alongside dragging.
      if (!started.current) {
        const moved = Math.hypot(e.clientX - from.x, e.clientY - from.y);
        if (moved < DRAG_THRESHOLD_PX) return;
        started.current = true;
      }

      const { rows, sections } = measure(layoutRef.current);
      const target = resolveDropTarget(e.clientY, rows, sections);
      if (
        current.active &&
        target?.section === current.target?.section &&
        target?.index === current.target?.index
      ) {
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
      if (started.current && current?.target) {
        onDrop(current.id, current.target.section, current.target.index);
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
    registerSection,
    setLayout,
    handlePointerDown,
  };
}
