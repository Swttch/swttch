import { ArrowDownTrayIcon, ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

/** The same button the Claude Code version row uses for its update. */
const BUTTON_CLASS =
  'flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ' +
  'bg-accent-primary-hover hover:bg-accent-primary text-text-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

export enum DependencyActivity {
  INSTALLING = 'installing',
  UPDATING = 'updating',
}

interface DependencyStatusProps {
  installed: boolean;
  /** A newer release exists. */
  updatable: boolean;
  /** The registry answered, so "Up to date" is a claim that can be made. */
  latestKnown: boolean;
  /** What is running now, whether the user started it or the backend did. */
  activity: DependencyActivity | null;
  onInstall: () => void;
  onUpdate: () => void;
}

/**
 * What stands left of a dependency's version: the same three states the Claude Code version row
 * shows (an Update button, a spinner while it runs, "Up to date"), plus Install for a package
 * that is not there yet.
 */
export function DependencyStatus({ installed, updatable, latestKnown, activity, onInstall, onUpdate }: DependencyStatusProps) {
  const { t } = useTranslation('settings');
  const spinner = <ArrowPathIcon className="w-3 h-3 animate-spin" />;

  if (activity === DependencyActivity.INSTALLING) {
    return (
      <button type="button" className={BUTTON_CLASS} disabled>
        {spinner}
        {t('about.dependencies.installing')}
      </button>
    );
  }
  if (activity === DependencyActivity.UPDATING) {
    return (
      <button type="button" className={BUTTON_CLASS} disabled>
        {spinner}
        {t('about.cliUpdate.updating')}
      </button>
    );
  }
  if (!installed) {
    return (
      <button type="button" className={BUTTON_CLASS} onClick={onInstall}>
        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
        {t('about.dependencies.install')}
      </button>
    );
  }
  if (updatable) {
    return (
      <button type="button" className={BUTTON_CLASS} onClick={onUpdate}>
        {t('about.cliUpdate.update')}
      </button>
    );
  }
  // Offline there is no latest version to compare with, so nothing is claimed.
  if (!latestKnown) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-text-tertiary">
      <CheckCircleIcon className="w-3.5 h-3.5 text-state-success-fg" />
      {t('about.cliUpdate.upToDate')}
    </span>
  );
}
