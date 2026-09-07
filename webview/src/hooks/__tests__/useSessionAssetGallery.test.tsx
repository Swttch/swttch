import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageType, type SessionAsset } from '@/shared';

const send = vi.fn();
const isSponsor = vi.fn(() => false);
const sessionContext = vi.fn<() => { currentSessionId: string | null } | null>(() => ({
  currentSessionId: 's1',
}));

vi.mock('@/contexts/SessionContext', () => ({
  useSessionContextOrNull: () => sessionContext(),
}));
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ workingDirectory: '/w' }),
}));
vi.mock('@/contexts/BridgeContext', () => ({ useBridgeContext: () => ({ send }) }));
vi.mock('@/hooks/queries/useSponsorStatus', () => ({
  useSponsorStatus: () => ({ isSponsor: isSponsor() }),
}));

import { useSessionAssetGallery } from '../useSessionAssetGallery';

function asset(entryUuid: string, blockIndex: number): SessionAsset {
  return { entryUuid, blockIndex, mediaType: 'image/png', timestamp: null, byteSize: 3, messagePreview: '' };
}

/** Three entries, one image each; the middle one is "this message". */
const SESSION: SessionAsset[] = [asset('older', 0), asset('mine', 1), asset('newer', 0)];

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function open(overrides: Partial<Parameters<typeof useSessionAssetGallery>[0]> = {}) {
  return renderHook(
    () =>
      useSessionAssetGallery({
        entryUuid: 'mine',
        localSrcs: ['data:image/png;base64,MINE'],
        openedLocalIndex: 0,
        ...overrides,
      }),
    { wrapper },
  );
}

beforeEach(() => {
  send.mockReset();
  isSponsor.mockReturnValue(false);
  sessionContext.mockReturnValue({ currentSessionId: 's1' });
  send.mockImplementation(async (type: string) =>
    type === MessageType.GET_SESSION_ASSETS ? { status: 'ok', assets: SESSION } : { status: 'gone' },
  );
});

describe('useSessionAssetGallery — non-sponsor', () => {
  it('keeps the viewer inside the clicked message', async () => {
    const { result } = open();

    await waitFor(() => expect(result.current.lockedCount).toBe(2));

    expect(result.current.srcs).toEqual(['data:image/png;base64,MINE']);
    expect(result.current.initialIndex).toBe(0);
  });

  it('counts what is out of reach so the invitation can name a number', async () => {
    const { result } = open();

    // Three in the session, one in this message.
    await waitFor(() => expect(result.current.lockedCount).toBe(2));
  });

  it('offers nothing when this message already holds the whole session', async () => {
    send.mockImplementation(async () => ({ status: 'ok', assets: [asset('mine', 1)] }));
    const { result } = open();

    await waitFor(() => expect(send).toHaveBeenCalled());

    expect(result.current.lockedCount).toBe(0);
  });

  it('never asks the backend for image bytes', async () => {
    const { result } = open();
    await waitFor(() => expect(result.current.lockedCount).toBe(2));

    act(() => result.current.onIndexChange(0));

    expect(send).not.toHaveBeenCalledWith(MessageType.GET_SESSION_ASSET_DATA, expect.anything());
  });
});

describe('useSessionAssetGallery — sponsor', () => {
  beforeEach(() => isSponsor.mockReturnValue(true));

  it('opens onto the whole session, positioned on the clicked image', async () => {
    const { result } = open();

    await waitFor(() => expect(result.current.srcs).toHaveLength(3));

    // 'mine' is the second of three, and its bytes come from the transcript.
    expect(result.current.initialIndex).toBe(1);
    expect(result.current.srcs[1]).toBe('data:image/png;base64,MINE');
    expect(result.current.srcs[0]).toBeNull();
    expect(result.current.srcs[2]).toBeNull();
    expect(result.current.lockedCount).toBe(0);
  });

  it('fetches a slot only when the viewer arrives at it', async () => {
    const { result } = open();
    await waitFor(() => expect(result.current.srcs).toHaveLength(3));

    send.mockImplementation(async (type: string) =>
      type === MessageType.GET_SESSION_ASSET_DATA
        ? { status: 'ok', source: { type: 'base64', media_type: 'image/png', data: 'OLDER' } }
        : { status: 'ok', assets: SESSION },
    );

    await act(async () => result.current.onIndexChange(0));

    await waitFor(() => expect(result.current.srcs[0]).toBe('data:image/png;base64,OLDER'));
    expect(send).toHaveBeenCalledWith(
      MessageType.GET_SESSION_ASSET_DATA,
      expect.objectContaining({ entryUuid: 'older', blockIndex: 0 }),
    );
  });

  it('does not re-fetch bytes the transcript already has', async () => {
    const { result } = open();
    await waitFor(() => expect(result.current.srcs).toHaveLength(3));
    send.mockClear();

    await act(async () => result.current.onIndexChange(1));

    expect(send).not.toHaveBeenCalled();
  });

  it('leaves the slot pending when the entry was rewound away', async () => {
    // 'gone' is an ordinary outcome, so the placeholder stays rather than the
    // viewer showing an error.
    const { result } = open();
    await waitFor(() => expect(result.current.srcs).toHaveLength(3));

    await act(async () => result.current.onIndexChange(2));

    expect(result.current.srcs[2]).toBeNull();
  });

  it('stays inside the message while the turn is still streaming', async () => {
    // No uuid yet means the entry is not on disk, so the index cannot point at
    // it and stepping across the session would land nowhere.
    const { result } = open({ entryUuid: undefined });

    await waitFor(() => expect(send).toHaveBeenCalled());

    expect(result.current.srcs).toEqual(['data:image/png;base64,MINE']);
  });
});

describe('useSessionAssetGallery — closed viewer', () => {
  it('does not index the session until the viewer opens', () => {
    // A transcript holds dozens of messages; indexing for each on render would
    // be dozens of full-session walks nobody asked for.
    open({ openedLocalIndex: null });

    expect(send).not.toHaveBeenCalled();
  });

  it('falls back to the message alone when rendered without session providers', () => {
    // A message renderer is reused where the providers are not mounted; that
    // must degrade to the local list, not throw.
    isSponsor.mockReturnValue(true);
    sessionContext.mockReturnValue(null);

    const { result } = open();

    expect(send).not.toHaveBeenCalled();
    expect(result.current.srcs).toEqual(['data:image/png;base64,MINE']);
    expect(result.current.lockedCount).toBe(0);
  });
});
