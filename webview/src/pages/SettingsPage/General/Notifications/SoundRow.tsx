import { api } from '@/api/ClaudeCodeApi';
import { SOUND_OFF, useSystemSounds, type SoundSelection } from '@/notifications';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { DEFAULT_VOLUME_STEP } from './VolumeRow';
import { useTranslation } from '@/i18n';

/**
 * Which sound a session makes when it finishes a turn or stops to ask
 * something.
 *
 * The list comes from the Node.js backend (`LIST_SYSTEM_SOUNDS`) and is
 * therefore OS-specific (macOS aiff, Windows wav, Linux freedesktop ogg).
 * Choosing one plays it once, because a sound named in a list tells you nothing
 * about what it sounds like.
 *
 * This is the whole switch for the sound. It is NOT held back by the banner row
 * below: the sound says "that just finished", which is worth hearing while
 * watching the session, whereas the banner exists to call back someone who is
 * elsewhere.
 *
 * `Off` is always first and always available. While the list is loading, or if
 * it failed, the dropdown is disabled and the description says which of the two
 * happened rather than leaving an inert control unexplained.
 *
 * The choice is written to the plugin settings file, which is the only place it
 * lives; the sessions that ring it never read it, they ask the backend to ring
 * "the notification sound" and the backend looks the name up. That is why
 * changing it here takes effect on the very next turn of a chat screen that has
 * been open the whole time — this row is drawn in an overlay on top of it, and
 * that screen is never told to re-read anything.
 *
 * Previewing is the one case that still names a sound outright, and it should:
 * the user is pointing at a row in a list and asking what it sounds like, which
 * is a question about that row and not about what is saved.
 */
export function SoundRow() {
  const { t } = useTranslation('settings');
  const { selection, setSelection } = useNotificationSound();
  const { sounds, loading, error } = useSystemSounds();
  const { settings } = useSettings();
  const stored = settings[SettingKey.NOTIFICATION_SOUND_VOLUME];
  // The default step until a value is saved, matching what the backend assumes
  // for a settings file that has no volume in it yet.
  const volumeStep = typeof stored === 'number' ? stored : DEFAULT_VOLUME_STEP;

  const handleChange = (next: SoundSelection) => {
    setSelection(next);
    if (next !== SOUND_OFF) {
      // Previewed at the saved volume, not at full: a sound auditioned louder
      // than it will ever ring is not the sound the user is choosing.
      // Fire-and-forget; failures are silently logged.
      api.sounds.play(next, volumeStep).catch((err: unknown) => {
        console.warn('[SoundRow] preview failed:', err);
      });
    }
  };

  const soundOptions: SelectOption[] = [
    { value: SOUND_OFF, label: t('general.notifications.sound.off') },
    ...sounds.map((sound) => ({ value: sound.id, label: sound.label })),
  ];

  const isEmpty = !loading && error === null && sounds.length === 0;
  const description =
    error !== null
      ? t('general.notifications.sound.errorDescription', { error })
      : loading
        ? t('general.notifications.sound.loadingDescription')
        : isEmpty
          ? t('general.notifications.sound.emptyDescription')
          : t('general.notifications.sound.description');

  return (
    <SettingRow label={t('general.notifications.sound.label')} description={description}>
      <Select
        value={selection}
        options={soundOptions}
        ariaLabel={t('general.notifications.sound.ariaLabel')}
        disabled={loading || error !== null}
        onChange={(value) => handleChange(value as SoundSelection)}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
      />
    </SettingRow>
  );
}
