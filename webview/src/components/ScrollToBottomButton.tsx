import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';

interface Props {
  onClick: () => void;
  /** Where the button sits within its positioned parent. */
  placementClassName: string;
}

/**
 * The "Scroll to bottom" pill shown while a detail view's transcript is not
 * following its newest content; when it shows is decided by useAutoScroll.
 *
 * The same look, wording and markup as the main chat's own button (class list
 * and icon copied from it). The main chat keeps its own inline copy so that
 * nothing about it changes.
 */
export function ScrollToBottomButton(props: Props) {
  const { onClick, placementClassName } = props;
  const { t } = useTranslation('chat');

  return (
    <button
      onClick={onClick}
      className={`absolute ${placementClassName} flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised border border-border-default rounded-full shadow-md text-xs text-text-primary hover:bg-surface-hover transition-colors`}
    >
      <ChevronDownIcon className="w-3.5 h-3.5" />
      {t('chatPage.scrollToBottom')}
    </button>
  );
}
