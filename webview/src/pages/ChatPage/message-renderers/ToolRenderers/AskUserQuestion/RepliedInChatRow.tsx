import { useState } from 'react';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';

/**
 * The line a question card becomes when the person replied to it in the chat instead of in the card, as the desktop
 * app draws it (measured on its recording):
 *
 * - one question: `Requested "header" Replied in chat ›`; several: `Requested 2 questions Replied in chat ›`
 * - a click opens each question under the line with "Replied in chat" under it, and the arrow turns down
 * - while the pointer is on the line, or while it is open, the line under it holds fork and how long ago it was
 *   sent. Closed, it hangs in the gap below the line and moves nothing.
 */
export function RepliedInChatRow({
  questions,
}: {
  questions: ReadonlyArray<{ question: string; header?: string }>;
}) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);

  const title =
    questions.length === 1
      ? `“${questions[0].header || questions[0].question}”`
      : t('askUserQuestion.card.questionCount', { count: questions.length });
  const replied = t('askUserQuestion.card.repliedInChat');

  return (
    // The inset and the space below are the block's own (the card around this row gives them).
    <div
      data-testid="question-replied-in-chat"
      data-open={open ? '' : undefined}
      className="w-full text-[0.866rem] leading-[1.25rem] text-[var(--tr-muted)]"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-default items-center gap-[0.5624rem] pt-1 pb-1 text-start leading-[0.9rem] text-[0.9375rem] transition-colors hover:text-[var(--tr-hover)]"
      >
        <span>{t('askUserQuestion.card.requested')}</span>
        <span>{title}</span>
        <span>{replied}</span>
        <ChevronRightIcon aria-hidden className={`-ms-[0.3376rem] h-[0.9rem] w-[0.9rem] flex-shrink-0 transition-transform rtl:-scale-x-100 ${open ? 'rotate-90 rtl:-rotate-90' : ''}`} />
      </button>
      {open && (
        <div data-testid="question-replied-in-chat-list" className="mt-3 mb-3 flex flex-col gap-[1.11rem] leading-[1.3188rem]">
          {questions.map((item, index) => (
            <div key={`${index}:${item.question}`}>
              <div>{item.question}</div>
              <div>{replied}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
