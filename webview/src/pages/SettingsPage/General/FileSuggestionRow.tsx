import { useState, useEffect } from 'react';
import { SettingRow } from '../common';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useTranslation } from '@/i18n';
import type { FileSuggestionConfig } from '@/types/claude-settings';

/**
 * Edits the Claude `fileSuggestion` command — the shell command that builds the
 * `@` file-mention index (settings.json). An empty field clears it and falls
 * back to the built-in index. Blur-to-save, no Save button, per
 * SettingsPage/CLAUDE.md. Reads/writes the active scope tab. Issue #201.
 */
export function FileSuggestionRow() {
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useClaudeSettings();

  const stored =
    (scopeSettings.fileSuggestion as FileSuggestionConfig | null | undefined)?.command ?? '';
  const [draft, setDraft] = useState(stored);

  // Re-sync the field with the stored value when the scope tab (and thus
  // scopeSettings) changes underneath us.
  useEffect(() => {
    setDraft(stored);
  }, [stored]);

  const commit = () => {
    const next = draft.trim();
    if (next === stored) return; // nothing changed
    void updateSetting('fileSuggestion', next === '' ? null : { type: 'command', command: next });
  };

  return (
    <SettingRow label="fileSuggestion" description={t('general.fileSuggestion.description')}>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={t('general.fileSuggestion.placeholder')}
        aria-label="fileSuggestion"
        className="w-72 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary"
      />
    </SettingRow>
  );
}
