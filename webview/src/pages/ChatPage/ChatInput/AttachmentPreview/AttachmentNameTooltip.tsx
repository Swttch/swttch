import type { ReactElement } from 'react';
import { Tooltip } from '@/components/Tooltip';

interface Props {
  /** The whole name, which the chip shows cut short. */
  name: string;
  /** Where the file or folder lives, when it has a path; an inline image has none. */
  path?: string;
  /** The element carrying the shortened name. It must accept a ref, like a `span`. */
  children: ReactElement;
}

/**
 * Show a chip's whole name when the pointer rests on its shortened name.
 *
 * The text can be selected and copied: names are cut at a few characters, and the
 * place to read the rest is also the place people lift it from. Where the chip has
 * a path it follows the name in a quieter tone.
 */
export function AttachmentNameTooltip(props: Props) {
  const { name, path, children } = props;

  return (
    <Tooltip
      selectable
      content={
        <>
          <div>{name}</div>
          {path && <div className="text-text-tertiary">{path}</div>}
        </>
      }
    >
      {children}
    </Tooltip>
  );
}
