/**
 * The review surface reacting to its file moving underneath it (#359).
 *
 * What matters here is that a notice for ANOTHER review does not raise this
 * one's banner, and that a failed rebuild does not clear it — a banner cleared
 * while the base is still stale is the screen saying "current" when it is not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';

type Listener = (message: { payload?: Record<string, unknown> }) => void;

const listeners = new Map<string, Set<Listener>>();
const subscribe = vi.fn((type: string, cb: Listener) => {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(cb);
  return () => listeners.get(type)!.delete(cb);
});

vi.mock('@/api/bridge/BridgeClient', () => ({
  getBridgeClient: () => ({ subscribe }),
}));

const refreshDiffPreview = vi.fn();
vi.mock('@/contexts/ApiContext', () => ({
  useApi: () => ({ tools: { refreshDiffPreview } }),
}));

import { useReviewBaseChanged } from '../useReviewBaseChanged';

function emit(payload: Record<string, unknown>) {
  for (const cb of listeners.get(MessageType.REVIEW_BASE_CHANGED) ?? []) {
    cb({ payload });
  }
}

const preview = (oldContent: string) => ({
  filePath: '/tmp/x.ts',
  oldContent,
  newContent: 'proposed\n',
  hunks: [],
  input: {},
  toolName: 'Write',
});

beforeEach(() => {
  listeners.clear();
  subscribe.mockClear();
  refreshDiffPreview.mockReset();
});

describe('useReviewBaseChanged', () => {
  it('raises the banner when this review\'s base moves', () => {
    const { result } = renderHook(() => useReviewBaseChanged('t-1', vi.fn()));

    act(() => emit({ toolUseId: 't-1', reason: 'changed', overlapsAccepted: false }));

    expect(result.current.change).toMatchObject({
      blockedApproval: false,
      reason: 'changed',
      overlapsAccepted: false,
    });
  });

  it('ignores a notice for a different review', () => {
    // Several reviews can be open at once; raising the wrong banner would tell
    // a reviewer their file moved when it did not.
    const { result } = renderHook(() => useReviewBaseChanged('t-mine', vi.fn()));

    act(() => emit({ toolUseId: 't-theirs', reason: 'changed' }));

    expect(result.current.change).toBeNull();
  });

  it('marks a held approval apart from a noticed save', () => {
    const { result } = renderHook(() => useReviewBaseChanged('t-2', vi.fn()));

    act(() => emit({ toolUseId: 't-2', blockedApproval: true, reason: 'changed' }));

    expect(result.current.change?.blockedApproval).toBe(true);
  });

  it('treats an absent overlap flag as overlapping', () => {
    // The honest default: if the backend did not say, the change may matter.
    const { result } = renderHook(() => useReviewBaseChanged('t-3', vi.fn()));

    act(() => emit({ toolUseId: 't-3', reason: 'changed' }));

    expect(result.current.change?.overlapsAccepted).toBe(true);
  });

  it('clears the banner and hands back the refreshed preview', async () => {
    const onRefreshed = vi.fn();
    refreshDiffPreview.mockResolvedValue({ outcome: 'refreshed', preview: preview('current\n') });
    const { result } = renderHook(() => useReviewBaseChanged('t-4', onRefreshed));

    act(() => emit({ toolUseId: 't-4', reason: 'changed' }));
    await act(async () => {
      await result.current.refresh();
    });

    expect(onRefreshed).toHaveBeenCalledWith(expect.objectContaining({ oldContent: 'current\n' }));
    await waitFor(() => expect(result.current.change).toBeNull());
  });

  it('keeps the banner up when the proposal can no longer be rebuilt', async () => {
    // Clearing here would leave the screen claiming the review is current while
    // the base is still stale — the exact confusion this feature exists to end.
    refreshDiffPreview.mockResolvedValue({
      outcome: 'unrebuildable',
      reason: 'no-longer-applies',
      preview: null,
    });
    const { result } = renderHook(() => useReviewBaseChanged('t-5', vi.fn()));

    act(() => emit({ toolUseId: 't-5', reason: 'changed' }));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.change).not.toBeNull();
    // NOT 'unreadable': the file is there, the edit just stopped fitting it.
    // Reporting it as unreadable sent the reviewer looking for a problem with
    // their file that did not exist (caught in QA).
    expect(result.current.change?.reason).toBe('no-longer-applies');
  });

  it('reports an unreadable file as unreadable', async () => {
    refreshDiffPreview.mockResolvedValue({
      outcome: 'unrebuildable',
      reason: 'unreadable',
      preview: null,
    });
    const { result } = renderHook(() => useReviewBaseChanged('t-gone', vi.fn()));

    act(() => emit({ toolUseId: 't-gone', reason: 'changed' }));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.change?.reason).toBe('unreadable');
  });

  it('lets the reviewer dismiss the banner', () => {
    const { result } = renderHook(() => useReviewBaseChanged('t-6', vi.fn()));

    act(() => emit({ toolUseId: 't-6', reason: 'changed' }));
    act(() => result.current.dismiss());

    expect(result.current.change).toBeNull();
  });
});
