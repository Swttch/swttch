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

/**
 * What to tell the drag hook for a pointer position and the drop target the
 * drag layer reports: the target's id and zone, or null when there is no
 * target or the pointer is outside its box. The drag layer keeps reporting the
 * last overlapped bubble while the pointer is already outside every bubble, so
 * a release there must not count as a drop on it.
 */
export function hoverFromPointer(
  target: { id: string | number; shape?: { boundingRectangle: { top: number; left: number; width: number; height: number } } | null } | null | undefined,
  pointer: { x: number; y: number },
): { id: string; zone: MessageDropZone } | null {
  const rect = target?.shape?.boundingRectangle;
  if (!target || !rect) return null;
  const inside =
    pointer.x >= rect.left && pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top && pointer.y <= rect.top + rect.height;
  if (!inside) return null;
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
