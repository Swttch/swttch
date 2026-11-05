import { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { QuoteBlock } from '@/components/QuoteBlock';
import { Portal } from '@/components/Portal';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import { quoteLines } from '../../message-renderers/utils/replyBlocks';
import type { PendingReply } from '@/utils/composerReplies';

interface Props {
  reply: PendingReply;
  onClose: () => void;
  /**
   * Given for a card still in the message box: the comment can then be rewritten here (Enter saves, Esc and the
   * other ways out drop the change), and a card with no comment can be given one. Left out for what was already
   * sent, which is a record and is only read.
   */
  onSave?: (comment: string) => void;
}

/** What a reply or an excerpt card will say when the message is sent: the quote, then the comment. */
export function ReplyDialog({ reply, onClose, onSave }: Props) {
  const { t } = useTranslation('chat');
  const [draft, setDraft] = useState(reply.comment);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editable = onSave !== undefined;
  const isReply = reply.comment !== '';
  useEscapeLayer(() => {
    onClose();
    return true;
  });

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // The box grows with what is written, up to a limit.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div role="dialog" className="relative flex max-h-[80vh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-xl border border-border-default bg-surface-raised p-5 shadow-2xl">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('selectionReply.close')}
            className="absolute right-3 top-3 rounded p-1 text-text-tertiary transition-colors hover:bg-surface-tooltip hover:text-text-primary"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
          {/* The key hint sits in the title row, left of the close button, so it takes no line of its own. */}
          <div className="flex items-center justify-between gap-3 pr-7">
            <h2 className="text-md font-semibold text-text-primary">
              {isReply ? t('selectionReply.replyBadge') : t('selectionReply.excerptBadge')}
            </h2>
            {editable && <span className="text-xs text-text-tertiary">{t('selectionReply.editHint')}</span>}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <QuoteBlock>
              <div>{quoteLines(reply.quote)}</div>
              {!editable && isReply && <div className="mt-4 text-text-primary/90">{reply.comment}</div>}
            </QuoteBlock>
            {editable && (
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                placeholder={t('selectionReply.placeholder')}
                aria-label={t('selectionReply.placeholder')}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    onSave(draft.trim());
                    onClose();
                  }
                }}
                className="block w-full resize-none bg-transparent text-[1rem] leading-[1.5] text-text-primary outline-none placeholder:text-text-tertiary"
              />
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
