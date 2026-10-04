/**
 * Elements a click is meant for, so the composer must not take the focus away
 * from them. A dialog is included because it traps focus on its own.
 */
const CLAIMS_CLICK_SELECTOR =
  'button, a, input, textarea, select, [role="button"], [contenteditable], [role="dialog"], [aria-modal="true"]';

/**
 * When the composer takes the caret back without being asked to.
 *
 * Two moments, and neither is a mouse press. A press is where a word or drag
 * selection starts, so it is left to the browser. What follows a press is only
 * known once the button is released:
 *
 * - a `click` that ended with nothing selected was a plain click, so the
 *   composer gets the focus. A press on a non-focusable area has just moved it
 *   to `body`, so this also covers the click that brings the user back to the
 *   window.
 * - the window regaining focus puts it back too, unless a selection exists or a
 *   mouse button is still down, since that press may be the start of a selection.
 *
 * In both, only `body` holding the focus counts as "nothing else wants it", which
 * keeps the composer from stealing focus from a control or from the other JCEF
 * window (that tug-of-war is the reason for the guard).
 */
export class ComposerFocusPolicy {
  private pointerHeld = false;

  constructor(
    private readonly doc: Document,
    /** Puts the caret in the composer. */
    private readonly focusComposer: () => void,
  ) {}

  /** Start watching mouse presses and clicks. Returns the function that stops watching. */
  attach(): () => void {
    const onDown = () => {
      this.pointerHeld = true;
    };
    const onUp = () => {
      this.pointerHeld = false;
    };
    const onClick = (event: MouseEvent) => this.focusOnPlainClick(event);

    this.doc.addEventListener('pointerdown', onDown, true);
    this.doc.addEventListener('pointerup', onUp, true);
    this.doc.addEventListener('pointercancel', onUp, true);
    this.doc.addEventListener('click', onClick, true);
    return () => {
      this.doc.removeEventListener('pointerdown', onDown, true);
      this.doc.removeEventListener('pointerup', onUp, true);
      this.doc.removeEventListener('pointercancel', onUp, true);
      this.doc.removeEventListener('click', onClick, true);
    };
  }

  /** Call when the window has just regained focus. */
  restoreOnWindowFocus(): void {
    if (this.pointerHeld) return;
    if (this.nothingElseHoldsFocus() && !this.hasSelection()) {
      this.focusComposer();
    }
  }

  private focusOnPlainClick(event: MouseEvent): void {
    if (!this.nothingElseHoldsFocus()) return;
    if (this.hasSelection()) return;
    if (this.landedOnClaimedElement(event)) return;
    this.focusComposer();
  }

  private nothingElseHoldsFocus(): boolean {
    return this.doc.activeElement === this.doc.body;
  }

  private hasSelection(): boolean {
    const selection = this.doc.getSelection();
    return !!selection && selection.rangeCount > 0 && !selection.isCollapsed;
  }

  /** Read the composed path: a click inside a shadow root is retargeted to its host. */
  private landedOnClaimedElement(event: MouseEvent): boolean {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    return path.some((node) => node instanceof HTMLElement && node.matches(CLAIMS_CLICK_SELECTOR));
  }
}
