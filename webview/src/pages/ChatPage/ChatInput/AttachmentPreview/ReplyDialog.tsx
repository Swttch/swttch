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
}

/** What a reply or an excerpt card will say when the message is sent: the quote, then the comment. */
export function ReplyDialog({ reply, onClose }: Props) {
  const { t } = useTranslation('chat');
  const isReply = reply.comment !== '';
  useEscapeLayer(() => {
    onClose();
    return true;
  });

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
          <h2 className="pr-6 text-md font-semibold text-text-primary">
            {isReply ? t('selectionReply.replyBadge') : t('selectionReply.excerptBadge')}
          </h2>
          <QuoteBlock className="min-h-0 flex-1 overflow-y-auto">
            <div>{quoteLines(reply.quote)}</div>
            {isReply && <div className="mt-4 text-text-primary/90">{reply.comment}</div>}
          </QuoteBlock>
        </div>
      </div>
    </Portal>
  );
}
