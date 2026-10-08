import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageType } from '@/shared';

const { requestMock, videoFrameMock } = vi.hoisted(() => ({ requestMock: vi.fn(), videoFrameMock: vi.fn() }));

vi.mock('@/api/bridge/Bridge', () => ({ getBridge: () => ({ request: requestMock }) }));
vi.mock('../videoFrame', () => ({ videoFrame: videoFrameMock }));

import { _resetFilePreviewCache, loadFilePreview } from '../loadFilePreview';

beforeEach(() => {
  requestMock.mockReset();
  videoFrameMock.mockReset();
  _resetFilePreviewCache();
});

describe('loadFilePreview', () => {
  it('asks the backend for the file by its path', async () => {
    requestMock.mockResolvedValue({ kind: 'none' });
    await loadFilePreview('/tmp/a.txt');
    expect(requestMock).toHaveBeenCalledWith(MessageType.GET_FILE_PREVIEW, { path: '/tmp/a.txt' });
  });

  it('passes the first lines of a text file through', async () => {
    requestMock.mockResolvedValue({ kind: 'text', text: '# Plan' });
    expect(await loadFilePreview('/tmp/plan.md')).toEqual({ kind: 'text', text: '# Plan' });
  });

  it('turns a picture into a data URL the card can draw', async () => {
    requestMock.mockResolvedValue({ kind: 'image', mimeType: 'image/png', base64: 'AAA' });
    expect(await loadFilePreview('/tmp/a.png')).toEqual({ kind: 'image', src: 'data:image/png;base64,AAA' });
  });

  it('shows a frame of a video that decodes', async () => {
    requestMock.mockResolvedValue({ kind: 'video', mimeType: 'video/quicktime', base64: 'AAAA' });
    videoFrameMock.mockResolvedValue('data:image/jpeg;base64,FRAME');

    expect(await loadFilePreview('/tmp/clip.mov')).toEqual({ kind: 'image', src: 'data:image/jpeg;base64,FRAME' });
    expect(videoFrameMock.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it('keeps the icon for a video the browser cannot decode', async () => {
    requestMock.mockResolvedValue({ kind: 'video', mimeType: 'video/quicktime', base64: 'AAAA' });
    videoFrameMock.mockResolvedValue(null);

    expect(await loadFilePreview('/tmp/clip.mov')).toEqual({ kind: 'none' });
  });

  it('keeps the icon when the backend has nothing to show', async () => {
    requestMock.mockResolvedValue({ kind: 'none' });
    expect(await loadFilePreview('/tmp/a.pdf')).toEqual({ kind: 'none' });
  });

  it('asks once for a path however many cards want it', async () => {
    requestMock.mockResolvedValue({ kind: 'text', text: 'x' });
    await Promise.all([loadFilePreview('/tmp/a.md'), loadFilePreview('/tmp/a.md')]);
    await loadFilePreview('/tmp/a.md');
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('never rejects, and does not remember a failed ask as "no preview"', async () => {
    requestMock.mockRejectedValueOnce(new Error('Bridge disconnected'));
    expect(await loadFilePreview('/tmp/a.md')).toEqual({ kind: 'none' });

    requestMock.mockResolvedValue({ kind: 'text', text: 'back' });
    expect(await loadFilePreview('/tmp/a.md')).toEqual({ kind: 'text', text: 'back' });
  });
});
