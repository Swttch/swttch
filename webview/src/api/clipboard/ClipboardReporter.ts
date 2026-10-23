import { selectedText } from '../selection/selectedText';

/**
 * Hands text to the IDE host, which puts it on the system clipboard. Resolves once the host has
 * placed it and rejects when it could not.
 */
export type HostCopy = (text: string) => Promise<unknown>;

/**
 * Reports text copied inside the embedded browser to the IDE host.
 *
 * JCEF and the IDE run in separate processes, so a browser copy can succeed
 * without updating the clipboard owned by the IDE. The reporter observes both
 * native copy events and Clipboard API writes, covering keyboard/context-menu
 * copies and explicit copy buttons alike.
 *
 * The browser's own write still happens. A copy counts as done as soon as
 * EITHER the browser or the host has placed the text, so where the browser
 * writes the real clipboard nothing changes and nobody waits for the host. It
 * is reported as failed only when neither could: the copy buttons turn that
 * rejection into their "copy failed" notice, which a write that always
 * resolved would make impossible to ever show.
 */
export class ClipboardReporter {
  private wrapped: Clipboard['writeText'] | undefined;
  private originalWriteText: Clipboard['writeText'] | undefined;
  private attached = false;
  private stopListening: (() => void) | undefined;

  constructor(
    private readonly doc: Document,
    private readonly clipboard: Clipboard | undefined,
    /** Receives non-empty copied text for the host bridge. */
    private readonly report: HostCopy,
  ) {}

  /** Start watching copies. Returns the function that restores the page. */
  attach(): () => void {
    if (this.attached) return () => this.detach();
    this.attached = true;

    // Ctrl+C, Ctrl+X and the context menu's Copy never call script, so the page
    // only hears an event and has to ask what is selected. The listeners sit in
    // the bubble phase on purpose: a component that handles the copy itself calls
    // preventDefault on the way up, and a capture-phase listener would run before
    // it and never see that.
    const onClipboardEvent = (event: Event) => {
      // Someone already took this copy over and put their own text on the
      // clipboard, so the selection is not what is being copied.
      if (event.defaultPrevented) return;
      const text = selectedText(this.doc);
      if (text.length === 0) return;
      this.report(text).catch(() => {
        // The browser's own copy went ahead, and there is no button to say no to.
      });
    };
    this.doc.addEventListener('copy', onClipboardEvent);
    this.doc.addEventListener('cut', onClipboardEvent);
    this.stopListening = () => {
      this.doc.removeEventListener('copy', onClipboardEvent);
      this.doc.removeEventListener('cut', onClipboardEvent);
    };

    const clipboard = this.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      const original = clipboard.writeText;
      const report = this.report;
      this.originalWriteText = original;
      this.wrapped = (text: string): Promise<void> => {
        // Called now, not after an await: the browser lets a page write the
        // clipboard only shortly after a click.
        let browserError: unknown;
        const browser = new Promise<void>((resolve, reject) => {
          try {
            resolve(original.call(clipboard, text));
          } catch (err) {
            reject(err);
          }
        }).catch((err) => {
          browserError = err;
          throw err;
        });
        const host: Promise<unknown> = text.length === 0 ? Promise.resolve() : report(text);
        return firstSuccess(browser, host, () => browserError);
      };
      clipboard.writeText = this.wrapped;
    }

    return () => this.detach();
  }

  private detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.stopListening?.();
    this.stopListening = undefined;
    // Put back only our own wrapper, so a later wrapper is not undone with it.
    if (this.clipboard && this.originalWriteText && this.clipboard.writeText === this.wrapped) {
      this.clipboard.writeText = this.originalWriteText;
    }
    this.originalWriteText = undefined;
    this.wrapped = undefined;
  }
}

/** Resolves on the first of [a] and [b] to succeed; rejects with [reason] only when both fail. */
function firstSuccess(a: Promise<unknown>, b: Promise<unknown>, reason: () => unknown): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let failures = 0;
    const failed = () => {
      failures += 1;
      if (failures === 2) reject(reason());
    };
    a.then(() => resolve(), failed);
    b.then(() => resolve(), failed);
  });
}
