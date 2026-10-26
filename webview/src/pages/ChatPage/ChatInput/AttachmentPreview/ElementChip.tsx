import { DesktopIcon } from '@/components/FilePreviewPane/DesktopIcon';

interface Props {
  /** The chip text, such as `<h1/> image page`. */
  token: string;
  /** The picture of the element, shown between the pointer and the text; a click opens it in the viewer. */
  pictureSrc?: string;
  onOpen?: () => void;
  onRemove: (token: string) => void;
}

/** An element picked in the Browser pane, among the message's attachments (#593). */
export function ElementChip({ token, pictureSrc, onOpen, onRemove }: Props) {
  return (
    <div className="relative group">
      <div
        role={onOpen ? 'button' : undefined}
        onClick={onOpen}
        className={`flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-hover px-2.5 py-1.5 ${onOpen ? 'cursor-pointer' : ''}`}
      >
        <DesktopIcon name="Cursor" aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
        {pictureSrc && (
          <img src={pictureSrc} alt="" draggable={false} className="h-6 w-6 shrink-0 rounded object-cover" />
        )}
        <span className="max-w-[240px] truncate text-[0.8461rem] text-text-secondary">{token}</span>
      </div>
      <button
        type="button"
        aria-label={`× ${token}`}
        onClick={() => onRemove(token)}
        className="absolute -top-1.5 -end-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface-tooltip text-[0.7692rem] text-text-secondary opacity-0 transition-colors hover:bg-state-error-fg group-hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
