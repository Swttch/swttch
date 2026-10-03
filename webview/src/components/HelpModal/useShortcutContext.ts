import { useMemo } from 'react';
import { isMac } from '@/config/environment';
import { useSettings } from '@/contexts/SettingsContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { SettingKey, VOICE_SHORTCUT_DEFAULT, type VoiceSettings } from '@/types/settings';
import type { ShortcutContext } from './shortcutCatalog';

/**
 * What the shortcut list needs to know about this machine and this user's
 * settings, read the same way the composer and voice input read them so the
 * modal names the keys that actually work.
 */
export function useShortcutContext(): ShortcutContext {
  const { settings, ideAttached } = useSettings();
  const { settings: claudeSettings } = useClaudeSettings();

  // Same reading as DictationProvider: only an explicit `enabled: false` turns
  // voice input off, and a missing shortcut falls back to the default.
  const voiceEnabled =
    (claudeSettings.voice as { enabled?: boolean } | undefined)?.enabled !== false;
  const voiceShortcut =
    (settings[SettingKey.VOICE] as VoiceSettings | undefined)?.shortcut ?? VOICE_SHORTCUT_DEFAULT;

  return useMemo(
    () => ({
      mac: isMac(),
      ideAttached,
      composer: settings,
      voiceShortcut: voiceEnabled && voiceShortcut ? voiceShortcut : null,
    }),
    [settings, ideAttached, voiceEnabled, voiceShortcut],
  );
}
