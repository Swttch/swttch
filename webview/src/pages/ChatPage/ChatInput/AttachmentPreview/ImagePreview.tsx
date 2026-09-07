import type { ImageAttachment } from '../../../../types';

interface Props {
  attachment: ImageAttachment;
  onRemove: (id: string) => void;
  /**
   * Open the shared viewer on this thumbnail.
   *
   * The viewer lives in the parent because stepping to the next attachment
   * requires knowing the other attachments, which a single preview does not.
   */
  onOpen: () => void;
}

export function ImagePreview(props: Props) {
  const { attachment, onRemove, onOpen } = props;

  return (
    <div className="relative group">
      <div className="w-16 h-16 rounded-md overflow-hidden border border-border-default bg-surface-hover">
        <img
          src={attachment.dataUrl}
          alt={attachment.displayLabel}
          className="w-full h-full object-cover cursor-pointer"
          onClick={onOpen}
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="absolute -top-1.5 -end-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-surface-tooltip hover:bg-state-error-fg text-text-secondary text-[0.7692rem] transition-colors opacity-0 group-hover:opacity-100"
      >
        ×
      </button>
      <div className="text-[0.7692rem] text-text-tertiary truncate max-w-[64px] mt-0.5 text-center">
        {attachment.displayLabel}
      </div>
    </div>
  );
}
