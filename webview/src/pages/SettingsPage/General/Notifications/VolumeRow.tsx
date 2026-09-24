import { useRef, type CSSProperties } from 'react';
import { api } from '@/api/ClaudeCodeApi';
import { SOUND_OFF } from '@/notifications';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { SettingRow } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';

export const MIN_VOLUME_STEP = 1;
export const MAX_VOLUME_STEP = 10;
export const DEFAULT_VOLUME_STEP = 5;

function clampStep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_VOLUME_STEP;
  return Math.min(MAX_VOLUME_STEP, Math.max(MIN_VOLUME_STEP, Math.round(value)));
}

/**
 * How loud the notification sound plays, on a ten-step slider.
 *
 * A step is not the same loudness on every OS and cannot be: macOS is the only
 * one whose player amplifies past the recording, so there 1 is the file as
 * recorded and 10 is ten times that, while Windows and Linux run from a tenth
 * of the recording up to the recording itself. The control says 1-10 rather
 * than a percentage for that reason — a percentage would promise a precision
 * across machines that does not exist.
 *
 * Releasing the slider previews the chosen sound at the new volume, the way
 * choosing a sound previews it: a number says nothing about how loud the result
 * actually is. It previews on release rather than on every step so that
 * dragging across the track does not fire ten overlapping sounds.
 *
 * The preview names both the sound and the volume outright instead of letting
 * the backend read them back, because the user is asking about the value they
 * are holding, and waiting for the write to land would preview the previous one.
 */
export function VolumeRow() {
  const { t } = useTranslation('settings');
  const { settings, updateSetting } = useSettings();
  const { selection } = useNotificationSound();

  const value = clampStep(settings[SettingKey.NOTIFICATION_SOUND_VOLUME]);
  // Keyboard users never fire pointerup/keyup on the same gesture as a drag, so
  // the last committed step is tracked to avoid previewing a value twice.
  const lastPreviewed = useRef(value);

  const preview = (step: number) => {
    if (selection === SOUND_OFF) return;
    if (lastPreviewed.current === step) return;
    lastPreviewed.current = step;
    // Fire-and-forget preview; failures are silently logged.
    api.sounds.play(selection, step).catch((err: unknown) => {
      console.warn('[VolumeRow] preview failed:', err);
    });
  };

  const handleChange = (next: number) => {
    void updateSetting(SettingKey.NOTIFICATION_SOUND_VOLUME, next);
  };

  return (
    <SettingRow
      label={t('general.notifications.volume.label')}
      description={t('general.notifications.volume.description')}
    >
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={MIN_VOLUME_STEP}
          max={MAX_VOLUME_STEP}
          step={1}
          value={value}
          aria-label={t('general.notifications.volume.label')}
          aria-valuetext={String(value)}
          onChange={(e) => handleChange(Number(e.target.value))}
          onPointerUp={(e) => preview(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => preview(Number((e.target as HTMLInputElement).value))}
          className="volume-slider w-40"
          // WebKit paints the filled portion as a gradient on the track itself,
          // because ::-webkit-slider-runnable-track cannot hold a child element.
          // Firefox uses ::-moz-range-progress instead and ignores this.
          style={
            {
              '--volume-fill': `${
                ((value - MIN_VOLUME_STEP) / (MAX_VOLUME_STEP - MIN_VOLUME_STEP)) * 100
              }%`,
            } as CSSProperties
          }
        />
        <span className="w-6 text-right text-sm tabular-nums text-text-secondary">{value}</span>
      </div>
    </SettingRow>
  );
}
