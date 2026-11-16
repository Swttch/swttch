import { SettingSection } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { CHAT_PAGES_RANGE, CHAT_PAGE_SIZE_RANGE, DEFAULT_SETTINGS, SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { ChatLoadingNumberRow } from './ChatLoadingNumberRow';
import { ChatWindowingRow } from './ChatWindowingRow';

/** More messages than this held at once is called out: it is what makes a long conversation heavy. */
const HEAVY_TOTAL = 2000;

/**
 * How much of a long conversation the chat holds in memory (#680): the size of a
 * page, the newest pages that are always kept, and the pages of older history that
 * follow the reader. The line under the rows adds them up, because the three are
 * only meaningful together: what matters is the number of messages held at once.
 */
export function ChatLoadingSection() {
  const { t } = useTranslation('settings');
  const { settings } = useSettings();

  const pageSize = settings[SettingKey.CHAT_PAGE_SIZE] ?? DEFAULT_SETTINGS[SettingKey.CHAT_PAGE_SIZE];
  const latestPages = settings[SettingKey.CHAT_LATEST_PAGES] ?? DEFAULT_SETTINGS[SettingKey.CHAT_LATEST_PAGES];
  const historyPages = settings[SettingKey.CHAT_HISTORY_PAGES] ?? DEFAULT_SETTINGS[SettingKey.CHAT_HISTORY_PAGES];
  const windowing = settings[SettingKey.CHAT_WINDOWING] ?? DEFAULT_SETTINGS[SettingKey.CHAT_WINDOWING];
  const total = pageSize * (latestPages + historyPages);
  const heavy = total > HEAVY_TOTAL;

  return (
    <SettingSection title={t('general.chatLoading.title')} description={t('general.chatLoading.description')}>
      <ChatWindowingRow />
      <ChatLoadingNumberRow
        settingKey={SettingKey.CHAT_PAGE_SIZE}
        textKey="pageSize"
        min={CHAT_PAGE_SIZE_RANGE.min}
        max={CHAT_PAGE_SIZE_RANGE.max}
        recommendedMax={CHAT_PAGE_SIZE_RANGE.recommendedMax}
      />
      {/* The two page counts and the total only mean something while pages are let go of. */}
      {windowing && (
        <>
          <ChatLoadingNumberRow
            settingKey={SettingKey.CHAT_LATEST_PAGES}
            textKey="latestPages"
            min={CHAT_PAGES_RANGE.min}
            max={CHAT_PAGES_RANGE.max}
          />
          <ChatLoadingNumberRow
            settingKey={SettingKey.CHAT_HISTORY_PAGES}
            textKey="historyPages"
            min={CHAT_PAGES_RANGE.min}
            max={CHAT_PAGES_RANGE.max}
          />
          <p
            role="status"
            className={`px-4 pb-3 pt-1 text-xs ${heavy ? 'text-state-warning-fg' : 'text-text-tertiary'}`}
          >
            {t(heavy ? 'general.chatLoading.totalHeavy' : 'general.chatLoading.total', { count: total })}
          </p>
        </>
      )}
    </SettingSection>
  );
}
