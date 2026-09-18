import { useMemo } from 'react';
import { SettingSection } from '../../common';
import { PermissionRow } from './PermissionRow';
import { PERMISSION_SPECS } from '@/permissions';
import { useTranslation } from '@/i18n';

interface Props {
  className?: string;
}

/**
 * What this page has asked the browser for.
 *
 * Renders nothing at all when the browser supports none of the permissions we
 * know about, rather than an empty card: a heading over nothing reads as
 * something that failed to load.
 */
export const PermissionsSection = (props: Props) => {
  const { className = '' } = props;
  const { t } = useTranslation('settings');
  const availableSpecs = useMemo(() => PERMISSION_SPECS.filter((s) => s.available()), []);

  if (availableSpecs.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <SettingSection title={t('browser.permissions.title')}>
        {availableSpecs.map((spec) => (
          <PermissionRow key={spec.id} spec={spec} />
        ))}
      </SettingSection>
    </div>
  );
};
