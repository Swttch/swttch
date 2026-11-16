import { useMemo } from 'react';
import { useSettingsOrNull } from '@/contexts/SettingsContext';
import { DEFAULT_SETTINGS, SettingKey } from '@/types/settings';
import type { WindowConfig } from '@/utils/transcriptWindow';

/**
 * How much of a long conversation the chat holds in memory (#680), read from the
 * three settings that size it: how many entries one page holds, how many of the
 * newest pages are always kept, and how many pages of older history follow the
 * reader. The same numbers the transcript window counts in and the page size the
 * backend is asked for (see `resolveMessagePageSize`).
 */
export function useChatWindowConfig(): WindowConfig {
  // Outside a settings provider (a page rendered on its own) the defaults apply.
  const settings = useSettingsOrNull()?.settings ?? DEFAULT_SETTINGS;
  const recycle = settings[SettingKey.CHAT_WINDOWING] ?? DEFAULT_SETTINGS[SettingKey.CHAT_WINDOWING];
  const pageSize = settings[SettingKey.CHAT_PAGE_SIZE] ?? DEFAULT_SETTINGS[SettingKey.CHAT_PAGE_SIZE];
  const latestPages = settings[SettingKey.CHAT_LATEST_PAGES] ?? DEFAULT_SETTINGS[SettingKey.CHAT_LATEST_PAGES];
  const historyPages = settings[SettingKey.CHAT_HISTORY_PAGES] ?? DEFAULT_SETTINGS[SettingKey.CHAT_HISTORY_PAGES];
  return useMemo(() => ({ pageSize, latestPages, historyPages, recycle }), [pageSize, latestPages, historyPages, recycle]);
}
