import type { ReactNode } from 'react';

interface Props {
  /** The translated title with [marker] standing where the file name goes. */
  template: string;
  /** The marker to replace, chosen so no translation can contain it. */
  marker: string;
  /** What to show in that slot, e.g. "cart.js". */
  file: string;
  onOpen: () => void;
}

/**
 * The approval prompt's title with its file name turned into a link to the
 * review diff.
 *
 * Split on a marker rather than on the file name itself: the words around it
 * differ per tool and per language, and a name like "index.ts" could appear in
 * them too. Falls back to plain text when the marker is absent, so a title that
 * names no file renders as it always did.
 */
export function TitleWithFileLink(props: Props): ReactNode {
  const { template, marker, file, onOpen } = props;

  const at = template.indexOf(marker);
  if (at === -1) return template;

  return (
    <>
      {template.slice(0, at)}
      <button
        type="button"
        onClick={() => onOpen()}
        className="text-accent-primary underline underline-offset-2 hover:text-accent-primary-hover cursor-pointer bg-transparent p-0 border-none font-inherit"
      >
        {file}
      </button>
      {template.slice(at + marker.length)}
    </>
  );
}
