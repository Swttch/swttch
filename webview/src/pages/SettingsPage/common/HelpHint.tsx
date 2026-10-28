import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { Tooltip } from '@/components/Tooltip';

interface Props {
  /** Heading line of the tooltip, naming what it explains. */
  title: string;
  /** The explanation. Line breaks in it are kept, so a short list can be written one item per line. */
  body: string;
}

/**
 * A circled question mark at the end of a setting's title, whose hover tooltip says something about
 * the setting that the one-line description cannot carry: here, the situations in which the chat
 * does not do what the switch seems to promise.
 *
 * Not {@link DiffersFromOfficialHint}: that one is an ⓘ for a setting that departs from the CLI.
 * This one is a "?" for a setting that behaves as the CLI's does but has conditions worth reading.
 *
 * The tooltip box breaks lines at any character (it is made for paths and ids), which splits ordinary
 * words in a paragraph. Here the breaks go back between words (`word-break: normal`), and only a word too long for
 * the box is still split (`overflow-wrap: anywhere`).
 */
export function HelpHint({ title, body }: Props) {
  return (
    <Tooltip
      content={
        <span className="block [word-break:normal] [overflow-wrap:anywhere]">
          <span className="block font-semibold">{title}</span>
          <span className="mt-1 block whitespace-pre-line [word-break:normal] [overflow-wrap:anywhere]">{body}</span>
        </span>
      }
    >
      <button
        type="button"
        // Focusable so the explanation is reachable without a pointer; the tooltip is
        // supplementary, so it carries no state of its own.
        aria-label={title}
        className="inline-flex text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <QuestionMarkCircleIcon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
