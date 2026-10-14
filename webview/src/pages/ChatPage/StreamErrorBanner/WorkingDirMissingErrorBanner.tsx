import { useSessionContext } from '@/contexts';
import { isJetBrains } from '@/config/environment';
import { useTranslation } from '@/i18n';
import type { WorkingDirMissingError } from '@/hooks/WorkingDirMissingError';

interface Props {
  error: WorkingDirMissingError;
}

/**
 * Says that the project's folder is gone, in place of the CLI's "spawn claude ENOENT"
 * which reads as "claude is not installed".
 *
 * Outside the IDE the way out is the project list, so the banner offers it. Inside
 * the IDE the project is the one the IDE has open, which has no list to go back to.
 */
export const WorkingDirMissingErrorBanner = ({ error }: Props) => {
  const { setWorkingDirectory } = useSessionContext();
  const { t } = useTranslation('chat');

  return (
    <div className="mx-4 my-2 px-3 py-2 rounded-md bg-state-error-bg border border-state-error-border text-state-error-fg text-xs flex items-center justify-between gap-2">
      <span className="min-w-0 break-words">{t('streamError.workingDirMissing.message', { path: error.workingDir })}</span>
      {!isJetBrains() && (
        <button
          type="button"
          onClick={() => setWorkingDirectory(null)}
          className="shrink-0 px-2 py-0.5 rounded bg-state-error-bg hover:bg-state-error-border text-state-error-fg transition-colors"
        >
          {t('streamError.workingDirMissing.openProjects')}
        </button>
      )}
    </div>
  );
};
