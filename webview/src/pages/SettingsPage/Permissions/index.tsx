import { BypassModeSection } from './BypassMode';
import { DefaultModeSection } from './DefaultMode';
import { useTranslation } from '@/i18n';

/** The Permissions page: a heading and the sections under it. */
export function PermissionsSettings() {
  const { t } = useTranslation('settings');

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('permissions.heading')}</h2>

      <BypassModeSection />
      <DefaultModeSection />
    </div>
  );
}
