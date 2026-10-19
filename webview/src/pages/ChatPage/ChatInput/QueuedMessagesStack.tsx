import { useRef } from 'react';
import { PaperAirplaneIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { DragDropProvider } from '@dnd-kit/react';
import { PointerSensor, PointerActivationConstraints } from '@dnd-kit/dom';
import { useSortable } from '@dnd-kit/react/sortable';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import type { QueuedMessage } from '@/shared';
import { MessageBox } from '../message-renderers/components/MessageBox';
import { hoverFromPointer } from './queuedMessageDrag';
import { useQueuedMessageDrag } from './useQueuedMessageDrag';

interface QueuedMessagesStackProps {
  /** The session's backend-owned queue, oldest first — see ChatStreamContext's `queuedMessages`. */
  messages: QueuedMessage[];
  onCancel: (id: string) => void;
  onSteer: (id: string) => void;
  onMerge: (sourceId: string, targetId: string) => void;
  onMove: (id: string, toIndex: number) => void;
}

/**
 * Tailwind's JIT scanner needs a complete class name literally present in
 * source; `translate-y-[${n}px]` built at render time is invisible to it and
 * generates no CSS. This table stands in for "offset by n steps of depth" —
 * indexed instead of computed, so every value it can produce already exists
 * in the compiled stylesheet. Four entries is plenty: a fifth message behind
 * the top one is fully hidden either way, so it costs nothing to share the
 * deepest step with everything past it.
 */
const STACK_TRANSLATE = ['translate-y-0', 'translate-y-1', 'translate-y-[6px]', 'translate-y-[9px]'];
const STACK_SCALE = ['scale-100', 'scale-[0.97]', 'scale-[0.94]', 'scale-[0.91]'];

/** A message behind the top one, at rest: stacked, and fanned out when the stack is hovered or focused. */
function restingSlotClass(depthIdx: number) {
  return [
    'absolute inset-x-0 top-0 z-0 pointer-events-none opacity-70',
    'transition-all duration-150 ease-out',
    STACK_TRANSLATE[depthIdx],
    STACK_SCALE[depthIdx],
    'group-hover/queue:static group-hover/queue:mt-1.5 group-hover/queue:translate-y-0',
    'group-hover/queue:scale-100 group-hover/queue:opacity-100 group-hover/queue:pointer-events-auto',
    // Keyboard focus fans the stack out too: these bubbles stay tabbable while hidden.
    'group-focus-within/queue:static group-focus-within/queue:mt-1.5 group-focus-within/queue:translate-y-0',
    'group-focus-within/queue:scale-100 group-focus-within/queue:opacity-100 group-focus-within/queue:pointer-events-auto',
  ].join(' ');
}
/** During a drag the stack stays fanned out even when the pointer leaves it, or the targets would vanish. */
const FANNED_SLOT_CLASS = 'relative mt-1.5';

/**
 * A mouse or pen starts a drag only after the pointer moved a few pixels (no press-and-hold), so a plain click
 * still expands the bubble. A finger needs a short press first, or every swipe over the stack would start a drag.
 */
const QUEUED_DRAG_SENSORS = [
  PointerSensor.configure({
    activationConstraints: (event: PointerEvent) => event.pointerType === 'touch'
      ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
      : [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
];

/**
 * The queued messages, drawn above the composer.
 *
 * Every message the session's backend queue is holding (see `messageQueue.ts`
 * on the backend and `ChatStreamContext.queuedMessages`) gets one bubble,
 * oldest first. At rest they read as a single card with a slight step behind
 * it per extra message and a count badge on the corner; hovering the stack
 * fans them out into an ordinary list so each one can be read, steered now or
 * removed (two icons inside the bubble) on its own.
 *
 * A message is dragged to move it, or held over the middle of another one to
 * merge the two — see `useQueuedMessageDrag` for the hold that decides which.
 * Optimistic sorting is turned off: the hook, not the drag layer, decides when
 * the others make room. A click still expands the bubble (`MessageBox`'s own
 * behavior); with a mouse or pen the drag only starts after the pointer has moved 5 pixels
 * (no hold delay), with a finger after a 250 ms press, and never from the icon buttons.
 *
 * The message on top at rest is the OLDEST, not the most recently queued: it
 * is the one about to be released to the CLI next, which is the one worth
 * seeing without having to hover first.
 */
export function QueuedMessagesStack({ messages, onCancel, onSteer, onMerge, onMove }: QueuedMessagesStackProps) {
  const container = useRef<HTMLDivElement>(null);
  const drag = useQueuedMessageDrag({ messageIds: messages.map(m => m.id), onMove, onMerge });
  if (messages.length === 0) return null;

  const fanned = drag.draggingId !== null;
  // The page keeps the queue's order and only the flex `order` shows the preview: moving the held
  // message's element in the page would make the drag layer drop the copy that follows the pointer.
  const visualIndex = new Map(drag.orderedIds.map((id, index) => [id, index]));

  /** `to` is where the pointer is going; the operation's own position is a snapshot from before the move. */
  const hover = (
    operation: { target?: Parameters<typeof hoverFromPointer>[0]; position: { current: { x: number; y: number } } },
    to?: { x: number; y: number },
  ) => {
    const found = hoverFromPointer(
      operation.target,
      to ?? operation.position.current,
      container.current?.getBoundingClientRect(),
      { first: drag.orderedIds[0], last: drag.orderedIds[drag.orderedIds.length - 1] },
    );
    if (found === 'gap') drag.hoverGap();
    else drag.hover(found?.id ?? null, found?.zone ?? null);
  };

  return (
    <DragDropProvider
      sensors={QUEUED_DRAG_SENSORS}
      onDragStart={(event) => {
        const source = event.operation.source;
        if (source) drag.start(String(source.id));
      }}
      onDragOver={(event) => {
        // The hold in useQueuedMessageDrag decides when the list moves, not the drag layer.
        event.preventDefault();
        hover(event.operation);
      }}
      onDragMove={(event) => hover(event.operation, event.to)}
      onDragEnd={(event) => (event.canceled ? drag.cancel() : drag.drop())}
    >
      <div ref={container} className="group/queue relative mb-2" data-testid="queued-messages-stack">
        {messages.length > 1 && (
          <div
            data-testid="queued-messages-count"
            // Fades out once the stack is open — the list already answers "how many" by being that many bubbles tall.
            // pointer-events-none: invisible must not mean it still blocks the top bubble's icons.
            className={`pointer-events-none absolute -top-2 -end-2 z-20 flex h-5 min-w-5 items-center justify-center rounded-full border border-border-default bg-surface-raised px-1 text-[0.6923rem] font-medium text-text-secondary transition-opacity duration-150 group-hover/queue:opacity-0 group-focus-within/queue:opacity-0 ${fanned ? 'opacity-0' : ''}`}
          >
            {messages.length}
          </div>
        )}
        <div className="relative flex flex-col">
          {messages.map((message) => {
            const index = visualIndex.get(message.id) ?? 0;
            const depthIdx = Math.min(index, STACK_TRANSLATE.length - 1);
            const slotClass = index === 0 ? 'relative z-10' : fanned ? FANNED_SLOT_CLASS : restingSlotClass(depthIdx);
            return (
              <div key={message.id} className={slotClass} style={{ order: index }} data-queued-slot>
                <QueuedMessageBubble
                  message={message}
                  index={index}
                  isMergeTarget={drag.mergeTargetId === message.id}
                  onCancel={onCancel}
                  onSteer={onSteer}
                />
              </div>
            );
          })}
        </div>
      </div>
    </DragDropProvider>
  );
}

function IconButton(props: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  const { label, onClick, danger, children } = props;
  return (
    <Tooltip content={label} placement="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex items-center justify-center text-text-tertiary transition-colors cursor-pointer ${danger ? 'hover:text-state-error-fg' : 'hover:text-text-primary'}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function QueuedMessageBubble(props: {
  message: QueuedMessage;
  index: number;
  isMergeTarget: boolean;
  onCancel: (id: string) => void;
  onSteer: (id: string) => void;
}) {
  const { message, index, isMergeTarget, onCancel, onSteer } = props;
  const { t } = useTranslation('chat');
  const { ref, isDragging } = useSortable({ id: message.id, index });
  return (
    <div
      ref={ref}
      className={`group/bubble relative min-w-0 rounded-lg cursor-grab ${isDragging ? 'opacity-60' : ''} ${isMergeTarget ? 'ring-1 ring-accent-primary' : ''}`}
      data-testid={`queued-message-${message.id}`}
    >
      {isMergeTarget && (
        <span className="pointer-events-none absolute -top-2 end-2 z-[2] rounded-full bg-accent-primary px-1.5 text-[0.6923rem] font-medium text-text-inverse">
          {t('chatInput.queuedMessages.mergePreview')}
        </span>
      )}
      {/* `compact` caps this at one line until clicked — the requirement a
          queued bubble has that an ordinary sent bubble does not. */}
      <MessageBox variant="compact">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">
            {message.content}
          </div>
          {/* Same place and look as the rename/delete icons of a session in the
              session dropdown. Stopping propagation keeps a click on an icon
              from also toggling MessageBox's expand, which wraps them. */}
          <span
            className="flex shrink-0 items-center gap-1.5 self-center opacity-0 group-hover/bubble:opacity-100 focus-within:opacity-100 transition-opacity"
            onClick={e => e.stopPropagation()}
          >
            <IconButton label={t('chatInput.queuedMessages.steer')} onClick={() => onSteer(message.id)}>
              <PaperAirplaneIcon className="w-3.5 h-3.5" />
            </IconButton>
            <IconButton label={t('chatInput.queuedMessages.remove')} onClick={() => onCancel(message.id)} danger>
              <XMarkIcon className="w-3.5 h-3.5" />
            </IconButton>
          </span>
        </div>
      </MessageBox>
    </div>
  );
}
