import { DebuggingSection } from './Debugging';
import { useTranslation } from '@/i18n';

/** The Advanced page: a heading and the sections under it. */
export function AdvancedSettings() {
  const { t } = useTranslation('settings');

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('advanced.title')}</h2>

      <DebuggingSection />
    </div>
  );
}
