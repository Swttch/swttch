import { useEffect } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { isJetBrains } from '@/config/environment';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { HostClipboard, type HostClipboardResponse } from '@/pages/ChatPage/ChatInput/HostClipboard';
import { MessageType } from '@/shared';
import { deepActiveElement } from '@/utils/focusedTypingTarget';
import {
  HOST_CLIPBOARD_TIMEOUT_MS,
  HOST_PASTE_CHECK_TIMEOUT_MS,
  afterNativePaste,
  normalizeNewlines,
} from '@/utils/hostPaste';
import { insertTextIntoField, type TextField } from '@/utils/insertTextIntoField';
import { takeMiddleClickPaste } from '@/utils/middleClickPaste';
import { typingTargetOf } from '@/utils/typingTarget';

/** The input types that take typed text, and so a paste of text. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'password', 'email', 'url', 'tel', 'number']);

/**
 * Pasting into any input or textarea of the page, in the IDE (#752).
 *
 * On a Wayland desktop the embedded browser cannot see the clipboard of the IDE
 * window, so its clipboard is empty or holds the last thing copied inside the page
 * (#278, #715). The composer finishes its pastes with what the IDE host reads
 * ([useHostClipboardPaste]); this does the same for every other text field, such as
 * the session search box and the settings fields, from one listener, so a field
 * added later is covered without wiring.
 *
 * The browser's own paste goes ahead untouched. Only when the host holds other text
 * is it taken back and the host's put in. A field takes text only, so the host is
 * asked for text only: files on the clipboard are not handed to the chat, and an
 * image is not attached.
 *
 * A middle-click paste is checked against the host's selection instead (#754).
 *
 * The composer is a contenteditable, not a field, so it never comes through here.
 * Outside the IDE nothing listens: a browser reads its own clipboard.
 */
export function useHostFieldPaste(): void {
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? undefined;

  useEffect(() => {
    if (!isJetBrains()) return;
    const onPaste = (event: ClipboardEvent) => {
      // Something nearer the field has taken the paste over.
      if (event.defaultPrevented) return;
      const field = textFieldOf(event);
      if (!field) return;
      const pasted = event.clipboardData?.getData('text/plain') ?? '';
      void finishFromHost(field, pasted, takeMiddleClickPaste(), workingDirectory);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [workingDirectory]);
}

/** The field a paste event is about to write into, or null when it is not one that takes text. */
function textFieldOf(event: Event): TextField | null {
  const target = typingTargetOf(event);
  const takesText = target instanceof HTMLTextAreaElement
    || (target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type));
  if (!takesText || target.readOnly || target.disabled) return null;
  return target;
}

/**
 * Called while the paste event is being dispatched, so the field still holds what it
 * held before the browser's paste.
 */
async function finishFromHost(
  field: TextField,
  pasted: string,
  fromSelection: boolean,
  workingDir: string | undefined,
): Promise<void> {
  const before = { value: field.value, start: field.selectionStart, end: field.selectionEnd };
  await afterNativePaste();
  const afterPaste = field.value;
  const browserChangedNothing = afterPaste === before.value;

  let text: string | null;
  try {
    // A middle click pastes what is selected, so the clipboard must not stand in for it (#754).
    const response = await getBridge().request<HostClipboardResponse>(
      fromSelection ? MessageType.GET_PRIMARY_SELECTION : MessageType.GET_CLIPBOARD,
      fromSelection ? { workingDir } : { workingDir, textOnly: true },
      // With nothing pasted yet, the user is waiting for the host to deliver the paste.
      { timeout: browserChangedNothing && pasted === '' ? HOST_CLIPBOARD_TIMEOUT_MS : HOST_PASTE_CHECK_TIMEOUT_MS },
    );
    text = HostClipboard.from(response).text;
  } catch {
    return;
  }

  // An empty or failed answer leaves the browser's paste standing, and so does a matching one.
  if (text === null || normalizeNewlines(text) === normalizeNewlines(pasted)) return;
  // The user has typed on, or moved elsewhere, since pasting: leave the field alone.
  if (field.value !== afterPaste || deepActiveElement() !== field) return;

  if (!browserChangedNothing) {
    document.execCommand('undo');
    // A field that rewrites what is typed into it can leave nothing to undo. Writing the
    // host's text beside the stale one would keep both, so the whole value is replaced.
    if (field.value !== before.value) {
      field.select();
      const head = before.value.slice(0, before.start ?? 0);
      const rest = before.end === null ? '' : before.value.slice(before.end);
      insertTextIntoField(field, head + text + rest);
      return;
    }
  }
  // Paste over what was selected when the user pasted.
  if (before.start !== null && before.end !== null) field.setSelectionRange(before.start, before.end);
  insertTextIntoField(field, text);
}
