import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { Tooltip } from '@/components/Tooltip';

interface Props {
  /** Heading line, naming what differs. */
  title: string;
  /** The explanation itself: what the CLI does, what we do, how to get the CLI's behaviour back. */
  body: string;
}

/**
 * A ⓘ that explains where a setting departs from the official Claude Code
 * behaviour.
 *
 * Most settings in this screen either mirror a CLI setting exactly (marked with
 * the native badge) or are ours alone. This is for the third case: a setting
 * that looks like the CLI's but resolves differently. Leaving that unsaid is
 * what made voice input feel broken — the spoken language could be set to
 * English while transcripts kept coming back in Korean, with nothing on screen
 * to explain it.
 *
 * Deliberately a hover hint rather than body text: it matters only to someone
 * who already knows the CLI behaviour and is surprised, and spelling it out
 * inline would bury the one sentence that describes what the control does.
 */
export function DiffersFromOfficialHint({ title, body }: Props) {
  return (
    <Tooltip
      content={
        <span className="block">
          <span className="block font-semibold">{title}</span>
          <span className="mt-1 block">{body}</span>
        </span>
      }
    >
      <button
        type="button"
        // Focusable so the explanation is reachable without a pointer; the
        // tooltip is supplementary, so it carries no state of its own.
        aria-label={title}
        className="ms-1 inline-flex translate-y-[0.1em] align-baseline text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <InformationCircleIcon className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
