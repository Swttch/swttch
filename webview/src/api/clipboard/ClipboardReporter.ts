/**
 * Reports text copied inside the embedded browser to the IDE host.
 *
 * JCEF and the IDE run in separate processes, so a browser copy can succeed
 * without updating the clipboard owned by the IDE. The reporter observes both
 * native copy events and Clipboard API writes, covering keyboard/context-menu
 * copies and explicit copy buttons alike.
 */
export class ClipboardReporter {
  private originalWriteText: Clipboard['writeText'] | undefined;
  private onCopyListener: (() => void) | undefined;
  private attached = false;

  constructor(
    private readonly doc: Document,
    private readonly clipboard: Clipboard | undefined,
    /** Receives non-empty copied text for the host bridge. */
    private readonly report: (text: string) => void,
  ) {}

  /** Start watching copies. Returns the function that restores the page. */
  attach(): () => void {
    if (this.attached) return () => this.detach();
    this.attached = true;

    const onCopy = () => {
      this.reportText(this.selectedText());
    };
    this.onCopyListener = onCopy;
    this.doc.addEventListener('copy', onCopy, true);

    if (this.clipboard && typeof this.clipboard.writeText === 'function') {
      const original = this.clipboard.writeText;
      this.originalWriteText = original;
      this.clipboard.writeText = async (text: string): Promise<void> => {
        try {
          await original.call(this.clipboard, text);
        } catch {
          // The host is the recovery path when JCEF's browser clipboard is not
          // available. It also receives successful writes below so the IDE's
          // clipboard stays in sync with the browser process.
        }
        this.reportText(text);
      };
    }

    return () => this.detach();
  }

  private detach(): void {
    if (!this.attached) return;
    this.attached = false;

    if (this.onCopyListener) {
      this.doc.removeEventListener('copy', this.onCopyListener, true);
      this.onCopyListener = undefined;
    }
    if (this.clipboard && this.originalWriteText) {
      this.clipboard.writeText = this.originalWriteText;
      this.originalWriteText = undefined;
    }
  }

  private reportText(text: string): void {
    if (text.length > 0) this.report(text);
  }

  private selectedText(): string {
    const active = this.doc.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      if (active instanceof HTMLInputElement && active.type === 'password') return '';
      const { selectionStart, selectionEnd, value } = active;
      if (selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd) {
        return value.slice(selectionStart, selectionEnd);
      }
    }
    return this.doc.getSelection()?.toString() ?? '';
  }
}
