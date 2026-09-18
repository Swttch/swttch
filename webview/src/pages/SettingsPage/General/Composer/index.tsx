import { useState } from 'react';
import { SettingSection } from '../../common';
import { ShortcutChoiceRow } from './ShortcutChoiceRow';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import {
  ComposerSendShortcut,
  ComposerNewlineShortcut,
  resolveComposerShortcuts,
  type ComposerShortcutSettings,
} from '@/shared';
import { conflictingBinding } from '@/utils/composerShortcut';
import { isMac } from '@/config/environment';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

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
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useSettings();
  const [conflicted, setConflicted] = useState<ConflictedRow>(null);

  const stored = scopeSettings as ComposerShortcutSettings;
  const { send, newline } = resolveComposerShortcuts(stored);
  const sendCustom = stored.composerSendShortcutCustom ?? '';
  const newlineCustom = stored.composerNewlineShortcutCustom ?? '';

  // Both Ctrl and Cmd send on either platform, so the label names the one this
  // platform's users reach for. A Windows user who reads "⌘" has no such key.
  const modifier = isMac() ? '⌘' : 'Ctrl';

  /**
   * Save a change, unless it would leave both keys on the same combination.
   *
   * Refusing rather than saving-and-warning: a saved conflict is a composer that
   * has silently lost an action, and the row would still be showing the value
   * the user chose. Nothing is written, so what is on screen stays true.
   */
  const commit = (row: Exclude<ConflictedRow, null>, key: SettingKey, value: string) => {
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
      <ShortcutChoiceRow
        label={t('general.composer.send.label')}
        description={t('general.composer.send.description')}
        mode={send}
        isCustom={send === ComposerSendShortcut.Custom}
        custom={sendCustom}
        isOverridden={isOverridden(SettingKey.COMPOSER_SEND_SHORTCUT)}
        error={conflicted === 'send' ? t('general.composer.conflictWithNewline') : undefined}
        options={[
          { value: ComposerSendShortcut.Enter, label: t('general.composer.send.enter') },
          {
            value: ComposerSendShortcut.ModEnter,
            label: t('general.composer.send.modEnter', { modifier }),
          },
          { value: ComposerSendShortcut.Custom, label: t('general.composer.custom') },
        ]}
        onModeChange={(mode) => commit('send', SettingKey.COMPOSER_SEND_SHORTCUT, mode)}
        onCustomChange={(shortcut) =>
          commit('send', SettingKey.COMPOSER_SEND_SHORTCUT_CUSTOM, shortcut)
        }
      />

      <ShortcutChoiceRow
        label={t('general.composer.newline.label')}
        description={t('general.composer.newline.description')}
        mode={newline}
        isCustom={newline === ComposerNewlineShortcut.Custom}
        custom={newlineCustom}
        isOverridden={isOverridden(SettingKey.COMPOSER_NEWLINE_SHORTCUT)}
        error={conflicted === 'newline' ? t('general.composer.conflictWithSend') : undefined}
        options={[
          {
            value: ComposerNewlineShortcut.ShiftEnter,
            label: t('general.composer.newline.shiftEnter'),
          },
          { value: ComposerNewlineShortcut.Enter, label: t('general.composer.newline.enter') },
          { value: ComposerNewlineShortcut.Custom, label: t('general.composer.custom') },
        ]}
        onModeChange={(mode) => commit('newline', SettingKey.COMPOSER_NEWLINE_SHORTCUT, mode)}
        onCustomChange={(shortcut) =>
          commit('newline', SettingKey.COMPOSER_NEWLINE_SHORTCUT_CUSTOM, shortcut)
        }
      />
    </SettingSection>
  );
}
