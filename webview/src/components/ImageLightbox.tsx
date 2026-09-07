import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { useTranslation } from '@/i18n';

interface ImageLightboxProps {
  /** Every image the viewer can reach, in the order they were attached. */
  srcs: string[];
  /** Which one the user clicked. Clamped, so an out-of-range value still opens. */
  initialIndex: number;
  onClose: () => void;
}

/**
 * Full-screen image viewer that steps through a list with the arrow keys.
 *
 * Split out of ImageAttachments because the Assets screen opens the very same
 * viewer: keeping one component is what stops the two entry points from drifting
 * into two subtly different viewers.
 *
 * Navigation stops at both ends rather than wrapping. Wrapping would make "am I
 * at the end?" unanswerable, and the end of the list is exactly where the
 * sponsor gate will later offer the rest of the session.
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ srcs, initialIndex, onClose }) => {
  const { t } = useTranslation('chatTools');
  const lastIndex = srcs.length - 1;
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(lastIndex, 0)));

  const hasPrevious = index > 0;
  const hasNext = index < lastIndex;

  const goPrevious = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : i)), []);
  const goNext = useCallback(() => setIndex((i) => (i < lastIndex ? i + 1 : i)), [lastIndex]);

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
          <img
            src={srcs[index]}
            alt={t('attachments.fullSizeAlt')}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

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
      </div>
    </Portal>
  );
};
