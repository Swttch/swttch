import type { ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

interface Props {
  title: string;
  description: ReactNode;
  /** A quieter line under the description — how to actually do the thing. */
  footnote?: ReactNode;
  onDismiss: () => void;
}

/**
 * The card every inline announcement is drawn as.
 *
 * One implementation on purpose: the same announcement appears in the settings
 * screen and in the empty chat, and two copies of this markup would drift the
 * first time either is touched.
 */
export function InlineAnnouncementCard(props: Props) {
  const { title, description, footnote, onDismiss } = props;
  const { t } = useTranslation('settings');

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border-default bg-surface-raised p-4 text-left">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 text-[0.8461rem] leading-relaxed text-text-secondary">{description}</p>
        {footnote && <p className="mt-2 text-[0.7307rem] leading-relaxed text-text-tertiary">{footnote}</p>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('layout.close')}
        className="shrink-0 rounded p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
