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
  /** The pointer is inside the stack but over no message (the gap between two): keep what is previewed. */
  hoverGap: () => void;
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
 * After a move, the dropped order stays on screen until the queue the backend
 * broadcasts differs from the one the drop started from, so the old order
 * never flashes back in between.
 */
export function useQueuedMessageDrag({ messageIds, onMove, onMerge }: Options): QueuedMessageDrag {
  const [draggingId, setDraggingState] = useState<string | null>(null);
  const [preview, setPreviewState] = useState<string[] | null>(null);
  const [settled, setSettled] = useState<{ base: string[]; order: string[] } | null>(null);
  const [mergeTargetId, setMergeTargetState] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKey = useRef<string | null>(null);
  const outside = useRef(false);

  // The drag layer fires several callbacks between two renders, so the handlers read these refs,
  // kept in step with the state at every write; the state only feeds the render.
  const draggingRef = useRef<string | null>(null);
  const previewRef = useRef<string[] | null>(null);
  const mergeTargetRef = useRef<string | null>(null);
  const idsRef = useRef(messageIds);
  idsRef.current = messageIds;
  const callbacks = useRef({ onMove, onMerge });
  callbacks.current = { onMove, onMerge };

  const setDragging = (id: string | null) => { draggingRef.current = id; setDraggingState(id); };
  const setPreview = (ids: string[] | null) => { previewRef.current = ids; setPreviewState(ids); };
  const setMergeTarget = (id: string | null) => { mergeTargetRef.current = id; setMergeTargetState(id); };

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pendingKey.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  // A message queued or sent during the drag still shows; one that left the queue disappears.
  const arrange = (ids: string[], order: string[] | null) => order === null
    ? ids
    : [...order.filter(id => ids.includes(id)), ...ids.filter(id => !order.includes(id))];
  const stillSettled = settled !== null
    && settled.base.length === messageIds.length && settled.base.every((id, i) => id === messageIds[i]);
  const orderedIds = arrange(messageIds, preview ?? (stillSettled ? settled.order : null));

  const reset = () => {
    clearTimer();
    outside.current = false;
    setDragging(null);
    setPreview(null);
    setMergeTarget(null);
    setSettled(null);
  };

  const start = (id: string) => {
    reset();
    setDragging(id);
  };

  const hover = (targetId: string | null, zone: MessageDropZone | null) => {
    const source = draggingRef.current;
    if (source === null) return;
    outside.current = targetId === null;
    if (targetId === null || zone === null || targetId === source) {
      clearTimer();
      setMergeTarget(null);
      return;
    }
    const key = `${targetId}:${zone}`;
    if (key === pendingKey.current) return;
    if (zone !== 'merge' || targetId !== mergeTargetRef.current) setMergeTarget(null);
    clearTimer();
    pendingKey.current = key;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (zone === 'merge') {
        setMergeTarget(targetId);
      } else {
        setPreview(placeMessage(previewRef.current ?? idsRef.current, source, targetId, zone));
      }
    }, MESSAGE_DRAG_DWELL_MS);
  };

  const hoverGap = () => {
    if (draggingRef.current === null) return;
    outside.current = false;
    clearTimer();
  };

  const drop = () => {
    const source = draggingRef.current;
    const wasOutside = outside.current;
    const target = mergeTargetRef.current;
    const ids = idsRef.current;
    const finalOrder = previewRef.current === null ? null : arrange(ids, previewRef.current);
    reset();
    if (source === null || wasOutside || !ids.includes(source)) return;
    if (target !== null) {
      if (ids.includes(target)) callbacks.current.onMerge(source, target);
      return;
    }
    if (finalOrder === null) return;
    const toIndex = finalOrder.indexOf(source);
    if (toIndex === ids.indexOf(source)) return;
    setSettled({ base: ids, order: finalOrder });
    callbacks.current.onMove(source, toIndex);
  };

  return { orderedIds, draggingId, mergeTargetId, start, hover, hoverGap, drop, cancel: reset };
}
