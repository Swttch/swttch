/** Where a dragged message is held over another one. */
export type MessageDropZone = 'before' | 'merge' | 'after';

/** How long a dragged message must stay over the same zone before anything moves or merges. */
export const MESSAGE_DRAG_DWELL_MS = 350;

/**
 * The zone of the hovered message under the pointer: its top quarter places
 * the dragged message before it, its bottom quarter after it, and its middle
 * half (edges included) merges the two. The gap between two bubbles is only a
 * few pixels, which is why the edges of a bubble count as "between".
 */
export function messageDropZone(pointerY: number, rect: { top: number; height: number }): MessageDropZone {
  const offset = (pointerY - rect.top) / rect.height;
  if (offset < 0.25) return 'before';
  if (offset > 0.75) return 'after';
  return 'merge';
}

type Box = { top: number; left: number; width: number; height: number };

function contains(box: Box, pointer: { x: number; y: number }): boolean {
  return pointer.x >= box.left && pointer.x <= box.left + box.width &&
    pointer.y >= box.top && pointer.y <= box.top + box.height;
}

/**
 * How far above the stack (or below it) the pointer still counts as "first
 * place" (or "last place"). A compact bubble is about 28 px tall, so its top
 * quarter alone is a band of a few pixels: too thin to hold still in.
 */
export const STACK_EDGE_MARGIN = 24;

/**
 * What to tell the drag hook for a pointer position, the drop target the drag
 * layer reports and the box of the whole stack: the target's id and zone, 'gap'
 * when the pointer is inside the stack but not on that target (the few pixels
 * between two fanned-out bubbles), or null when it is outside the stack. The
 * drag layer keeps reporting the last overlapped bubble while the pointer is
 * already between bubbles or away, so the stack's box, not the target's, tells
 * a release outside (discarded) from one in a gap (kept). With [ends], the band
 * of {@link STACK_EDGE_MARGIN} just above the stack places before the first
 * message and the band just below places after the last one.
 */
export function hoverFromPointer(
  target: { id: string | number; shape?: { boundingRectangle: Box } | null } | null | undefined,
  pointer: { x: number; y: number },
  container: Box | null | undefined,
  ends?: { first: string; last: string },
): { id: string; zone: MessageDropZone } | 'gap' | null {
  if (!container) return null;
  if (!contains(container, pointer)) {
    const besideStack = pointer.x >= container.left && pointer.x <= container.left + container.width;
    const bottom = container.top + container.height;
    if (!ends || !besideStack) return null;
    if (pointer.y < container.top && pointer.y >= container.top - STACK_EDGE_MARGIN) return { id: ends.first, zone: 'before' };
    if (pointer.y > bottom && pointer.y <= bottom + STACK_EDGE_MARGIN) return { id: ends.last, zone: 'after' };
    return null;
  }
  const rect = target?.shape?.boundingRectangle;
  if (!target || !rect || !contains(rect, pointer)) return 'gap';
  return { id: String(target.id), zone: messageDropZone(pointer.y, rect) };
}

/** [ids] with [sourceId] moved right before or right after [targetId]. Unchanged when either is unknown. */
export function placeMessage(
  ids: string[],
  sourceId: string,
  targetId: string,
  side: 'before' | 'after',
): string[] {
  if (!ids.includes(sourceId)) return ids;
  const rest = ids.filter(id => id !== sourceId);
  const at = rest.indexOf(targetId);
  if (at === -1) return ids;
  rest.splice(side === 'before' ? at : at + 1, 0, sourceId);
  return rest;
}
