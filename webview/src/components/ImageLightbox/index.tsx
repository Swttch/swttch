import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import { LightboxPanel } from './LightboxPanel';

/**
 * One of the two step arrows, with its explanation for when it cannot move.
 *
 * The tooltip hangs on the wrapping span, NOT on the button. A disabled button
 * emits no pointer events in a browser, so a tooltip bound to it would never
 * open — and "cannot move" is the only moment this arrow has anything to say.
 * Testing that in jsdom would not catch it either: jsdom happily dispatches a
 * mouseenter at a disabled element, so this has to be right by construction.
 *
 * The wrapper also takes over the positioning, so the button keeps its own size
 * and the hover target stays exactly the arrow.
 *
 * The tooltip is interactive because the hint carries a link to the sponsor
 * page: the pointer has to be able to travel onto the tooltip without it
 * closing on the way.
 */
function ArrowButton({
  side,
  label,
  enabled,
  hint,
  onHintShown,
  onActivate,
  children,
}: {
  side: 'start' | 'end';
  label: string;
  enabled: boolean;
  hint?: React.ReactNode;
  /** Fires when the hint is really on screen, not merely mounted. */
  onHintShown?: () => void;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={enabled ? undefined : hint} interactive onShow={onHintShown}>
      <span
        className={`absolute ${side === 'start' ? 'start-4' : 'end-4'} top-1/2 -translate-y-1/2`}
      >
        <button
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-hover/90 hover:bg-surface-tooltip/80 border border-border-default text-text-primary transition-colors disabled:opacity-30 disabled:cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            onActivate();
          }}
          disabled={!enabled}
          aria-label={label}
        >
          {children}
        </button>
      </span>
    </Tooltip>
  );
}

/** Keeps a position inside the list, so an out-of-range value still shows something. */
function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

/** Zoom bounds, in multiples of the fitted size. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

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
  /**
   * Opens the Assets screen from the bottom panel. Absent when the viewer was
   * opened FROM that screen, where the button would lead back to where the user
   * already is.
   */
  onOpenAssets?: () => void;
  /**
   * Tooltip for an arrow that cannot move, when the reason is worth explaining.
   *
   * Only reaches a DISABLED arrow. A working arrow gets no tooltip at all: the
   * chevron already says which way it goes, and labelling the obvious is noise.
   * A stopped one is the opposite — nothing on screen says why it stopped.
   *
   * Passed in rather than decided here, because the viewer does not know what a
   * sponsor is and must not learn. Owners hand this over only when something is
   * genuinely out of reach; when the list simply ended, they hand over nothing
   * and the arrow stays quiet.
   */
  edgeHint?: React.ReactNode;
  /**
   * Called when `edgeHint` actually becomes visible on an arrow.
   *
   * Exists so the caller can measure the hint being SHOWN without this viewer
   * having to know what the hint is about. Mounting cannot stand in for it:
   * Tippy commits tooltip content while the tooltip is still closed.
   */
  onEdgeHintShown?: () => void;
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
  onOpenAssets,
  edgeHint,
  onEdgeHintShown,
}) => {
  const { t } = useTranslation('chatTools');
  const lastIndex = srcs.length - 1;
  const [index, setIndex] = useState(() => clampIndex(initialIndex, srcs.length));

  // Whether the user has stepped since opening. Until they do, a corrected
  // `initialIndex` is still the position they asked for; afterwards it is stale.
  const hasMoved = useRef(false);

  const hasPrevious = index > 0;
  const hasNext = index < lastIndex;

  const goPrevious = useCallback(() => {
    hasMoved.current = true;
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);
  const goNext = useCallback(() => {
    hasMoved.current = true;
    setIndex((i) => (i < lastIndex ? i + 1 : i));
  }, [lastIndex]);

  // Zoom is per-image: arriving at a new one should show it whole, not inherit
  // a magnification chosen for the previous picture.
  const [zoom, setZoom] = useState(1);
  useEffect(() => setZoom(1), [index]);
  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN)), []);

  // Report the position, including the one it opened on, so an owner fetching
  // lazily learns about the first image too and not only about moves.
  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  /*
    Keeps the position honest while the list changes underneath the viewer, which
    happens two ways.

    It GROWS: the session index is fetched only once the viewer opens, so the
    first render sees just this message's images and a position within them. The
    corrected `initialIndex` that arrives with the full list is still the image
    the user clicked, so it is adopted — without this, clicking the last of five
    opened the third (reported 2026-09-07).

    It SHRINKS: the composer lets an attachment be removed. The index is clamped
    so the viewer never renders a blank frame, and an emptied list closes it.

    Once the user has stepped, their position wins over any later `initialIndex`:
    a slow fetch must not undo a deliberate move.
  */
  useEffect(() => {
    if (srcs.length === 0) {
      onClose();
      return;
    }
    setIndex((i) => clampIndex(hasMoved.current ? i : initialIndex, srcs.length));
  }, [srcs.length, initialIndex, onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Up/Down mirror Left/Right. The list is one dimensional, so the vertical
      // pair has no separate meaning to claim — and pressing it expecting to
      // move and getting nothing reads as a broken viewer.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrevious();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
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
              className="max-w-full max-h-[90vh] object-contain rounded-lg transition-transform"
              style={{ transform: `scale(${zoom})` }}
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

          The arrows are always here, disabled when there is nowhere to go.
          Hiding them instead made the same viewer look like two different ones:
          a message holding one image opened without them, and the controls the
          user had just learned were simply gone. A greyed-out arrow says "not
          from here"; a missing one says nothing at all.

          The counter is the exception and lives in the panel, because "1 / 1"
          states a position that carries no information.
        */}
        <ArrowButton
          side="start"
          label={t('attachments.lightbox.previous')}
          enabled={hasPrevious}
          hint={edgeHint}
          onHintShown={onEdgeHintShown}
          onActivate={goPrevious}
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </ArrowButton>

        <ArrowButton
          side="end"
          label={t('attachments.lightbox.next')}
          enabled={hasNext}
          hint={edgeHint}
          onHintShown={onEdgeHintShown}
          onActivate={goNext}
        >
          <ChevronRightIcon className="w-5 h-5" />
        </ArrowButton>

        {/*
          Above the panel, and shown whatever the list length: a message holding a
          single image is exactly the case where the rest of the session is most
          worth offering.
        */}
        {notice && (
          <div
            className="absolute bottom-20 left-1/2 -translate-x-1/2 max-w-[80vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {notice}
          </div>
        )}

        <LightboxPanel
          src={srcs[index]}
          index={index}
          total={srcs.length}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          canZoomIn={zoom < ZOOM_MAX}
          canZoomOut={zoom > ZOOM_MIN}
          onOpenAssets={onOpenAssets}
        />
      </div>
    </Portal>
  );
};
