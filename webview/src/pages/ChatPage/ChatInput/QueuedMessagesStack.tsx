import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import type { QueuedMessage } from '@/shared';
import { MessageBox } from '../message-renderers/components/MessageBox';

interface QueuedMessagesStackProps {
  /** The session's backend-owned queue, oldest first — see ChatStreamContext's `queuedMessages`. */
  entries: QueuedMessage[];
  onCancel: (id: string) => void;
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
 * read (and, per bubble, cancelled) on its own. The bubble ITSELF still
 * expands to its full text on click, same as any other chat bubble —
 * `MessageBox`'s own behavior, unmodified.
 *
 * The message on top at rest is the OLDEST, not the most recently queued: it
 * is the one about to be released to the CLI next, which is the one worth
 * seeing without having to hover first.
 */
export function QueuedMessagesStack({ entries, onCancel }: QueuedMessagesStackProps) {
  const { t } = useTranslation('chat');
  if (entries.length === 0) return null;

  return (
    <div className="group/queue relative mb-2" data-testid="queued-messages-stack">
      {entries.length > 1 && (
        <div
          // Fades out once the stack is hovered open — the expanded list
          // already answers "how many" by being that many bubbles tall.
          className="absolute -top-2 -end-2 z-20 flex h-5 min-w-5 items-center justify-center rounded-full border border-border-default bg-surface-raised px-1 text-[0.6923rem] font-medium text-text-secondary transition-opacity duration-150 group-hover/queue:opacity-0"
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
                    ].join(' ')
              }
            >
              <QueuedMessageBubble entry={entry} onCancel={onCancel} cancelLabel={t('chatInput.queuedMessages.cancel')} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QueuedMessageBubble(props: { entry: QueuedMessage; onCancel: (id: string) => void; cancelLabel: string }) {
  const { entry, onCancel, cancelLabel } = props;
  return (
    <div className="group/bubble relative min-w-0">
      {/* `compact` caps this at one line until clicked — the requirement a
          queued bubble has that an ordinary sent bubble does not. */}
      <MessageBox variant="compact">
        <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">
          {entry.content}
        </div>
      </MessageBox>
      {/* Same corner and swallowed-click pattern as `SendActionMenu`: without
          stopping propagation here, the click would also toggle MessageBox's
          own expand, which sits directly underneath this button. */}
      <div className="absolute -top-2 -end-2 z-[2]" onClick={e => e.stopPropagation()}>
        <Tooltip content={cancelLabel} placement="top">
          <button
            type="button"
            onClick={() => onCancel(entry.id)}
            aria-label={cancelLabel}
            className="flex items-center justify-center w-5 h-5 rounded-full border border-border-default bg-surface-raised text-text-tertiary hover:text-state-error-fg hover:bg-surface-hover transition-all opacity-0 group-hover/bubble:opacity-100 focus-visible:opacity-100 cursor-pointer"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
