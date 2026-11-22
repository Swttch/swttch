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
      className="fixed bottom-[6.3rem] end-[0.9rem] z-[100] flex max-w-[18rem] items-start gap-[0.675rem] rounded-[0.45rem] border border-border-default bg-surface-raised px-[0.675rem] py-[0.5624rem] shadow-xl"
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[0.45rem]">
        <span className="text-[0.7874rem] leading-[1.125rem] text-text-primary">{t('sessionHeader.transcriptView.defaultOffer.title', { mode })}</span>
        <button
          type="button"
          onClick={accept}
          className="rounded-[0.3376rem] border border-border-default bg-surface-overlay px-[0.5624rem] py-[0.225rem] text-[0.675rem] leading-[0.9rem] text-text-primary hover:bg-surface-hover"
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
        <XMarkIcon className="h-[0.9rem] w-[0.9rem]" />
      </button>
    </div>
  );
}
