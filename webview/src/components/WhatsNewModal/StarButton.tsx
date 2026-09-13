import { getAdapter } from '@/adapters';
import { REPO_URL } from '@/config/app';

/**
 * GitHub's own star glyph (octicon `star-16`), not a generic five-point star.
 *
 * The shape is half of what makes the button read as "the GitHub star button"
 * rather than as some button that happens to mention stars, so it is worth the
 * inline path.
 */
function OcticonStar(props: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={props.className}>
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
    </svg>
  );
}

/**
 * A star button drawn to match GitHub's, without embedding GitHub's.
 *
 * The embeddable versions (`buttons.github.io/buttons.js`, the `ghbtns.com`
 * iframe) are third-party and fetched at render time, which would break the
 * button behind a proxy or offline, leak the reader's IP to a host we do not
 * control, and ignore the IDE theme. Redrawing it costs one SVG path and keeps
 * all three.
 *
 * The label stays English because that is what the button says everywhere it
 * appears; a translated "Star" would stop looking like the thing it imitates.
 */
export function StarButton() {
  return (
    <button
      onClick={() => void getAdapter().openUrl(REPO_URL)}
      className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-border-default bg-surface-overlay hover:bg-surface-hover text-xs font-semibold text-text-primary transition-colors"
    >
      <OcticonStar className="w-3.5 h-3.5" />
      Star
    </button>
  );
}
