import { useEffect, useState } from 'react';
import { api } from '@/api/ClaudeCodeApi';
import type { BannerPersistence } from '@/api/modules/NotificationsApi';
import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { Trans, useTranslation } from '@/i18n';

/**
 * Whether a session may put a banner on screen when it finishes a turn or stops
 * to ask something while the user is looking at something else.
 *
 * Off silences the banner alone. The sound above keeps its own answer, because
 * the two are addressed to different situations — the banner to someone who
 * walked away, the sound to whoever is within earshot.
 *
 * `null` is not "off": it means the user has never been asked. The first
 * notification asks — raising it is what triggers the OS permission prompt —
 * and the answer is written back, so the switch shows the user their own
 * decision rather than a default we invented. Until then it reads as on,
 * because that is what will happen next.
 */
export function BannerRow() {
  const { t } = useTranslation('settings');
  const { settings, updateSetting } = useSettings();
  const enabled = settings[SettingKey.NOTIFICATION_BANNER] !== false;

  return (
    <SettingRow
      label={t('general.notifications.banner.label')}
      description={t('general.notifications.banner.description')}
      below={enabled ? <FadeHint /> : undefined}
    >
      <ToggleSwitch
        checked={enabled}
        onChange={(checked) => updateSetting(SettingKey.NOTIFICATION_BANNER, checked)}
        ariaLabel={t('general.notifications.banner.label')}
      />
    </SettingRow>
  );
}

/**
 * Offers to walk the user to the OS switch that decides whether our banners
 * stay on screen or fade after a few seconds.
 *
 * Shown only when they actually fade. macOS reserves that choice for the user —
 * no app can set it, and the plist key that looks like it should is ignored for
 * a bundle like ours — so the best we can do is notice and point. Windows and
 * Linux answer `unknown` because the notification itself decides there, and an
 * offer to change a setting that does not exist would be worse than silence.
 */
function FadeHint() {
  const { t } = useTranslation('settings');
  const [persistence, setPersistence] = useState<BannerPersistence>('unknown');

  useEffect(() => {
    let cancelled = false;
    void api.notifications
      .bannerPersistence()
      .then((value) => {
        if (!cancelled) setPersistence(value);
      })
      .catch(() => {
        // A backend that cannot answer leaves the hint hidden, which is the
        // same as an OS that has no such switch.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (persistence !== 'transient') return null;

  return (
    <p className="mt-1 text-xs text-text-tertiary">
      <Trans
        i18nKey="general.notifications.banner.fadeHint"
        ns="settings"
        components={{
          action: (
            <button
              type="button"
              className="underline underline-offset-2 hover:text-text-secondary"
              onClick={() => {
                void api.notifications.openSystemSettings().catch(() => {
                  // Nothing useful to say if the OS refuses to open its own
                  // settings; the hint stays put so the user can try again.
                });
              }}
            />
          ),
        }}
      >
        {t('general.notifications.banner.fadeHint')}
      </Trans>
    </p>
  );
}
