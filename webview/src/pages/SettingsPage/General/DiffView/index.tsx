import { SettingSection } from '../../common';
import { AutoOpenRow } from './AutoOpenRow';
import { SurfaceRow } from './SurfaceRow';
import { PresentationRow } from './PresentationRow';
import { useTranslation } from '@/i18n';

/**
 * Where Claude's proposed file edits are shown for review, and how.
 *
 * Its own section rather than more rows under the app settings: reviewing a
 * proposed edit is a screen of its own with its own options, and more of them
 * are coming.
 *
 * All three rows are about the same moment — the permission prompt asking
 * whether to write a file — so they belong together even though one only
 * applies inside an IDE and another only outside one.
 */
export function DiffViewSection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('diffView.sectionTitle')}>
      <AutoOpenRow />
      <SurfaceRow />
      <PresentationRow />
    </SettingSection>
  );
}
