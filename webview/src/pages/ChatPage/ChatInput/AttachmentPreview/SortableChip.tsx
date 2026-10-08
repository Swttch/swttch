import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/react/sortable';

interface Props {
  /** The attachment's id, which is also what the drag layer calls it. */
  id: string;
  /** Where the chip sits among the finished attachments. */
  index: number;
  /** False when there is nothing to reorder, so the chip does not invite a drag. */
  sortable: boolean;
  children: ReactNode;
}

/**
 * Lets a chip or card be picked up and moved among the others.
 *
 * The element that carries the drag is this wrapper, not the chip: the chips are
 * four different components, and what they share is only that they sit in the row.
 * A press on the chip's own button (its x) never starts a drag, which is the drag
 * layer's default and exactly what is wanted, and a press that travels less than
 * the library's threshold stays a click, so opening an image still works.
 */
export function SortableChip(props: Props) {
  const { id, index, sortable, children } = props;
  const { ref, isDragging } = useSortable({ id, index, disabled: !sortable, type: 'attachment', accept: 'attachment' });

  const classes = ['select-none'];
  if (sortable) classes.push('cursor-grab', 'active:cursor-grabbing');
  if (isDragging) classes.push('opacity-80');

  return (
    <div ref={ref} data-attachment-id={id} className={classes.join(' ')}>
      {children}
    </div>
  );
}
