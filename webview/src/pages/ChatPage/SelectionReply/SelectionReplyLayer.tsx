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
/** The reply card's width, which the placement below keeps inside the window; the card is given the same value. */
const CARD_WIDTH = 380;

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
  // Whether the open card has a comment in it: a card in use is kept, an empty one gives way to a new selection.
  const draftRef = useRef(false);
  const onDraftChange = useCallback((hasText: boolean) => {
    draftRef.current = hasText;
  }, []);

  const dismiss = useCallback(() => {
    setPicked(null);
    setAnchor(null);
    setComposing(false);
  }, []);

  const pickSelection = useCallback(() => {
    // A card with a comment in it keeps the text it was opened for, and a new selection brings up no bar (as in
    // Claude Desktop): pressing in its box moves the selection away, and none of that may close it. An empty
    // card is only a question, so a new selection replaces it.
    const composing = composingRef.current;
    if (composing && draftRef.current) return;
    const selection = window.getSelection();
    const container = containerRef.current;
    const clear = () => {
      if (composing) return;
      setPicked(null);
      setAnchor(null);
    };
    if (!selection || !container || selection.rangeCount === 0 || selection.isCollapsed) {
      clear();
      return;
    }
    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text || !container.contains(range.commonAncestorContainer) || isEditable(range.commonAncestorContainer)) {
      clear();
      return;
    }
    const next = anchorOf(range);
    if (!next) return;
    setComposing(false);
    setPicked({ text, range: range.cloneRange() });
    setAnchor(next);
  }, [containerRef]);

  // The quoted text stays highlighted while its card is open, even after the selection itself has moved on.
  useEffect(() => {
    if (!composing || !picked || typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;
    CSS.highlights.set("reply-quote", new Highlight(picked.range));
    return () => {
      CSS.highlights.delete("reply-quote");
    };
  }, [composing, picked]);

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
    // Scrolling fires many events a frame (the chat also scrolls itself while it streams), and each one used to
    // measure the range, which forces a layout, and to set a new anchor object, which renders again. Once a frame
    // is enough, and an anchor that has not moved is left as it is (#645).
    let frame = 0;
    const follow = () => {
      frame = 0;
      if (!picked.range.commonAncestorContainer.isConnected) {
        dismiss();
        return;
      }
      const next = anchorOf(picked.range);
      if (!next) {
        dismiss();
        return;
      }
      setAnchor((prev) =>
        prev && prev.top === next.top && prev.bottom === next.bottom && prev.centerX === next.centerX ? prev : next,
      );
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(follow);
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
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
    // Never wider than the window, so a narrow pane keeps the card whole; centred on the text, then kept inside.
    const cardWidth = Math.min(CARD_WIDTH, viewport.width - 2 * EDGE);
    const cardLeft = Math.min(Math.max(anchor.centerX - cardWidth / 2, EDGE), Math.max(EDGE, viewport.width - cardWidth - EDGE));
    const style: CSSProperties = cardAbove
      ? { left: cardLeft, width: cardWidth, bottom: viewport.height - anchor.top + EDGE }
      : { left: cardLeft, width: cardWidth, top: anchor.bottom + EDGE };
    return (
      <ReplyComposerCard
        quote={picked.text}
        style={style}
        onCancel={dismiss}
        onDraftChange={onDraftChange}
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
  // `whitespace-nowrap` and `w-max`: a fixed box can grow only as far as the window's edge from its `left`, so a
  // selection near the right edge made "Start side chat" wrap onto two lines.
  const buttonClass = 'whitespace-nowrap px-3 text-[0.9231rem] text-text-primary hover:bg-surface-hover transition-colors';

  return (
    // Pressing a button must not move focus or the selection away before the click lands.
    <div
      role="toolbar"
      style={barStyle}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-40 flex h-9 w-max items-stretch divide-x divide-border-default overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-lg"
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
