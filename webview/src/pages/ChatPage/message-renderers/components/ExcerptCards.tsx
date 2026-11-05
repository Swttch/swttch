import React, { useState } from 'react';
import { useTranslation } from '@/i18n';
import { QuoteBlock } from '@/components/QuoteBlock';
import { ReplyDialog } from '../../ChatInput/AttachmentPreview/ReplyDialog';

interface Props {
  excerpts: readonly string[];
}

/**
 * The excerpts a user message opens with, as in Claude Desktop: one small card each above the bubble, showing
 * the quoted text beside a bar and an "Excerpt" badge. A click opens the whole quote.
 */
export const ExcerptCards: React.FC<Props> = ({ excerpts }) => {
  const { t } = useTranslation('chat');
  const [opened, setOpened] = useState<number | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        {excerpts.map((quote, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setOpened(index)}
            className="flex h-[88px] w-[132px] cursor-pointer flex-col justify-between gap-1 rounded-lg border border-border-default bg-surface-hover px-2 py-1.5 text-start hover:bg-surface-tooltip"
          >
            <QuoteBlock size="sm" clamp={3} className="min-h-0 flex-1 overflow-hidden">
              {quote}
            </QuoteBlock>
            <span className="self-start rounded-full border border-border-default px-1.5 text-[0.6923rem] leading-[1.5] text-text-secondary">
              {t('selectionReply.excerptBadge')}
            </span>
          </button>
        ))}
      </div>
      {opened !== null && excerpts[opened] !== undefined && (
        <ReplyDialog reply={{ id: `excerpt-${opened}`, quote: excerpts[opened], comment: '' }} onClose={() => setOpened(null)} />
      )}
    </>
  );
};
