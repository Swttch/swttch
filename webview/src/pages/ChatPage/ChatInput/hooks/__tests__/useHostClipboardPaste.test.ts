import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MessageType } from '@/shared';

/**
 * Finishing a paste with the host's clipboard (#278).
 *
 * The browser's own paste event came up empty, so this hook asks the IDE host
 * what is on the clipboard and puts it in the composer. These tests pin what goes
 * where: text at the caret through the editing command (so undo keeps working),
 * an image through the attachment path, and nothing at all when the host has
 * nothing or the user has moved on.
 */

const sendMock = vi.fn();

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: sendMock,
    sendRaw: vi.fn(),
    subscribe: () => () => {},
    lastError: null,
  }),
}));

import { useHostClipboardPaste } from '../useHostClipboardPaste';

function renderPaste(workingDirectory: string | null = '/proj') {
  const addImageAttachment = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useHostClipboardPaste({ workingDirectory, addImageAttachment }));
  return { paste: result.current, addImageAttachment };
}

/** A focused editable element standing in for the composer. */
function focusedEditor(): HTMLElement {
  const editor = document.createElement('div');
  editor.tabIndex = 0;
  document.body.appendChild(editor);
  editor.focus();
  return editor;
}

describe('useHostClipboardPaste', () => {
  let insertText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no editing commands, and the call is what matters here.
    insertText = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: insertText, configurable: true, writable: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('asks the host for the clipboard of this project, with a deadline', async () => {
    sendMock.mockResolvedValue({ text: null, image: null });
    const { paste } = renderPaste('/proj');

    await paste(focusedEditor());

    expect(sendMock).toHaveBeenCalledWith(
      MessageType.GET_CLIPBOARD,
      { workingDir: '/proj' },
      { timeout: 5_000 },
    );
  });

  it('inserts the host text at the caret through the editing command', async () => {
    sendMock.mockResolvedValue({ text: 'copied elsewhere', image: null });
    const { paste, addImageAttachment } = renderPaste();

    await paste(focusedEditor());

    expect(insertText).toHaveBeenCalledWith('insertText', false, 'copied elsewhere');
    expect(addImageAttachment).not.toHaveBeenCalled();
  });

  it('ends the browser\'s typing run first, so undo takes back the paste alone and not the typing before it', async () => {
    sendMock.mockResolvedValue({ text: 'copied elsewhere', image: null });
    const { paste } = renderPaste();
    const editor = focusedEditor();
    editor.textContent = 'typed';
    const selection = document.getSelection();
    if (!selection) throw new Error('jsdom has no selection');
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    const reset = vi.spyOn(selection, 'removeAllRanges');

    await paste(editor);

    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(insertText.mock.invocationCallOrder[0]);
    // The caret stays exactly where it was.
    expect(selection.rangeCount).toBe(1);
    expect(selection.getRangeAt(0).startOffset).toBe(range.startOffset);
  });

  it('attaches the host image, and leaves the text out as a paste that carries both does', async () => {
    sendMock.mockResolvedValue({ text: 'caption', image: { mimeType: 'image/png', base64: btoa('PNG') } });
    const { paste, addImageAttachment } = renderPaste();

    await paste(focusedEditor());

    expect(addImageAttachment).toHaveBeenCalledTimes(1);
    const [file, source] = addImageAttachment.mock.calls[0] as [File, string];
    expect(file.type).toBe('image/png');
    expect(source).toBe('paste');
    expect(insertText).not.toHaveBeenCalled();
  });

  it('does nothing when the host has nothing, as a paste of an empty clipboard always did', async () => {
    sendMock.mockResolvedValue({ text: null, image: null });
    const { paste, addImageAttachment } = renderPaste();

    await paste(focusedEditor());

    expect(insertText).not.toHaveBeenCalled();
    expect(addImageAttachment).not.toHaveBeenCalled();
  });

  it('does nothing when the host cannot be asked, instead of surfacing a fault', async () => {
    sendMock.mockRejectedValue(new Error('No IDE host connected'));
    const { paste, addImageAttachment } = renderPaste();

    await expect(paste(focusedEditor())).resolves.toBeUndefined();

    expect(insertText).not.toHaveBeenCalled();
    expect(addImageAttachment).not.toHaveBeenCalled();
  });

  it('does not type into something else when the user clicked away while the host answered', async () => {
    sendMock.mockResolvedValue({ text: 'copied elsewhere', image: null });
    const { paste } = renderPaste();
    const editor = focusedEditor();
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    await paste(editor);

    expect(insertText).not.toHaveBeenCalled();
  });

  it('asks without a project while none is chosen yet', async () => {
    sendMock.mockResolvedValue({ text: null, image: null });
    const { paste } = renderPaste(null);

    await paste(focusedEditor());

    expect(sendMock).toHaveBeenCalledWith(
      MessageType.GET_CLIPBOARD,
      { workingDir: undefined },
      { timeout: 5_000 },
    );
  });
});
