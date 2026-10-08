import type { ReactElement } from 'react';
import { Tooltip } from '@/components/Tooltip';
import { formatFileSize } from './formatFileSize';
import { useFileSize } from './useFileSize';

interface Props {
  /** The whole name, which the chip shows cut short. */
  name: string;
  /** Where the file or folder lives, when it has a path; an inline image has none. */
  path?: string;
  /**
   * The size in bytes when the chip already knows it (a file just uploaded, an
   * inline image). Without it the size is asked of the backend by `path`.
   */
  size?: number;
  /** False for a folder, whose size would mean walking everything inside it. */
  withSize?: boolean;
  /** The element carrying the shortened name. It must accept a ref, like a `span`. */
  children: ReactElement;
}

/**
 * The tooltip's content: the name, with the size at the right end of its line, and
 * the path beneath in a quieter tone when there is one.
 */
function NameLine(props: Pick<Props, 'name' | 'path' | 'size' | 'withSize'>) {
  const { name, path, size, withSize = true } = props;
  // Ask only for a file whose size is not already in hand.
  const asked = useFileSize(withSize && size === undefined ? path : undefined);
  const bytes = withSize ? (size ?? asked) : null;

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">{name}</span>
        {bytes !== null && <span className="shrink-0 tabular-nums text-text-tertiary">{formatFileSize(bytes)}</span>}
      </div>
      {path && <div className="text-text-tertiary">{path}</div>}
    </>
  );
}

/**
 * Show a chip's whole name when the pointer rests on its shortened name.
 *
 * The text can be selected and copied: names are cut at a few characters, and the
 * place to read the rest is also the place people lift it from. Where the chip has
 * a path it follows the name in a quieter tone.
 */
export function AttachmentNameTooltip(props: Props) {
  const { name, path, size, withSize, children } = props;

  return (
    <Tooltip selectable content={<NameLine name={name} path={path} size={size} withSize={withSize} />}>
      {children}
    </Tooltip>
  );
}
