import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOptionPreview } from '../useOptionPreview';

const created: FakeAudio[] = [];

class FakeAudio {
  paused = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {
    created.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

describe('useOptionPreview', () => {
  beforeEach(() => {
    created.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts the sample once the pointer has stayed, not at the first touch', () => {
    const { result } = renderHook(() => useOptionPreview());
    act(() => result.current.start('a.mp3'));
    expect(created).toHaveLength(0);
    act(() => vi.advanceTimersByTime(200));
    expect(created.map((audio) => audio.src)).toEqual(['a.mp3']);
    expect(result.current.playingUrl).toBe('a.mp3');
  });

  it('plays one at a time: a new sample stops the one before', () => {
    const { result } = renderHook(() => useOptionPreview());
    act(() => result.current.start('a.mp3'));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.start('b.mp3'));
    expect(created[0].paused).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.playingUrl).toBe('b.mp3');
  });

  it('plays nothing when the pointer leaves before it started', () => {
    const { result } = renderHook(() => useOptionPreview());
    act(() => result.current.start('a.mp3'));
    act(() => result.current.stop());
    act(() => vi.advanceTimersByTime(500));
    expect(created).toHaveLength(0);
  });

  it('stops what plays when the list goes away', () => {
    const { result, unmount } = renderHook(() => useOptionPreview());
    act(() => result.current.start('a.mp3'));
    act(() => vi.advanceTimersByTime(200));
    unmount();
    expect(created[0].paused).toBe(true);
  });
});
