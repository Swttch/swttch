import { useCallback } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import { ImageAttachSource } from '../../../../types';
import { HostClipboard, type HostClipboardResponse } from '../HostClipboard';

/**
 * How long a paste waits for the host to read the clipboard. A read is instant when
 * it works, so this only ends the wait for a host that never answers, which would
 * otherwise leave the user's paste doing nothing for the bridge's thirty seconds.
 */
const HOST_CLIPBOARD_TIMEOUT_MS = 5_000;

/**
 * How long a paste of plain text waits for the host's word on files. The text is already
 * in the composer by then, so a slow host only means the chips come late, never that the
 * paste is lost.
 */
const HOST_FILE_CHECK_TIMEOUT_MS = 1_500;

/** What a paste that the browser is already finishing lets the host settle afterwards. */
export type HostPasteOptions = {
  /**
   * The text the browser itself is pasting. The IDE project tree can leave only the names
   * of the copied files as text on the system clipboard, so text alone cannot say "files".
   * The host is asked after the browser has put the text in; when it answers that it handed
   * files to the chat, the text the browser just put in is taken back, because the chips
   * are the paste. Anything else the host answers changes nothing: the browser's paste stands.
   */
  pastedText?: string;
};

/**
 * End the run of typing the browser is still counting as one edit, so the text that
 * follows becomes an undo step of its own.
 *
 * Chrome folds every `insertText` into the typing that came just before it, and a
 * native paste is never folded into anything. Without this, Cmd/Ctrl+Z after a
 * paste into a half-typed prompt took back the paste AND the typing before it in one
 * step. Putting the selection back where it already is is what closes the run: the
 * browser treats a selection set from script like one made by the user.
 */
function endTypingRun(): void {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Wait until the browser has finished the paste it was in the middle of when the event fired. */
function afterNativePaste(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
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

      let host = HostClipboard.NONE;
      try {
        const response = await send<HostClipboardResponse>(
          MessageType.GET_CLIPBOARD,
          { workingDir: workingDirectory ?? undefined },
          { timeout: browserPastedText ? HOST_FILE_CHECK_TIMEOUT_MS : HOST_CLIPBOARD_TIMEOUT_MS },
        );
        host = HostClipboard.from(response);
      } catch {
        return;
      }

      if (browserPastedText) {
        // Only files change the outcome: their chips are the paste, so the names the browser
        // just typed come back out. If the composer has changed since, leave it alone.
        if (host.fileCount > 0 && editor.textContent === afterPaste) {
          document.execCommand('undo');
        }
        return;
      }

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
      endTypingRun();
      document.execCommand('insertText', false, host.text);
    },
    [send, workingDirectory, addImageAttachment],
  );
}
