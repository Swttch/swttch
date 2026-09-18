import { api } from '@/api/ClaudeCodeApi';
import {
  SOUND_OFF,
  useNotificationSound,
  useSystemSounds,
  type SoundSelection,
} from '@/notifications';
import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useTranslation } from '@/i18n';

/**
 * Which sound a desktop notification makes.
 *
 * The list comes from the Node.js backend (`LIST_SYSTEM_SOUNDS`) and is
 * therefore OS-specific (macOS aiff, Windows wav, Linux freedesktop ogg).
 * Choosing one plays it once, because a sound named in a list tells you nothing
 * about what it sounds like.
 *
 * `Off` is always first and always available. While the list is loading, or if
 * it failed, the dropdown is disabled and the description says which of the two
 * happened rather than leaving an inert control unexplained.
 */
export function SoundRow() {
  const { t } = useTranslation('settings');
  const { selection, setSelection } = useNotificationSound();
  const { sounds, loading, error } = useSystemSounds();

  const handleChange = (next: SoundSelection) => {
    setSelection(next);
    if (next !== SOUND_OFF) {
      // Fire-and-forget preview; failures are silently logged.
      api.sounds.play(next).catch((err: unknown) => {
        console.warn('[SoundRow] preview failed:', err);
      });
    }
  };

  const soundOptions: SelectOption[] = [
    { value: SOUND_OFF, label: t('browser.notifications.sound.off') },
    ...sounds.map((sound) => ({ value: sound.id, label: sound.label })),
  ];

  const isEmpty = !loading && error === null && sounds.length === 0;
  const description =
    error !== null
      ? t('browser.notifications.sound.errorDescription', { error })
      : loading
        ? t('browser.notifications.sound.loadingDescription')
        : isEmpty
          ? t('browser.notifications.sound.emptyDescription')
          : t('browser.notifications.sound.description');

  return (
    <SettingRow label={t('browser.notifications.sound.label')} description={description}>
      <Select
        value={selection}
        options={soundOptions}
        ariaLabel={t('browser.notifications.sound.ariaLabel')}
        disabled={loading || error !== null}
        onChange={(value) => handleChange(value as SoundSelection)}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
      />
    </SettingRow>
  );
}
