import { SettingSection } from '../../common';
import { AttachEditorContextRow } from './AttachEditorContextRow';
import { FocusInputRow } from './FocusInputRow';
import { DevToolsRow } from './DevToolsRow';
import { useTranslation } from '@/i18n';

/**
 * Settings that only mean anything when an IDE is hosting the backend.
 *
 * ALWAYS listed, even with no IDE attached: the editor-context options have
 * been settable from a browser since long before this section existed, and
 * hiding it would take that away from standalone users.
 *
 * Choosing where a proposed edit is reviewed does NOT live here: it is one half
 * of a question whose other half (how the built-in diff appears) has nothing to
 * do with an IDE, and splitting the pair across two screens would hide that the
 * first answer decides whether the second applies. Both are in General.
 */
export function IntegrationSection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('ide.sectionTitle')}>
      <AttachEditorContextRow />
      <FocusInputRow />
      <DevToolsRow />
    </SettingSection>
  );
}
