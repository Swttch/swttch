import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';

/**
 * Whether a diff can be opened in the IDE right now.
 *
 * Two conditions, and both are about the same question — is there an IDE that
 * will show it? The backend has to be hosted by one (`ideAttached`), and the
 * project must not have opted out (`showDiffInIde`). Neither the settings
 * toggle nor the file-name link in the approval prompt should offer something
 * that cannot happen.
 *
 * Shared rather than repeated so the two cannot drift into disagreeing about
 * when the feature is on.
 */
export function useIdeDiffAvailable(): boolean {
  const { scopeSettings, ideAttached } = useSettings();
  // Default on: the setting exists only to let people turn it back off.
  return ideAttached && (scopeSettings[SettingKey.SHOW_DIFF_IN_IDE] ?? true);
}
