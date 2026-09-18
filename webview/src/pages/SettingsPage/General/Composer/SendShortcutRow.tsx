import { ShortcutChoiceRow } from './ShortcutChoiceRow';
import type { ComposerRowProps } from './types';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import {
  ComposerSendShortcut,
  resolveComposerShortcuts,
  type ComposerShortcutSettings,
} from '@/shared';
import { isMac } from '@/config/environment';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/** Which keystroke sends the prompt. */
export function SendShortcutRow({ commit, error }: ComposerRowProps) {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings } = useSettings();

  const stored = scopeSettings as ComposerShortcutSettings;
  const { send } = resolveComposerShortcuts(stored);

  // Both Ctrl and Cmd send on either platform, so the label names the one this
  // platform's users reach for. A Windows user who reads "⌘" has no such key.
  const modifier = isMac() ? '⌘' : 'Ctrl';

  return (
    <ShortcutChoiceRow
      label={t('general.composer.send.label')}
      description={t('general.composer.send.description')}
      mode={send}
      isCustom={send === ComposerSendShortcut.Custom}
      custom={stored.composerSendShortcutCustom ?? ''}
      isOverridden={isOverridden(SettingKey.COMPOSER_SEND_SHORTCUT)}
      error={error}
      options={[
        { value: ComposerSendShortcut.Enter, label: t('general.composer.send.enter') },
        {
          value: ComposerSendShortcut.ModEnter,
          label: t('general.composer.send.modEnter', { modifier }),
        },
        { value: ComposerSendShortcut.Custom, label: t('general.composer.custom') },
      ]}
      onModeChange={(mode) => commit(SettingKey.COMPOSER_SEND_SHORTCUT, mode)}
      onCustomChange={(shortcut) => commit(SettingKey.COMPOSER_SEND_SHORTCUT_CUSTOM, shortcut)}
    />
  );
}
