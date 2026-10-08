import type { PendingUpload } from '../../../../types';
import { AttachmentNameTooltip } from './AttachmentNameTooltip';
import { FileTypeIcon, FolderIcon } from './FileTypeIcon';

interface Props {
  upload: PendingUpload;
  onCancel: (id: string) => void;
}

/**
 * The chip of a file or folder whose bytes are still travelling to the backend.
 *
 * It sits where the finished chip will appear, so the person watches the file
 * turn into an attachment in place: a thin bar along the bottom edge fills with
 * the share already sent, and the percentage sits beside the name. While the size
 * is not known yet (a folder still being listed) the percentage is left out and
 * the bar stays empty. The × stops the upload and removes the chip.
 */
export function UploadChip(props: Props) {
  const { upload, onCancel } = props;
  const percent = upload.percent;

  return (
    <div
      className="relative group flex items-center gap-1.5 rounded-md bg-surface-overlay border border-border-default px-2 py-1 overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-label={upload.label}
    >
      {upload.isFolder
        ? <FolderIcon className="w-3.5 h-3.5 shrink-0 text-text-secondary" />
        : <FileTypeIcon name={upload.label} className="w-3.5 h-3.5 shrink-0" />}
      <AttachmentNameTooltip name={upload.label} size={upload.isFolder ? undefined : upload.totalBytes} withSize={!upload.isFolder}>
        <span className="text-[0.8461rem] text-text-secondary truncate max-w-[120px]">
          {upload.isFolder ? `${upload.label}/` : upload.label}
        </span>
      </AttachmentNameTooltip>
      {percent !== null && (
        <span className="text-[0.7692rem] text-text-tertiary tabular-nums shrink-0">{percent}%</span>
      )}
      <button
        type="button"
        onClick={() => onCancel(upload.id)}
        className="w-3.5 h-3.5 flex items-center justify-center rounded-full text-text-tertiary hover:text-state-error-fg text-[0.7692rem] shrink-0"
      >
        ×
      </button>
      <div
        className="absolute left-0 bottom-0 h-0.5 bg-accent-primary transition-[width] duration-150"
        style={{ width: `${percent ?? 0}%` }}
      />
    </div>
  );
}
