import type { PendingUpload } from '../../../../types';
import { AttachmentNameTooltip } from './AttachmentNameTooltip';

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
      <svg className="w-3.5 h-3.5 text-text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {upload.isFolder ? (
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        ) : (
          <>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </>
        )}
      </svg>
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
