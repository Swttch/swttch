import { useState, useEffect, useCallback } from 'react';
import { SettingRow } from '../common';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useBridge } from '@/hooks/useBridge';
import { useSettings } from '@/contexts/SettingsContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';

interface ConfigDirInfo {
  effective: string;
  globalSetting: string | null;
  projectSetting: string | null;
  inherited: string | null;
}

/**
 * Edits CLAUDE_CONFIG_DIR — the folder Claude reads its settings and credentials
 * from. Stored in the plugin settings `env` map (global/project per the active scope
 * tab) and re-applied to the backend immediately so chat, the usage widget (ccb), and
 * session history all resolve the same directory. (#123)
 *
 * Rendered as a single row inside the General section: blur-to-save, no Save button,
 * no dedicated section — per SettingsPage/CLAUDE.md.
 */
export function ClaudeConfigDirRow() {
  const { send } = useBridge();
  const { scope } = useSettings();
  const { workingDirectory } = useWorkingDir();
  const { t } = useTranslation('settings');
  const [info, setInfo] = useState<ConfigDirInfo | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    const res = await send<ConfigDirInfo>(MessageType.GET_CLAUDE_CONFIG_DIR, {
      workingDir: workingDirectory ?? undefined,
      scope,
    });
    if (res) setInfo(res);
  }, [send, workingDirectory, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const stored = (scope === 'project' ? info?.projectSetting : info?.globalSetting) ?? '';
  // Keep the field in sync with the stored value when scope/info changes.
  useEffect(() => {
    setDraft(stored);
  }, [stored]);

  const projectScopeUnavailable = scope === 'project' && !workingDirectory;

  const commit = useCallback(async () => {
    const next = draft.trim();
    if (next === stored) return; // nothing changed
    await send(MessageType.SAVE_CLAUDE_CONFIG_DIR, {
      value: next || null,
      scope,
      workingDir: workingDirectory ?? undefined,
    });
    await load();
  }, [draft, stored, send, scope, workingDirectory, load]);

  return (
    <SettingRow
      label="CLAUDE_CONFIG_DIR"
      description={t('general.configDir.description')}
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref="https://code.claude.com/docs/en/settings#environment-variables"
        />
      }
    >
      <div className="flex flex-col items-end gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          placeholder={t('general.configDir.placeholder')}
          disabled={projectScopeUnavailable}
          aria-label="CLAUDE_CONFIG_DIR"
          className="w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary disabled:opacity-50"
        />
        {projectScopeUnavailable ? (
          <span className="text-xs text-text-tertiary">{t('general.configDir.projectUnavailable')}</span>
        ) : (
          info && (
            <span className="text-xs text-text-tertiary truncate max-w-64" title={info.effective}>
              {t('general.configDir.active', { value: info.effective })}
            </span>
          )
        )}
      </div>
    </SettingRow>
  );
}
