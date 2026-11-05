import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { QuoteBlock } from '@/components/QuoteBlock';
import { isMac } from '@/config/environment';

/**
 * The send button's mark in Claude Desktop's reply box: a speech bubble drawn as an open circle with its tail at
 * the bottom left, and a plus where the circle is left open at the bottom right.
 */
function ReplyAddIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M8.2 15.4H5.2V13A6.3 6.3 0 1 1 16.1 11.4" />
      <path d="M14.8 13.2v4.6M12.5 15.5h4.6" />
    </svg>
  );
}

interface Props {
  /** The selected text the reply is about. */
  quote: string;
  style: CSSProperties;
  /** Enter was pressed: `comment` is what was written, empty for an excerpt. `send` is ⌘↵ (Ctrl+Enter off the Mac). */
  onSubmit: (comment: string, send: boolean) => void;
  onCancel: () => void;
}

/**
 * The small card that opens beside selected text when "Reply" is pressed (as in Claude Desktop): the quote on
 * top, a box for the comment under it. Enter puts the card in the message box and ⌘↵ sends it right away; the
 * send button's tooltip says so.
 */
export function ReplyComposerCard({ quote, style, onSubmit, onCancel }: Props) {
  const { t } = useTranslation('chat');
  const [comment, setComment] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendKeys = isMac() ? '⌘↵' : 'Ctrl+↵';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Nothing outside the card closes it: as in Claude Desktop, a comment being written stays put while the reader
  // looks elsewhere or selects other text. Esc, or sending the card, ends it.

  // The box grows with what is written, up to a limit.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [comment]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      style={style}
      className="fixed z-40 flex w-[420px] max-w-[calc(100vw-16px)] flex-col gap-3 rounded-2xl border border-border-default bg-surface-raised px-4 py-3 shadow-2xl"
    >
      <QuoteBlock size="sm" clamp={2} className="[&>div]:text-[0.9231rem]">
        {quote}
      </QuoteBlock>
      <div className="flex items-end gap-3">
        <textarea
          ref={inputRef}
          rows={1}
          value={comment}
          placeholder={t('selectionReply.placeholder')}
          aria-label={t('selectionReply.placeholder')}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit(comment.trim(), e.metaKey || e.ctrlKey);
            }
          }}
          className="min-h-[24px] flex-1 resize-none bg-transparent text-[1rem] leading-[1.5] text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <Tooltip
          desktop
          placement="top"
          content={
            <div className="flex flex-col gap-1.5 px-1 py-1">
              <div className="flex items-center justify-between gap-6">
                <span>{t('selectionReply.addToPrompt')}</span>
                <span className="text-white/50">↵</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span>{t('selectionReply.sendReply')}</span>
                <span className="text-white/50">{sendKeys}</span>
              </div>
            </div>
          }
        >
          <button
            type="button"
            aria-label={t('selectionReply.addToPrompt')}
            onClick={() => onSubmit(comment.trim(), false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-primary/80 transition-colors hover:bg-surface-tooltip hover:text-text-primary"
          >
            <ReplyAddIcon className="h-5 w-5" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
