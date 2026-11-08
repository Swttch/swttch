import { useSettingsOrNull } from '@/contexts/SettingsContext';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { SettingKey, TRANSCRIPT_VIEW_MODES, type TranscriptViewMode } from '@/types/settings';

/**
 * The chat's view mode, or `null` for the chat UI that has been released so far
 * (the "classic" mode).
 *
 * The three named modes are the Claude desktop app's Transcript view. They have
 * one thing in common, which is what separates them from classic: the user's
 * bubble sits on the right, and it has no fold arrow and does not pin itself to
 * the top while its reply scrolls past.
 *
 * The header menu picks a view for one session. That pick wins; a session
 * without one follows the default from the settings screen.
 *
 * Reads through [useSettingsOrNull] so a renderer mounted without a provider
 * (every unit test that renders one directly) keeps drawing the classic chat.
 */
export function useTranscriptViewMode(): TranscriptViewMode | null {
  const context = useSettingsOrNull();
  const sessionId = useSessionContextOrNull()?.currentSessionId ?? null;
  const picked = sessionId ? context?.settings[SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION]?.[sessionId] : undefined;
  if (picked === 'classic') return null;
  if (isTranscriptViewMode(picked)) return picked;
  const value = context?.settings[SettingKey.TRANSCRIPT_VIEW_MODE];
  return isTranscriptViewMode(value) ? value : null;
}

export function isTranscriptViewMode(value: unknown): value is TranscriptViewMode {
  return TRANSCRIPT_VIEW_MODES.includes(value as TranscriptViewMode);
}
