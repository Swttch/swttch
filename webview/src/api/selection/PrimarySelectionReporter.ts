/**
 * Reports the text the user has selected, so the host can put it into the Linux
 * PRIMARY selection: the buffer a middle click pastes from, which any program
 * fills the moment something is selected (#513).
 *
 * Reported from here because the page is the only place that knows what is
 * selected. The embedded browser of IDE 2026.2 and later runs in a process of its
 * own and no longer fills the buffer, so a word selected in the chat reached no
 * buffer at all. What to do with the text is the host's business and differs per
 * environment; this class only says what was selected, and when.
 *
 * "When" is the part that needs care:
 *
 * - While a mouse button is down the selection is still being drawn, and a drag
 *   changes it on every mouse move. Nothing is reported until the button comes
 *   up, and then the final text is reported once.
 * - Without a button the selection changes by keyboard (Shift+Arrow), once per
 *   key press, and each change is reported.
 * - An empty selection is never reported. Dropping a selection leaves the buffer
 *   alone in every other program, so reporting it would wipe text the user can
 *   still paste.
 *
 * The same text is not sent twice in a row, since a selection change usually
 * follows the button release that already reported it. The exception is the
 * button release itself: it ends a deliberate selection, and another program may
 * have taken the buffer since the last one, so it always claims it again.
 */
export class PrimarySelectionReporter {
  private pointerHeld = false;
  private lastReported = '';

  constructor(
    private readonly doc: Document,
    /** Receives the selected text; called only with non-empty text. */
    private readonly report: (text: string) => void,
  ) {}

  /** Start watching selections. Returns the function that stops watching. */
  attach(): () => void {
    const onDown = () => {
      this.pointerHeld = true;
    };
    const onUp = () => {
      this.pointerHeld = false;
      this.reportSelection({ alwaysClaim: true });
    };
    const onSelectionChange = () => {
      if (this.pointerHeld) return;
      this.reportSelection({ alwaysClaim: false });
    };

    this.doc.addEventListener('pointerdown', onDown, true);
    this.doc.addEventListener('pointerup', onUp, true);
    this.doc.addEventListener('pointercancel', onUp, true);
    this.doc.addEventListener('selectionchange', onSelectionChange);
    return () => {
      this.doc.removeEventListener('pointerdown', onDown, true);
      this.doc.removeEventListener('pointerup', onUp, true);
      this.doc.removeEventListener('pointercancel', onUp, true);
      this.doc.removeEventListener('selectionchange', onSelectionChange);
    };
  }

  private reportSelection(options: { alwaysClaim: boolean }): void {
    const text = this.selectedText();
    if (text === '') {
      // Forget it, so selecting the same text again later is reported again.
      this.lastReported = '';
      return;
    }
    if (!options.alwaysClaim && text === this.lastReported) return;
    this.lastReported = text;
    this.report(text);
  }

  /** The selected text, from a text field or from the page, or '' when there is none. */
  private selectedText(): string {
    const active = this.doc.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      // Never what was typed into a password field, selected or not.
      if (active instanceof HTMLInputElement && active.type === 'password') return '';
      const { selectionStart, selectionEnd, value } = active;
      if (selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd) {
        return value.slice(selectionStart, selectionEnd);
      }
    }
    return this.doc.getSelection()?.toString() ?? '';
  }
}
