import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { videoFrame } from '../videoFrame';

/** A video element that does what the test tells it to, since jsdom decodes nothing. */
class FakeVideo {
  muted = false;
  playsInline = false;
  preload = '';
  duration = 10;
  videoWidth = 1920;
  videoHeight = 1080;
  currentTime = 0;
  onerror: (() => void) | null = null;
  onloadeddata: (() => void) | null = null;
  onseeked: (() => void) | null = null;
  src = '';
  removeAttribute = vi.fn();
  load = vi.fn();
}

let video: FakeVideo;
let canvas: { width: number; height: number; getContext: ReturnType<typeof vi.fn>; toDataURL: ReturnType<typeof vi.fn> };
const drawImage = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  video = new FakeVideo();
  canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage })),
    toDataURL: vi.fn(() => 'data:image/jpeg;base64,FRAME'),
  };
  drawImage.mockClear();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:v'), revokeObjectURL: vi.fn() });
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    (tag === 'video' ? video : canvas)) as unknown as typeof document.createElement);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('videoFrame', () => {
  it('seeks a little way in, then paints the frame it lands on, scaled down', async () => {
    const result = videoFrame(new Blob(['v']));

    video.onloadeddata?.();
    expect(video.currentTime).toBe(0.1);
    video.onseeked?.();

    expect(await result).toBe('data:image/jpeg;base64,FRAME');
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(72);
    expect(drawImage).toHaveBeenCalledOnce();
  });

  it('seeks to the middle of a clip shorter than a tenth of a second', async () => {
    video.duration = 0.04;
    const result = videoFrame(new Blob(['v']));

    video.onloadeddata?.();
    expect(video.currentTime).toBe(0.02);
    video.onseeked?.();
    await result;
  });

  it('gives null when the browser cannot decode the video', async () => {
    const result = videoFrame(new Blob(['v']));
    video.onerror?.();
    expect(await result).toBeNull();
  });

  it('gives null when no frame ever shows up, rather than waiting forever', async () => {
    const result = videoFrame(new Blob(['v']));
    await vi.advanceTimersByTimeAsync(8000);
    expect(await result).toBeNull();
  });

  it('gives null for a video with no picture size, which is audio in disguise', async () => {
    video.videoWidth = 0;
    const result = videoFrame(new Blob(['v']));
    video.onloadeddata?.();
    video.onseeked?.();
    expect(await result).toBeNull();
  });

  it('lets the decoder go and frees the blob whichever way it ends', async () => {
    const result = videoFrame(new Blob(['v']));
    video.onerror?.();
    await result;

    expect(video.load).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:v');
  });
});
