import type { FileAttachment } from '../../../../types';
import { AttachmentNameTooltip } from './AttachmentNameTooltip';

interface Props {
  attachment: FileAttachment;
  onRemove: (id: string) => void;
}

export function FileChip(props: Props) {
  const { attachment, onRemove } = props;

  return (
    <div className="relative group flex items-center gap-1.5 rounded-md bg-surface-overlay border border-border-default px-2 py-1">
      <svg className="w-3.5 h-3.5 text-text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
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
