import { useEffect, useState } from 'react';
import { SettingRow, ScopeGuard } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { DEFAULT_SETTINGS, SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

type ChatLoadingKey = SettingKey.CHAT_PAGE_SIZE | SettingKey.CHAT_LATEST_PAGES | SettingKey.CHAT_HISTORY_PAGES;

interface Props {
  settingKey: ChatLoadingKey;
  /** The key of the label and of the description under `general.chatLoading`. */
  textKey: 'pageSize' | 'latestPages' | 'historyPages';
  min: number;
  max: number;
  /** A value above this is accepted and marked as not recommended. */
  recommendedMax?: number;
}

/**
 * One of the three numbers that size how much of a long conversation the chat holds
 * in memory (#680). App-global behaviour, so it is written to global scope.
 *
 * The number is edited as text and written when the field is left (or Enter is
 * pressed), clamped to its range: writing on every keystroke would send 1 on the
 * way to typing 100, and the backend refuses a number outside the range.
 */
export function ChatLoadingNumberRow({ settingKey, textKey, min, max, recommendedMax }: Props) {
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSettingWithScope, scope } = useSettings();
  const { t } = useTranslation('settings');

  const value = settings[settingKey] ?? DEFAULT_SETTINGS[settingKey];
  const [draft, setDraft] = useState(String(value));
  // The setting can change under the field (the value the URL carries, another window).
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (!Number.isInteger(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    if (clamped !== value) updateSettingWithScope(settingKey, clamped, 'global');
  };

  const label = t(`general.chatLoading.${textKey}.label`);
  const notRecommended = recommendedMax !== undefined && value > recommendedMax;

  return (
    <SettingRow
      label={label}
      description={
        <>
          {t(`general.chatLoading.${textKey}.description`, { min, max })}
          {notRecommended && (
            <span className="block mt-1 text-state-warning-fg">{t('general.chatLoading.notRecommended')}</span>
          )}
        </>
      }
      isOverridden={isOverridden(settingKey)}
    >
      <ScopeGuard supportedScope="global" currentScope={scope}>
        <input
          type="number"
          min={min}
          max={max}
          step="1"
          value={draft}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          className="min-w-32 max-w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
        />
      </ScopeGuard>
    </SettingRow>
  );
}
