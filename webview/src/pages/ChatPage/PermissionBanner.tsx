import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { ApprovalPanel } from './ApprovalPanel';
import { OptionItem } from './ApprovalPanel/OptionButton';
import { TitleWithFileLink } from './PermissionBanner/TitleWithFileLink';
import { useChatStreamContext } from '../../contexts/ChatStreamContext';
import { useOpenDiffReview } from '../../hooks/useOpenDiffReview';
import { useAutoOpenDiffReview } from '../../hooks/useAutoOpenDiffReview';
import { PendingPermission } from '../../hooks/usePendingPermissions';
import { parseWorkflowName } from '@/utils/workflowName';
import { humanizeMcpToolName, mcpToolSessionScopeLabel } from './message-renderers/ToolRenderers/Mcp/humanize';
import { useTranslation } from '@/i18n';

interface Props {
  permission: PendingPermission;
  onApprove: () => void;
  onApproveForSession: () => void;
  onDeny: (reason?: string) => void;
  /**
   * Show the review as an overlay over this screen.
   *
   * Only called when the settings ask for one; every other surface opens a
   * window this panel does not own (an IDE editor tab, a browser tab), so it has
   * nothing to hand back. Absent where no overlay can be mounted.
   */
  onOpenDiffOverlay?: (toolUseId: string) => void;
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
  const { permission, onApprove, onApproveForSession, onDeny, onOpenDiffOverlay } = props;
  const { stop } = useChatStreamContext();
  const openDiffReview = useOpenDiffReview();
  const { t } = useTranslation('chat');

  const parts = useMemo(
    () => titleParts(permission.toolName, permission.input),
    [permission.toolName, permission.input],
  );

  const openDiff = useCallback(() => {
    // Looking at the change is not answering the question: the request stays
    // open and the turn keeps running.
    void openDiffReview(permission.toolUseId).then((result) => {
      if (result.kind === 'overlay') onOpenDiffOverlay?.(result.toolUseId);
    });
  }, [openDiffReview, permission.toolUseId, onOpenDiffOverlay]);

  // Shown without being asked for, the way the IDE shows it. The file link below
  // stays: it is how the review is reached again after being closed.
  useAutoOpenDiffReview(permission.toolUseId, onOpenDiffOverlay);

  /**
   * The file name links to the review, which the user may have closed while its
   * question is still up.
   *
   * Every host can show one now — the IDE's viewer or our own page — so the only
   * reason to fall back to plain text is a prompt with no file in it. Before the
   * built-in page existed this also checked for an IDE, and a browser got a name
   * it could not click.
   */
  const title = useMemo(() => {
    if (!parts.file) return t(parts.key, { ...parts.values, file: parts.file });
    // Translate a second time with a marker in the file's place, so the link
    // lands exactly where this language puts the name — rather than searching
    // the sentence for the name, which could also match the words around it.
    const marked = t(parts.key, { ...parts.values, file: FILE_MARKER });
    return (
      <TitleWithFileLink template={marked} marker={FILE_MARKER} file={parts.file} onOpen={openDiff} />
    );
  }, [t, parts, openDiff]);

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

  /*
   * No diff is drawn in this panel.
   *
   * It used to be, for hosts with no IDE: the change was shown inline, capped at
   * a fixed height and dropped to a single column below 720px, because the chat
   * column is not wide enough for two. Every one of those was a compromise
   * forced by the container rather than a choice about reviewing.
   *
   * The review now gets a window of its own on every host — an IDE editor tab,
   * a browser tab, or an overlay — and the file name above is the way in.
   */

  return (
    <ApprovalPanel
      title={title}
      collapsedTitle={t(parts.key, { ...parts.values, file: parts.file })}
      subtitle={subtitle}
      notice={notice}
      options={options}
      onOptionSelect={handleOptionSelect}
      textareaPlaceholder={t('permissionBanner.textareaPlaceholder')}
      onTextSubmit={(text) => onDeny(text)}
      onCancel={handleCancel}
    />
  );
}
