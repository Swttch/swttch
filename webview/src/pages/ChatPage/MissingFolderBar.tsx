import { useSessionContext } from '@/contexts/SessionContext';
import { useChooseFolder } from '@/hooks/useChooseFolder';
import { isJetBrains } from '@/config/environment';
import { useTranslation } from '@/i18n';
import { InputBanner } from './InputBanner';

const PRIMARY_CLASS =
  'rounded bg-surface-base px-3 py-1 text-[0.7692rem] font-medium text-text-link hover:bg-accent-primary hover:text-text-primary transition-colors';
const SECONDARY_CLASS =
  'rounded px-2 py-1 text-[0.7692rem] font-medium text-text-tertiary hover:bg-state-info-bg transition-colors';

/**
 * Stands where the chat input would be when the folder this session works in is gone.
 * Nothing can be sent from here, since the CLI cannot start in a folder that does not
 * exist, so the input is not drawn and the way on is offered in its place: choose a
 * folder to start working in.
 *
 * Outside the IDE the project list is a second way out. Inside the IDE the project is
 * the one the IDE has open, which has no list to go back to.
 */
export function MissingFolderBar() {
  const { t } = useTranslation('chat');
  const { setWorkingDirectory } = useSessionContext();
  const chooseFolder = useChooseFolder();

  return (
    <div role="alert" className="px-4 pb-2">
      <InputBanner
        message={t('missingFolder.message')}
        actions={
          <>
            <button type="button" onClick={chooseFolder} className={PRIMARY_CLASS}>
              {t('missingFolder.chooseFolder')}
            </button>
            {!isJetBrains() && (
              <button type="button" onClick={() => setWorkingDirectory(null)} className={SECONDARY_CLASS}>
                {t('missingFolder.openProjects')}
              </button>
            )}
          </>
        }
      />
    </div>
  );
}
