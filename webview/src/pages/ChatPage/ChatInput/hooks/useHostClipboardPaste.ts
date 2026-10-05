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

/**
 * Finish a paste with what the IDE host reads off the system clipboard, for a paste
 * whose own event arrived empty (#278).
 *
 * On a Wayland desktop the embedded browser cannot see the clipboard of the IDE
 * window, but the IDE process can. The host answers with text, an image, or
 * neither:
 *
 * - An image is attached through the same path as any pasted image, and wins over
 *   text, as it does for a paste that carries both.
 * - Text goes in at the caret through the browser's editing command, so the insert
 *   lands on the undo stack and fires `input`, exactly as a native paste does
 *   (issue #286). Writing it through `onChange` instead would skip both.
 *
 * Nothing is shown when the host has nothing or cannot be asked: the user pressed
 * paste, and a paste of nothing does nothing, as it did before.
 */
export function useHostClipboardPaste(options: {
  workingDirectory: string | null | undefined;
  addImageAttachment: (file: File, source: ImageAttachSource) => Promise<void>;
}): (editor: HTMLElement) => Promise<void> {
  const { workingDirectory, addImageAttachment } = options;
  const { send } = useBridgeContext();

  return useCallback(
    async (editor: HTMLElement) => {
      let host = HostClipboard.NONE;
      try {
        const response = await send<HostClipboardResponse>(
          MessageType.GET_CLIPBOARD,
          { workingDir: workingDirectory ?? undefined },
          { timeout: HOST_CLIPBOARD_TIMEOUT_MS },
        );
        host = HostClipboard.from(response);
      } catch {
        return;
      }

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
