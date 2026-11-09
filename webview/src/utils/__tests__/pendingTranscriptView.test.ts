import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPendingTranscriptView,
  setPendingTranscriptView,
  subscribePendingTranscriptViewForTest,
  takePendingTranscriptView,
} from '../pendingTranscriptView';

describe('pendingTranscriptView', () => {
  afterEach(() => setPendingTranscriptView(null));

  it('holds the pick of a chat that has not started', () => {
    setPendingTranscriptView('thinking');
    expect(getPendingTranscriptView()).toBe('thinking');
  });

  it('hands the pick over once, then holds nothing', () => {
    setPendingTranscriptView('verbose');
    expect(takePendingTranscriptView()).toBe('verbose');
    expect(takePendingTranscriptView()).toBeNull();
    expect(getPendingTranscriptView()).toBeNull();
  });

  it('keeps the classic chat as a pick of its own, not as no pick', () => {
    setPendingTranscriptView('classic');
    expect(takePendingTranscriptView()).toBe('classic');
  });

  it('tells its listeners when the pick changes, and not when it does not', () => {
    const listener = vi.fn();
    const stop = subscribePendingTranscriptViewForTest(listener);
    setPendingTranscriptView('normal');
    setPendingTranscriptView('normal');
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    setPendingTranscriptView('verbose');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
