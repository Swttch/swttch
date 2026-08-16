import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { ApprovalPanel } from './ApprovalPanel';
import { OptionItem } from './ApprovalPanel/OptionButton';
import { PendingPermission } from '../../hooks/usePendingPermissions';
import { parseWorkflowName } from '@/utils/workflowName';
import { humanizeMcpToolName, mcpToolSessionScopeLabel } from './message-renderers/ToolRenderers/Mcp/humanize';
import { useTranslation } from '@/i18n';

interface Props {
  permission: PendingPermission;
  onApprove: () => void;
  onApproveForSession: () => void;
  onDeny: (reason?: string) => void;
}

function basename(filePath: string): string {
  if (typeof filePath !== 'string') return '';
  return filePath.split('/').pop() || filePath;
}

function generateTitle(t: TFunction, toolName: string, input: Record<string, unknown>): string {
  // MCP tools own their humanized title and must NOT go through the built-in
  // file-path logic below: their inputs are arbitrary per-tool schemas and some
  // reuse `path` for a non-string value (e.g. xdebug_get_value_by_path sends
  // `path: ["greeter","name"]`), which would crash basename() and take down the
  // whole chat. The file logic is only valid for the built-in tools.
  if (toolName.startsWith('mcp__')) return t('permissionBanner.allowMcpTool', { tool: humanizeMcpToolName(toolName) });

  const filePath = (input.file_path as string) || (input.path as string) || '';
  const file = filePath ? basename(filePath) : '';

  switch (toolName) {
    case 'Edit':
      return file ? t('permissionBanner.editWithFile', { file }) : t('permissionBanner.editNoFile');
    case 'Write':
      return file ? t('permissionBanner.writeWithFile', { file }) : t('permissionBanner.writeNoFile');
    case 'Delete':
      return file ? t('permissionBanner.deleteWithFile', { file }) : t('permissionBanner.deleteNoFile');
    case 'Bash':
      return t('permissionBanner.runCommand');
    case 'Read':
      return file ? t('permissionBanner.readWithFile', { file }) : t('permissionBanner.readNoFile');
    case 'NotebookEdit':
      return file ? t('permissionBanner.editNotebookWithFile', { file }) : t('permissionBanner.editNotebookNoFile');
    case 'Workflow':
      return t('permissionBanner.allowWorkflow', { name: parseWorkflowName(input) });
    default:
      return t('permissionBanner.allowTool', { tool: toolName });
  }
}

function getSessionLabel(t: TFunction, toolName: string): string {
  switch (toolName) {
    case 'Edit':
      return t('permissionBanner.sessionLabel.edit');
    case 'Write':
      return t('permissionBanner.sessionLabel.write');
    case 'Bash':
      return t('permissionBanner.sessionLabel.bash');
    case 'Delete':
      return t('permissionBanner.sessionLabel.delete');
    case 'Read':
      return t('permissionBanner.sessionLabel.read');
    case 'Workflow':
      return t('permissionBanner.sessionLabel.workflow');
    default:
      if (toolName.startsWith('mcp__')) {
        return t('permissionBanner.sessionLabel.mcp', { scope: mcpToolSessionScopeLabel(toolName) });
      }
      return t('permissionBanner.sessionLabel.default', { tool: toolName });
  }
}

export function PermissionBanner(props: Props) {
  const { permission, onApprove, onApproveForSession, onDeny } = props;
  const { t } = useTranslation('chat');

  const title = useMemo(
    () => generateTitle(t, permission.toolName, permission.input),
    [t, permission.toolName, permission.input],
  );

  const isWorkflow = permission.toolName === 'Workflow';
  const subtitle = isWorkflow ? (permission.input.description as string | undefined) : undefined;
  const notice = isWorkflow ? t('permissionBanner.workflowNotice') : undefined;

  const options: OptionItem[] = useMemo(() => [
    { key: '1', label: t('permissionBanner.yes') },
    { key: '2', label: getSessionLabel(t, permission.toolName) },
    { key: '3', label: t('permissionBanner.no') },
  ], [t, permission.toolName]);

  const handleOptionSelect = useCallback((index: number) => {
    if (index === 0) onApprove();
    else if (index === 1) onApproveForSession();
    else if (index === 2) onDeny();
  }, [onApprove, onApproveForSession, onDeny]);

  return (
    <ApprovalPanel
      title={title}
      subtitle={subtitle}
      notice={notice}
      options={options}
      onOptionSelect={handleOptionSelect}
      textareaPlaceholder={t('permissionBanner.textareaPlaceholder')}
      onTextSubmit={(text) => onDeny(text)}
      onCancel={onDeny}
    />
  );
}
