import { useEffect, useMemo, useRef, useState } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { HeroSparkles } from './HeroSparkles';
import { StarButton } from './StarButton';
import { useTranslation } from '@/i18n';
import {
  sanitizeReleaseHtml,
  formatReleaseDateShort,
  extractTitle,
  stripVersionPrefix,
  takeFirstSection,
} from '@/utils/releaseNotesHtml';

export interface WhatsNewRelease {
  id: number;
  version: string;
  notes: string;
  cdate: string | number;
}

interface Props {
  /** Newest release first — the order `usePluginUpdates()` returns. */
  releases: WhatsNewRelease[];
  /**
   * The release to open on. This is the installed version rather than
   * `releases[0]`: someone updating from far behind lands on a marketplace
   * listing whose newest entry is not what they are now running.
   */
  initialVersion?: string;
  onClose: () => void;
}

/**
 * The release notes of the version that was just installed, opened once after
 * an update.
 *
 * The whole marketplace history is reachable from here one release per page,
 * because this is the only moment we know the user is looking at the changelog
 * at all — the Releases settings screen requires them to go find it.
 */
export function WhatsNewModal(props: Props) {
  const { releases, initialVersion, onClose } = props;
  const { t } = useTranslation('chat');
  const [index, setIndex] = useState(() => {
    const at = releases.findIndex((r) => r.version === initialVersion);
    return at >= 0 ? at : 0;
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const release = releases[index];

  // Focus trap for the lifetime of the modal, mirroring McpModal: the chat
  // input underneath re-focuses its textarea whenever activeElement falls back
  // to document.body, which happens on any click inside a non-focusable area
  // here. Remember the opener, pull focus back if it escapes, restore on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleFocusIn = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) {
        dialog.focus();
      }
    };
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(releases.length - 1, i + 1));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, releases.length]);

  // A new page starts at its own beginning. Without this the reader lands
  // mid-way down the next release because the scroll position is kept.
  // Assigning scrollTop rather than calling scrollTo(): jsdom implements the
  // property but not the method, and the modal has nothing to animate here.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [index]);

  // The version prefix is dropped because the header already shows it, and
  // only this release's own section is kept: a marketplace note carries every
  // older release after it, which would repeat on every page of the pager.
  const rawTitle = release ? extractTitle(release.notes) : null;
  const title = rawTitle ? stripVersionPrefix(rawTitle, release?.version) : null;
  const rawBody = release ? takeFirstSection(release.notes) : '';
  const body = useMemo(() => (rawBody ? sanitizeReleaseHtml(rawBody) : ''), [rawBody]);

  if (!release) return null;

  const isFirst = index === 0;
  const isLast = index === releases.length - 1;

  return (
    <Portal>
      <div
        data-testid="whats-new-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('whatsNew.title')}
          tabIndex={-1}
          className="w-full max-w-2xl bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col focus:outline-none"
          style={{ maxHeight: '46rem' }}
        >
          {/* Hero: the title centred over scattered glyphs, with the version and
              date beneath it. A centred masthead rather than one left-aligned
              row is what keeps this from reading as the same dialog everyone
              else ships. */}
          <div className="relative flex-shrink-0 px-6 pt-10 pb-6 border-b border-border-default bg-gradient-to-b from-surface-overlay via-surface-overlay to-surface-raised">
            <HeroSparkles />
            <button
              onClick={onClose}
              aria-label={t('whatsNew.close')}
              className="absolute top-3 end-3 w-8 h-8 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            {/* The title is fixed English on purpose: it is the name of this
                screen across the products that popularised it, and it reads as
                a masthead rather than a translated sentence. The localized
                wording still labels the dialog for screen readers, above. */}
            <h2 className="relative text-center text-[1.75rem] font-semibold tracking-tight text-text-primary">
              What&apos;s new
            </h2>
            <p className="relative mt-2.5 flex items-center justify-center gap-2.5 text-sm text-text-tertiary">
              <span className="px-2 py-0.5 rounded font-mono text-xs font-medium bg-accent-primary text-accent-primary-fg">
                v{release.version}
              </span>
              {formatReleaseDateShort(release.cdate, t('whatsNew.unknownDate'))}
            </p>
          </div>

          {/* Promo strip, dividing the hero from the notes at full width. Its
              copy is still to be decided; the key is in place so it can be
              written without touching this layout. */}
          <div className="flex items-center gap-3 px-6 py-2.5 border-b border-banner-info-border bg-banner-info-bg flex-shrink-0">
            <span className="text-sm text-text-link">{t('whatsNew.promo')}</span>
            <div className="ms-auto">
              <StarButton />
            </div>
          </div>

          {/* Body, flanked by the paging arrows. They sit beside what they move
              rather than in a footer bar: the arrow is next to the page it
              turns, and the dialog needs no second row of chrome for it. */}
          <div className="flex-1 flex min-h-0">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={isFirst}
              aria-label={t('whatsNew.newer')}
              className="flex-shrink-0 w-11 flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-text-tertiary"
            >
              <ChevronLeftIcon className="w-5 h-5 rtl:-scale-x-100" />
            </button>

            <div ref={bodyRef} className="flex-1 overflow-y-auto px-2 py-5">
              {title && (
                <h3 className="text-base font-semibold text-text-primary mb-3">{title}</h3>
              )}
              {body ? (
                <div
                  data-testid="whats-new-body"
                  // No @tailwindcss/typography plugin is installed, so `prose` would be
                  // a dead class — every block element's spacing/markers are set
                  // explicitly here instead (Tailwind preflight resets h*/ul/ol/p).
                  className="text-sm text-text-secondary max-w-none
                    [&_h1]:mt-4 [&_h1]:mb-1.5 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-text-primary
                    [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-text-primary
                    [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary
                    [&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0
                    [&_p]:my-2
                    [&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5
                    [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5
                    [&_li]:my-1.5
                    [&_a]:text-text-link [&_a:hover]:underline
                    [&_strong]:font-semibold [&_strong]:text-text-primary
                    [&_code]:text-xs [&_code]:bg-surface-overlay [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              ) : (
                <p className="text-sm text-text-disabled italic">{t('whatsNew.noNotes')}</p>
              )}
            </div>

            <button
              onClick={() => setIndex((i) => Math.min(releases.length - 1, i + 1))}
              disabled={isLast}
              aria-label={t('whatsNew.older')}
              className="flex-shrink-0 w-11 flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-text-tertiary"
            >
              <ChevronRightIcon className="w-5 h-5 rtl:-scale-x-100" />
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
