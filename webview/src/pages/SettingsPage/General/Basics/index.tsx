import { SettingSection } from '../../common';
import { useTranslation } from '@/i18n';
import { LanguageRow } from './LanguageRow';
import { UiLanguageRow } from './UiLanguageRow';
import { UiDirectionRow } from './UiDirectionRow';
import { RespectGitignoreRow } from './RespectGitignoreRow';
import { FileCheckpointingRow } from './FileCheckpointingRow';
import { AutoResumeOnLimitRow } from './AutoResumeOnLimitRow';
import { FileSuggestionRow } from './FileSuggestionRow';
import { HostModeRow } from './HostModeRow';
import { OpenSettingsRow } from './OpenSettingsRow';
import { ChatPaginationRow } from './ChatPaginationRow';
import { ClaudeConfigDirRow } from './ClaudeConfigDirRow';

/**
 * The settings that are about the app as a whole rather than about one surface
 * of it: what language it speaks, where it opens, what it reads.
 *
 * Some of these rows write to Claude's own settings.json and some to ours. The
 * row knows which; the section does not, so that moving a key between the two
 * files stays a change to one row.
 */
export function BasicsSection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('nav.general')}>
      <LanguageRow />
      <UiLanguageRow />
      <UiDirectionRow />
      <RespectGitignoreRow />
      <FileCheckpointingRow />
      <AutoResumeOnLimitRow />
      <FileSuggestionRow />
      <HostModeRow />
      <OpenSettingsRow />
      <ChatPaginationRow />
      <ClaudeConfigDirRow />
    </SettingSection>
  );
}
