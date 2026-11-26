import { useCallback } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import { ImageAttachSource } from '../../../../types';
import {
  HOST_CLIPBOARD_TIMEOUT_MS,
  HOST_PASTE_CHECK_TIMEOUT_MS,
  afterNativePaste,
  normalizeNewlines,
} from '@/utils/hostPaste';
import { HostClipboard, type HostClipboardResponse } from '../HostClipboard';
import { insertTextAtCursor } from '../RichInput/insertTextAtCursor';

/** What a paste that the browser is already finishing lets the host settle afterwards. */
export type HostPasteOptions = {
  /**
   * The text the browser itself is pasting. The IDE project tree can leave only the names
   * of the copied files as text on the system clipboard, so text alone cannot say "files".
   * The host is asked after the browser has put the text in; when it answers that it handed
   * files to the chat, the text the browser just put in is taken back, because the chips
   * are the paste. The browser's own clipboard can also be stale (#715), so when the host
   * holds other text, or an image and no text, the browser's text is taken back and the
   * host's goes in. An empty or failed answer changes nothing: the browser's paste stands.
   *
   * An empty string means the paste carried no plain text (markup only, for one). Pass
   * [textBefore] with it: when the browser then put nothing in, the paste is finished from
   * the host like an empty one; when it did put something in, it is checked like any other.
   */
  pastedText?: string;
  /** What the composer held just before the browser's own paste, for a paste that carried no plain text. */
  textBefore?: string;
};

/**
 * End the run of typing the browser is still counting as one edit, so what follows
 * becomes an undo step of its own.
 *
 * Chrome folds every `insertText` into the typing around it, and a native paste is
 * never folded into anything. Without this, Cmd/Ctrl+Z after a paste into a
 * half-typed prompt took back the paste AND the typing before it in one step, and
 * after more typing it took back that typing AND the paste. Putting the selection
 * back where it already is is what closes the run: the browser treats a selection
 * set from script like one made by the user.
 */
function endTypingRun(): void {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Put the host's text in at the caret as one undo step, apart from the typing on either side. */
function pasteText(text: string): void {
  endTypingRun();
  insertTextAtCursor(text);
  endTypingRun();
}

/**
 * Finish a paste with what the IDE host reads off the system clipboard (#278, #672).
 *
 * Two kinds of paste come here:
 *
 * - A paste whose own event arrived empty. On a Wayland desktop the embedded browser
 *   cannot see the clipboard of the IDE window, but the IDE process can. The host
 *   answers with text, an image, files, or nothing:
 *   - Files copied in a file manager were already sent to the chat the way a drop of
 *     them goes, and their chips are the paste.
 *   - An image is attached through the same path as any pasted image, and wins over
 *     text, as it does for a paste that carries both.
 *   - Text goes in at the caret through the browser's editing command, so the insert
 *     lands on the undo stack and fires `input`, exactly as a native paste does
 *     (issue #286). Writing it through `onChange` instead would skip both.
 * - A paste that carried text, which the browser pastes itself (see [HostPasteOptions]).
 *   The host is asked beside it, and its answer wins when it differs: files, an image, or
 *   other text mean the browser's copy of the clipboard was stale (#715).
 *
 * Nothing is shown when the host has nothing or cannot be asked: the user pressed
 * paste, and a paste of nothing does nothing, as it did before.
 */
export function useHostClipboardPaste(options: {
  workingDirectory: string | null | undefined;
  addImageAttachment: (file: File, source: ImageAttachSource) => Promise<void>;
}): (editor: HTMLElement, pasteOptions?: HostPasteOptions) => Promise<void> {
  const { workingDirectory, addImageAttachment } = options;
  const { send } = useBridgeContext();

  return useCallback(
    async (editor: HTMLElement, pasteOptions?: HostPasteOptions) => {
      const browserPastedText = pasteOptions?.pastedText !== undefined;

      // What the composer holds right after the browser's own paste, to tell later whether
      // the user has gone on typing before the host answered.
      let afterPaste: string | null = null;
      if (browserPastedText) {
        await afterNativePaste();
        afterPaste = editor.textContent;
      }
      // A paste with no plain text that the browser left the composer untouched for is a paste
      // of nothing, which the host finishes (#715), the way it finishes a paste that came up empty.
      const browserInsertedNothing = browserPastedText
        && pasteOptions?.pastedText === ''
        && pasteOptions.textBefore !== undefined
        && afterPaste === pasteOptions.textBefore;
      const checkingBrowserPaste = browserPastedText && !browserInsertedNothing;

      let host = HostClipboard.NONE;
      try {
        const response = await send<HostClipboardResponse>(
          MessageType.GET_CLIPBOARD,
          { workingDir: workingDirectory ?? undefined },
          { timeout: checkingBrowserPaste ? HOST_PASTE_CHECK_TIMEOUT_MS : HOST_CLIPBOARD_TIMEOUT_MS },
        );
        host = HostClipboard.from(response);
      } catch {
        return;
      }

      if (checkingBrowserPaste) {
        // The composer has changed since the browser's paste (the user typed on, or the
        // focus moved): leave it alone, whatever the host says.
        if (editor.textContent !== afterPaste) return;

        // Files change the outcome: their chips are the paste, so the names the browser
        // just typed come back out.
        if (host.fileCount > 0) {
          document.execCommand('undo');
          return;
        }

        // The browser's clipboard can be stale (#715). On a Wayland desktop the embedded
        // browser keeps the last thing copied inside the chat, and the desktop does not
        // refresh it while the IDE window has the focus, so a paste carries that old text
        // although the user has since copied something else outside. The host reads the
        // real clipboard, so when it holds something other than what the browser pasted,
        // the browser's text comes back out and the host's goes in.
        const hostImage = host.text === null ? host.toImageFile() : null;
        const staleText = host.text !== null
          && normalizeNewlines(host.text) !== normalizeNewlines(pasteOptions?.pastedText ?? '');
        if (!staleText && !hostImage) return;
        document.execCommand('undo');
        if (hostImage) {
          await addImageAttachment(hostImage, ImageAttachSource.Paste);
          return;
        }
        if (!editor.contains(document.activeElement)) return;
        pasteText(host.text as string);
        return;
      }

      // The user typed on while the host answered a paste the browser had left empty.
      if (browserInsertedNothing && editor.textContent !== afterPaste) return;

      // Files the host sent on arrive as chips of their own, so the paste is answered.
      if (host.fileCount > 0) return;

      const image = host.toImageFile();
      if (image) {
        await addImageAttachment(image, ImageAttachSource.Paste);
        return;
      }

      if (host.text === null) return;
      // The user may have clicked elsewhere while the host answered. Text typed
      // into whatever has the focus now would not be what they pasted into.
      if (!editor.contains(document.activeElement)) return;
      pasteText(host.text);
    },
    [send, workingDirectory, addImageAttachment],
  );
}
