import {
  ArrowsPointingInIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import type { QueuedMessage } from '@/shared';
import { MessageBox } from '../message-renderers/components/MessageBox';

interface QueuedMessagesStackProps {
  /** The session's backend-owned queue, oldest first — see ChatStreamContext's `queuedMessages`. */
  entries: QueuedMessage[];
  onCancel: (id: string) => void;
  onSteer: (id: string) => void;
  onMergeWithNext: (id: string) => void;
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

/**
 * The queued follow-up messages, drawn above the composer.
 *
 * Every message the session's backend queue is holding (see
 * `messageQueue.ts` on the backend and `ChatStreamContext.queuedMessages`)
 * gets one bubble, oldest first. At rest they read as a single card with a
 * slight step behind it per extra message and a count badge on the corner;
 * hovering the stack fans them out into an ordinary list so each one can be
 * read (and, per bubble, steered now, moved or cancelled from a hover
 * toolbar) on its own. Between two fanned-out bubbles sits a merge button:
 * its place says which two messages it joins, which a button on one bubble
 * could not. The bubble ITSELF still
 * expands to its full text on click, same as any other chat bubble —
 * `MessageBox`'s own behavior, unmodified.
 *
 * The message on top at rest is the OLDEST, not the most recently queued: it
 * is the one about to be released to the CLI next, which is the one worth
 * seeing without having to hover first.
 */
export function QueuedMessagesStack({ entries, onCancel, onSteer, onMergeWithNext, onMove }: QueuedMessagesStackProps) {
  // Index of the lower bubble of the pair whose merge button is hovered or focused.
  const [mergePreview, setMergePreview] = useState<number | null>(null);
  if (entries.length === 0) return null;

  return (
    <div className="group/queue relative mb-2" data-testid="queued-messages-stack">
      {entries.length > 1 && (
        <div
          // Fades out once the stack is hovered open — the expanded list
          // already answers "how many" by being that many bubbles tall.
          // pointer-events-none: invisible must not mean it still blocks the top bubble's toolbar.
          className="pointer-events-none absolute -top-2 -end-2 z-20 flex h-5 min-w-5 items-center justify-center rounded-full border border-border-default bg-surface-raised px-1 text-[0.6923rem] font-medium text-text-secondary transition-opacity duration-150 group-hover/queue:opacity-0 group-focus-within/queue:opacity-0"
        >
          {entries.length}
        </div>
      )}
      <div className="relative">
        {entries.map((entry, index) => {
          const isTop = index === 0;
          const depthIdx = Math.min(index, STACK_TRANSLATE.length - 1);
          return (
            <div
              key={entry.id}
              className={
                isTop
                  ? 'relative z-10'
                  : [
                      'absolute inset-x-0 top-0 z-0 pointer-events-none opacity-70',
                      'transition-all duration-150 ease-out',
                      STACK_TRANSLATE[depthIdx],
                      STACK_SCALE[depthIdx],
                      'group-hover/queue:static group-hover/queue:mt-1.5 group-hover/queue:translate-y-0',
                      'group-hover/queue:scale-100 group-hover/queue:opacity-100 group-hover/queue:pointer-events-auto',
                      // Keyboard focus fans the stack out too: these bubbles stay tabbable while hidden.
                      'group-focus-within/queue:static group-focus-within/queue:mt-1.5 group-focus-within/queue:translate-y-0',
                      'group-focus-within/queue:scale-100 group-focus-within/queue:opacity-100 group-focus-within/queue:pointer-events-auto',
                    ].join(' ')
              }
            >
              {!isTop && (
                <MergeDivider
                  onMerge={() => {
                    // The merge removes this button, which then never sees mouseleave.
                    setMergePreview(null);
                    onMergeWithNext(entries[index - 1].id);
                  }}
                  onPreview={show => setMergePreview(show ? index : null)}
                />
              )}
              <QueuedMessageBubble
                entry={entry}
                index={index}
                count={entries.length}
                highlighted={mergePreview === index || mergePreview === index + 1}
                onCancel={onCancel}
                onSteer={onSteer}
                onMove={onMove}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The merge button between two bubbles. Collapsed to nothing while the stack
 * is at rest; it only takes room once the stack fans out. Hovering or focusing
 * it outlines the two bubbles it would join.
 */
function MergeDivider({ onMerge, onPreview }: { onMerge: () => void; onPreview: (show: boolean) => void }) {
  const { t } = useTranslation('chat');
  return (
    <div className="flex h-0 items-center gap-2 overflow-hidden opacity-0 transition-opacity group-hover/queue:h-auto group-hover/queue:mb-1.5 group-hover/queue:opacity-100 group-focus-within/queue:h-auto group-focus-within/queue:mb-1.5 group-focus-within/queue:opacity-100">
      <div className="h-px flex-1 bg-border-default" />
      <button
        type="button"
        onClick={onMerge}
        onMouseEnter={() => onPreview(true)}
        onMouseLeave={() => onPreview(false)}
        onFocus={() => onPreview(true)}
        onBlur={() => onPreview(false)}
        className="flex items-center gap-1 rounded-full px-1.5 text-[0.7692rem] text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors cursor-pointer"
      >
        <ArrowsPointingInIcon className="w-3.5 h-3.5" />
        {t('chatInput.queuedMessages.merge')}
      </button>
      <div className="h-px flex-1 bg-border-default" />
    </div>
  );
}

function ToolbarButton(props: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  const { label, onClick, danger, children } = props;
  return (
    <Tooltip content={label} placement="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex items-center justify-center w-5 h-5 rounded-full text-text-tertiary hover:bg-surface-hover transition-colors cursor-pointer ${danger ? 'hover:text-state-error-fg' : 'hover:text-text-primary'}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function QueuedMessageBubble(props: {
  entry: QueuedMessage;
  index: number;
  count: number;
  highlighted: boolean;
  onCancel: (id: string) => void;
  onSteer: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
}) {
  const { entry, index, count, highlighted, onCancel, onSteer, onMove } = props;
  const { t } = useTranslation('chat');
  const isFirst = index === 0;
  const isLast = index === count - 1;
  return (
    <div
      className={`group/bubble relative min-w-0 rounded-lg ${highlighted ? 'ring-1 ring-accent-primary' : ''}`}
      data-testid={`queued-message-${entry.id}`}
    >
      {/* `compact` caps this at one line until clicked — the requirement a
          queued bubble has that an ordinary sent bubble does not. */}
      <MessageBox variant="compact">
        <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">
          {entry.content}
        </div>
      </MessageBox>
      {/* Same corner and swallowed-click pattern as `SendActionMenu`: without
          stopping propagation here, the click would also toggle MessageBox's
          own expand, which sits directly underneath these buttons. */}
      <div
        className="absolute -top-2 -end-2 z-[2] flex items-center gap-0.5 rounded-full border border-border-default bg-surface-raised px-0.5 opacity-0 group-hover/bubble:opacity-100 focus-within:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        <ToolbarButton label={t('chatInput.queuedMessages.steer')} onClick={() => onSteer(entry.id)}>
          <PaperAirplaneIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        {!isFirst && (
          <ToolbarButton label={t('chatInput.queuedMessages.moveUp')} onClick={() => onMove(entry.id, index - 1)}>
            <ChevronUpIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
        )}
        {!isLast && (
          <ToolbarButton label={t('chatInput.queuedMessages.moveDown')} onClick={() => onMove(entry.id, index + 1)}>
            <ChevronDownIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
        )}
        <ToolbarButton label={t('chatInput.queuedMessages.cancel')} onClick={() => onCancel(entry.id)} danger>
          <XMarkIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>
    </div>
  );
}
