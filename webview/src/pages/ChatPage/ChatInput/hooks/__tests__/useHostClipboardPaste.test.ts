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

  describe('a paste that carried text, which the browser pastes itself', () => {
    /** The composer as the browser leaves it right after its own paste. */
    function editorWithPastedText(text: string): HTMLElement {
      const editor = focusedEditor();
      editor.textContent = text;
      return editor;
    }

    it('takes the pasted names back out when the host handed files to the chat, since their chips are the paste', async () => {
      sendMock.mockResolvedValue({ text: null, image: null, files: 2 });
      const { paste } = renderPaste();

      await paste(editorWithPastedText('report.xlsx'), { pastedText: 'report.xlsx' });

      expect(insertText).toHaveBeenCalledTimes(1);
      expect(insertText).toHaveBeenCalledWith('undo');
    });

    it('leaves the browser paste alone when the host holds the same text, even with other line endings', async () => {
      sendMock.mockResolvedValue({ text: 'one\r\ntwo', image: null });
      const { paste, addImageAttachment } = renderPaste();

      await paste(editorWithPastedText('one\ntwo'), { pastedText: 'one\ntwo' });

      expect(insertText).not.toHaveBeenCalled();
      expect(addImageAttachment).not.toHaveBeenCalled();
    });

    it('leaves the browser paste alone when the host holds nothing', async () => {
      sendMock.mockResolvedValue({ text: null, image: null });
      const { paste } = renderPaste();

      await paste(editorWithPastedText('what the user copied'), { pastedText: 'what the user copied' });

      expect(insertText).not.toHaveBeenCalled();
    });

    it('replaces the browser text with the host text when the browser clipboard is stale (#715)', async () => {
      sendMock.mockResolvedValue({ text: 'copied outside', image: null });
      const { paste } = renderPaste();

      await paste(editorWithPastedText('copied in the chat'), { pastedText: 'copied in the chat' });

      expect(insertText).toHaveBeenNthCalledWith(1, 'undo');
      expect(insertText).toHaveBeenNthCalledWith(2, 'insertText', false, 'copied outside');
    });

    it('attaches the host image and takes the stale text back out when the host holds an image and no text', async () => {
      const base64 = btoa('png');
      sendMock.mockResolvedValue({ text: null, image: { mimeType: 'image/png', base64 } });
      const { paste, addImageAttachment } = renderPaste();

      await paste(editorWithPastedText('copied in the chat'), { pastedText: 'copied in the chat' });

      expect(insertText).toHaveBeenCalledWith('undo');
      expect(insertText).not.toHaveBeenCalledWith('insertText', false, expect.anything());
      expect(addImageAttachment).toHaveBeenCalledTimes(1);
    });

    it('does not replace anything once the user has gone on typing before the host answered', async () => {
      let answer: (value: unknown) => void = () => {};
      sendMock.mockReturnValue(new Promise(resolve => { answer = resolve; }));
      const { paste } = renderPaste();
      const editor = editorWithPastedText('stale');

      const pasting = paste(editor, { pastedText: 'stale' });
      await new Promise(resolve => setTimeout(resolve, 5));
      editor.textContent = 'stale and more typing';
      answer({ text: 'fresh', image: null });
      await pasting;

      expect(insertText).not.toHaveBeenCalled();
    });

    describe('a paste that carried markup but no plain text (#715)', () => {
      it('finishes the paste from the host when the browser put nothing in, without undoing what was typed before', async () => {
        sendMock.mockResolvedValue({ text: 'copied outside', image: null });
        const { paste } = renderPaste();

        await paste(editorWithPastedText('typed before'), { pastedText: '', textBefore: 'typed before' });

        expect(insertText).not.toHaveBeenCalledWith('undo');
        expect(insertText).toHaveBeenCalledWith('insertText', false, 'copied outside');
        expect(sendMock).toHaveBeenCalledWith(
          MessageType.GET_CLIPBOARD,
          { workingDir: '/proj' },
          { timeout: 5_000 },
        );
      });

      it('attaches the host image when the browser put nothing in', async () => {
        sendMock.mockResolvedValue({ text: null, image: { mimeType: 'image/png', base64: btoa('png') } });
        const { paste, addImageAttachment } = renderPaste();

        await paste(editorWithPastedText('typed before'), { pastedText: '', textBefore: 'typed before' });

        expect(insertText).not.toHaveBeenCalled();
        expect(addImageAttachment).toHaveBeenCalledTimes(1);
      });

      it('takes back what the browser made of the markup when the host holds other text', async () => {
        sendMock.mockResolvedValue({ text: 'copied outside', image: null });
        const { paste } = renderPaste();

        await paste(editorWithPastedText('typed beforestale words'), { pastedText: '', textBefore: 'typed before' });

        expect(insertText).toHaveBeenNthCalledWith(1, 'undo');
        expect(insertText).toHaveBeenNthCalledWith(2, 'insertText', false, 'copied outside');
      });

      it('does nothing when the browser put nothing in and the host holds nothing', async () => {
        sendMock.mockResolvedValue({ text: null, image: null });
        const { paste, addImageAttachment } = renderPaste();

        await paste(editorWithPastedText('typed before'), { pastedText: '', textBefore: 'typed before' });

        expect(insertText).not.toHaveBeenCalled();
        expect(addImageAttachment).not.toHaveBeenCalled();
      });

      it('does nothing once the user has gone on typing before the host answered', async () => {
        let answer: (value: unknown) => void = () => {};
        sendMock.mockReturnValue(new Promise(resolve => { answer = resolve; }));
        const { paste } = renderPaste();
        const editor = editorWithPastedText('typed before');

        const pasting = paste(editor, { pastedText: '', textBefore: 'typed before' });
        await new Promise(resolve => setTimeout(resolve, 5));
        editor.textContent = 'typed before and more';
        answer({ text: 'copied outside', image: null });
        await pasting;

        expect(insertText).not.toHaveBeenCalled();
      });
    });

    it('leaves the paste alone when the host cannot be asked, so a paste is never lost', async () => {
      sendMock.mockRejectedValue(new Error('No IDE host connected'));
      const { paste } = renderPaste();

      await paste(editorWithPastedText('what the user copied'), { pastedText: 'what the user copied' });

      expect(insertText).not.toHaveBeenCalled();
    });

    it('does not undo anything once the user has gone on typing before the host answered', async () => {
      let answer: (value: unknown) => void = () => {};
      sendMock.mockReturnValue(new Promise(resolve => { answer = resolve; }));
      const { paste } = renderPaste();
      const editor = editorWithPastedText('report.xlsx');

      const pasting = paste(editor, { pastedText: 'report.xlsx' });
      await new Promise(resolve => setTimeout(resolve, 5));
      editor.textContent = 'report.xlsx and more typing';
      answer({ text: null, image: null, files: 1 });
      await pasting;

      expect(insertText).not.toHaveBeenCalled();
    });

    it('waits for the host only briefly', async () => {
      sendMock.mockResolvedValue({ text: null, image: null });
      const { paste } = renderPaste('/proj');

      await paste(editorWithPastedText('x'), { pastedText: 'x' });

      expect(sendMock).toHaveBeenCalledWith(
        MessageType.GET_CLIPBOARD,
        { workingDir: '/proj' },
        { timeout: 1_500 },
      );
    });
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
