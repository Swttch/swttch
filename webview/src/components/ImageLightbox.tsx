import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { useTranslation } from '@/i18n';

interface ImageLightboxProps {
  /**
   * Every image the viewer can reach, in order.
   *
   * `null` means "this one is not fetched yet" — a session-wide list is indexed
   * up front but its bytes arrive one at a time, so the viewer has to be able to
   * show a slot before it has anything to draw in it.
   */
  srcs: (string | null)[];
  /** Which one the user clicked. Clamped, so an out-of-range value still opens. */
  initialIndex: number;
  onClose: () => void;
  /**
   * Told which slot is on screen, so the owner can fetch it if it is still null.
   * Fires for the opening position too, not just on movement.
   */
  onIndexChange?: (index: number) => void;
  /**
   * Rendered under the image. Carries the sponsor invitation when the list is
   * cut short: the viewer itself has no idea a gate exists, it only shows what
   * its owner hands it.
   */
  notice?: React.ReactNode;
}

/**
 * Full-screen image viewer that steps through a list with the arrow keys.
 *
 * Shared by the transcript, the composer and the Assets screen: keeping one
 * component is what stops those entry points from drifting into subtly
 * different viewers. It deliberately knows nothing about sessions, sponsors or
 * fetching — it renders the list it is given and reports where it is.
 *
 * Navigation stops at both ends rather than wrapping. Wrapping would make "am I
 * at the end?" unanswerable, and the end of the list is exactly where the
 * sponsor invitation belongs.
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  srcs,
  initialIndex,
  onClose,
  onIndexChange,
  notice,
}) => {
  const { t } = useTranslation('chatTools');
  const lastIndex = srcs.length - 1;
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(lastIndex, 0)));

  const hasPrevious = index > 0;
  const hasNext = index < lastIndex;

  const goPrevious = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : i)), []);
  const goNext = useCallback(() => setIndex((i) => (i < lastIndex ? i + 1 : i)), [lastIndex]);

  // Report the position, including the one it opened on, so an owner fetching
  // lazily learns about the first image too and not only about moves.
  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  // The list can shrink while the viewer is open — the composer lets the user
  // remove an attachment. Without this the index would point past the end and
  // the viewer would render a blank frame; an emptied list closes outright.
  useEffect(() => {
    if (srcs.length === 0) {
      onClose();
      return;
    }
    setIndex((i) => Math.min(i, srcs.length - 1));
  }, [srcs.length, onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrevious();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onClose();
      else return;
      // The chat input and the command palette also listen for these keys; the
      // viewer is modal, so it must not let them act on the same press.
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [goPrevious, goNext, onClose]);

  if (srcs.length === 0) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim backdrop-blur-sm"
        onClick={onClose}
      >
        <div className="relative max-w-[90vw] max-h-[90vh]">
          {srcs[index] ? (
            <img
              src={srcs[index] as string}
              alt={t('attachments.fullSizeAlt')}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // Indexed but not fetched yet. Sized so stepping onto a pending slot
            // does not collapse the frame and jump the controls around.
            <div
              className="w-[60vw] h-[60vh] flex items-center justify-center rounded-lg border border-border-default bg-surface-hover/40 text-text-tertiary text-sm"
              onClick={(e) => e.stopPropagation()}
              role="status"
              aria-label={t('attachments.lightbox.loading')}
            >
              {t('attachments.lightbox.loading')}
            </div>
          )}

          <button
            className="absolute -top-3.5 -end-3.5 w-7 h-7 flex items-center justify-center rounded-full bg-surface-hover hover:bg-surface-tooltip/70 border border-border-default text-text-primary transition-colors"
            onClick={(e) => {
              // Without this the click also reaches the backdrop below and
              // onClose fires twice for one press.
              e.stopPropagation();
              onClose();
            }}
            aria-label={t('attachments.lightbox.close')}
          >
            ✕
          </button>

        </div>

        {/*
          The controls are positioned against the viewport, not the image.
          Anchoring them to the image collapses them on top of each other for a
          small attachment (an icon, a cropped snippet), because the image box
          shrinks to the image while the buttons keep their fixed size.

          A single image has nowhere to go, so it gets no arrows and no counter.
        */}
        {srcs.length > 1 && (
          <>
            <button
              className="absolute start-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-surface-hover/90 hover:bg-surface-tooltip/80 border border-border-default text-text-primary transition-colors disabled:opacity-30 disabled:cursor-default"
              onClick={(e) => {
                e.stopPropagation();
                goPrevious();
              }}
              disabled={!hasPrevious}
              aria-label={t('attachments.lightbox.previous')}
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>

            <button
              className="absolute end-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-surface-hover/90 hover:bg-surface-tooltip/80 border border-border-default text-text-primary transition-colors disabled:opacity-30 disabled:cursor-default"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              disabled={!hasNext}
              aria-label={t('attachments.lightbox.next')}
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>

            <div
              className="absolute bottom-6 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-surface-hover/90 border border-border-default text-text-secondary text-xs tabular-nums"
              onClick={(e) => e.stopPropagation()}
            >
              {index + 1} / {srcs.length}
            </div>
          </>
        )}

        {/*
          Sits below the counter and is shown whatever the list length, because
          a message holding a single image is exactly the case where the rest of
          the session is most worth offering.
        */}
        {notice && (
          <div
            className="absolute bottom-16 left-1/2 -translate-x-1/2 max-w-[80vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {notice}
          </div>
        )}
      </div>
    </Portal>
  );
};
