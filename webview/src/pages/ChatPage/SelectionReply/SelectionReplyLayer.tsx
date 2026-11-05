import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useTranslation } from '@/i18n';
import { useOptionalSideQuestions } from '@/contexts/SideQuestionContext';
import { addReplyToComposer } from '@/utils/composerReplies';
import { quoteLines } from '../message-renderers/utils/replyBlocks';
import { ReplyComposerCard } from './ReplyComposerCard';

interface Props {
  /** The chat transcript: only text selected inside it brings up the bar. */
  containerRef: RefObject<HTMLElement | null>;
}

interface Picked {
  text: string;
  range: Range;
}

interface Anchor {
  top: number;
  bottom: number;
  centerX: number;
}

const BAR_HEIGHT = 36;
const EDGE = 8;

/**
 * The page zoom (`zoom` on the root, the zoom control's doing). A range reports its place in screen pixels, but
 * what a fixed element is given is in the zoomed pixels, so every place taken from a range is divided by this.
 */
function pageZoom(): number {
  const zoom = parseFloat(getComputedStyle(document.documentElement).zoom);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

/** The window's size in the pixels a fixed element is placed in. */
function viewportSize(): { width: number; height: number } {
  const zoom = pageZoom();
  return { width: window.innerWidth / zoom, height: window.innerHeight / zoom };
}

function anchorOf(range: Range): Anchor | null {
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  // Out of sight (scrolled away): nothing to point at.
  if (rect.bottom < 0 || rect.top > window.innerHeight) return null;
  const zoom = pageZoom();
  return { top: rect.top / zoom, bottom: rect.bottom / zoom, centerX: (rect.left + rect.width / 2) / zoom };
}

function isEditable(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement;
  return !!el?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]');
}

/**
 * Text selected anywhere in the chat gets a small bar, as in Claude Desktop: "Start side chat" and "Reply".
 * "Reply" opens a card beside the text; its Enter puts a reply (or, with nothing written, an excerpt) in the
 * message box. "Start side chat" opens the side-question window with the quote already in its box.
 */
export function SelectionReplyLayer({ containerRef }: Props) {
  const { t } = useTranslation('chat');
  const sideQuestions = useOptionalSideQuestions();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [composing, setComposing] = useState(false);
  // While the pointer is down the selection is still being made and the bar waits for the release.
  const pointerDown = useRef(false);
  const composingRef = useRef(false);
  composingRef.current = composing;

  const dismiss = useCallback(() => {
    setPicked(null);
    setAnchor(null);
    setComposing(false);
  }, []);

  const pickSelection = useCallback(() => {
    // The card keeps the text it was opened for, even though pressing in its box moves the selection away.
    if (composingRef.current) return;
    const selection = window.getSelection();
    const container = containerRef.current;
    if (!selection || !container || selection.rangeCount === 0 || selection.isCollapsed) {
      setPicked(null);
      setAnchor(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text || !container.contains(range.commonAncestorContainer) || isEditable(range.commonAncestorContainer)) {
      setPicked(null);
      setAnchor(null);
      return;
    }
    const next = anchorOf(range);
    if (!next) return;
    setPicked({ text, range: range.cloneRange() });
    setAnchor(next);
  }, [containerRef]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (e.button === 0) pointerDown.current = true;
    };
    const onUp = () => {
      pointerDown.current = false;
      // After the browser has settled the selection of a double click.
      window.setTimeout(pickSelection, 0);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key === 'Shift') pickSelection();
    };
    const onSelectionChange = () => {
      if (pointerDown.current || composingRef.current) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setPicked(null);
        setAnchor(null);
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('mouseup', onUp, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mouseup', onUp, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [pickSelection]);

  // The bar and the card are fixed to the screen, so they follow the text when the chat scrolls or resizes.
  useEffect(() => {
    if (!picked) return;
    const follow = () => {
      const next = anchorOf(picked.range);
      if (next) setAnchor(next);
      else dismiss();
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [picked, dismiss]);

  if (!picked || !anchor) return null;

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    dismiss();
  };

  const viewport = viewportSize();
  const left = Math.min(Math.max(anchor.centerX, EDGE + 120), viewport.width - EDGE - 120);
  const above = anchor.top > BAR_HEIGHT + 2 * EDGE;

  if (composing) {
    const cardAbove = anchor.top > 200;
    const cardLeft = Math.min(Math.max(anchor.centerX - 180, EDGE), Math.max(EDGE, viewport.width - 360 - EDGE));
    const style: CSSProperties = cardAbove
      ? { left: cardLeft, bottom: viewport.height - anchor.top + EDGE }
      : { left: cardLeft, top: anchor.bottom + EDGE };
    return (
      <ReplyComposerCard
        quote={picked.text}
        style={style}
        onCancel={dismiss}
        onSubmit={(comment, send) => {
          addReplyToComposer(picked.text, comment, send);
          clearSelection();
        }}
      />
    );
  }

  const barStyle: CSSProperties = {
    left,
    top: above ? anchor.top - BAR_HEIGHT - EDGE : anchor.bottom + EDGE,
    transform: 'translateX(-50%)',
  };
  const buttonClass = 'px-3 text-[0.9231rem] text-text-primary hover:bg-surface-hover transition-colors';

  return (
    // Pressing a button must not move focus or the selection away before the click lands.
    <div
      role="toolbar"
      style={barStyle}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-40 flex h-9 items-stretch divide-x divide-border-default overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-lg"
    >
      {sideQuestions && (
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            sideQuestions.openWithText(`${quoteLines(picked.text)}\n\n`);
            clearSelection();
          }}
        >
          {t('selectionReply.startSideChat')}
        </button>
      )}
      <button type="button" className={buttonClass} onClick={() => setComposing(true)}>
        {t('selectionReply.reply')}
      </button>
    </div>
  );
}
