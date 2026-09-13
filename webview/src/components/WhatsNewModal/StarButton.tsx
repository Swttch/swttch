import { getAdapter } from '@/adapters';
import { REPO_URL } from '@/config/app';

/**
 * GitHub's mark (octicon `mark-github-16`), not a star.
 *
 * A star would be the literal match for GitHub's own button, but it is the
 * wrong glyph here for two reasons. This button opens the repository rather
 * than starring anything, so the icon should name the destination; and a star
 * already means "favourite" in this app's project list, so reusing it would
 * give one shape two meanings on adjacent screens.
 */
function OcticonMarkGithub(props: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={props.className}>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
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
      <OcticonMarkGithub className="w-3.5 h-3.5" />
      Star
    </button>
  );
}
