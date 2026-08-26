import { useTranslation } from '@/i18n';
import type { ReviewBaseChange } from './useReviewBaseChanged';

interface Props {
  change: ReviewBaseChange;
  refreshing: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

/**
 * Say that the file under this review has moved, and offer to rebuild against
 * it (#359).
 *
 * Sits between the header and the diff rather than over them: the diff below is
 * still worth reading — it is what Claude proposed — it just no longer
 * describes the file. Covering it would hide the thing the decision is about.
 *
 * Three cases, and they are told apart because the answer differs:
 *
 *  - The file is gone. There is nothing to rebuild against, so no button.
 *  - The change misses everything the reviewer kept. Rebuilding is routine and
 *    the wording says so.
 *  - The change lands under what they kept. Both sides claim the same lines,
 *    and nothing here can tell which the user meant — so it says that plainly
 *    rather than merging and hoping. This is where git itself stops too.
 */
export function BaseChangedBanner({ change, refreshing, onRefresh, onDismiss }: Props) {
  const { t } = useTranslation('chat');

  const message = change.reason === 'unreadable'
    ? t('diffPage.baseChanged.unreadable')
    : change.overlapsAccepted
      ? t('diffPage.baseChanged.conflict')
      : t('diffPage.baseChanged.outside');

  return (
    <div
      // Announced, because a reviewer who is reading the diff will not be
      // looking at the space where this appears — and the thing it interrupts
      // is them approving a write over their own work.
      role="alert"
      className="flex shrink-0 items-center gap-3 border-b border-border-default bg-state-warning-bg px-4 py-2"
    >
      <span className="min-w-0 flex-1 text-sm text-state-warning-fg">
        {/* The held approval is worth saying first: without it the reviewer
            presses approve, nothing happens, and the banner reads as a warning
            they could ignore. */}
        {change.blockedApproval && (
          <strong className="mr-1 font-medium">{t('diffPage.baseChanged.held')}</strong>
        )}
        {message}
      </span>

      {/* No rebuild offered for a file that is not there: a button that cannot
          act is worse than none. */}
      {change.reason !== 'unreadable' && (
        <button
          type="button"
          className="shrink-0 rounded bg-state-warning-fg/10 px-3 py-1 text-sm text-state-warning-fg disabled:opacity-50"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? t('diffPage.baseChanged.refreshing') : t('diffPage.baseChanged.refresh')}
        </button>
      )}

      <button
        type="button"
        className="shrink-0 text-sm text-text-tertiary hover:text-text-primary"
        onClick={onDismiss}
        aria-label={t('diffPage.baseChanged.dismiss')}
      >
        ×
      </button>
    </div>
  );
}
