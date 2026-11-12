import type { ReactNode } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';

interface VersionLineProps {
  /** What stands left of the version: an update button, an "Up to date" note, or nothing. */
  status?: ReactNode;
  version: string;
  /** Asks for the version again. Omit for a version that cannot change while the screen is open. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Something that acts on the versioned thing itself, after the re-check. */
  trailing?: ReactNode;
}

/**
 * The right-hand side of a version row in About: status, version, re-check.
 *
 * One component for the Claude Code version and for every dependency under it, so a row that
 * reports a version reads and behaves the same whichever program it is about.
 */
export function VersionLine({ status, version, onRefresh, refreshing = false, trailing }: VersionLineProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="flex items-center gap-2">
      {status}
      <span className="text-sm text-text-secondary">{version}</span>
      {onRefresh && (
        <Tooltip content={t('about.versionInfo.refresh')}>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={t('about.versionInfo.refreshVersion')}
            className="text-text-tertiary hover:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </Tooltip>
      )}
      {trailing}
    </div>
  );
}
