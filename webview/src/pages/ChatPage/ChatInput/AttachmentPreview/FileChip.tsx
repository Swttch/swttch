import type { FileAttachment } from '../../../../types';
import { AttachmentNameTooltip } from './AttachmentNameTooltip';
import { FileTypeIcon } from './FileTypeIcon';

interface Props {
  attachment: FileAttachment;
  onRemove: (id: string) => void;
}

export function FileChip(props: Props) {
  const { attachment, onRemove } = props;

  return (
    <div className="relative group flex items-center gap-1.5 rounded-md bg-surface-overlay border border-border-default px-2 py-1">
      <FileTypeIcon name={attachment.fileName} className="w-3.5 h-3.5 shrink-0" />
      <AttachmentNameTooltip name={attachment.fileName} path={attachment.absolutePath} size={attachment.size}>
        <span className="text-[0.8461rem] text-text-secondary truncate max-w-[120px]">
          {attachment.displayLabel}
        </span>
      </AttachmentNameTooltip>
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="w-3.5 h-3.5 flex items-center justify-center rounded-full text-text-tertiary hover:text-state-error-fg text-[0.7692rem] shrink-0"
      >
        ×
      </button>
    </div>
  );
}
