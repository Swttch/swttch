import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { ApprovalPanel } from './ApprovalPanel';
import { OptionItem } from './ApprovalPanel/OptionButton';
import { TitleWithFileLink } from './PermissionBanner/TitleWithFileLink';
import { ReviewDiff } from './ReviewDiff';
import { useApi } from '../../contexts/ApiContext';
import { useChatStreamContext } from '../../contexts/ChatStreamContext';
import { useIdeDiffAvailable } from '../../hooks/useIdeDiffAvailable';
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

/**
 * Stands in for the file name while the title's shape is worked out. Not a
 * string any translation would contain, so finding it locates the slot exactly.
 */
const FILE_MARKER = '\u0000file\u0000';

function basename(filePath: string): string {
  if (typeof filePath !== 'string') return '';
  return filePath.split('/').pop() || filePath;
}

/**
 * Which title to show, kept as (key, file) rather than a finished sentence so
 * the file name can be rendered as a link to the review diff. `file` is empty
 * for the tools that name no file.
 */
interface TitleParts {
  key: string;
  /** Interpolations the title needs besides the file name. */
  values: Record<string, string>;
  /** The linkable file name, or empty when this title names no file. */
  file: string;
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

/**
 * Which title to show for this tool.
 *
 * Reported as (key, interpolation, file) rather than a finished sentence so the
 * file name can be rendered as a link to the review diff. `file` is empty for
 * the tools that name none, and those render as plain text.
 *
 * MCP tools own their humanized title and must NOT go through the file-path
 * logic: their inputs are arbitrary per-tool schemas and some reuse `path` for
 * a non-string value (e.g. xdebug_get_value_by_path sends
 * `path: ["greeter","name"]`), which would crash basename() and take down the
 * whole chat. The file logic is only valid for the built-in tools.
 */
function titleParts(toolName: string, input: Record<string, unknown>): TitleParts {
  if (toolName.startsWith('mcp__')) {
    return {
      key: 'permissionBanner.allowMcpTool',
      values: { tool: humanizeMcpToolName(toolName) },
      file: '',
    };
  }

  const filePath = (input.file_path as string) || (input.path as string) || '';
  const file = filePath ? basename(filePath) : '';
  const withFile = (yes: string, no: string): TitleParts =>
    file ? { key: yes, values: { file }, file } : { key: no, values: {}, file: '' };

  switch (toolName) {
    case 'Edit':
      return withFile('permissionBanner.editWithFile', 'permissionBanner.editNoFile');
    case 'Write':
      return withFile('permissionBanner.writeWithFile', 'permissionBanner.writeNoFile');
    case 'Delete':
      return withFile('permissionBanner.deleteWithFile', 'permissionBanner.deleteNoFile');
    case 'Read':
      return withFile('permissionBanner.readWithFile', 'permissionBanner.readNoFile');
    case 'NotebookEdit':
      return withFile(
        'permissionBanner.editNotebookWithFile',
        'permissionBanner.editNotebookNoFile',
      );
    case 'Bash':
      return { key: 'permissionBanner.runCommand', values: {}, file: '' };
    case 'Workflow':
      return {
        key: 'permissionBanner.allowWorkflow',
        values: { name: parseWorkflowName(input) },
        file: '',
      };
    default:
      return { key: 'permissionBanner.allowTool', values: { tool: toolName }, file: '' };
  }
}

export function PermissionBanner(props: Props) {
  const { permission, onApprove, onApproveForSession, onDeny } = props;
  const { stop } = useChatStreamContext();
  const api = useApi();
  const diffAvailable = useIdeDiffAvailable();
  const { t } = useTranslation('chat');

  const parts = useMemo(
    () => titleParts(permission.toolName, permission.input),
    [permission.toolName, permission.input],
  );

  const openDiff = useCallback(() => {
    // Looking at the change is not answering the question: the request stays
    // open and the turn keeps running.
    void api.tools.openDiffForRequest(permission.toolUseId);
  }, [api, permission.toolUseId]);

  /**
   * The file name links to the review diff, which the user may have closed
   * while its question is still up. Plain text where no diff can be shown —
   * an underlined name that does nothing is worse than none.
   */
  const title = useMemo(() => {
    if (!parts.file || !diffAvailable) return t(parts.key, { ...parts.values, file: parts.file });
    // Translate a second time with a marker in the file's place, so the link
    // lands exactly where this language puts the name — rather than searching
    // the sentence for the name, which could also match the words around it.
    const marked = t(parts.key, { ...parts.values, file: FILE_MARKER });
    return (
      <TitleWithFileLink template={marked} marker={FILE_MARKER} file={parts.file} onOpen={openDiff} />
    );
  }, [t, parts, diffAvailable, openDiff]);

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

  /**
   * Cancelling is "stop what you are doing", not "no to this one file".
   *
   * A denial on its own only answers this request: the turn keeps running, and
   * Claude moves on to the next tool call and writes up the refusal — so an
   * interruption comes back as an answer. Ending the turn as well is what the
   * other two prompt panels already do (AcceptPlanPanel, AskUserQuestion).
   */
  const handleCancel = useCallback(() => {
    onDeny();
    stop();
  }, [onDeny, stop]);

  /**
   * Where the change gets reviewed.
   *
   * With an IDE attached the diff opens there, in a native editor that brings
   * its own keymap and code assistance — the file name in the title is the way
   * in. Without one there is no such tab (`BrowserBridge.openDiff` is a no-op),
   * and until now that meant the change could not be seen at all. Drawing it
   * here is that host's review surface, not a second one competing with the
   * IDE's: only ever one of the two is shown.
   */
  const reviewInline = !diffAvailable && Boolean(parts.file);

  return (
    <ApprovalPanel
      title={title}
      collapsedTitle={t(parts.key, { ...parts.values, file: parts.file })}
      subtitle={subtitle}
      notice={notice}
      preview={reviewInline ? <ReviewDiff toolUseId={permission.toolUseId} /> : undefined}
      options={options}
      onOptionSelect={handleOptionSelect}
      textareaPlaceholder={t('permissionBanner.textareaPlaceholder')}
      onTextSubmit={(text) => onDeny(text)}
      onCancel={handleCancel}
    />
  );
}
