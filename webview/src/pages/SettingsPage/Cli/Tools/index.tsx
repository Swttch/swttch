import { SettingSection } from '../../common';
import { OpenFilesWithRow } from './OpenFilesWithRow';
import { TerminalAppRow } from './TerminalAppRow';
import { CliPathRow } from './CliPathRow';
import { NodePathRow } from './NodePathRow';

/**
 * Which programs this one reaches for: the editor that opens a file, the
 * terminal that opens a shell, and the two executables the backend runs.
 *
 * Untitled, because the page's own heading already says CLI.
 */
export function ToolsSection() {
  return (
    <SettingSection>
      <OpenFilesWithRow />
      <TerminalAppRow />
      <CliPathRow />
      <NodePathRow />
    </SettingSection>
  );
}
