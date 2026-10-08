import type { FileAttachment, FolderAttachment, PendingUpload } from '../../../../types';
import { AttachmentTile, FileGlyph } from './AttachmentTile';
import { FileTypeIcon } from './FileTypeIcon';
import { extensionTag, isPictureName } from './fileType';
import type { FilePreviewResult } from './loadFilePreview';
import { useFilePreview } from './useFilePreview';

/**
 * The card forms of the three non-image chips, used while the row is as tall as
 * an image thumbnail. Each one is the same square an image takes, so the row
 * reads as one line of equals instead of pills beside a picture.
 */

/**
 * What fills the square when the file has something to show of itself: the first
 * lines of a text file as a tiny page, or a picture (the file itself, or a frame
 * of a video). The extension stays on a corner so the kind is still readable.
 */
function PreviewFace(props: { preview: Exclude<FilePreviewResult, { kind: 'none' }>; name: string; tag: string }) {
  const { preview, name, tag } = props;

  return (
    <>
      {preview.kind === 'text' ? (
        <pre className="w-full h-full overflow-hidden px-1 py-1 text-start font-mono text-[0.3846rem] leading-[0.4615rem] text-text-secondary whitespace-pre">
          {preview.text}
        </pre>
      ) : (
        <img src={preview.src} alt="" draggable={false} className="w-full h-full object-cover" />
      )}
      <span className="absolute top-0.5 start-0.5 flex rounded bg-surface-tooltip p-0.5">
        <FileTypeIcon name={name} className="w-3 h-3" />
      </span>
      {tag && (
        <span className="absolute bottom-0.5 end-0.5 rounded bg-surface-tooltip px-1 text-[0.6154rem] leading-[0.75rem] font-semibold text-text-secondary">
          {tag}
        </span>
      )}
    </>
  );
}

interface FileTileProps {
  attachment: FileAttachment;
  onRemove: (id: string) => void;
  /** Open the viewer on this picture. Only a picture file that has its picture can be opened. */
  onOpenPicture?: () => void;
}

export function FileTile(props: FileTileProps) {
  const { attachment, onRemove, onOpenPicture } = props;
  const preview = useFilePreview(attachment.absolutePath);

  // A picture file looks like a picture pasted into the box: the thumbnail alone,
  // with no corner marks, and a click that opens it. The corner marks are for the
  // files whose face is only a hint of what is inside.
  const asPicture = isPictureName(attachment.fileName) && preview.kind === 'image';

  return (
    <AttachmentTile
      name={attachment.fileName}
      path={attachment.absolutePath}
      size={attachment.size}
      onRemove={() => onRemove(attachment.id)}
    >
      {asPicture ? (
        <img
          src={preview.src}
          alt={attachment.fileName}
          draggable={false}
          className="w-full h-full object-cover cursor-pointer"
          onClick={onOpenPicture}
        />
      ) : preview.kind === 'none' ? (
        <FileGlyph name={attachment.fileName} />
      ) : (
        <PreviewFace preview={preview} name={attachment.fileName} tag={extensionTag(attachment.fileName)} />
      )}
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
      withSize={false}
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
      size={upload.isFolder ? undefined : upload.totalBytes}
      withSize={!upload.isFolder}
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
