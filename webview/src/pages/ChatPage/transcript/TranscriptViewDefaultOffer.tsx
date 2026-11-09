import { XMarkIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import type { DefaultViewOffer } from './useCycleTranscriptViewMode';

/**
 * The small card that offers to keep the view the shortcut stopped on as the default for every session, as the
 * desktop app does: "Make {mode} your default view?" with one button and a close mark. It sits at the right,
 * above the chat input, and is drawn by the app rather than by a page so that it also shows where the shortcut
 * works without one (the settings page).
 */
export function TranscriptViewDefaultOffer({ offer, accept, dismiss }: DefaultViewOffer) {
  const { t } = useTranslation('chat');
  if (!offer) return null;
  const mode = t(`sessionHeader.transcriptView.${offer}`);

  return (
    <div
      role="status"
      className="fixed bottom-28 end-4 z-[100] flex max-w-[20rem] items-start gap-3 rounded-lg border border-border-default bg-surface-raised px-3 py-2.5 shadow-xl"
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <span className="text-sm text-text-primary">{t('sessionHeader.transcriptView.defaultOffer.title', { mode })}</span>
        <button
          type="button"
          onClick={accept}
          className="rounded-md border border-border-default bg-surface-overlay px-2.5 py-1 text-xs text-text-primary hover:bg-surface-hover"
        >
          {t('sessionHeader.transcriptView.defaultOffer.action')}
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('inputBanner.close')}
        className="text-text-tertiary hover:text-text-secondary"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
