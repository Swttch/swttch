import { ShortcutChoiceRow } from './ShortcutChoiceRow';
import type { ComposerRowProps } from './types';
import { SettingKey } from '@/types/settings';
import {
  ComposerNewlineShortcut,
  resolveComposerShortcuts,
  type ComposerShortcutSettings,
} from '@/shared';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/** Which keystroke breaks the line instead of sending. */
export function NewlineShortcutRow({ commit, error }: ComposerRowProps) {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const stored = displaySettings as ComposerShortcutSettings;
  const { newline } = resolveComposerShortcuts(stored);

  return (
    <ShortcutChoiceRow
      label={t('general.composer.newline.label')}
      description={t('general.composer.newline.description')}
      mode={newline}
      isCustom={newline === ComposerNewlineShortcut.Custom}
      custom={stored.composerNewlineShortcutCustom ?? ''}
      isOverridden={isOverridden(SettingKey.COMPOSER_NEWLINE_SHORTCUT)}
      isInherited={isInherited(SettingKey.COMPOSER_NEWLINE_SHORTCUT)}
      onResetToGlobal={resetFor(SettingKey.COMPOSER_NEWLINE_SHORTCUT, SettingKey.COMPOSER_NEWLINE_SHORTCUT_CUSTOM)}
      error={error}
      options={[
        {
          value: ComposerNewlineShortcut.ShiftEnter,
          label: t('general.composer.newline.shiftEnter'),
        },
        { value: ComposerNewlineShortcut.Enter, label: t('general.composer.newline.enter') },
        { value: ComposerNewlineShortcut.Custom, label: t('general.composer.custom') },
      ]}
      onModeChange={(mode) => commit(SettingKey.COMPOSER_NEWLINE_SHORTCUT, mode)}
      onCustomChange={(shortcut) => commit(SettingKey.COMPOSER_NEWLINE_SHORTCUT_CUSTOM, shortcut)}
    />
  );
}
