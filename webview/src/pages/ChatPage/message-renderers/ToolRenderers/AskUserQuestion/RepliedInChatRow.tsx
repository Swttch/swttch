import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { LoadedMessageDto } from '@/types';
import { useSendActionsValue } from '../../../SendActionsContext';
import { TranscriptReplyFooter } from '../../../transcript/TranscriptReplyFooter';

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
  message,
}: {
  questions: ReadonlyArray<{ question: string; header?: string }>;
  message?: LoadedMessageDto;
}) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const sendActions = useSendActionsValue();
  const uuid = message?.uuid;
  const onFork = sendActions && uuid && sendActions.canForkReply(uuid) ? () => sendActions.forkAtReply(uuid) : undefined;

  const title =
    questions.length === 1
      ? `“${questions[0].header || questions[0].question}”`
      : t('askUserQuestion.card.questionCount', { count: questions.length });
  const Arrow = open ? ChevronDownIcon : ChevronRightIcon;
  const replied = t('askUserQuestion.card.repliedInChat');

  return (
    // Open, the list and the line under it take their own room, and the room the closed line leaves under it is
    // given back (the next message stands the same distance from the line under it as from the closed line).
    <div
      data-testid="question-replied-in-chat"
      data-open={open ? '' : undefined}
      className={`mt-[0.25rem] w-full text-[0.866rem] leading-[1.25rem] text-[var(--tr-muted)] ${open ? 'mb-[-1.1075rem]' : 'mb-[1.5rem]'}`}
    >
      {/* A layer of its own for the hover group: a stylesheet rule gives the `flex` child of a `group` that stands
          directly in a transcript card no gap. */}
      <div className="group relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-default items-center gap-[0.4rem] text-start"
      >
        <span>{t('askUserQuestion.card.requested')}</span>
        <span>{title}</span>
        <span>{replied}</span>
        <Arrow aria-hidden className="ms-[-0.075rem] h-[0.7rem] w-[0.7rem]" strokeWidth={3} />
      </button>
      {open && (
        <div data-testid="question-replied-in-chat-list" className="mt-[1.146rem] flex flex-col gap-[1.11rem] leading-[1.3188rem]">
          {questions.map((item, index) => (
            <div key={`${index}:${item.question}`}>
              <div>{item.question}</div>
              <div>{replied}</div>
            </div>
          ))}
        </div>
      )}
      {(onFork || message?.timestamp) && (
        // Closed: out of the flow, in the gap under the line, with an invisible strip above it so that the pointer
        // can go down to it without the line under it fading out on the way.
        <div className={open ? 'mt-[0.67rem]' : 'absolute inset-x-0 top-full'}>
          {!open && <div aria-hidden className="absolute inset-x-0 bottom-full h-[0.986rem]" />}
          <TranscriptReplyFooter
            className={open ? '' : 'mt-[0.986rem]'}
            timestamp={message?.timestamp}
            onFork={onFork}
            shown={open}
          />
        </div>
      )}
      </div>
    </div>
  );
}
