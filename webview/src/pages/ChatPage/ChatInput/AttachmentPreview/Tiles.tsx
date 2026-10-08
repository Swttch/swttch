import type { FileAttachment, FolderAttachment, PendingUpload } from '../../../../types';
import { AttachmentTile, FileGlyph } from './AttachmentTile';

/**
 * The card forms of the three non-image chips, used while the row is as tall as
 * an image thumbnail. Each one is the same square an image takes, so the row
 * reads as one line of equals instead of pills beside a picture.
 */

export function FileTile(props: { attachment: FileAttachment; onRemove: (id: string) => void }) {
  const { attachment, onRemove } = props;

  return (
    <AttachmentTile name={attachment.fileName} path={attachment.absolutePath} onRemove={() => onRemove(attachment.id)}>
      <FileGlyph name={attachment.fileName} />
    </AttachmentTile>
  );
}

export function FolderTile(props: { attachment: FolderAttachment; onRemove: (id: string) => void }) {
  const { attachment, onRemove } = props;

  return (
    <AttachmentTile
      name={attachment.folderName}
      label={attachment.displayLabel}
      path={attachment.absolutePath}
      onRemove={() => onRemove(attachment.id)}
    >
      <FileGlyph isFolder />
    </AttachmentTile>
  );
}

export function UploadTile(props: { upload: PendingUpload; onCancel: (id: string) => void }) {
  const { upload, onCancel } = props;
  const percent = upload.percent;

  return (
    <AttachmentTile
      name={upload.label}
      label={upload.isFolder ? `${upload.label}/` : upload.label}
      progress={percent ?? 0}
      onRemove={() => onCancel(upload.id)}
    >
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-label={upload.label}
      >
        <FileGlyph name={upload.label} isFolder={upload.isFolder} caption={percent === null ? '' : `${percent}%`} />
      </div>
    </AttachmentTile>
  );
}
