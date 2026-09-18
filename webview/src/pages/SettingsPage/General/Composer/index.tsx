import { useState } from 'react';
import { SettingSection } from '../../common';
import { SendShortcutRow } from './SendShortcutRow';
import { NewlineShortcutRow } from './NewlineShortcutRow';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import type { ComposerShortcutSettings } from '@/shared';
import { conflictingBinding } from '@/utils/composerShortcut';
import { useTranslation } from '@/i18n';

/** Which row is currently refusing a change, so only that row shows the reason. */
type ConflictedRow = 'send' | 'newline' | null;

/**
 * The composer keys: what sends the prompt, and what breaks the line.
 *
 * A section of their own rather than two more rows under the app settings,
 * because they are the only pair of settings that constrain each other — the
 * conflict check below has to hold both, and holding both is what a section is.
 */
export function ComposerSection() {
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();
  const [conflicted, setConflicted] = useState<ConflictedRow>(null);

  const stored = scopeSettings as ComposerShortcutSettings;

  /**
   * Save a change, unless it would leave both keys on the same combination.
   *
   * Refusing rather than saving-and-warning: a saved conflict is a composer that
   * has silently lost an action, and the row would still be showing the value
   * the user chose. Nothing is written, so what is on screen stays true.
   */
  const commitFor =
    (row: Exclude<ConflictedRow, null>) => (key: SettingKey, value: string) => {
      // Each SettingKey's value IS the field name the settings file uses, so the
      // prospective state is the stored one with that field replaced.
      if (conflictingBinding({ ...stored, [key]: value })) {
        setConflicted(row);
        return;
      }
      setConflicted(null);
      void updateSetting(key, value as never);
    };

  return (
    <SettingSection title={t('general.composer.title')}>
      <SendShortcutRow
        commit={commitFor('send')}
        error={conflicted === 'send' ? t('general.composer.conflictWithNewline') : undefined}
      />
      <NewlineShortcutRow
        commit={commitFor('newline')}
        error={conflicted === 'newline' ? t('general.composer.conflictWithSend') : undefined}
      />
    </SettingSection>
  );
}
