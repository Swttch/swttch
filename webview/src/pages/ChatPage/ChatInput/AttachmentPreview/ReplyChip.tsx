import { useTranslation } from '@/i18n';
import { QuoteBlock } from '@/components/QuoteBlock';
import type { PendingReply } from '@/utils/composerReplies';

interface Props {
  reply: PendingReply;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * A reply or an excerpt waiting in the message box, as in Claude Desktop: a small card showing the comment (or,
 * with no comment, the quoted text) beside a bar, and a badge saying which of the two it is. A click opens it.
 */
export function ReplyChip({ reply, onOpen, onRemove }: Props) {
  const { t } = useTranslation('chat');
  const isReply = reply.comment !== '';
  const badge = isReply ? t('selectionReply.replyBadge') : t('selectionReply.excerptBadge');
  const preview = isReply ? reply.comment : reply.quote;

  return (
    <div className="relative group">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(reply.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(reply.id);
          }
        }}
        className="flex h-[88px] w-[132px] cursor-pointer flex-col justify-between gap-1 rounded-lg border border-border-default bg-surface-hover px-2 py-1.5 hover:bg-surface-tooltip"
      >
        <QuoteBlock size="sm" clamp={3} className="min-h-0 flex-1 overflow-hidden">
          {preview}
        </QuoteBlock>
        <span className="self-start rounded-full border border-border-default px-1.5 text-[0.6923rem] leading-[1.5] text-text-secondary">
          {badge}
        </span>
      </div>
      <button
        type="button"
        aria-label={`${t('selectionReply.removeCard')}: ${badge}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(reply.id);
        }}
        className="absolute -top-1.5 -end-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface-tooltip text-[0.7692rem] text-text-secondary opacity-0 transition-colors hover:bg-state-error-fg group-hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
