import { BasicsSection } from './Basics';
import { ComposerSection } from './Composer';
import { NotificationsSection } from './Notifications';
import { VoiceSection } from './Voice';
import { DiffViewSection } from './DiffView';
import { useTranslation } from '@/i18n';

/**
 * The General page: a heading and the sections under it, in the order they are
 * read.
 *
 * Nothing about any individual setting lives here. Each section owns its own
 * folder, and each row inside that folder owns its own file, so a change to one
 * setting touches one file and the page keeps saying only what is on it.
 */
export function GeneralSettings() {
  const { t } = useTranslation('settings');

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.general')}</h2>

      <BasicsSection />
      <ComposerSection />
      <NotificationsSection />
      <VoiceSection />
      <DiffViewSection />
    </div>
  );
}
