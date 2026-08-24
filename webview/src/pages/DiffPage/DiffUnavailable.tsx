import { useTranslation } from '@/i18n';

interface Props {
  /** Called when the reviewer dismisses the page. */
  onClose: () => void;
}

/**
 * What a diff page shows when there is no longer a question to answer.
 *
 * Reached more often than it looks: the same request can be answered from the
 * chat prompt, the page can be opened twice, and a reload arrives with nothing
 * but the URL. Every one of those lands on a request the backend has already
 * settled and forgotten.
 *
 * A message and a way out, centred, rather than the empty page this used to be.
 * The window opened for a reason and closing it is the only thing left to do,
 * so that is the one control — the reviewer should not have to work out whether
 * the screen is blank because it is broken or because it is over.
 */
export function DiffUnavailable({ onClose }: Props) {
  const { t } = useTranslation('chat');

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <p className="text-text-primary text-base">{t('diffPage.unavailable.title')}</p>
        <p className="text-text-tertiary text-sm">{t('diffPage.unavailable.description')}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border-default bg-surface-overlay px-4 py-2 text-sm text-text-primary transition-colors hover:bg-surface-hover"
        >
          {t('diffPage.close')}
        </button>
      </div>
    </div>
  );
}
