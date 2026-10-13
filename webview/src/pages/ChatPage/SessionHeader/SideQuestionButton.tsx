import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { TOGGLE_SIDE_QUESTION_EVENT, useOptionalSideQuestions } from '@/contexts/SideQuestionContext';

/**
 * Dock icon for the "By the way" (`/btw`) window.
 *
 * Dispatches the toggle event rather than holding the window: the same item can
 * be triggered from the ⋮ overflow menu, whose row unmounts the moment it
 * closes, and the shortcut and the command palette raise the very same event.
 * The dot says an answer came in while the window was parked.
 */
export function SideQuestionButton() {
  const { t } = useTranslation('chat');
  const hasUnseen = useOptionalSideQuestions()?.hasUnseen ?? false;

  return (
    <Tooltip content={t('sideQuestion.title')}>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent(TOGGLE_SIDE_QUESTION_EVENT))}
        aria-label={t('sideQuestion.title')}
        className="relative p-1 rounded transition-colors hover:bg-surface-hover"
      >
        <ChatBubbleLeftEllipsisIcon className="w-5 h-5 text-text-secondary hover:text-text-primary" />
        {hasUnseen && (
          <span
            aria-label={t('sideQuestion.newAnswer')}
            className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-accent-primary"
          />
        )}
      </button>
    </Tooltip>
  );
}
