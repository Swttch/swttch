import type { SessionFamilies } from './families';

/**
 * Dragging a session in the list onto another session, to put it under that one, or onto the strip at the top,
 * to take it to the top level.
 *
 * The rules are here as pure functions so that the row that lights up as a place to drop and the drop that is
 * accepted cannot disagree.
 */

/** The dnd-kit `type` of a session row being dragged. */
export const SESSION_DRAG_TYPE = 'session-link';

/** The id of the strip that takes a dragged session to the top level. */
export const TOP_LEVEL_DROP_ID = 'session-top-level-drop';

/** What a dragged session row carries. */
export interface SessionDragData {
  sessionId: string;
}

/** What a row carries as a drop target. */
export interface SessionDropData {
  sessionId: string;
}

export function readSessionDrag(data: unknown): SessionDragData | null {
  const sessionId = (data as { sessionId?: unknown } | null | undefined)?.sessionId;
  return typeof sessionId === 'string' ? { sessionId } : null;
}

/**
 * Whether [draggedId] may be put under [targetId]: not under itself, not under one of the sessions it started
 * (that would make a loop), and not under the session it is already under.
 */
export function canDropUnder(families: SessionFamilies, draggedId: string, targetId: string): boolean {
  if (draggedId === targetId) return false;
  if (families.parentOf(draggedId) === targetId) return false;
  return !families.descendantsOf(draggedId).some((s) => s.id === targetId);
}

/** Whether [draggedId] has anything to leave: only a session that is under another one can be taken to the top level. */
export function canDropOnTopLevel(families: SessionFamilies, draggedId: string): boolean {
  return families.parentOf(draggedId) !== null;
}
