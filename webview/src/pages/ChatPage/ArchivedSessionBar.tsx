import { useSessionContext } from '@/contexts/SessionContext';
import { useTranslation } from '@/i18n';
import { InputColumn } from './ChatInput/InputColumn';

const BUTTON_BASE = 'shrink-0 rounded px-3 py-1 text-[0.7692rem] font-medium transition-colors';
/** Unarchive: a quiet button, a step lighter than the box (the box is `surface-hover`, as the card above it is). */
const BUTTON_CLASS = `${BUTTON_BASE} bg-border-default text-text-primary hover:bg-surface-pressed`;
/** New session: the same button with its background and text colours swapped, so it is the one that stands out. */
const BUTTON_INVERTED_CLASS = `${BUTTON_BASE} bg-text-primary text-surface-base hover:opacity-85`;

/**
 * Covers the chat input when the session is archived. An archived session is not worked in, and the way on is offered
 * over the input: start a new session in this tab (left button), or bring this session back (right button).
 *
 * The input is not removed. It stays where it is, hidden (see `ArchivedChatInputSlot`), so it keeps its place and its
 * size; this bar is laid over that place with `absolute inset-0` and fills the box the input would have drawn. The bar
 * stands in the same `InputColumn`, so the two have the same width and margins, and a change to the input's size
 * changes the bar with it.
 *
 * With room, the sentence stands at the box's vertical middle and the two buttons at its right end. Without room, the
 * buttons go under the sentence, at the right end of their own line. The sentence asks for 22rem before it lets the
 * buttons share its line, but never more than the box has: at a large zoom the box is narrower than 22rem, and a
 * fixed minimum would push the text out of it.
 */
export function ArchivedSessionBar({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation('chat');
  const { setSessionArchived, resetToNewSession } = useSessionContext();

  return (
    <div role="status" data-testid="archived-session-bar" className="absolute inset-0">
      <InputColumn className="h-full">
        <div className="flex h-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border-default/70 bg-surface-hover px-3 py-2">
          <span className="min-w-[min(22rem,100%)] flex-1 break-words text-base leading-normal text-text-primary">
            {t('archivedSession.message')}
          </span>
          <div className="ms-auto flex shrink-0 items-center gap-2">
            <button type="button" onClick={resetToNewSession} className={BUTTON_INVERTED_CLASS}>
              {t('archivedSession.newSession')}
            </button>
            <button type="button" onClick={() => void setSessionArchived(sessionId, false)} className={BUTTON_CLASS}>
              {t('archivedSession.unarchive')}
            </button>
          </div>
        </div>
      </InputColumn>
    </div>
  );
}

/**
 * The input of an archived session: still mounted and still taking its place, but hidden (`invisible` keeps the
 * layout) and shut to the keyboard and the pointer (`inert`), with the archived bar laid over it. Nothing can be typed
 * or focused in what is hidden.
 */
export function ArchivedChatInputSlot({ sessionId, children }: { sessionId: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="invisible" aria-hidden="true" {...({ inert: '' } as object)}>
        {children}
      </div>
      <ArchivedSessionBar sessionId={sessionId} />
    </div>
  );
}
