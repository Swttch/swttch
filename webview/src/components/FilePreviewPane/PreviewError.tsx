import type { ReactNode } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Props {
  title: string;
  detail: string;
  /** The file that could not be shown. */
  path?: string;
  /** The way out, as Claude Desktop's panes offer one under the message. */
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
}

/**
 * What a pane shows in place of a file it could not draw, as Claude Desktop's does: a warning icon, what
 * happened, the likely reason, the file, and a button back to where the reader was.
 */
export function PreviewError({ title, detail, path, action }: Props) {
  return (
    <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
      <ExclamationTriangleIcon className="h-6 w-6 text-text-secondary" aria-hidden />
      <p className="mt-1 text-[0.8461rem] font-medium text-text-primary">{title}</p>
      <p className="max-w-[26rem] text-[0.7692rem] leading-[1.5] text-text-tertiary">{detail}</p>
      {path && <p dir="ltr" className="max-w-[26rem] break-all text-[0.7692rem] leading-[1.5] text-text-tertiary">{path}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-3 rounded-lg bg-[color-mix(in_srgb,currentColor_8%,transparent)] px-3 py-1.5 text-[0.7692rem] text-text-secondary hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)] hover:text-text-primary"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
