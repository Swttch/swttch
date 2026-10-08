import { move } from '@dnd-kit/helpers';
import type { DragEndEvent } from '@dnd-kit/react';
import type { Attachment } from '../../../../types';

/**
 * The attachments' ids in the order a finished drag asks for, or null when the
 * drag changed nothing: it was cancelled, dropped outside the row, or put the
 * chip back where it began.
 *
 * Kept apart from the component so the decision can be tested with a plain
 * object shaped like the drag layer's event, since jsdom cannot make one.
 */
export function idsAfterDrag(attachments: Attachment[], event: DragEndEvent): string[] | null {
  const next = move(attachments, event);
  if (next.every((attachment, index) => attachment === attachments[index])) return null;
  return next.map((attachment) => attachment.id);
}
