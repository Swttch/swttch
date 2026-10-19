import { useCallback, useEffect, useRef, useState } from 'react';
import { MESSAGE_DRAG_DWELL_MS, placeMessage, type MessageDropZone } from './queuedMessageDrag';

interface Options {
  /** The queue as the backend holds it, oldest first. */
  messageIds: string[];
  onMove: (id: string, toIndex: number) => void;
  onMerge: (sourceId: string, targetId: string) => void;
}

export interface QueuedMessageDrag {
  /** The order to draw: the queue, or the previewed order while a message is held. */
  orderedIds: string[];
  /** The message being dragged, or null. */
  draggingId: string | null;
  /** The message that would absorb the dragged one on drop, or null. */
  mergeTargetId: string | null;
  start: (id: string) => void;
  /** The pointer is over [targetId] in [zone]; null for both means outside the stack. */
  hover: (targetId: string | null, zone: MessageDropZone | null) => void;
  drop: () => void;
  cancel: () => void;
}

/**
 * The drag of a queued message, apart from the drag layer that reports it.
 *
 * Nothing changes the moment the pointer crosses another message: it has to
 * stay over the same zone of the same message for {@link MESSAGE_DRAG_DWELL_MS},
 * like an app icon on a phone's home screen. Only then do the others make room
 * (edge zones) or does the hovered message get outlined (middle zone). Without
 * that hold, the list would slide away from under the pointer before a merge
 * could be aimed at anything.
 *
 * The queue itself only changes on drop, through one `onMove` or `onMerge`.
 */
export function useQueuedMessageDrag({ messageIds, onMove, onMerge }: Options): QueuedMessageDrag {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKey = useRef<string | null>(null);
  const outside = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pendingKey.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  // A message queued or sent during the drag still shows; one that left the queue disappears.
  const orderedIds = preview === null
    ? messageIds
    : [...preview.filter(id => messageIds.includes(id)), ...messageIds.filter(id => !preview.includes(id))];

  const reset = () => {
    clearTimer();
    outside.current = false;
    setDraggingId(null);
    setPreview(null);
    setMergeTargetId(null);
  };

  const start = (id: string) => {
    reset();
    setDraggingId(id);
  };

  const hover = (targetId: string | null, zone: MessageDropZone | null) => {
    if (draggingId === null) return;
    outside.current = targetId === null;
    if (targetId === null || zone === null || targetId === draggingId) {
      clearTimer();
      if (targetId !== mergeTargetId) setMergeTargetId(null);
      return;
    }
    const key = `${targetId}:${zone}`;
    if (key === pendingKey.current) return;
    if (zone !== 'merge' || targetId !== mergeTargetId) setMergeTargetId(null);
    clearTimer();
    pendingKey.current = key;
    const source = draggingId;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (zone === 'merge') {
        setMergeTargetId(targetId);
      } else {
        setPreview(current => placeMessage(current ?? messageIds, source, targetId, zone));
      }
    }, MESSAGE_DRAG_DWELL_MS);
  };

  const drop = () => {
    const source = draggingId;
    const wasOutside = outside.current;
    const target = mergeTargetId;
    const finalOrder = preview === null ? null : orderedIds;
    reset();
    if (source === null || wasOutside || !messageIds.includes(source)) return;
    if (target !== null) {
      onMerge(source, target);
      return;
    }
    if (finalOrder === null) return;
    const toIndex = finalOrder.indexOf(source);
    if (toIndex !== messageIds.indexOf(source)) onMove(source, toIndex);
  };

  return { orderedIds, draggingId, mergeTargetId, start, hover, drop, cancel: reset };
}
