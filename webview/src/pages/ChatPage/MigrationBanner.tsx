import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useMigrationRetry } from '@/hooks/useMigrationRetry';
import { useMigrationStatus } from '@/hooks/useMigrationStatus';
import { useTranslation } from '@/i18n';

/**
 * Top banner for the data migrations the backend runs when it starts.
 *
 * Silent when all is well, which is nearly always: the backend only announces a run
 * that is still going after a second. It speaks in three cases.
 *
 * - `running`: the user's data is being moved to the shape this version reads, and
 *   the prompt library and project list will answer as soon as it is done.
 * - `failed`: a migration failed, so the library and the project list are held back
 *   rather than shown half moved. It is tried again when the user comes back to the
 *   window, and the button tries it now. Nothing is restarted.
 * - `done` with folders it could not read: the old files in them were left where they
 *   were, and the user can act on that by allowing access. The backend reads them
 *   again by itself (at start, when their prompts are opened, when the window is
 *   active again), so the banner goes away without a click. They may close it.
 */
export function MigrationBanner() {
  const migration = useMigrationStatus();
  const { t } = useTranslation('chat');
  const { retry, retrying } = useMigrationRetry(migration.status === 'failed');
  const [dismissed, setDismissed] = useState(false);

  if (migration.status === 'idle') return null;

  if (migration.status === 'running') {
    return (
      <div className="w-full z-20 border-t border-b border-banner-info-border bg-banner-info-bg px-4 py-1.5">
        <span className="text-text-primary text-[0.8461rem]">{t('dataUpdate.running')}</span>
      </div>
    );
  }

  if (migration.status === 'done' && dismissed) return null;

  const message =
    migration.status === 'failed'
      ? t('dataUpdate.failed', { name: migration.failedMigration ?? '' })
      : t('dataUpdate.unreadable', { folders: migration.unreadable.join(', ') });

  return (
    <div className="w-full z-20 border-t border-b border-state-warning-border bg-state-warning-bg px-4 py-1.5 flex items-center gap-3">
      <span className="text-state-warning-fg text-[0.8461rem] mr-auto">{message}</span>
      {migration.status === 'failed' && (
        <button
          type="button"
          disabled={retrying}
          onClick={() => void retry()}
          className="shrink-0 rounded bg-surface-base px-3 py-1 text-[0.7692rem] font-medium text-text-link hover:bg-accent-primary hover:text-text-primary transition-colors disabled:opacity-60 disabled:cursor-default"
        >
          {retrying ? t('dataUpdate.retrying') : t('dataUpdate.retry')}
        </button>
      )}
      {migration.status === 'done' && (
        <button
          type="button"
          aria-label={t('dataUpdate.dismiss')}
          onClick={() => setDismissed(true)}
          className="p-0.5 rounded text-state-warning-fg hover:bg-accent-primary transition-colors"
        >
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
