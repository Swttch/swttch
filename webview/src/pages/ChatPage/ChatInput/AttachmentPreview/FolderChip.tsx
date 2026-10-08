import type { FolderAttachment } from '../../../../types';
import { AttachmentNameTooltip } from './AttachmentNameTooltip';

interface Props {
  attachment: FolderAttachment;
  onRemove: (id: string) => void;
}

export function FolderChip(props: Props) {
  const { attachment, onRemove } = props;

  return (
    <div className="relative group flex items-center gap-1.5 rounded-md bg-surface-overlay border border-border-default px-2 py-1">
      <svg className="w-3.5 h-3.5 text-text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      <AttachmentNameTooltip name={attachment.displayLabel} path={attachment.absolutePath}>
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
