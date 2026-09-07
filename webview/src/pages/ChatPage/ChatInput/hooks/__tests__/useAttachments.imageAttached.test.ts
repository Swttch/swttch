import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';
import { ImageAttachSource, ATTACHMENT_LIMITS } from '@/types';

// ---------------------------------------------------------------------------
// The IMAGE_ATTACHED report is fire-and-forget over the Bridge singleton's
// sendRaw (nothing ACKs it), so the mock only needs to capture the wire message.
// ---------------------------------------------------------------------------

const { sendRawMock } = vi.hoisted(() => ({ sendRawMock: vi.fn() }));

vi.mock('@/api/bridge/Bridge', () => ({
  getBridge: () => ({ sendRaw: sendRawMock }),
}));

// Imported AFTER vi.mock so the mock is wired up first.
import { useAttachments } from '../useAttachments';

/** A PNG whose reported size can be forced past the limit without allocating it. */
function imageFile(name = 'shot.png', type = 'image/png', size?: number): File {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

function lastReport() {
  const calls = sendRawMock.mock.calls;
  const call = calls[calls.length - 1];
  return call?.[0] as { type: string; payload: Record<string, unknown> } | undefined;
}

beforeEach(() => vi.clearAllMocks());

describe('useAttachments — IMAGE_ATTACHED telemetry report', () => {
  it('reports the attach so it is visible to telemetry at all', async () => {
    // Attaching happens entirely in the webview, so without this report the
    // backend never learns an image was attached and the feature is invisible
    // in usage data. That blindness is the whole reason this event exists.
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.addImageAttachment(imageFile(), ImageAttachSource.Button);
    });

    expect(sendRawMock).toHaveBeenCalledTimes(1);
    expect(lastReport()?.type).toBe(MessageType.IMAGE_ATTACHED);
    expect(lastReport()?.payload).toMatchObject({
      source: ImageAttachSource.Button,
      mimeType: 'image/png',
    });
  });

  it('never sends the file name, which routinely carries personal information', async () => {
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.addImageAttachment(
        imageFile('/Users/somebody/secret-project/leak.png'),
        ImageAttachSource.Button,
      );
    });

    expect(JSON.stringify(lastReport())).not.toContain('secret-project');
    expect(lastReport()?.payload).not.toHaveProperty('fileName');
  });

  it('does not report an attach that was rejected for an unsupported type', async () => {
    // A rejected file never becomes an attachment, so counting it would inflate
    // the headcount this event exists to measure.
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.addImageAttachment(
        imageFile('doc.pdf', 'application/pdf'),
        ImageAttachSource.Button,
      );
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(sendRawMock).not.toHaveBeenCalled();
  });

  it('does not report an attach that was rejected for being oversize', async () => {
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.addImageAttachment(
        imageFile('huge.png', 'image/png', ATTACHMENT_LIMITS.MAX_FILE_SIZE + 1),
        ImageAttachSource.Button,
      );
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(sendRawMock).not.toHaveBeenCalled();
  });

  it('reports source=paste when the image arrives on the clipboard', async () => {
    const { result } = renderHook(() => useAttachments());
    const file = imageFile();

    await act(async () => {
      await result.current.handlePaste({
        clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
        preventDefault: vi.fn(),
      } as unknown as React.ClipboardEvent<HTMLElement>);
    });

    expect(lastReport()?.payload.source).toBe(ImageAttachSource.Paste);
  });

  it('reports source=drop when the image is dropped on the input', async () => {
    const { result } = renderHook(() => useAttachments());
    const file = imageFile();

    await act(async () => {
      await result.current.handleDrop({
        preventDefault: vi.fn(),
        dataTransfer: { files: [file] },
      } as unknown as React.DragEvent);
    });

    expect(lastReport()?.payload.source).toBe(ImageAttachSource.Drop);
  });

  it('still attaches the image when the report throws on a closed socket', async () => {
    // The attachment already succeeded by then; a lost telemetry ping must
    // never surface to the user as a failed attach.
    sendRawMock.mockImplementationOnce(() => {
      throw new Error('socket not open');
    });
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.addImageAttachment(imageFile(), ImageAttachSource.Button);
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });
});
