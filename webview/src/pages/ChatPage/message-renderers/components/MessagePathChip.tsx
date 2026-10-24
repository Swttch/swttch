import React from 'react';
import toast from 'react-hot-toast';
import { openChatFile } from '@/utils/openChatFile';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { i18n } from '@/i18n';
import { pathFromToken, lineFromToken, isFolderToken, resolveFilePath } from '../utils/tokenizeMessagePaths';

interface Props {
  token: string;
}

/**
 * Renders an `@`-path mention from a submitted user message as a highlighted
 * chip. File mentions are clickable and open the file in the IDE. The mention
 * path is relative to the project, so it is resolved against the working
 * directory into an absolute path before `openFile` (the IDE's file lookup
 * needs an absolute path). Folder mentions (trailing `/`) render as a
 * non-interactive chip because `openFile` only opens files.
 */
export const MessagePathChip = (props: Props) => {
  const { token } = props;
  const { workingDirectory } = useWorkingDir();
  const isFolder = isFolderToken(token);

  const open = (event: React.SyntheticEvent) => {
    if (isFolder) return;
    // Stop the parent MessageBox from toggling its expand/collapse state.
    event.stopPropagation();
    const filePath = resolveFilePath(pathFromToken(token), workingDirectory);
    openChatFile(filePath, lineFromToken(token))
      .catch((err) => {
        console.error('[MessagePathChip] Failed to open file:', err);
        toast.error(i18n.t('chat:fileOpenFailed', { path: filePath }));
      });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isFolder) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open(event);
    }
  };

  if (isFolder) {
    return (
      <span className="richInputChip" title={pathFromToken(token)}>
        {token}
      </span>
    );
  }

  return (
    <span
      className="richInputChip cursor-pointer"
      role="button"
      tabIndex={0}
      title={pathFromToken(token)}
      onClick={open}
      onKeyDown={handleKeyDown}
    >
      {token}
    </span>
  );
};
