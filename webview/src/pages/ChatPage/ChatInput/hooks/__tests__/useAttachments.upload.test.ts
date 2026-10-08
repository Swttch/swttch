import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FileAttachment, FolderAttachment, ImageAttachment } from '@/types';

const { requestMock, sendRawMock, isJetBrainsMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  sendRawMock: vi.fn(),
  isJetBrainsMock: vi.fn(),
}));

vi.mock('@/api/bridge/Bridge', () => ({
  getBridge: () => ({ request: requestMock, sendRaw: sendRawMock }),
}));
vi.mock('@/config/environment', () => ({ isJetBrains: isJetBrainsMock }));

import { useAttachments } from '../useAttachments';

/** A backend that saves every upload under /saved and answers like the real handler. */
function backendSavesUploads() {
  requestMock.mockImplementation(async (_type: string, payload: Record<string, unknown>) =>
    payload.last ? { path: `/saved/${payload.uploadId}/${payload.fileName}` } : {});
}

function file(name: string, type = '', body = 'data'): File {
  return new File([body], name, { type });
}

function pasteOf(...files: File[]) {
  const preventDefault = vi.fn();
  const event = {
    preventDefault,
    clipboardData: {
      items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    },
  } as unknown as React.ClipboardEvent<HTMLElement>;
  return { event, preventDefault };
}

function dropOf(...files: File[]) {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { files },
  } as unknown as React.DragEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  isJetBrainsMock.mockReturnValue(false);
  backendSavesUploads();
});

describe('useAttachments in a browser', () => {
  it('turns a pasted video into a file chip, as a dropped one does', async () => {
    const { result } = renderHook(() => useAttachments());
    const { event, preventDefault } = pasteOf(file('clip.mov', 'video/quicktime'));

    await act(async () => {
      await result.current.handlePaste(event);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.attachments).toHaveLength(1);
    const chip = result.current.attachments[0] as FileAttachment;
    expect(chip).toBeInstanceOf(FileAttachment);
    expect(chip.fileName).toBe('clip.mov');
    expect(chip.absolutePath).toMatch(/^\/saved\/.+\/clip\.mov$/);
  });

  it('leaves a paste without any file to the browser, so text keeps its undo entry', async () => {
    const { result } = renderHook(() => useAttachments());
    const preventDefault = vi.fn();

    await act(async () => {
      await result.current.handlePaste({
        preventDefault,
        clipboardData: { items: [{ kind: 'string', type: 'text/plain' }] },
      } as unknown as React.ClipboardEvent<HTMLElement>);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('keeps a pasted png inline and uploads nothing', async () => {
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.handlePaste(pasteOf(file('shot.png', 'image/png')).event);
    });

    expect(result.current.attachments[0]).toBeInstanceOf(ImageAttachment);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('attaches a picture type the model cannot read inline as a file chip instead of refusing it', async () => {
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.handleDrop(dropOf(file('logo.svg', 'image/svg+xml')));
    });

    expect(result.current.error).toBeNull();
    expect(result.current.attachments[0]).toBeInstanceOf(FileAttachment);
  });

  it('attaches a file of a type nobody listed', async () => {
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.handleDrop(dropOf(file('data.weird-extension')));
    });

    expect((result.current.attachments[0] as FileAttachment).fileName).toBe('data.weird-extension');
  });

  it('turns a dropped folder into a folder chip pointing at the saved copy', async () => {
    requestMock.mockImplementation(async (_type: string, payload: Record<string, unknown>) =>
      payload.last ? { path: `/saved/${payload.relativePath}`, rootPath: '/saved/photos' } : {});
    const listing = {
      isDirectory: true,
      name: 'photos',
      createReader: () => {
        let done = false;
        return {
          readEntries: (ok: (batch: unknown[]) => void) => {
            const wasDone = done;
            done = true;
            ok(wasDone ? [] : [{ isDirectory: false, name: 'a.png', file: (cb: (f: File) => void) => cb(file('a.png', 'image/png')) }]);
          },
        };
      },
    };
    const folder = new File([], 'photos');
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.handleDrop({
        preventDefault: vi.fn(),
        dataTransfer: { items: [{ kind: 'file', getAsFile: () => folder, webkitGetAsEntry: () => listing }] },
      } as unknown as React.DragEvent);
    });

    expect(result.current.error).toBeNull();
    const chip = result.current.attachments[0] as FolderAttachment;
    expect(chip).toBeInstanceOf(FolderAttachment);
    expect(chip.folderName).toBe('photos');
    expect(chip.absolutePath).toBe('/saved/photos/');
  });

  it('says which file failed when the upload does', async () => {
    requestMock.mockResolvedValue({ status: 'error', error: 'disk full' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.handleDrop(dropOf(file('clip.mov', 'video/quicktime')));
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.error).toContain('clip.mov');
  });
});

describe('useAttachments while a file is travelling', () => {
  /** A backend that holds every answer until the test lets it go. */
  function heldBackend() {
    const releases: Array<() => void> = [];
    requestMock.mockImplementation((_type: string, payload: Record<string, unknown>) =>
      new Promise((resolve) => {
        releases.push(() => resolve(payload.last ? { path: `/saved/${payload.fileName}` } : {}));
      }));
    return { releaseNext: () => releases.shift()?.() };
  }

  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it('lists the file as travelling until the backend has stored it, then swaps in the real chip', async () => {
    const { releaseNext } = heldBackend();
    const { result } = renderHook(() => useAttachments());

    let dropping: Promise<void> = Promise.resolve();
    act(() => {
      dropping = result.current.handleDrop(dropOf(file('clip.mov', 'video/quicktime')));
    });
    await flush();

    expect(result.current.uploads.map((u) => u.label)).toEqual(['clip.mov']);
    expect(result.current.attachments).toHaveLength(0);

    await act(async () => {
      releaseNext();
      await dropping;
    });

    expect(result.current.uploads).toHaveLength(0);
    expect(result.current.attachments).toHaveLength(1);
  });

  it('lists every dropped file at once, before the first one has finished', async () => {
    heldBackend();
    const { result } = renderHook(() => useAttachments());

    act(() => {
      void result.current.handleDrop(dropOf(file('a.mov', 'video/quicktime'), file('b.pdf', 'application/pdf')));
    });
    await flush();

    expect(result.current.uploads.map((u) => u.label)).toEqual(['a.mov', 'b.pdf']);
  });

  it('stops the upload and says nothing when the person removes the chip', async () => {
    const { releaseNext } = heldBackend();
    const { result } = renderHook(() => useAttachments());
    const big = new File([new Uint8Array(512 * 1024 * 2)], 'big.bin');

    let dropping: Promise<void> = Promise.resolve();
    act(() => {
      dropping = result.current.handleDrop(dropOf(big));
    });
    await flush();
    act(() => result.current.cancelUpload(result.current.uploads[0].id));
    expect(result.current.uploads).toHaveLength(0);

    await act(async () => {
      releaseNext();
      await dropping;
    });

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it('drops the travelling chip when the upload fails', async () => {
    requestMock.mockResolvedValue({ status: 'error', error: 'disk full' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.handleDrop(dropOf(file('clip.mov', 'video/quicktime')));
    });

    expect(result.current.uploads).toHaveLength(0);
  });

  it('shows nothing travelling in the IDE, where no upload happens', async () => {
    isJetBrainsMock.mockReturnValue(true);
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.handleDrop(dropOf(file('clip.mov', 'video/quicktime')));
    });

    expect(result.current.uploads).toHaveLength(0);
  });
});

describe('useAttachments in the IDE', () => {
  beforeEach(() => isJetBrainsMock.mockReturnValue(true));

  it('does not upload a dropped video, since the IDE hands the backend its real path', async () => {
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.handleDrop(dropOf(file('clip.mov', 'video/quicktime')));
    });

    expect(requestMock).not.toHaveBeenCalled();
    expect(result.current.attachments).toHaveLength(0);
  });

  it('does not claim a pasted video, leaving the paste to the host', async () => {
    const { result } = renderHook(() => useAttachments());
    const { event, preventDefault } = pasteOf(file('clip.mov', 'video/quicktime'));

    await act(async () => {
      await result.current.handlePaste(event);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('shows no unsupported-type error for a dropped svg, which the IDE attaches by path', async () => {
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      await result.current.handleDrop(dropOf(file('logo.svg', 'image/svg+xml')));
    });

    expect(result.current.error).toBeNull();
  });
});
