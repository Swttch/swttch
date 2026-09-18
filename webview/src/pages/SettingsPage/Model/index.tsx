import { DefaultsSection } from './Defaults';
import { useTranslation } from '@/i18n';

/** The Model page: a heading and the sections under it. */
export function ModelSettings() {
  const { t } = useTranslation('settings');

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.model')}</h2>

      <DefaultsSection />
    </div>
  );
}
